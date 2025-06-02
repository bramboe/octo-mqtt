import { EventEmitter } from 'events';
import { logInfo, logError, logWarn } from '@utils/logger';
import type { IESPConnection } from '../ESPHome/IESPConnection';

export class BLEController extends EventEmitter {
  private keepAliveInterval: NodeJS.Timeout | null = null;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private isConnected: boolean = false;
  private lastKeepAliveTime: number = 0;
  private readonly KEEP_ALIVE_INTERVAL = 30000; // 30 seconds
  private readonly RECONNECT_DELAY = 5000; // 5 seconds
  private readonly SERVICE_UUID = 'ffe0';
  private readonly CHARACTERISTIC_UUID = 'ffe1';

  constructor(
    private readonly espConnection: IESPConnection,
    private readonly deviceAddress: string,
    private readonly pin: string = '0000'
  ) {
    super();
    this.setupConnectionHandlers();
  }

  private setupConnectionHandlers() {
    this.espConnection.on('connect', () => {
      logInfo(`[BLE] Connected to device ${this.deviceAddress}`);
      this.isConnected = true;
      this.emit('connectionStatus', true);
      this.startKeepAlive();
    });

    this.espConnection.on('disconnect', () => {
      logInfo(`[BLE] Disconnected from device ${this.deviceAddress}`);
      this.isConnected = false;
      this.emit('connectionStatus', false);
      this.stopKeepAlive();
      this.scheduleReconnect();
    });

    this.espConnection.on('error', (error: Error) => {
      logError(`[BLE] Connection error for device ${this.deviceAddress}:`, error);
      this.isConnected = false;
      this.emit('connectionStatus', false);
      this.stopKeepAlive();
      this.scheduleReconnect();
    });
  }

  public async connect(): Promise<void> {
    try {
      logInfo(`[BLE] Attempting to connect to device ${this.deviceAddress}`);
      await this.espConnection.connect(this.deviceAddress, this.pin);
    } catch (error) {
      logError(`[BLE] Failed to connect to device ${this.deviceAddress}:`, error);
      this.scheduleReconnect();
    }
  }

  private async sendKeepAlive(): Promise<void> {
    if (!this.isConnected) return;

    try {
      const keepAliveCommand = [0x40, 0x20, 0x43, 0x00, 0x04, 0x00, 0x01, 0x09, 0x08, 0x07, 0x40];
      await this.espConnection.write(
        this.deviceAddress,
        this.SERVICE_UUID,
        this.CHARACTERISTIC_UUID,
        keepAliveCommand
      );
      this.lastKeepAliveTime = Date.now();
      logInfo(`[BLE] Keep-alive sent to device ${this.deviceAddress}`);
    } catch (error) {
      logError(`[BLE] Failed to send keep-alive to device ${this.deviceAddress}:`, error);
      this.stopKeepAlive();
      this.scheduleReconnect();
    }
  }

  private startKeepAlive(): void {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
    }
    
    // Send initial keep-alive
    this.sendKeepAlive();
    
    // Schedule regular keep-alive
    this.keepAliveInterval = setInterval(() => {
      this.sendKeepAlive();
    }, this.KEEP_ALIVE_INTERVAL);
  }

  private stopKeepAlive(): void {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    this.reconnectTimeout = setTimeout(() => {
      this.connect();
    }, this.RECONNECT_DELAY);
  }

  public disconnect(): void {
    this.stopKeepAlive();
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    this.espConnection.disconnect(this.deviceAddress);
  }

  public isDeviceConnected(): boolean {
    return this.isConnected;
  }

  public getLastKeepAliveTime(): number {
    return this.lastKeepAliveTime;
  }
} 