import { BluetoothGATTCharacteristic, BluetoothGATTService } from '@2colors/esphome-native-api';
import { BLEAdvertisement } from './BLEAdvertisement';
import { BLEDeviceInfo } from './BLEDeviceInfo';

export interface IBLEDevice {
  name: string;
  mac: string;
  address: number;
  advertisement: any;
  
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getCharacteristic(serviceUuid: string, characteristicUuid: string): Promise<any | undefined>;
  writeCharacteristic(handle: number, bytes: Uint8Array, response?: boolean): Promise<void>;
  subscribeToCharacteristic(handle: number, notify: (data: Uint8Array) => void): Promise<void>;
  getServices(): Promise<any[]>;
  getDeviceInfo(): Promise<any | undefined>;
  readCharacteristic(handle: number): Promise<Uint8Array>;
}
