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

  private convertAddressToMac(address: number): string {
    return address.toString(16).padStart(12, '0').match(/.{2}/g)?.join(':').toLowerCase() || '';
  }

  private convertMacToAddress(mac: string): number {
    return parseInt(mac.replace(/:/g, ''), 16);
  }

  async getBLEDevices(deviceAddresses: string[]): Promise<IBLEDevice[]> {
    if (this.connections.length === 0) {
      logWarn('[ESPHome] No active proxy connections to get BLE devices.');
      return [];
    }

    const devices: IBLEDevice[] = [];
    const complete = new Deferred<void>();

    await this.discoverBLEDevices(
      (device: IBLEDevice) => {
        if (deviceAddresses.includes(device.mac.toLowerCase())) {
          devices.push(device);
          if (devices.length === deviceAddresses.length) {
            complete.resolve();
          }
        }
      },
      complete
    );

    return devices;
  }

  async discoverBLEDevices(
    onNewDeviceFound: (bleDevice: IBLEDevice) => void,
    complete: Deferred<void>
  ) {
    const seenAddresses = new Set<string>();
    const listenerBuilder = (connection: Connection) => ({
      connection,
      listener: (advertisement: any) => {
        let { name, address } = advertisement;
        const mac = this.convertAddressToMac(address);
        if (seenAddresses.has(mac) || !name) return;
        seenAddresses.add(mac);
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
    const discoveredDevicesDuringScan = new Map<string, BLEDeviceAdvertisement>();

    return new Promise((resolve, reject) => {
      this.isProxyScanning = true;
      this.advertisementPacketListener = (data: any) => {
        const device = data as BLEDeviceAdvertisement;
        const deviceMac = this.convertAddressToMac(device.address);
        
        if (!discoveredDevicesDuringScan.has(deviceMac)) {
          discoveredDevicesDuringScan.set(deviceMac, device);
          onDeviceDiscoveredDuringScan(device);
        }
      };

      primaryConnection.on('message.BluetoothLEAdvertisementResponse', this.advertisementPacketListener);
      primaryConnection.subscribeBluetoothAdvertisementService();

      this.scanTimeoutId = setTimeout(async () => {
        try {
          await this.cleanupScan();
          resolve(Array.from(discoveredDevicesDuringScan.values()));
        } catch (error) {
          reject(error);
        }
      }, durationMs);
    });
  }

  private async cleanupScan(): Promise<void> {
    if (this.advertisementPacketListener && this.connections[0]) {
      this.connections[0].off('message.BluetoothLEAdvertisementResponse', this.advertisementPacketListener);
      this.advertisementPacketListener = null;
    }
    
    if (this.scanTimeoutId) {
      clearTimeout(this.scanTimeoutId);
      this.scanTimeoutId = null;
    }
    
    this.isProxyScanning = false;
  }

  async stopBleScan(): Promise<void> {
    await this.cleanupScan();
  }

  async reconnect(): Promise<void> {
    for (const connection of this.connections) {
      try {
        await connection.connect();
      } catch (error) {
        logError('[ESPHome] Failed to reconnect:', error);
      }
    }
  }

  disconnect(): void {
    for (const connection of this.connections) {
      try {
        connection.disconnect();
      } catch (error) {
        logError('[ESPHome] Error during disconnect:', error);
      }
    }
  }
}
