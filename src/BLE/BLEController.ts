import { EventEmitter } from 'events';
import { logInfo, logError, logWarn } from '@utils/logger';

export class BLEController extends EventEmitter {
  private connected: boolean = false;
  private keepAliveInterval: NodeJS.Timeout | null = null;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private deviceInfo: any = null;

  constructor(private esphomeConnection: any) {
    super();
    this.setupEventHandlers();
  }

  private setupEventHandlers() {
    this.esphomeConnection.on('connect', () => {
      logInfo('[BLE] ESPHome connection established');
      this.emit('connectionStatus', { connected: true });
    });

    this.esphomeConnection.on('disconnect', () => {
      logInfo('[BLE] ESPHome connection lost');
      this.emit('connectionStatus', { connected: false });
      this.scheduleReconnect();
    });
  }

  public async connectToDevice(deviceInfo: any) {
    this.deviceInfo = deviceInfo;
    try {
      // Format MAC address for connection
      const macAddress = deviceInfo.address.replace(/:/g, '').toUpperCase();
      
      // Connect using ESPHome BLE client
      await this.esphomeConnection.sendMessage({
        type: 'ble_client',
        data: {
          mac_address: macAddress,
          service_uuid: 'ffe0',
          characteristic_uuid: 'ffe1'
        }
      });

      this.connected = true;
      this.startKeepAlive();
      this.emit('deviceConnected', deviceInfo);
      logInfo(`[BLE] Connected to device ${deviceInfo.name} (${macAddress})`);
      
      return true;
    } catch (error) {
      logError('[BLE] Failed to connect:', error);
      this.scheduleReconnect();
      return false;
    }
  }

  private startKeepAlive() {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
    }

    this.keepAliveInterval = setInterval(async () => {
      try {
        // Send keep-alive command based on YAML configuration
        await this.esphomeConnection.sendMessage({
          type: 'ble_write',
          data: {
            service_uuid: 'ffe0',
            characteristic_uuid: 'ffe1',
            value: [0x40, 0x20, 0x43, 0x00, 0x04, 0x00, 0x01, 0x09, 0x08, 0x07, 0x40]
          }
        });
        logInfo('[BLE] Keep-alive sent successfully');
      } catch (error) {
        logError('[BLE] Keep-alive failed:', error);
        this.handleConnectionError();
      }
    }, 30000); // 30 seconds interval as per YAML
  }

  private handleConnectionError() {
    this.connected = false;
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }
    this.emit('connectionStatus', { connected: false });
    this.scheduleReconnect();
  }

  private scheduleReconnect() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    this.reconnectTimeout = setTimeout(async () => {
      if (this.deviceInfo) {
        logInfo('[BLE] Attempting to reconnect...');
        await this.connectToDevice(this.deviceInfo);
      }
    }, 5000); // 5 seconds delay before reconnect
  }

  public disconnect() {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    this.connected = false;
    this.deviceInfo = null;
    this.emit('connectionStatus', { connected: false });
  }

  public isConnected(): boolean {
    return this.connected;
  }
} 