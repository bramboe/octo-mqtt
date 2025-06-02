import { EventEmitter } from 'events';
import { logError, logInfo, logWarn } from '@utils/logger';

export interface BLEDeviceAdvertisement {
  name: string;
  address: string;
  rssi: number;
  service_uuids: string[];
  // raw advertisement data might also be useful
}

export class BLEController extends EventEmitter {
  cache: Record<string, any> = {};
  private commandQueue: Array<{
    command: number[] | { command: number[]; data?: number[] };
    resolve: () => void;
    reject: (error: Error) => void;
  }> = [];
  private processing = false;
  private timeout: NodeJS.Timeout | null = null;
  private pollingInterval: NodeJS.Timeout | null = null;
  private keepAliveInterval: NodeJS.Timeout | null = null;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private lastValue: string = '';
  private pin: string = '0000'; // Default PIN
  private isScanning = false;
  private connectionAttempts = 0;
  private readonly MAX_RECONNECT_ATTEMPTS = 5;
  private readonly RECONNECT_DELAY = 5000; // 5 seconds

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
    this.setupConnectionHandling();
    // Start polling for characteristic changes if feedback handle is provided
    this.startPolling();
    // Start keep-alive mechanism
    this.startKeepAlive();
  }

  private setupConnectionHandling() {
    if (!this.bleDevice) return;
    
    this.bleDevice.on('disconnect', () => {
      logWarn('[BLE] Device disconnected');
      this.emit('connectionStatus', { connected: false });
      this.handleDisconnect();
    });

    this.bleDevice.on('connect', () => {
      logInfo('[BLE] Device connected');
      this.connectionAttempts = 0;
      this.emit('connectionStatus', { connected: true });
    });
  }

  private handleDisconnect() {
    if (this.connectionAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
      logError('[BLE] Max reconnection attempts reached');
      return;
    }

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    this.connectionAttempts++;
    this.reconnectTimeout = setTimeout(async () => {
      try {
        logInfo(`[BLE] Attempting to reconnect (attempt ${this.connectionAttempts})`);
        await this.bleDevice.connect();
      } catch (error) {
        logError('[BLE] Reconnection failed:', error);
        this.handleDisconnect(); // Try again
      }
    }, this.RECONNECT_DELAY);
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
        if (!this.bleDevice?.connected) {
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
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
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
