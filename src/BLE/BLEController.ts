import { EventEmitter } from 'events';
import { logError, logInfo, logWarn } from '@utils/logger';

// Simple stub implementation
export class BLEController extends EventEmitter {
  // Add cache property to satisfy interface
  cache: Record<string, any> = {};
  private commandQueue: Array<{
    command: number[] | { command: number[]; data?: number[] };
    resolve: () => void;
    reject: (error: Error) => void;
  }> = [];
  private processing = false;
  private timeout: NodeJS.Timeout | null = null;
  private notificationSetup = false;
  
  constructor(
    public readonly deviceData: any,
    private readonly bleDevice: any,
    private readonly handle: number,
    private readonly buildCommand: (command: number[] | { command: number[]; data?: number[] }) => number[],
    private readonly handles?: { feedback: number }
  ) {
    super();
    // Silence unused parameter warnings
    this._silence(bleDevice, handle, buildCommand, handles);
    
    // Set up notifications listener through separate method
    this.setupNotifications();
  }

  // Used only to silence TypeScript warnings
  private _silence(...args: any[]): void {
    // Do nothing
  }

  // Set up notifications in a way that doesn't depend on 'on' method
  private async setupNotifications() {
    if (!this.handles?.feedback || this.notificationSetup) {
      return;
    }
    
    try {
      this.notificationSetup = true;
      logInfo('[BLE] Setting up notifications for feedback characteristic');
      
      // Check if subscribeToCharacteristic is available
      if (typeof this.bleDevice.subscribeToCharacteristic === 'function') {
        // Subscribe to the characteristic
        await this.bleDevice.subscribeToCharacteristic(this.handles.feedback);
        
        // If available, use the direct notification subscription method
        if (typeof this.bleDevice.onCharacteristicValueChanged === 'function') {
          const feedbackHandle = this.handles.feedback; // Store in local variable to avoid undefined warning
          this.bleDevice.onCharacteristicValueChanged(feedbackHandle, (value: Uint8Array) => {
            this.emit('feedback', value);
          });
        } else {
          logWarn('[BLE] onCharacteristicValueChanged not found, notifications may not work properly');
        }
      } else {
        logWarn('[BLE] subscribeToCharacteristic not found, will try to fall back to polling');
        
        // Fall back to polling the characteristic every second
        const feedbackHandle = this.handles.feedback; // Store in local variable to avoid undefined warning
        setInterval(async () => {
          try {
            const value = await this.bleDevice.readCharacteristic(feedbackHandle);
            if (value) {
              this.emit('feedback', value);
            }
          } catch (error) {
            // Ignore read errors to avoid spamming logs
          }
        }, 1000);
      }
    } catch (error) {
      logError('[BLE] Failed to set up notifications:', error);
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
