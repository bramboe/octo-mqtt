import { Connection } from '@2colors/esphome-native-api';
import { Deferred } from '../Utils/deferred';
import { logError, logInfo, logWarn } from '../Utils/logger';
import { IESPConnection } from './IESPConnection';
import { connect } from './connect';
import { BLEDevice } from './types/BLEDevice';
import { IBLEDevice } from './types/IBLEDevice';
import { BLEDeviceAdvertisement } from '../BLE/BLEController';
import { EventEmitter } from 'events';

export class ESPConnection implements IESPConnection {
  private advertisementPacketListener: ((data: any) => void) | null = null;
  private isProxyScanning = false;
  private scanTimeoutId: NodeJS.Timeout | null = null;
  private activeDevices = new Set<IBLEDevice>();

  constructor(private connections: Connection[]) {
    // Set higher maxListeners on all connections
    connections.forEach(connection => {
      if (connection instanceof EventEmitter) {
        connection.setMaxListeners(100); // Set a higher limit for all connections
      }
    });
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

  async getBLEDevices(deviceAddresses: number[]): Promise<IBLEDevice[]> {
    logInfo(`[ESPHome] Searching for device(s): ${deviceAddresses.join(', ')}`);
    const bleDevices: IBLEDevice[] = [];
    const complete = new Deferred<void>();
    
    await this.discoverBLEDevices(
      (bleDevice) => {
        const { address } = bleDevice;
        const index = deviceAddresses.indexOf(address);
        if (index === -1) return;

        deviceAddresses.splice(index, 1);
        logInfo(`[ESPHome] Found device with address: ${address}`);
        bleDevices.push(bleDevice);
        this.activeDevices.add(bleDevice);
        if (deviceAddresses.length) return;
        complete.resolve();
      },
      complete
    );
    
    if (deviceAddresses.length) {
      logWarn(`[ESPHome] Could not find device(s) with addresses: ${deviceAddresses.join(', ')}`);
    }
    
    return bleDevices;
  }

  async discoverBLEDevices(
    onNewDeviceFound: (bleDevice: IBLEDevice) => void,
    complete: Deferred<void>
  ) {
    const seenAddresses: number[] = [];
    const listenerBuilder = (connection: Connection) => ({
      connection,
      listener: (advertisement: any) => {
        let { name, address } = advertisement;
        if (seenAddresses.includes(address) || !name) return;
        seenAddresses.push(address);
        onNewDeviceFound(new BLEDevice(name, advertisement, connection));
      },
    });
    
    const listeners = this.connections.map(listenerBuilder);
    
    for (const { connection, listener } of listeners) {
      connection.on('message.BluetoothLEAdvertisementResponse', listener);
      connection.subscribeBluetoothAdvertisementService();
    }
    
    await complete;
    
    for (const { connection, listener } of listeners) {
      connection.off('message.BluetoothLEAdvertisementResponse', listener);
    }
  }

  private convertAddressToMac(address: number): string {
    if (!address) {
      logInfo(`[ESPHome DEBUG] convertAddressToMac: address is falsy: ${address}`);
      return '';
    }
    
    // Convert numeric address to MAC address format
    const hex = address.toString(16).padStart(12, '0');
    const mac = hex.match(/.{2}/g)?.join(':') || '';
    logInfo(`[ESPHome DEBUG] convertAddressToMac: ${address} -> ${hex} -> ${mac}`);
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
    logInfo('[ESPHome] Looking specifically for devices named "RC2"...');
    const discoveredDevicesDuringScan = new Map<string, BLEDeviceAdvertisement>();
    
    this.advertisementPacketListener = (data: any) => {
      // Log raw advertisement data for debugging
      logInfo('[ESPHome DEBUG] Raw advertisement data:', JSON.stringify(data));
      
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
      // Validate MAC: must match pattern XX:XX:XX:XX:XX:XX
      if (!/^([0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}$/.test(finalAddress)) {
        logWarn('[ESPHome] Skipping device with invalid MAC address:', finalAddress);
        return;
      }
      
      logInfo(`[ESPHome DEBUG] Address processing: raw=${rawAddress}, mac=${macFromData}, converted=${convertedMac}, final=${finalAddress}`);
      
      const isRC2Device = (
        // Primary check: device name must explicitly contain "RC2"
        (data.name && data.name.toUpperCase().includes('RC2')) ||
        // Secondary check: specific MAC address patterns for known RC2 beds
        (finalAddress && (
          finalAddress.toLowerCase().startsWith('c3:e7:63') ||
          finalAddress.toLowerCase().startsWith('f6:21:dd')
        ))
      );

      // Log all devices for debugging, but only process RC2 devices
      logInfo(`[ESPHome DEBUG] Processing device: ${data.name || 'Unknown'} (${finalAddress}) - IsRC2: ${isRC2Device}`);

      const discoveredDevice: BLEDeviceAdvertisement = {
        name: data.name || (isRC2Device ? 'RC2' : 'Unknown Device'),
        address: rawAddress, 
        rssi: data.rssi,
        service_uuids: data.serviceUuids || data.service_uuids || [],
      };

      if (isRC2Device) {
        if (!discoveredDevicesDuringScan.has(discoveredDevice.address.toString())) {
          logInfo('[ESPHome SCAN] Found RC2 device!');
          logInfo(`[ESPHome SCAN] Name: ${discoveredDevice.name}`);
          logInfo(`[ESPHome SCAN] MAC Address: ${discoveredDevice.address}`);
          logInfo(`[ESPHome SCAN] RSSI: ${discoveredDevice.rssi}`);
          logInfo(`[ESPHome SCAN] Service UUIDs: ${discoveredDevice.service_uuids.join(', ') || 'None'}`);
          discoveredDevicesDuringScan.set(discoveredDevice.address.toString(), discoveredDevice);
        }
        onDeviceDiscoveredDuringScan(discoveredDevice);
      }
    };

    try {
      primaryConnection.on('message.BluetoothLEAdvertisementResponse', this.advertisementPacketListener);
      await primaryConnection.subscribeBluetoothAdvertisementService();
      this.isProxyScanning = true;
      logInfo('[ESPHome] Scan started successfully. Waiting for RC2 devices...');

      return new Promise((resolve, _reject) => {
        this.scanTimeoutId = setTimeout(async () => {
          const devices = Array.from(discoveredDevicesDuringScan.values());
          logInfo(`[ESPHome] Scan completed. Found ${devices.length} RC2 device(s).`);
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
