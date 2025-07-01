import { EventEmitter } from 'events';
import { BLEDeviceAdvertisement } from '../BLE/BLEController';
import { IBLEDevice } from './types/IBLEDevice';

export interface IESPConnection extends EventEmitter {
  reconnect(): Promise<void>;
  disconnect(): void;
  getBLEDevices(deviceNames: string[], nameMapper?: (name: string) => string): Promise<IBLEDevice[]>;
  startBleScan(
    durationMs: number,
    onDeviceDiscoveredDuringScan: (device: BLEDeviceAdvertisement) => void
  ): Promise<BLEDeviceAdvertisement[]>;
  stopBleScan?(): Promise<void>;
  hasActiveConnections(): boolean;
  waitForConnection(maxWaitTime?: number): Promise<boolean>;
} 