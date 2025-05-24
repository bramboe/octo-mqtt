import { IBLEDevice } from './types/IBLEDevice';
import { BLEDeviceAdvertisement } from '../BLE/BLEController';
export interface IESPConnection {
    getBLEDevices(deviceNames: string[]): Promise<IBLEDevice[]>;
    reconnect(): Promise<void>;
    disconnect(): void;
    startBleScan(durationMs: number, onDeviceDiscoveredDuringScan: (device: BLEDeviceAdvertisement) => void): Promise<BLEDeviceAdvertisement[]>;
    stopBleScan(): Promise<void>;
}
