import { Connection } from '@2colors/esphome-native-api';
import { logInfo, logError, logWarn } from '@utils/logger';
import { EventEmitter } from 'events';

export interface BLEDeviceAdvertisement {
  name: string;
  address: string;
  rssi: number;
}

export class BLEController extends EventEmitter {
  private keepAliveInterval: NodeJS.Timeout | null = null;
  private isConnected = false;
  private readonly SERVICE_UUID = 'ffe0';
  private readonly CHARACTERISTIC_UUID = 'ffe1';
  private readonly KEEP_ALIVE_INTERVAL = 30000; // 30 seconds
  private address: number = 0;

  constructor(private connection: Connection) {
    super();
    this.setupConnectionHandlers();
  }

  private setupConnectionHandlers() {
    this.connection.on('error', (error) => {
      logError('[BLE] Connection error:', error);
      this.emit('error', error);
    });

    this.connection.on('disconnect', () => {
      logInfo('[BLE] Device disconnected');
      this.isConnected = false;
      this.stopKeepAlive();
      this.emit('disconnected');
    });
  }

  async connectToDevice(macAddress: string) {
    try {
      logInfo(`[BLE] Attempting to connect to device: ${macAddress}`);
      
      // Format MAC address to match ESPHome format (uppercase, no colons)
      const formattedMac = macAddress.replace(/:/g, '').toUpperCase();
      
      // Subscribe to BLE advertisements to find the device
      await this.connection.subscribeBluetoothAdvertisementService();
      
      // Wait for the device advertisement
      const device = await this.waitForDevice(formattedMac);
      if (!device) {
        throw new Error(`Device with MAC ${macAddress} not found`);
      }

      // Set the device address
      this.address = parseInt(device.address, 16);

      // Connect to the device
      await this.connection.connectBluetoothDeviceService(this.address, 0);
      this.isConnected = true;
      
      // Start keep-alive mechanism
      this.startKeepAlive();
      
      logInfo(`[BLE] Successfully connected to device: ${macAddress}`);
      this.emit('connected');
      
      return true;
    } catch (error) {
      logError('[BLE] Failed to connect:', error);
      this.emit('error', error);
      return false;
    }
  }

  private async waitForDevice(macAddress: string): Promise<BLEDeviceAdvertisement | null> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.connection.off('message.BluetoothLEAdvertisementResponse', listener);
        resolve(null);
      }, 30000); // 30 second timeout

      const listener = (advertisement: any) => {
        const deviceMac = advertisement.address.toString(16).padStart(12, '0').toUpperCase();
        if (deviceMac === macAddress) {
          clearTimeout(timeout);
          this.connection.off('message.BluetoothLEAdvertisementResponse', listener);
          resolve({
            name: advertisement.name,
            address: deviceMac,
            rssi: advertisement.rssi
          });
        }
      };

      this.connection.on('message.BluetoothLEAdvertisementResponse', listener);
    });
  }

  private startKeepAlive() {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
    }

    // Send initial keep-alive
    this.sendKeepAlive();

    // Set up interval for subsequent keep-alive messages
    this.keepAliveInterval = setInterval(() => {
      this.sendKeepAlive();
    }, this.KEEP_ALIVE_INTERVAL);
  }

  private async sendKeepAlive() {
    try {
      if (!this.isConnected) {
        return;
      }

      const keepAliveCommand = new Uint8Array([
        0x40, 0x20, 0x43, 0x00, 0x04, 0x00, 0x01, 0x09, 0x08, 0x07, 0x40
      ]);

      await this.writeCharacteristic(keepAliveCommand);
      logInfo('[BLE] Keep-alive sent successfully');
    } catch (error) {
      logError('[BLE] Failed to send keep-alive:', error);
      this.stopKeepAlive();
      this.emit('error', error);
    }
  }

  private stopKeepAlive() {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }
  }

  async writeCharacteristic(data: Uint8Array) {
    try {
      const services = await this.connection.listBluetoothGATTServicesService(this.address);
      const service = services.servicesList.find(s => s.uuid === this.SERVICE_UUID);
      
      if (!service) {
        throw new Error(`Service ${this.SERVICE_UUID} not found`);
      }

      const characteristic = service.characteristicsList.find(c => c.uuid === this.CHARACTERISTIC_UUID);
      if (!characteristic) {
        throw new Error(`Characteristic ${this.CHARACTERISTIC_UUID} not found`);
      }

      await this.connection.writeBluetoothGATTCharacteristicService(
        this.address,
        characteristic.handle,
        data,
        true
      );
    } catch (error) {
      logError('[BLE] Failed to write characteristic:', error);
      throw error;
    }
  }

  disconnect() {
    this.stopKeepAlive();
    if (this.isConnected) {
      this.connection.disconnectBluetoothDeviceService(this.address);
      this.isConnected = false;
    }
  }
} 