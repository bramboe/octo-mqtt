import { Connection } from '@2colors/esphome-native-api';
import { Deferred } from '../Utils/deferred';
import { logError, logInfo, logWarn } from '../Utils/logger';
import { IESPConnection } from './IESPConnection';
import { connect } from './connect';
import { BLEDevice } from './types/BLEDevice';
import { IBLEDevice } from './types/IBLEDevice';
import { BLEDeviceAdvertisement } from '../BLE/BLEController';
import { EventEmitter } from 'events';

export class ESPConnection extends EventEmitter implements IESPConnection {
  private advertisementPacketListener: ((data: any) => void) | null = null;
  private isProxyScanning = false;
  private scanTimeoutId: NodeJS.Timeout | null = null;
  private activeDevices = new Set<IBLEDevice>();

  constructor(private connections: Connection[]) {
    super(); // Call EventEmitter constructor
    // Set higher maxListeners on all connections
    connections.forEach(connection => {
      if (connection instanceof EventEmitter) {
        connection.setMaxListeners(100); // Set a higher limit for all connections
      }
    });
  }

  hasActiveConnections(): boolean {
    return this.connections.length > 0;
  }

  async waitForConnection(maxWaitTime = 30000): Promise<boolean> {
    const startTime = Date.now();
    while (Date.now() - startTime < maxWaitTime) {
      if (this.connections.length > 0) {
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
    }
    return false;
  }

  async reconnect(): Promise<void> {
    this.disconnect();
    logInfo('[ESPHome] Reconnecting...');
    this.connections = await Promise.all(
      this.connections.map((connection) =>
        connect(new Connection({ 
          host: connection.host, 
          port: connection.port
        }))
      )
    );
  }

  disconnect(): void {
    this.cleanupScan().catch(error => {
      logError('[ESPHome] Error during disconnect cleanup:', error);
    });
  }

  async getBLEDevices(deviceNames: string[], nameMapper?: (name: string) => string): Promise<IBLEDevice[]> {
    if (this.connections.length === 0) {
      logWarn('[ESPHome] No active proxy connections available for device discovery');
      return [];
    }
    
    logInfo(`[ESPHome] Searching for device(s): ${deviceNames.join(', ')}`);
    
    // Separate MAC addresses from device names
    const macAddresses: string[] = [];
    const actualDeviceNames: string[] = [];
    
    deviceNames.forEach(device => {
      // Check if this looks like a MAC address (XX:XX:XX:XX:XX:XX format)
      if (/^([0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}$/.test(device)) {
        macAddresses.push(device.toLowerCase());
        logInfo(`[ESPHome] Treating "${device}" as MAC address`);
      } else {
        actualDeviceNames.push(device.toLowerCase());
        logInfo(`[ESPHome] Treating "${device}" as device name`);
      }
    });
    
    // Also add common RC2 MAC prefixes to search for
    if (actualDeviceNames.includes('rc2') || macAddresses.length === 0) {
      logInfo('[ESPHome] Adding RC2 MAC address patterns to search for');
      // Add common RC2 MAC prefixes
      macAddresses.push('f6:21:dd:dd:6f:19'); // Your specific device
      macAddresses.push('c3:e7:63'); // Common RC2 prefix
    }
    
    const bleDevices: IBLEDevice[] = [];
    const complete = new Deferred<void>();
    
    try {
      await this.discoverBLEDevices(
        (bleDevice) => {
          const { name, mac } = bleDevice;
          
          // Check MAC address match first (most reliable)
          let macIndex = macAddresses.indexOf(mac.toLowerCase());
          
          // If no exact match, try partial matches for MAC prefixes
          if (macIndex === -1) {
            macIndex = macAddresses.findIndex(targetMac => 
              mac.toLowerCase().startsWith(targetMac.toLowerCase())
            );
          }
          
          if (macIndex !== -1) {
            const matchedMac = macAddresses[macIndex];
            macAddresses.splice(macIndex, 1);
            logInfo(`[ESPHome] Found device by MAC: ${name} (${mac}) - matched against ${matchedMac}`);
            bleDevices.push(bleDevice);
            this.activeDevices.add(bleDevice);
            if (macAddresses.length === 0 && actualDeviceNames.length === 0) {
              complete.resolve();
            }
            return;
          }
          
          // Check device name match
          let nameIndex = actualDeviceNames.indexOf(name.toLowerCase());
          if (nameIndex !== -1) {
            actualDeviceNames.splice(nameIndex, 1);
            logInfo(`[ESPHome] Found device by name: ${name} (${mac})`);
            bleDevices.push(bleDevice);
            this.activeDevices.add(bleDevice);
            if (macAddresses.length === 0 && actualDeviceNames.length === 0) {
              complete.resolve();
            }
            return;
          }
          
          // Additional check: if we're looking for RC2 devices, also check for RC2 in the name
          if (actualDeviceNames.includes('rc2') && name.toLowerCase().includes('rc2')) {
            const rc2Index = actualDeviceNames.indexOf('rc2');
            actualDeviceNames.splice(rc2Index, 1);
            logInfo(`[ESPHome] Found RC2 device by name pattern: ${name} (${mac})`);
            bleDevices.push(bleDevice);
            this.activeDevices.add(bleDevice);
            if (macAddresses.length === 0 && actualDeviceNames.length === 0) {
              complete.resolve();
            }
            return;
          }
        },
        complete,
        nameMapper
      );
    } catch (error) {
      logError('[ESPHome] Error during device discovery:', error);
      // Don't throw, just return empty array
    }
    
    if (macAddresses.length > 0) {
      logWarn(`[ESPHome] Could not find MAC address(es): ${macAddresses.join(', ')}`);
    }
    if (actualDeviceNames.length > 0) {
      logWarn(`[ESPHome] Could not find device name(s): ${actualDeviceNames.join(', ')}`);
    }
    
    return bleDevices;
  }

  async discoverBLEDevices(
    onNewDeviceFound: (bleDevice: IBLEDevice) => void,
    complete: Deferred<void>,
    nameMapper?: (name: string) => string
  ) {
    const seenAddresses: number[] = [];
    const listenerBuilder = (connection: Connection) => ({
      connection,
      listener: (advertisement: any) => {
        let { name, address } = advertisement;
        
        // Validate address: must be a number and not NaN or 0
        if (typeof address !== 'number' || isNaN(address) || address === 0) {
          logWarn('[ESPHome] Skipping device with invalid address in discovery:', address);
          return;
        }
        
        // Don't skip devices without names - many BLE devices don't broadcast names
        if (seenAddresses.includes(address)) return;
        seenAddresses.push(address);

        // Use a default name if none is provided
        if (!name) {
          name = 'Unknown Device';
        }

        if (nameMapper) name = nameMapper(name);
        
        // Log all discovered devices for debugging
        logInfo(`[ESPHome DEBUG] Processing discovered device: ${name} (address: ${address}, mac: ${this.convertAddressToMac(address)})`);
        
        onNewDeviceFound(new BLEDevice(name, advertisement, connection));
      },
    });
    
    const listeners = this.connections.map(listenerBuilder);
    
    // Add a timeout to prevent hanging indefinitely
    const timeout = setTimeout(() => {
      logWarn('[ESPHome] Device discovery timeout reached');
      complete.resolve();
    }, 10000); // 10 second timeout
    
    for (const { connection, listener } of listeners) {
      connection.on('message.BluetoothLEAdvertisementResponse', listener);
      connection.subscribeBluetoothAdvertisementService();
    }
    
    try {
      await complete;
    } finally {
      clearTimeout(timeout);
      for (const { connection, listener } of listeners) {
        connection.off('message.BluetoothLEAdvertisementResponse', listener);
      }
    }
  }

  private convertAddressToMac(address: number): string {
    if (!address) {
      logInfo(`[ESPHome DEBUG] convertAddressToMac: address is falsy: ${address}`);
      return '';
    }
    
    // Convert numeric address to MAC address format
    // The address is a 48-bit integer, we need to extract each byte in reverse order
    const bytes = [
      (address >>> 40) & 0xFF,
      (address >>> 32) & 0xFF,
      (address >>> 24) & 0xFF,
      (address >>> 16) & 0xFF,
      (address >>> 8) & 0xFF,
      address & 0xFF
    ];
    
    const mac = bytes.map(b => b.toString(16).padStart(2, '0')).join(':');
    logInfo(`[ESPHome DEBUG] convertAddressToMac: ${address} -> [${bytes.join(',')}] -> ${mac}`);
    return mac;
  }

  async startBleScan(
    durationMs: number,
    onDeviceDiscoveredDuringScan: (device: BLEDeviceAdvertisement) => void
  ): Promise<BLEDeviceAdvertisement[]> {
    if (this.connections.length === 0) {
      logWarn('[ESPHome] No active proxy connections to start scan.');
      throw new Error('No active proxy connections.');
    }
    const primaryConnection = this.connections[0];
    
    if (this.isProxyScanning) {
      logWarn('[ESPHome] Scan already in progress. Stop it first or wait for it to complete.');
      throw new Error('Scan already in progress.');
    }

    // Clean up any existing scan state
    await this.cleanupScan();

    logInfo(`[ESPHome] Starting BLE scan for ${durationMs}ms via primary proxy...`);
    logInfo('[ESPHome] Looking for ALL BLE devices - no filtering during discovery');
    const discoveredDevicesDuringScan = new Map<string, BLEDeviceAdvertisement>();
    
    // Get target MAC and PIN from environment variables for reference only
    const targetMac = process.env.OCTO_TARGET_MAC || '';
    const targetPin = process.env.OCTO_TARGET_PIN || '';
    
    logInfo(`[ESPHome] Scan parameters: Target MAC="${targetMac}", Target PIN="${targetPin}" (for connection keep-alive)`);
    logInfo('[ESPHome] Note: PIN is used for connection keep-alive, not discovery filtering');
    
    this.advertisementPacketListener = (data: any) => {
      // Log ALL advertisement data for debugging
      logInfo(`[ESPHome DEBUG] Advertisement received: name="${data.name || 'Unknown'}", address=${data.address}, mac="${data.mac || 'N/A'}", rssi=${data.rssi || 'N/A'}`);
      
      // Debug the address conversion process
      const rawAddress = data.address;
      const macFromData = data.mac;
      const convertedMac = rawAddress ? this.convertAddressToMac(rawAddress) : '';
      const finalAddress = macFromData || convertedMac;

      // Validate address: must be a number and not NaN or 0
      if (typeof rawAddress !== 'number' || isNaN(rawAddress) || rawAddress === 0) {
        logWarn('[ESPHome] Skipping device with invalid address:', rawAddress);
        return;
      }
      
      logInfo(`[ESPHome DEBUG] Address processing: raw=${rawAddress}, mac=${macFromData}, converted=${convertedMac}, final=${finalAddress}`);

      const discoveredDevice: BLEDeviceAdvertisement = {
        name: data.name || 'Unknown Device',
        address: rawAddress, 
        rssi: data.rssi,
        service_uuids: data.serviceUuids || data.service_uuids || [],
      };

      // Always add the device to discovered devices if not already seen
      if (!discoveredDevicesDuringScan.has(discoveredDevice.address.toString())) {
        logInfo(`[ESPHome SCAN] Found device: ${discoveredDevice.name} (${finalAddress})`);
        logInfo(`[ESPHome SCAN] RSSI: ${discoveredDevice.rssi}`);
        logInfo(`[ESPHome SCAN] Service UUIDs: ${discoveredDevice.service_uuids.join(', ') || 'None'}`);
        
        // Highlight potential RC2 devices for easier identification
        const deviceNameLower = (discoveredDevice.name || '').toLowerCase();
        const macLower = finalAddress.toLowerCase();
        
        if (deviceNameLower.includes('rc2') || 
            deviceNameLower.includes('octo') || 
            deviceNameLower.includes('ergomotion') ||
            macLower.startsWith('f6:21:dd') ||
            macLower.startsWith('c3:e7:63')) {
          logInfo(`[ESPHome SCAN] *** POTENTIAL RC2 DEVICE DETECTED ***`);
          logInfo(`[ESPHome SCAN] Name: "${discoveredDevice.name}"`);
          logInfo(`[ESPHome SCAN] MAC: ${finalAddress}`);
          logInfo(`[ESPHome SCAN] RSSI: ${discoveredDevice.rssi}`);
        }
        
        discoveredDevicesDuringScan.set(discoveredDevice.address.toString(), discoveredDevice);
      }

      // Report ALL discovered devices to the UI for manual selection
      logInfo(`[ESPHome SCAN] Reporting device: ${discoveredDevice.name} (${finalAddress})`);
      onDeviceDiscoveredDuringScan(discoveredDevice);
    };

    try {
      logInfo('[ESPHome] Testing connection to ESPHome device...');
      logInfo(`[ESPHome] Connection details: host=${primaryConnection.host}, port=${primaryConnection.port}`);
      
      logInfo('[ESPHome] Setting up advertisement listener...');
      primaryConnection.on('message.BluetoothLEAdvertisementResponse', this.advertisementPacketListener);
      logInfo('[ESPHome] Advertisement listener attached successfully');
      
      logInfo('[ESPHome] Subscribing to Bluetooth advertisement service...');
      await primaryConnection.subscribeBluetoothAdvertisementService();
      logInfo('[ESPHome] Bluetooth advertisement service subscription completed');
      
      // Test if we can receive any BLE advertisements by listening for a short time
      logInfo('[ESPHome] Testing BLE advertisement reception...');
      let advertisementReceived = false;
      const testListener = (data: any) => {
        advertisementReceived = true;
        logInfo('[ESPHome] TEST: Received BLE advertisement during test!');
        logInfo('[ESPHome] TEST: Advertisement data:', JSON.stringify(data, null, 2));
      };
      
      primaryConnection.on('message.BluetoothLEAdvertisementResponse', testListener);
      
      // Wait 5 seconds to see if any advertisements are received
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      primaryConnection.off('message.BluetoothLEAdvertisementResponse', testListener);
      
      if (!advertisementReceived) {
        logWarn('[ESPHome] WARNING: No BLE advertisements received during test!');
        logWarn('[ESPHome] This indicates the ESPHome BLE proxy is not working correctly.');
        logWarn('[ESPHome] Please check:');
        logWarn('  1. ESPHome device has esp32_ble_tracker configured');
        logWarn('  2. BLE proxy service is enabled in ESPHome');
        logWarn('  3. ESPHome device is in range of BLE devices');
        logWarn('  4. ESPHome device is not in deep sleep mode');
      } else {
        logInfo('[ESPHome] BLE advertisement test passed - ESPHome proxy is working!');
      }
      
      this.isProxyScanning = true;
      logInfo('[ESPHome] Scan started successfully. Looking for all BLE devices...');
      logInfo('[ESPHome] All discovered devices will be shown in the UI for manual selection');

      return new Promise((resolve, _reject) => {
        this.scanTimeoutId = setTimeout(async () => {
          const devices = Array.from(discoveredDevicesDuringScan.values());
          logInfo(`[ESPHome] Scan completed. Found ${devices.length} total device(s).`);
          
          // Log all discovered devices for debugging
          devices.forEach((device, index) => {
            const macStr = device.address.toString(16).padStart(12, '0');
            const macWithColons = macStr.match(/.{2}/g)?.join(':') || '';
            logInfo(`[ESPHome] Device ${index + 1}: ${device.name} (MAC: ${macWithColons}, RSSI: ${device.rssi})`);
          });
          
          await this.stopBleScan();
          resolve(devices);
        }, durationMs);
      });

    } catch (error) {
      logError('[ESPHome] Error during BLE scan:', error);
      await this.cleanupScan();
      throw error;
    }
  }

  async stopBleScan(): Promise<void> {
    logInfo('[ESPHome] Scan stopped prematurely via stopBleScan call.');
    await this.cleanupScan();
  }

  private async cleanupScan() {
    logInfo('[ESPHome] Attempting to stop BLE scan via primary proxy...');
    
    if (this.scanTimeoutId) {
      clearTimeout(this.scanTimeoutId);
      this.scanTimeoutId = null;
    }

    if (this.advertisementPacketListener && this.connections[0]) {
      this.connections[0].off('message.BluetoothLEAdvertisementResponse', this.advertisementPacketListener);
      this.advertisementPacketListener = null;
    }

      this.isProxyScanning = false; 

    // Clean up any active devices
    for (const device of this.activeDevices) {
      try {
        await device.disconnect();
    } catch (error) {
        logError('[ESPHome] Error disconnecting device during cleanup:', error);
      }
    }
    this.activeDevices.clear();

    logInfo('[ESPHome] BLE scan stopped.');
  }
}
