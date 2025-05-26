import { logInfo, logWarn, logError } from '@utils/logger';
import { BLEDeviceAdvertisement } from '../BLE/BLEController';
import { IESPConnection } from './IESPConnection';
import { EventEmitter } from 'events';
import { Deferred } from '@utils/deferred';
import { setTimeout, clearTimeout } from 'timers';

export class ESPConnection implements IESPConnection {
  private advertisementPacketListener: ((data: any) => void) | null = null;
  private connections: any[] = [];
  private isProxyScanning = false;
  private scanTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private activeDevices = new Set<any>();

  private async cleanupScan(): Promise<void> {
    if (this.advertisementPacketListener) {
      this.connections[0]?.off('message.BluetoothLEAdvertisementResponse', this.advertisementPacketListener);
      this.advertisementPacketListener = null;
    }
    if (this.scanTimeoutId) {
      clearTimeout(this.scanTimeoutId);
      this.scanTimeoutId = null;
    }
    this.isProxyScanning = false;
  }

  async stopBleScan(): Promise<void> {
    logInfo('[ESPHome] Attempting to stop BLE scan via primary proxy...');
    await this.cleanupScan();
    if (this.connections[0]?.unsubscribeBluetoothAdvertisementService) {
      await this.connections[0].unsubscribeBluetoothAdvertisementService();
    }
    logInfo('[ESPHome] BLE scan stopped.');
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
    logInfo('[ESPHome] Looking specifically for RC2 devices...');
    const discoveredDevicesDuringScan = new Map<string, BLEDeviceAdvertisement>();
    
    this.advertisementPacketListener = (data: any) => {
      // Log raw advertisement data for debugging
      logInfo('[ESPHome DEBUG] Raw advertisement data:', JSON.stringify(data));
      
      const discoveredDevice: BLEDeviceAdvertisement = {
        name: data.name || 'RC2',  // Default to RC2 if no name
        address: data.address || data.mac, 
        rssi: data.rssi,
        service_uuids: data.serviceUuids || data.service_uuids || [],
      };

      // Check if this is an RC2 device by looking at the manufacturer data
      const isRC2Device = data.manufacturerDataList?.some((mfgData: any) => {
        // RC2 devices typically use specific manufacturer IDs
        return mfgData.uuid === '0000004c-0000-1000-8000-00805f9b34fb' ||
               mfgData.uuid === '00000075-0000-1000-8000-00805f9b34fb';
      });

      if (isRC2Device) {
        if (!discoveredDevicesDuringScan.has(discoveredDevice.address)) {
          logInfo('[ESPHome SCAN] Found RC2 device!');
          logInfo(`[ESPHome SCAN] Name: ${discoveredDevice.name}`);
          logInfo(`[ESPHome SCAN] MAC Address: ${discoveredDevice.address}`);
          logInfo(`[ESPHome SCAN] RSSI: ${discoveredDevice.rssi}`);
          logInfo(`[ESPHome SCAN] Service UUIDs: ${discoveredDevice.service_uuids.join(', ') || 'None'}`);
          discoveredDevicesDuringScan.set(discoveredDevice.address, discoveredDevice);
          onDeviceDiscoveredDuringScan(discoveredDevice);
        }
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

  // ... rest of the class implementation ...
} 