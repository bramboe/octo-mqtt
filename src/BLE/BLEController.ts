import { EventEmitter } from 'events';
import { logError, logInfo, logWarn } from '@utils/logger';

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
  private lastValue: string = '';
  private pin: string = '0000'; // Default PIN
  
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
    try {
      await this.writeCommand([0x02, 0x73]);
      // Send twice for reliability, as seen in ESPHome implementation
      await this.writeCommand([0x02, 0x73]);
      logInfo('[BLE] Stop command sent successfully');
    } catch (error) {
      logError('[BLE] Error sending stop command:', error);
    }
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

  on(event: 'feedback', listener: (message: Uint8Array) => void): this;
  on(event: string, listener: (...args: any[]) => void): this {
    return super.on(event, listener);
  }

  off(event: 'feedback', listener: (message: Uint8Array) => void): this;
  off(event: string, listener: (...args: any[]) => void): this {
    return super.off(event, listener);
  }
}
