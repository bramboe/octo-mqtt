import { EventEmitter } from 'events';
import { logInfo, logError, logWarn } from '@utils/logger';
import type { IESPConnection } from '../ESPHome/IESPConnection';

export class BLEController extends EventEmitter {
  private keepAliveInterval: NodeJS.Timeout | null = null;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private isConnected: boolean = false;
  private lastKeepAliveTime: number = 0;
  private connectionAttempts: number = 0;
  private readonly MAX_RECONNECT_ATTEMPTS = 5;
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
    logInfo(`[BLEController] Initializing controller for device ${this.deviceAddress} with PIN ${this.pin}`);
    this.setupConnectionHandlers();
  }

  private setupConnectionHandlers() {
    logInfo(`[BLEController] Setting up connection handlers for device ${this.deviceAddress}`);
    
    this.espConnection.on('connect', () => {
      this.connectionAttempts = 0;
      this.isConnected = true;
      logInfo(`[BLEController] Connected to device ${this.deviceAddress}`);
      logInfo(`[BLEController] Starting keep-alive mechanism for ${this.deviceAddress}`);
      this.emit('connectionStatus', true);
      this.startKeepAlive();
    });

    this.espConnection.on('disconnect', () => {
      logInfo(`[BLEController] Disconnected from device ${this.deviceAddress}`);
      logInfo(`[BLEController] Last keep-alive was ${Date.now() - this.lastKeepAliveTime}ms ago`);
      this.isConnected = false;
      this.emit('connectionStatus', false);
      this.stopKeepAlive();
      this.scheduleReconnect();
    });

    this.espConnection.on('error', (error: Error) => {
      logError(`[BLEController] Connection error for device ${this.deviceAddress}:`, error);
      logInfo(`[BLEController] Connection state before error: ${this.isConnected ? 'Connected' : 'Disconnected'}`);
      logInfo(`[BLEController] Last keep-alive was ${Date.now() - this.lastKeepAliveTime}ms ago`);
      this.isConnected = false;
      this.emit('connectionStatus', false);
      this.stopKeepAlive();
      this.scheduleReconnect();
    });
  }

  public async connect(): Promise<void> {
    this.connectionAttempts++;
    logInfo(`[BLEController] Attempting to connect to device ${this.deviceAddress} (Attempt ${this.connectionAttempts}/${this.MAX_RECONNECT_ATTEMPTS})`);
    
    try {
      await this.espConnection.connect(this.deviceAddress, this.pin);
      logInfo(`[BLEController] Connection attempt successful for ${this.deviceAddress}`);
    } catch (error) {
      logError(`[BLEController] Failed to connect to device ${this.deviceAddress}:`, error);
      if (this.connectionAttempts < this.MAX_RECONNECT_ATTEMPTS) {
        logInfo(`[BLEController] Will attempt reconnection in ${this.RECONNECT_DELAY}ms`);
        this.scheduleReconnect();
      } else {
        logWarn(`[BLEController] Max reconnection attempts (${this.MAX_RECONNECT_ATTEMPTS}) reached for ${this.deviceAddress}`);
      }
    }
  }

  private async sendKeepAlive(): Promise<void> {
    if (!this.isConnected) {
      logWarn(`[BLEController] Attempted to send keep-alive while disconnected from ${this.deviceAddress}`);
      return;
    }

    try {
      const keepAliveCommand = [0x40, 0x20, 0x43, 0x00, 0x04, 0x00, 0x01, 0x09, 0x08, 0x07, 0x40];
      logInfo(`[BLEController] Sending keep-alive to ${this.deviceAddress}`);
      await this.espConnection.write(
        this.deviceAddress,
        this.SERVICE_UUID,
        this.CHARACTERISTIC_UUID,
        keepAliveCommand
      );
      this.lastKeepAliveTime = Date.now();
      logInfo(`[BLEController] Keep-alive sent successfully to ${this.deviceAddress}`);
    } catch (error) {
      logError(`[BLEController] Failed to send keep-alive to device ${this.deviceAddress}:`, error);
      logInfo(`[BLEController] Connection state: ${this.isConnected ? 'Connected' : 'Disconnected'}`);
      this.stopKeepAlive();
      this.scheduleReconnect();
    }
  }

  private startKeepAlive(): void {
    if (this.keepAliveInterval) {
      logInfo(`[BLEController] Clearing existing keep-alive interval for ${this.deviceAddress}`);
      clearInterval(this.keepAliveInterval);
    }
    
    logInfo(`[BLEController] Starting keep-alive sequence for ${this.deviceAddress}`);
    // Send initial keep-alive
    this.sendKeepAlive();
    
    // Schedule regular keep-alive
    this.keepAliveInterval = setInterval(() => {
      logInfo(`[BLEController] Keep-alive interval triggered for ${this.deviceAddress}`);
      this.sendKeepAlive();
    }, this.KEEP_ALIVE_INTERVAL);
    
    logInfo(`[BLEController] Keep-alive mechanism started for ${this.deviceAddress} (interval: ${this.KEEP_ALIVE_INTERVAL}ms)`);
  }

  private stopKeepAlive(): void {
    if (this.keepAliveInterval) {
      logInfo(`[BLEController] Stopping keep-alive mechanism for ${this.deviceAddress}`);
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.connectionAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
      logWarn(`[BLEController] Not scheduling reconnect - max attempts reached for ${this.deviceAddress}`);
      return;
    }

    if (this.reconnectTimeout) {
      logInfo(`[BLEController] Clearing existing reconnect timeout for ${this.deviceAddress}`);
      clearTimeout(this.reconnectTimeout);
    }

    logInfo(`[BLEController] Scheduling reconnection attempt for ${this.deviceAddress} in ${this.RECONNECT_DELAY}ms`);
    this.reconnectTimeout = setTimeout(() => {
      this.connect();
    }, this.RECONNECT_DELAY);
  }

  public disconnect(): void {
    logInfo(`[BLEController] Initiating disconnect for ${this.deviceAddress}`);
    this.stopKeepAlive();
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    this.espConnection.disconnect(this.deviceAddress);
    logInfo(`[BLEController] Disconnect sequence completed for ${this.deviceAddress}`);
  }

  public isDeviceConnected(): boolean {
    return this.isConnected;
  }

  public getLastKeepAliveTime(): number {
    return this.lastKeepAliveTime;
  }
} 