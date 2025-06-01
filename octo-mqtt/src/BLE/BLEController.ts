import { logInfo, logWarn, logError } from '@utils/logger';
import { EventEmitter } from 'events';
import { IESPConnection } from '../ESPHome/IESPConnection';

export interface BLEDeviceAdvertisement {
  name: string;
  address: string;
  rssi: number;
  service_uuids: string[];
  // raw advertisement data might also be useful
}

interface BLEEvents {
  'connected': () => void;
  'disconnected': () => void;
  'notification': (data: Buffer) => void;
}

export class BLEController extends EventEmitter {
  private readonly RECONNECT_INTERVAL = 5000; // 5 seconds
  private readonly KEEP_ALIVE_INTERVAL = 30000; // 30 seconds
  private readonly MAX_RECONNECT_ATTEMPTS = 3;
  private readonly SERVICE_UUID = '0000ffe0-0000-1000-8000-00805f9b34fb';
  private readonly CONTROL_CHARACTERISTIC = '0000ffe1-0000-1000-8000-00805f9b34fb';

  private isConnected = false;
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private keepAliveTimer: NodeJS.Timeout | null = null;
  private device: any = null;
  private commandQueue: Array<{
    command: Buffer;
    resolve: (value: void | PromiseLike<void>) => void;
    reject: (reason?: any) => void;
  }> = [];
  private processing = false;

  constructor(
    private readonly espConnection: IESPConnection,
    private readonly deviceAddress: string,
    private readonly pin: string = '0000'
  ) {
    super();
    this.setupConnectionHandling();
  }

  private setupConnectionHandling() {
    this.on('disconnected', () => {
      logWarn(`[BLE] Device ${this.deviceAddress} disconnected`);
      this.isConnected = false;
      this.clearTimers();
      this.startReconnectTimer();
    });

    this.on('connected', () => {
      logInfo(`[BLE] Device ${this.deviceAddress} connected`);
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.startKeepAliveTimer();
    });
  }

  private clearTimers() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
  }

  private startReconnectTimer() {
    if (this.reconnectAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
      logError(`[BLE] Max reconnection attempts reached for ${this.deviceAddress}`);
      return;
    }

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectAttempts++;
      logInfo(`[BLE] Attempting to reconnect to ${this.deviceAddress} (attempt ${this.reconnectAttempts})`);
      await this.connect();
    }, this.RECONNECT_INTERVAL);
  }

  private startKeepAliveTimer() {
    this.keepAliveTimer = setInterval(async () => {
      try {
        await this.sendKeepAlive();
      } catch (error) {
        logError(`[BLE] Keep-alive failed for ${this.deviceAddress}:`, error);
        this.emit('disconnected');
      }
    }, this.KEEP_ALIVE_INTERVAL);
  }

  private async sendKeepAlive() {
    // Send a no-op command to keep the connection alive
    const command = Buffer.from([0x00, 0x00, 0x00, 0x00]);
    await this.sendCommand(command);
  }

  public async connect(): Promise<void> {
    try {
      if (this.isConnected) {
        return;
      }

      logInfo(`[BLE] Connecting to device ${this.deviceAddress}`);
      
      // Connect to the device
      this.device = await this.espConnection.getBLEDevices([this.deviceAddress]);
      
      if (!this.device) {
        throw new Error('Device not found');
      }

      // Subscribe to notifications
      await this.device.subscribeToCharacteristic(
        this.SERVICE_UUID,
        this.CONTROL_CHARACTERISTIC,
        (data: Buffer) => {
          this.handleNotification(data);
        }
      );

      // Send PIN code
      await this.authenticate();

      this.emit('connected');
    } catch (error) {
      logError(`[BLE] Connection failed for ${this.deviceAddress}:`, error);
      this.emit('disconnected');
    }
  }

  private async authenticate() {
    const pinBuffer = Buffer.from(this.pin.padStart(4, '0'));
    await this.sendCommand(Buffer.concat([Buffer.from([0x01]), pinBuffer]));
  }

  public async disconnect(): Promise<void> {
    this.clearTimers();
    if (this.device) {
      await this.device.disconnect();
    }
    this.isConnected = false;
  }

  private async sendCommand(data: Buffer): Promise<void> {
    if (!this.isConnected) {
      throw new Error('Device not connected');
    }

    try {
      await this.device.writeCharacteristic(
        this.SERVICE_UUID,
        this.CONTROL_CHARACTERISTIC,
        data
      );
    } catch (error) {
      logError(`[BLE] Failed to send command:`, error);
      this.emit('disconnected');
      throw error;
    }
  }

  private handleNotification(data: Buffer) {
    // Handle incoming notifications from the device
    logInfo(`[BLE] Received notification from ${this.deviceAddress}:`, data);
    this.emit('notification', data);
  }

  public async moveHead(position: number): Promise<void> {
    const command = Buffer.from([0x02, position]);
    await this.sendCommand(command);
  }

  public async moveFeet(position: number): Promise<void> {
    const command = Buffer.from([0x03, position]);
    await this.sendCommand(command);
  }

  public async stopMovement(): Promise<void> {
    const command = Buffer.from([0x04]);
    await this.sendCommand(command);
  }

  public async toggleLight(): Promise<void> {
    const command = Buffer.from([0x05]);
    await this.sendCommand(command);
  }

  public isDeviceConnected(): boolean {
    return this.isConnected;
  }

  cache: Record<string, any> = {};
  private timeout: NodeJS.Timeout | null = null;
  private pollingInterval: NodeJS.Timeout | null = null;
  private keepAliveInterval: NodeJS.Timeout | null = null;
  private lastValue: string = '';
  private pin: string = '0000'; // Default PIN
  private isScanning = false;

  constructor(
    public readonly deviceData: any,
    private readonly bleDevice: any,
    private readonly handle: number,
    private readonly buildCommand: (command: number[] | { command: number[]; data?: number[] }) => number[],
    private readonly handles?: { feedback: number },
    pin?: string
  ) {
    super();
    // Store PIN if provided
    if (pin && pin.length === 4) {
      this.pin = pin;
    }
    // Start polling for characteristic changes if feedback handle is provided
    this.startPolling();
    // Start keep-alive mechanism
    this.startKeepAlive();
  }

  /**
   * Set PIN for authentication and keep-alive messages
   */
  setPin(pin: string) {
    if (pin && pin.length === 4) {
      this.pin = pin;
      logInfo('[BLE] PIN set successfully');
    } else {
      logWarn('[BLE] Invalid PIN format. PIN must be 4 digits. Using default.');
    }
  }

  /**
   * Start the keep-alive interval to maintain connection
   */
  private startKeepAlive() {
    // Clear any existing keep-alive interval
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
    }
    logInfo('[BLE] Starting keep-alive mechanism');
    // Send keep-alive every 30 seconds
    this.keepAliveInterval = setInterval(async () => {
      try {
        if (!this.bleDevice.connected) {
          logWarn('[BLE] Device not connected, skipping keep-alive');
          return;
        }
        // Send PIN-based keep-alive command (0x20, 0x43)
        const pinDigits = this.pin.split('').map(digit => parseInt(digit));
        await this.writeCommand({ 
          command: [0x20, 0x43], 
          data: pinDigits 
        });
        logInfo('[BLE] Keep-alive sent successfully');
      } catch (error) {
        logError('[BLE] Error sending keep-alive:', error);
      }
    }, 30000); // 30 seconds
  }

  private startPolling() {
    if (!this.handles?.feedback) {
      logWarn('[BLE] No feedback handle provided, polling not started');
      return;
    }
    logInfo('[BLE] Starting polling for characteristic changes');
    // Store feedback handle in local variable to avoid undefined error
    const feedbackHandle = this.handles.feedback;
    // Poll every 100ms
    this.pollingInterval = setInterval(async () => {
      try {
        if (typeof this.bleDevice.readCharacteristic !== 'function') {
          logError('[BLE] readCharacteristic is not a function, polling not possible');
          this.stopPolling();
          return;
        }
        const value = await this.bleDevice.readCharacteristic(feedbackHandle);
        if (!value) return;
        // Only emit if the value has changed (to avoid spamming)
        const valueString = Array.from(value).join(',');
        if (valueString !== this.lastValue) {
          this.lastValue = valueString;
          this.emit('feedback', value);
        }
      } catch (error) {
        // Don't log errors to avoid filling up logs, just silently continue
      }
    }, 100); // Poll every 100ms
  }
  
  private stopPolling() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }
  
  /**
   * Stop all intervals and timers when the controller is no longer needed
   */
  dispose() {
    this.stopPolling();
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
    this.stopScan(); // Ensure scanning is stopped on dispose
  }

  async writeCommand(command: number[] | { command: number[]; data?: number[] }): Promise<void> {
    return new Promise((resolve, reject) => {
      this.commandQueue.push({
        command,
        resolve,
        reject,
      });
      this.processQueue();
    });
  }
  
  async writeCommands(commands: Array<number[] | { command: number[]; data?: number[] }>, count: number = 1): Promise<void> {
    for (let i = 0; i < count; i++) {
      for (const command of commands) {
        await this.writeCommand(command);
      }
    }
  }
  
  /**
   * Send a stop command to immediately stop all motors
   */
  async stopMotors(): Promise<void> {
    // Cancel pending commands first
    await this.cancelCommands();
    // Send stop command (0x02, 0x73)
    // Ensure this doesn't interfere with scan commands if they use the same characteristic
    try {
      await this.writeCommand([0x02, 0x73]);
      // Send twice for reliability, as seen in ESPHome implementation
      await this.writeCommand([0x02, 0x73]);
      logInfo('[BLE] Stop command sent successfully');
    } catch (error) {
      logError('[BLE] Error sending stop command:', error);
    }
    // Process next command after a short delay
    this.timeout = setTimeout(() => {
      this.timeout = null;
      if (this.commandQueue.length > 0) {
        this.processQueue();
      }
    }, 150); // Add a small delay between commands
  }
  
  async cancelCommands(): Promise<void> {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
    // Clear the queue
    const queue = [...this.commandQueue];
    this.commandQueue = [];
    this.processing = false;
    // Reject all pending commands
    for (const item of queue) {
      item.reject(new Error('Commands canceled'));
    }
    return Promise.resolve();
  }

  private async processQueue(): Promise<void> {
    if (this.processing || this.commandQueue.length === 0) {
      return;
    }
    this.processing = true;
    try {
      const item = this.commandQueue.shift();
      if (!item) {
        this.processing = false;
        return;
      }
      logInfo(`[BLE] Processing command: ${JSON.stringify(item.command)}`);
      const bytes = this.buildCommand(item.command);
      try {
        if (typeof this.bleDevice.writeCharacteristic !== 'function') {
          throw new Error('writeCharacteristic is not a function');
        }
        await this.bleDevice.writeCharacteristic(this.handle, new Uint8Array(bytes));
        item.resolve();
      } catch (error) {
        logError('[BLE] Error writing characteristic:', error);
        item.reject(error instanceof Error ? error : new Error(String(error)));
      }
    } catch (error) {
      logError('[BLE] Error in processQueue:', error);
    } finally {
      this.processing = false;
      // Process next command after a short delay
      this.timeout = setTimeout(() => {
        this.timeout = null;
        if (this.commandQueue.length > 0) {
          this.processQueue();
        }
      }, 150); // Add a small delay between commands
    }
  }

  /**
   * Start BLE scanning for devices.
   * Emits 'deviceDiscovered' for each unique device found.
   * Emits 'scanStatus' with { scanning: boolean, error?: string }.
   */
  async startScan(): Promise<void> {
    if (this.isScanning) {
      logWarn('[BLE] Scan already in progress.');
      return;
    }
    if (!this.bleDevice || typeof this.bleDevice.subscribeBluetoothLEAdvertisementPackets !== 'function') {
      logError('[BLE] subscribeBluetoothLEAdvertisementPackets is not available on bleDevice.');
      this.emit('scanStatus', { scanning: false, error: 'Scan functionality not supported by BLE device object.' });
      return;
    }

    logInfo('[BLE] Starting BLE scan...');
    this.isScanning = true;
    this.emit('scanStatus', { scanning: true });

    try {
      // The callback for subscribeBluetoothLEAdvertisementPackets receives advertisement data
      // We need to map this data to our BLEDeviceAdvertisement interface
      await this.bleDevice.subscribeBluetoothLEAdvertisementPackets((data: any) => {
        // Assuming data has properties like name, mac, rssi, service_uuids
        // Adjust based on the actual structure provided by ESPHome
        const discoveredDevice: BLEDeviceAdvertisement = {
          name: data.name || 'Unknown Device',
          address: data.mac, // ESPHome typically uses 'mac' for address
          rssi: data.rssi,
          service_uuids: data.service_uuids || [],
        };
        this.emit('deviceDiscovered', discoveredDevice);
      });
    } catch (error) {
      logError('[BLE] Error starting scan subscription:', error);
      this.isScanning = false;
      this.emit('scanStatus', { scanning: false, error: error instanceof Error ? error.message : String(error) });
    }
  }

  /**
   * Stop BLE scanning.
   */
  async stopScan(): Promise<void> {
    if (!this.isScanning) {
      // logInfo('[BLE] Scan is not currently active.'); // Can be noisy
      return;
    }
    if (!this.bleDevice || typeof this.bleDevice.unsubscribeBluetoothLEAdvertisementPackets !== 'function') {
      logError('[BLE] unsubscribeBluetoothLEAdvertisementPackets is not available on bleDevice.');
      // Even if we can't unsubscribe, update our internal state
      this.isScanning = false;
      this.emit('scanStatus', { scanning: false, error: 'Could not formally stop scan due to missing unsubscribe function.' });
      return;
    }

    logInfo('[BLE] Stopping BLE scan...');
    try {
      await this.bleDevice.unsubscribeBluetoothLEAdvertisementPackets();
      this.isScanning = false;
      this.emit('scanStatus', { scanning: false });
    } catch (error) {
      logError('[BLE] Error stopping scan subscription:', error);
      // Still update our internal state even if unsubscribe fails
      this.isScanning = false;
      this.emit('scanStatus', { scanning: false, error: error instanceof Error ? error.message : String(error) });
    }
  }

  on(event: 'feedback', listener: (message: Uint8Array) => void): this;
  on(event: 'deviceDiscovered', listener: (device: BLEDeviceAdvertisement) => void): this;
  on(event: 'scanStatus', listener: (status: { scanning: boolean; error?: string }) => void): this;
  on(event: string, listener: (...args: any[]) => void): this {
    return super.on(event, listener);
  }

  off(event: 'feedback', listener: (message: Uint8Array) => void): this;
  off(event: 'deviceDiscovered', listener: (device: BLEDeviceAdvertisement) => void): this;
  off(event: 'scanStatus', listener: (status: { scanning: boolean; error?: string }) => void): this;
  off(event: string, listener: (...args: any[]) => void): this {
    return super.off(event, listener);
  }
}
