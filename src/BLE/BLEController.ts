import { EventEmitter } from 'events';
import { logInfo, logError, logWarn } from '@utils/logger';
import { IBLEDevice } from '../ESPHome/types/IBLEDevice';
import { IESPConnection } from '../ESPHome/IESPConnection';
import { IController } from '../Common/IController';
import { Dictionary } from '@utils/Dictionary';
import { IDeviceData } from '@homeassistant/IDeviceData';
import { MQTTDevicePlaceholder } from '@homeassistant/MQTTDevicePlaceholder';

export interface BLEDeviceAdvertisement {
  name: string;
  address: number;
  rssi: number;
  service_uuids: string[];
}

export interface Command {
  command: number[];
  data?: number[];
  retries?: number;
  waitTime?: number;
}

export type CommandInput = Command | number[];

export interface LightCache {
  state: boolean;
  brightness: number;
}

export class BLEController extends EventEmitter implements IController<CommandInput> {
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
  private isScanning = false;
  private scanTimeoutId: NodeJS.Timeout | null = null;

  constructor(private espConnection: IESPConnection) {
    super();
  }

  private updateDeviceData(deviceAddress: number, device: IBLEDevice) {
    const mac = this.convertAddressToMac(deviceAddress);
    const mqttDevice: MQTTDevicePlaceholder = {
      identifiers: [mac],
      name: device.name,
      manufacturer: 'Ergomotion',
      model: 'RC2'
    };

    this.deviceData = {
      deviceTopic: `ergomotion/${mac}`,
      device: {
        ids: mqttDevice.identifiers,
        name: mqttDevice.name,
        mf: mqttDevice.manufacturer || '',
        mdl: mqttDevice.model || '',
        sw_version: mqttDevice.sw_version
      }
    };
  }

  public async connect(deviceAddress: number): Promise<IBLEDevice | null> {
    const mac = this.convertAddressToMac(deviceAddress);
    logInfo(`[BLE] Connecting to device ${mac} (address: ${deviceAddress})`);
    
    if (this.connectedDevices.has(deviceAddress)) {
      logInfo(`[BLE] Device ${mac} already connected`);
      return this.connectedDevices.get(deviceAddress)!;
    }

    try {
      const devices = await this.espConnection.getBLEDevices([mac]);
      if (devices.length === 0) {
        logError(`[BLE] Device ${mac} not found`);
        return null;
      }

      const device = devices[0];
      await device.connect();
      this.connectedDevices.set(deviceAddress, device);
      this.setupKeepAlive(deviceAddress);
      this.resetReconnectAttempts(deviceAddress);
      this.updateDeviceData(deviceAddress, device);

      return device;
    } catch (error) {
      logError(`[BLE] Failed to connect to device ${mac}:`, error);
      return null;
    }
  }

  private convertAddressToMac(address: number): string {
    return address.toString(16).padStart(12, '0').match(/.{2}/g)?.join(':').toLowerCase() || '';
  }

  private setupKeepAlive(deviceAddress: number) {
    const mac = this.convertAddressToMac(deviceAddress);
    this.keepAliveIntervals.set(
      deviceAddress,
      setInterval(() => {
        this.checkConnection(deviceAddress).catch(error => {
          logError(`[BLE] Keep-alive check failed for device ${mac}:`, error);
        });
      }, this.KEEP_ALIVE_INTERVAL)
    );
  }

  private async checkConnection(deviceAddress: number) {
    const mac = this.convertAddressToMac(deviceAddress);
    if (!this.connectedDevices.has(deviceAddress)) {
      logWarn(`[BLE] Device ${mac} not in connected devices map`);
      return;
    }

    const device = this.connectedDevices.get(deviceAddress)!;
    try {
      await device.getDeviceInfo();
    } catch (error) {
      logWarn(`[BLE] Lost connection to device ${mac}, attempting to reconnect...`);
      await this.handleDisconnect(deviceAddress);
    }
  }

  private async handleDisconnect(deviceAddress: number) {
    const mac = this.convertAddressToMac(deviceAddress);
    const device = this.connectedDevices.get(deviceAddress);
    if (!device) {
      logWarn(`[BLE] Device ${mac} not found in connected devices map during disconnect`);
      return;
    }

    try {
      await device.disconnect();
    } catch (error) {
      logError(`[BLE] Error disconnecting device ${mac}:`, error);
    }

    this.connectedDevices.delete(deviceAddress);
    await this.reconnect(deviceAddress);
  }

  private async reconnect(deviceAddress: number) {
    const mac = this.convertAddressToMac(deviceAddress);
    try {
      const device = await this.connect(deviceAddress);
      if (!device) {
        logError(`[BLE] Failed to reconnect to device ${mac}`);
        return;
      }
      logInfo(`[BLE] Successfully reconnected to device ${mac}`);
    } catch (error) {
      logError(`[BLE] Error during reconnect to device ${mac}:`, error);
    }
  }

  private resetReconnectAttempts(deviceAddress: number) {
    this.reconnectAttempts.set(deviceAddress, 0);
  }

  public async disconnect(deviceAddress: number): Promise<void> {
    logInfo(`[BLE] Disconnecting from device ${deviceAddress}`);
    
    if (this.keepAliveIntervals.has(deviceAddress)) {
      clearInterval(this.keepAliveIntervals.get(deviceAddress)!);
      this.keepAliveIntervals.delete(deviceAddress);
    }

    if (this.connectedDevices.has(deviceAddress)) {
      const device = this.connectedDevices.get(deviceAddress)!;
      await device.disconnect();
      this.connectedDevices.delete(deviceAddress);
    }
  }

  public async disconnectAll(): Promise<void> {
    logInfo('[BLE] Disconnecting from all devices');
    await Promise.all(
      Array.from(this.connectedDevices.keys()).map(deviceAddress =>
        this.disconnect(deviceAddress)
      )
    );
  }

  public async writeCommand(command: CommandInput, count: number = 1, waitTime: number = 0): Promise<void> {
    const commandData = Array.isArray(command) ? command : command.command;
    const effectiveWaitTime = Array.isArray(command) ? waitTime : (command.waitTime || waitTime);
    const retries = Array.isArray(command) ? 1 : (command.retries || 1);

    for (let i = 0; i < count; i++) {
      for (let retry = 0; retry < retries; retry++) {
        try {
          await this.sendCommand(commandData);
          break; // Success, exit retry loop
        } catch (error) {
          if (retry === retries - 1) {
            logError('[BLE] Error writing command after all retries:', error);
            throw error;
          }
          logWarn(`[BLE] Retry ${retry + 1}/${retries} for command:`, error);
          await new Promise(resolve => setTimeout(resolve, 100)); // Wait before retry
        }
      }

      if (effectiveWaitTime > 0 && i < count - 1) {
        await new Promise(resolve => setTimeout(resolve, effectiveWaitTime));
      }
    }
  }

  public async writeCommands(commands: CommandInput[], count: number = 1, waitTime: number = 0): Promise<void> {
    for (let i = 0; i < count; i++) {
      for (const command of commands) {
        await this.writeCommand(command);
      }
      if (waitTime > 0 && i < count - 1) {
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }

  public async cancelCommands(): Promise<void> {
    // Implementation for canceling commands if needed
    logWarn('[BLE] Command cancellation not implemented');
  }

  private async sendCommand(command: number[]): Promise<void> {
    if (this.connectedDevices.size === 0) {
      throw new Error('No connected devices');
    }

    const device = this.connectedDevices.values().next().value;
    if (!device) {
      throw new Error('No connected device found');
    }

    try {
      const characteristic = await device.getCharacteristic(
        this.SERVICE_UUID,
        this.CHARACTERISTIC_UUID
      );
      if (!characteristic) {
        throw new Error('Required characteristic not found');
      }

      await device.writeCharacteristic(
        characteristic.handle,
        Uint8Array.from(command)
      );
    } catch (error) {
      logError('[BLE] Failed to send command:', error);
      throw error;
    }
  }

  public setPin(pin: string): void {
    const pinBytes = pin.split('').map(c => parseInt(c));
    this.writeCommand([0x20, 0x73, ...pinBytes]).catch(error => {
      logError('[BLE] Failed to set PIN:', error);
    });
  }

  public async scan(): Promise<void> {
    if (this.isScanning) {
      logWarn('[BLE] Scan already in progress');
      return;
    }

    try {
      this.isScanning = true;
      this.emit('scan', { status: 'started', scanning: true });

      const onDeviceDiscovered = (device: BLEDeviceAdvertisement) => {
        this.emit('device_discovered', device);
      };

      await this.espConnection.startBleScan(30000, onDeviceDiscovered);
      
      // Set a timeout to stop scanning after 30 seconds
      this.scanTimeoutId = setTimeout(() => {
        this.stopScan().catch(error => {
          logError('[BLE] Error stopping scan:', error);
        });
      }, 30000);

    } catch (error) {
      this.isScanning = false;
      logError('[BLE] Error starting scan:', error);
      throw error;
    }
  }

  public async stopScan(): Promise<void> {
    if (!this.isScanning) {
      return;
    }

    try {
      await this.espConnection.stopBleScan();
    } catch (error) {
      logError('[BLE] Error stopping scan:', error);
      throw error;
    } finally {
      this.isScanning = false;
      if (this.scanTimeoutId) {
        clearTimeout(this.scanTimeoutId);
        this.scanTimeoutId = null;
      }
      this.emit('scan', { status: 'stopped', scanning: false });
    }
  }
}