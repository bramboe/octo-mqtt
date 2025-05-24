import { EventEmitter } from 'events';
import { IESPConnection } from '../ESPHome/IESPConnection';
import { BLEDeviceAdvertisement } from '../BLE/BLEController';
export declare class BLEScanner {
    private isScanning;
    private scanStartTime;
    private scanTimeout;
    private readonly SCAN_DURATION_MS;
    private discoveredDevices;
    private esphomeConnection;
    constructor(esphomeConnection: IESPConnection & EventEmitter);
    startScan(): Promise<void>;
    stopScan(): Promise<void>;
    getScanStatus(): {
        isScanning: boolean;
        scanTimeRemaining: number;
        discoveredDevices: number;
        devices: (BLEDeviceAdvertisement & {
            isConfigured: boolean;
            configuredName?: string;
        })[];
    };
    getDevice(address: string): BLEDeviceAdvertisement | undefined;
    private cleanupScanState;
}
