import { Connection } from '@2colors/esphome-native-api';
import { Deferred } from '@utils/deferred';
import { logError, logInfo, logWarn } from '@utils/logger';
import { IESPConnection } from './IESPConnection';
import { connect } from './connect';
import { BLEDevice } from './types/BLEDevice';
import { IBLEDevice } from './types/IBLEDevice';
import { BLEDeviceAdvertisement } from '../BLE/BLEController';
import { EventEmitter } from 'events';

declare let rawAdvertisements: any[];

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

  async getBLEDevices(deviceNames: string[]): Promise<IBLEDevice[]> {
    logInfo(`[ESPHome] Searching for device(s): ${deviceNames.join(', ')}`);
    deviceNames = deviceNames.map((name) => name.toLowerCase());
    const bleDevices: IBLEDevice[] = [];
    const complete = new Deferred<void>();
    
    await this.discoverBLEDevices(
      (bleDevice) => {
        const { name, mac } = bleDevice;
        let index = deviceNames.indexOf(mac);
        if (index === -1) index = deviceNames.indexOf(name.toLowerCase());
        if (index === -1) return;

        deviceNames.splice(index, 1);
        logInfo(`[ESPHome] Found device: ${name} (${mac})`);
        bleDevices.push(bleDevice);
        this.activeDevices.add(bleDevice);
        if (deviceNames.length) return;
        complete.resolve();
      },
      complete
    );
    
    if (deviceNames.length) {
      logWarn(`[ESPHome] Could not find address for device(s): ${deviceNames.join(', ')}`);
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
      if (typeof rawAdvertisements !== 'undefined') {
        rawAdvertisements.push(data);
      }
      logInfo('[RAW ADV]', JSON.stringify(data));
      
      // Debug the address conversion process
      const rawAddress = data.address;
      const macFromData = data.mac;
      const convertedMac = rawAddress ? this.convertAddressToMac(rawAddress) : '';
      const finalAddress = macFromData || convertedMac;
      
      logInfo(`[ESPHome DEBUG] Address processing: raw=${rawAddress}, mac=${macFromData}, converted=${convertedMac}, final=${finalAddress}`);
      
      // Accept ALL devices for discovery (remove RC2/MAC filter)
      const isRC2Device = true; // <-- Changed: always true, discover all devices

      // Log all devices for debugging, and process all
      logInfo(`[ESPHome DEBUG] Processing device: ${data.name || 'Unknown'} (${finalAddress}) - IsRC2: ${isRC2Device}`);

      const discoveredDevice: BLEDeviceAdvertisement = {
        name: data.name || 'Unknown Device',
        address: finalAddress, 
        rssi: data.rssi,
        service_uuids: data.serviceUuids || data.service_uuids || [],
      };

      if (isRC2Device) {
        if (!discoveredDevicesDuringScan.has(discoveredDevice.address)) {
          logInfo('[ESPHome SCAN] Found device!');
          logInfo(`[ESPHome SCAN] Name: ${discoveredDevice.name}`);
          logInfo(`[ESPHome SCAN] MAC Address: ${discoveredDevice.address}`);
          logInfo(`[ESPHome SCAN] RSSI: ${discoveredDevice.rssi}`);
          logInfo(`[ESPHome SCAN] Service UUIDs: ${discoveredDevice.service_uuids.join(', ') || 'None'}`);
          discoveredDevicesDuringScan.set(discoveredDevice.address, discoveredDevice);
        }
        onDeviceDiscoveredDuringScan(discoveredDevice);
      }
    };

    try {
      primaryConnection.on('message.BluetoothLEAdvertisementResponse', this.advertisementPacketListener);
      await primaryConnection.subscribeBluetoothAdvertisementService();
      this.isProxyScanning = true;
      logInfo('[ESPHome] Scan started successfully. Waiting for RC2 devices...');

      return new Promise((resolve) => {
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
