import { Connection } from '@2colors/esphome-native-api';
import { Deferred } from '../Utils/deferred';
import { IESPConnection } from './IESPConnection';
import { IBLEDevice } from './types/IBLEDevice';
import { BLEDeviceAdvertisement } from '../BLE/BLEController';
export declare class ESPConnection implements IESPConnection {
    private connections;
    private advertisementPacketListener;
    private isProxyScanning;
    private scanTimeoutId;
    private activeDevices;
    constructor(connections: Connection[]);
    reconnect(): Promise<void>;
    disconnect(): void;
    getBLEDevices(deviceNames: string[]): Promise<IBLEDevice[]>;
    discoverBLEDevices(onNewDeviceFound: (bleDevice: IBLEDevice) => void, complete: Deferred<void>): Promise<void>;
    private convertAddressToMac;
    startBleScan(durationMs: number, onDeviceDiscoveredDuringScan: (device: BLEDeviceAdvertisement) => void): Promise<BLEDeviceAdvertisement[]>;
    stopBleScan(): Promise<void>;
    private cleanupScan;
}
