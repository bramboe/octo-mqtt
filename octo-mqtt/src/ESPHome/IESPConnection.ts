import { IBLEDevice } from './types/IBLEDevice';
import { BLEDeviceAdvertisement } from '../BLE/BLEController'; // Import for type usage

export interface IESPConnection {
  getBLEDevices(deviceAddresses: number[]): Promise<IBLEDevice[]>;
  reconnect(): Promise<void>;
  disconnect(): void;
  startBleScan(
    durationMs: number,
    onDeviceDiscoveredDuringScan: (device: BLEDeviceAdvertisement) => void
  ): Promise<BLEDeviceAdvertisement[]>;
  stopBleScan(): Promise<void>;
} 