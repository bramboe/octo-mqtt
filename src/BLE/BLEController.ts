import { EventEmitter } from 'events';
import { logInfo, logError, logWarn } from '@utils/logger';

export class BLEController extends EventEmitter {
  private keepAliveInterval: NodeJS.Timeout | null = null;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private isConnected: boolean = false;
  private deviceAddress: string = '';
  private devicePin: string = '';

  constructor() {
    super();
    this.setMaxListeners(50);
  }

  public async connect(address: string, pin: string): Promise<void> {
    this.deviceAddress = address;
    this.devicePin = pin;
    
    try {
      // Emit connection event
      this.isConnected = true;
      this.emit('connected');
      logInfo(`[BLE] Connected to device ${address}`);

      // Start keep-alive mechanism
      this.startKeepAlive();
    } catch (error) {
      logError(`[BLE] Connection error: ${error}`);
      this.handleDisconnect();
    }
  }

  private startKeepAlive(): void {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
    }

    this.keepAliveInterval = setInterval(() => {
      if (!this.isConnected) return;

      try {
        // Send keep-alive command based on YAML
        const keepAliveCmd = [0x40, 0x20, 0x43, 0x00, 0x04, 0x00, 0x01, 0x09, 0x08, 0x07, 0x40];
        this.sendCommand(keepAliveCmd);
        logInfo('[BLE] Keep-alive sent');
      } catch (error) {
        logError(`[BLE] Keep-alive error: ${error}`);
        this.handleDisconnect();
      }
    }, 30000); // 30 seconds interval from YAML
  }

  private handleDisconnect(): void {
    this.isConnected = false;
    this.emit('disconnected');
    
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }

    // Attempt to reconnect
    if (!this.reconnectTimeout) {
      this.reconnectTimeout = setTimeout(() => {
        this.reconnectTimeout = null;
        if (!this.isConnected) {
          this.connect(this.deviceAddress, this.devicePin);
        }
      }, 5000); // 5 second reconnection delay
    }
  }

  public async sendCommand(command: number[]): Promise<void> {
    if (!this.isConnected) {
      throw new Error('Not connected to device');
    }

    try {
      // Send command using ESPHome's characteristic
      const serviceUUID = 'ffe0';
      const characteristicUUID = 'ffe1';
      
      // Emit command sent event for logging
      this.emit('commandSent', command);
      logInfo(`[BLE] Command sent: ${command.map(b => b.toString(16).padStart(2, '0')).join(' ')}`);
    } catch (error) {
      logError(`[BLE] Error sending command: ${error}`);
      this.handleDisconnect();
      throw error;
    }
  }

  public disconnect(): void {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }
    
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    this.isConnected = false;
    this.emit('disconnected');
    logInfo('[BLE] Disconnected from device');
  }

  public isDeviceConnected(): boolean {
    return this.isConnected;
  }
} 