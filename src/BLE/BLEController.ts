import { EventEmitter } from 'events';
import { logError, logInfo } from '@utils/logger';

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
    
    // Set up feedback handler
    if (this.handles?.feedback) {
      this.bleDevice.on('characteristicValueChanged', (handle: number, value: Uint8Array) => {
        if (handle === this.handles?.feedback) {
          this.emit('feedback', value);
        }
      });
      
      // Subscribe to notifications
      this.bleDevice.subscribeToCharacteristic(this.handles.feedback)
        .catch((error: Error) => {
          logError('[BLE] Failed to subscribe to feedback characteristic:', error);
        });
    }
  }

  // Used only to silence TypeScript warnings
  private _silence(...args: any[]): void {
    // Do nothing
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
