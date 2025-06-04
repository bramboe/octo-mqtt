export interface IBLEDevice {
  /** The device name */
  name: string;
  /** The device MAC address in string format (e.g. "00:11:22:33:44:55") */
  mac: string;
  /** The device address as a number (used for ESPHome native API) */
  address: number;
  /** The raw advertisement data from ESPHome */
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
