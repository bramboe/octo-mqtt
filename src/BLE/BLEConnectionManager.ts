import { IBLEDevice } from '../ESPHome/types/IBLEDevice';
import { logInfo, logError, logWarn } from '../Utils/logger';
import { EventEmitter } from 'events';

export class BLEConnectionManager extends EventEmitter {
  private keepAliveInterval: NodeJS.Timeout | null = null;
  private readonly KEEP_ALIVE_INTERVAL = 30000; // 30 seconds
  private isConnected = false;

  constructor(private device: IBLEDevice) {
    super();
    this.setupConnectionHandlers();
  }

  private setupConnectionHandlers() {
    this.on('connect', () => {
      this.isConnected = true;
      this.startKeepAlive();
      logInfo(`[BLE] Connected to device ${this.device.name} (${this.device.mac})`);
    });

    this.on('disconnect', () => {
      this.isConnected = false;
      this.stopKeepAlive();
      logInfo(`[BLE] Disconnected from device ${this.device.name} (${this.device.mac})`);
    });
  }

  public async connect() {
    try {
      await this.device.connect();
      this.emit('connect');
      
      // Get the FFE1 characteristic for keep-alive
      const characteristic = await this.device.getCharacteristic(
        'ffe0',  // Service UUID from your YAML
        'ffe1'   // Characteristic UUID from your YAML
      );

      if (!characteristic) {
        throw new Error('Required characteristic FFE1 not found');
      }

      return true;
    } catch (error) {
      logError(`[BLE] Failed to connect to device ${this.device.name}:`, error);
      return false;
    }
  }

  public async disconnect() {
    try {
      await this.device.disconnect();
      this.emit('disconnect');
      return true;
    } catch (error) {
      logError(`[BLE] Failed to disconnect from device ${this.device.name}:`, error);
      return false;
    }
  }

  private async sendKeepAlive() {
    try {
      // This is the keep-alive command from your YAML
      const keepAliveCommand = new Uint8Array([
        0x40, 0x20, 0x43, 0x00, 0x04, 0x00, 0x01, 0x09, 0x08, 0x07, 0x40
      ]);

      const characteristic = await this.device.getCharacteristic('ffe0', 'ffe1');
      if (!characteristic) {
        throw new Error('Required characteristic FFE1 not found');
      }

      await this.device.writeCharacteristic(characteristic.handle, keepAliveCommand);
      logInfo(`[BLE] Keep-alive sent to ${this.device.name}`);
    } catch (error) {
      logWarn(`[BLE] Failed to send keep-alive to ${this.device.name}:`, error);
      // If keep-alive fails, try to reconnect
      this.emit('disconnect');
      await this.connect();
    }
  }

  private startKeepAlive() {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
    }

    this.keepAliveInterval = setInterval(() => {
      if (this.isConnected) {
        this.sendKeepAlive();
      }
    }, this.KEEP_ALIVE_INTERVAL);
  }

  private stopKeepAlive() {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }
  }
} 