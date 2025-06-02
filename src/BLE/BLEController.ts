import { EventEmitter } from 'events';
import { logInfo, logError, logWarn } from '../Utils/logger';
import { IBLEDevice } from '../ESPHome/types/IBLEDevice';
import { IESPConnection } from '../ESPHome/IESPConnection';
import { IController } from '../Common/IController';
import { Dictionary } from '../Utils/Dictionary';
import { IDeviceData } from '../HomeAssistant/IDeviceData';

export interface BLEDeviceAdvertisement {
  name: string;
  address: number;
  rssi: number;
  service_uuids: string[];
}

export interface Command {
  data: number[];
  retries?: number;
  waitTime?: number;
}

export interface LightCache {
  state: boolean;
  brightness: number;
}

export class BLEController extends EventEmitter implements IController<Command | number[]> {
  public cache: Dictionary<Object> = {};
  public deviceData: IDeviceData = {
    deviceTopic: '',
    device: {
      ids: [],
      name: '',
      mf: '',
      mdl: ''
    }
  };

  private connectedDevices = new Map<number, IBLEDevice>();
  private keepAliveIntervals = new Map<number, NodeJS.Timeout>();
  private reconnectAttempts = new Map<number, number>();
  private readonly MAX_RECONNECT_ATTEMPTS = 5;
  private readonly KEEP_ALIVE_INTERVAL = 30000; // 30 seconds
  private readonly SERVICE_UUID = 'ffe0';
  private readonly CHARACTERISTIC_UUID = 'ffe1';

  constructor(private espConnection: IESPConnection) {
    super();
  }

  async connectToDevice(deviceAddress: number, pin: string): Promise<boolean> {
    try {
      logInfo(`[BLE] Attempting to connect to device: ${deviceAddress.toString(16)}`);
      
      // Get the device from ESPHome
      const devices = await this.espConnection.getBLEDevices([deviceAddress]);
      if (devices.length === 0) {
        logError(`[BLE] Device not found: ${deviceAddress.toString(16)}`);
        return false;
      }

      const device = devices[0];
      
      // Connect to the device
      await device.connect();
      
      // Get the characteristic for communication
      const characteristic = await device.getCharacteristic(this.SERVICE_UUID, this.CHARACTERISTIC_UUID);
      if (!characteristic) {
        logError(`[BLE] Required characteristic not found for device: ${deviceAddress.toString(16)}`);
        await device.disconnect();
        return false;
      }

      // Store the connected device
      this.connectedDevices.set(deviceAddress, device);
      
      // Start keep-alive mechanism
      this.startKeepAlive(deviceAddress, device);
      
      // Reset reconnect attempts on successful connection
      this.reconnectAttempts.set(deviceAddress, 0);
      
      logInfo(`[BLE] Successfully connected to device: ${deviceAddress.toString(16)}`);
      this.emit('deviceConnected', deviceAddress);
      
      return true;
    } catch (error) {
      logError(`[BLE] Error connecting to device ${deviceAddress.toString(16)}:`, error);
      return false;
    }
  }

  private startKeepAlive(deviceAddress: number, device: IBLEDevice) {
    // Clear any existing interval
    this.stopKeepAlive(deviceAddress);
    
    // Create new keep-alive interval
    const interval = setInterval(async () => {
      try {
        // Send keep-alive command based on the YAML configuration
        await device.writeCharacteristic(
          0x0B, // Handle for the characteristic
          new Uint8Array([0x40, 0x20, 0x43, 0x00, 0x04, 0x00, 0x01, 0x09, 0x08, 0x07, 0x40])
        );
        logInfo(`[BLE] Keep-alive sent to device: ${deviceAddress.toString(16)}`);
      } catch (error) {
        logError(`[BLE] Keep-alive failed for device ${deviceAddress.toString(16)}:`, error);
        await this.handleConnectionError(deviceAddress);
      }
    }, this.KEEP_ALIVE_INTERVAL);

    this.keepAliveIntervals.set(deviceAddress, interval);
  }

  private stopKeepAlive(deviceAddress: number) {
    const interval = this.keepAliveIntervals.get(deviceAddress);
    if (interval) {
      clearInterval(interval);
      this.keepAliveIntervals.delete(deviceAddress);
    }
  }

  private async handleConnectionError(deviceAddress: number) {
    const attempts = (this.reconnectAttempts.get(deviceAddress) || 0) + 1;
    this.reconnectAttempts.set(deviceAddress, attempts);

    if (attempts <= this.MAX_RECONNECT_ATTEMPTS) {
      logWarn(`[BLE] Attempting to reconnect to device ${deviceAddress.toString(16)} (attempt ${attempts}/${this.MAX_RECONNECT_ATTEMPTS})`);
      await this.disconnectDevice(deviceAddress);
      const device = this.connectedDevices.get(deviceAddress);
      if (device) {
        try {
          await device.connect();
          this.startKeepAlive(deviceAddress, device);
          this.reconnectAttempts.set(deviceAddress, 0);
          logInfo(`[BLE] Successfully reconnected to device: ${deviceAddress.toString(16)}`);
        } catch (error) {
          logError(`[BLE] Reconnection attempt failed for device ${deviceAddress.toString(16)}:`, error);
        }
      }
    } else {
      logError(`[BLE] Max reconnection attempts reached for device: ${deviceAddress.toString(16)}`);
      await this.disconnectDevice(deviceAddress);
      this.emit('deviceDisconnected', deviceAddress);
    }
  }

  async disconnectDevice(deviceAddress: number) {
    try {
      const device = this.connectedDevices.get(deviceAddress);
      if (device) {
        await device.disconnect();
        this.connectedDevices.delete(deviceAddress);
      }
      this.stopKeepAlive(deviceAddress);
      this.reconnectAttempts.delete(deviceAddress);
      logInfo(`[BLE] Disconnected from device: ${deviceAddress.toString(16)}`);
    } catch (error) {
      logError(`[BLE] Error disconnecting from device ${deviceAddress.toString(16)}:`, error);
    }
  }

  async disconnectAll() {
    const addresses = Array.from(this.connectedDevices.keys());
    await Promise.all(addresses.map(addr => this.disconnectDevice(addr)));
  }

  async writeCommand(command: Command | number[], count: number = 1, waitTime: number = 0): Promise<void> {
    const data = Array.isArray(command) ? command : command.data;
    const retries = !Array.isArray(command) && command.retries ? command.retries : 1;
    const commandWaitTime = !Array.isArray(command) && command.waitTime ? command.waitTime : waitTime;

    for (let i = 0; i < count; i++) {
      for (let j = 0; j < retries; j++) {
        try {
          for (const device of this.connectedDevices.values()) {
            await device.writeCharacteristic(0x0B, new Uint8Array(data));
          }
          if (commandWaitTime > 0 && i < count - 1) {
            await new Promise(resolve => setTimeout(resolve, commandWaitTime));
          }
          break;
        } catch (error) {
          logError(`[BLE] Error writing command (attempt ${j + 1}/${retries}):`, error);
          if (j === retries - 1) throw error;
        }
      }
    }
  }

  async writeCommands(commands: (Command | number[])[], count: number = 1, waitTime: number = 0): Promise<void> {
    for (let i = 0; i < count; i++) {
      for (const command of commands) {
        await this.writeCommand(command);
      }
      if (waitTime > 0 && i < count - 1) {
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }

  async cancelCommands(): Promise<void> {
    // Implementation depends on your specific needs
    logWarn('[BLE] Command cancellation not implemented');
  }

  async setPin(pin: string): Promise<void> {
    const pinBytes = pin.split('').map(Number);
    await this.writeCommand({
      data: [0x40, 0x20, 0x43, 0x00, 0x04, ...pinBytes],
      retries: 3
    });
  }
} 