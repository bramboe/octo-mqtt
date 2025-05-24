import { Connection } from '@2colors/esphome-native-api';
import { logInfo, logError, logWarn } from '@utils/logger';
import { IBLEDevice } from './IBLEDevice';
import { EventEmitter } from 'events';

const READ_CHARACTERISTIC_TIMEOUT = 5000; // 5 second timeout for reads

// Type guard to check if an object is an EventEmitter
function isEventEmitter(obj: any): obj is EventEmitter {
  return obj && typeof obj === 'object' &&
         typeof obj.on === 'function' &&
         typeof obj.once === 'function' &&
         typeof obj.removeAllListeners === 'function';
}

export class BLEDevice implements IBLEDevice {
  private connected = false;
  private pendingReads = new Map<number, NodeJS.Timeout>();
  public mac: string;
  private emitter: EventEmitter | null = null;
  
  constructor(public name: string, public advertisement: any, private connection: Connection) {
    this.mac = this.address.toString(16).padStart(12, '0');
    // Check if connection is an EventEmitter
    if (isEventEmitter(connection)) {
      this.emitter = connection;
    } else {
      logWarn('[BLE] Connection does not implement EventEmitter interface');
    }
  }
  
  public get address() {
    return this.advertisement.address;
  }
  
  connect = async () => {
    const { addressType } = this.advertisement;
    await this.connection.connectBluetoothDeviceService(this.address, addressType);
    this.connected = true;
  };

  disconnect = async () => {
    this.cleanup();
    this.connected = false;
    await this.connection.disconnectBluetoothDeviceService(this.address);
  };

  writeCharacteristic = async (handle: number, bytes: Uint8Array, response = true) => {
    await this.connection.writeBluetoothGATTCharacteristicService(this.address, handle, bytes, response);
  };

  getCharacteristic = async (serviceUuid: string, characteristicUuid: string) => {
    const services = await this.getServices();
    const service = services.find(s => s.uuid === serviceUuid);
    
    if (!service) {
      logInfo('[BLE] Could not find expected service for device:', serviceUuid, this.name);
      return undefined;
    }

    const characteristic = service.characteristicsList.find(c => c.uuid === characteristicUuid);
    if (!characteristic) {
      logInfo('[BLE] Could not find expected characteristic for device:', characteristicUuid, this.name);
      return undefined;
    }

    return characteristic;
  };

  subscribeToCharacteristic = async (handle: number, notify: (data: Uint8Array) => void) => {
    this.connection.on('message.BluetoothGATTNotifyDataResponse', (message) => {
      if (message.address != this.address || message.handle != handle) return;
      notify(new Uint8Array([...Buffer.from(message.data, 'base64')]));
    });
    
    await this.connection.notifyBluetoothGATTCharacteristicService(this.address, handle);
  };

  getServices = async () => {
    const { servicesList } = await this.connection.listBluetoothGATTServicesService(this.address);
    return servicesList;
  };

  getDeviceInfo = async () => {
    const services = await this.getServices();
    const service = services.find(s => s.uuid === '0000180a-0000-1000-8000-00805f9b34fb');
    if (!service) return undefined;

    const deviceInfo: any = {};
    const setters: any = {
      '00002a24-0000-1000-8000-00805f9b34fb': (value: string) => (deviceInfo.modelNumber = value),
      '00002a25-0000-1000-8000-00805f9b34fb': (value: string) => (deviceInfo.serialNumber = value),
      '00002a26-0000-1000-8000-00805f9b34fb': (value: string) => (deviceInfo.firmwareRevision = value),
      '00002a27-0000-1000-8000-00805f9b34fb': (value: string) => (deviceInfo.hardwareRevision = value),
      '00002a28-0000-1000-8000-00805f9b34fb': (value: string) => (deviceInfo.softwareRevision = value),
      '00002a29-0000-1000-8000-00805f9b34fb': (value: string) => (deviceInfo.manufacturerName = value),
    };
    
    for (const { uuid, handle } of service.characteristicsList) {
      const setter = setters[uuid];
      if (!setter) continue;
      
      try {
        const value = await this.readCharacteristic(handle);
        setter(Buffer.from(value).toString());
      } catch {}
    }

    return deviceInfo;
  };

  readCharacteristic = async (handle: number): Promise<Uint8Array> => {
    // Clear any existing timeout for this handle
    if (this.pendingReads.has(handle)) {
      clearTimeout(this.pendingReads.get(handle));
      this.pendingReads.delete(handle);
    }

    return new Promise<Uint8Array>((resolve, reject) => {
      // Set up timeout to prevent hanging
      const timeoutId = setTimeout(() => {
        // Clean up the listener when timeout occurs
        if (this.emitter) {
          this.emitter.removeAllListeners('message.BluetoothGATTReadResponse');
        }
        this.pendingReads.delete(handle);
        reject(new Error(`Timeout reading characteristic handle ${handle}`));
      }, READ_CHARACTERISTIC_TIMEOUT);

      this.pendingReads.set(handle, timeoutId);

      // Set up one-time listener for this read request
      if (this.emitter) {
        this.emitter.once('message.BluetoothGATTReadResponse', (response) => {
          // Only handle responses for this specific read request
          if (response.address === this.address && response.handle === handle) {
            clearTimeout(timeoutId);
            this.pendingReads.delete(handle);
            resolve(new Uint8Array([...Buffer.from(response.data, 'base64')]));
          }
        });
      }

      // Send the read request
      this.connection.readBluetoothGATTCharacteristicService(this.address, handle)
        .catch(error => {
          clearTimeout(timeoutId);
          this.pendingReads.delete(handle);
          if (this.emitter) {
            this.emitter.removeAllListeners('message.BluetoothGATTReadResponse');
          }
          reject(error);
        });
    });
  };

  // Add cleanup method
  cleanup = () => {
    // Clear all pending read timeouts
    for (const [handle, timeoutId] of this.pendingReads.entries()) {
      clearTimeout(timeoutId);
      if (this.emitter) {
        this.emitter.removeAllListeners('message.BluetoothGATTReadResponse');
      }
    }
    this.pendingReads.clear();
  };
}
