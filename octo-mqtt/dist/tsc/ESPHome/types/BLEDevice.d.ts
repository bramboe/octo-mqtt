import { Connection } from '@2colors/esphome-native-api';
import { IBLEDevice } from './IBLEDevice';
export declare class BLEDevice implements IBLEDevice {
    name: string;
    advertisement: any;
    private connection;
    private connected;
    private pendingReads;
    mac: string;
    private emitter;
    constructor(name: string, advertisement: any, connection: Connection);
    get address(): any;
    connect: () => Promise<void>;
    disconnect: () => Promise<void>;
    writeCharacteristic: (handle: number, bytes: Uint8Array, response?: boolean) => Promise<void>;
    getCharacteristic: (serviceUuid: string, characteristicUuid: string) => Promise<import("@2colors/esphome-native-api").BluetoothGATTCharacteristic | undefined>;
    subscribeToCharacteristic: (handle: number, notify: (data: Uint8Array) => void) => Promise<void>;
    getServices: () => Promise<import("@2colors/esphome-native-api").BluetoothGATTService[]>;
    getDeviceInfo: () => Promise<any>;
    readCharacteristic: (handle: number) => Promise<Uint8Array>;
    cleanup: () => void;
}
