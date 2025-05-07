import { EventEmitter } from 'events';

// Simple stub implementation
export class BLEController extends EventEmitter {
  // Add cache property to satisfy interface
  cache: Record<string, any> = {};
  
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
  }

  // Used only to silence TypeScript warnings
  private _silence(...args: any[]): void {
    // Do nothing
  }

  async writeCommand(command: number[] | { command: number[]; data?: number[] }): Promise<void> {
    // Silence unused parameter warnings
    this._silence(command);
    // Simple implementation
    return Promise.resolve();
  }
  
  // Add these methods to satisfy interface
  async writeCommands(commands: any[], count: number = 1): Promise<void> {
    this._silence(commands, count);
    return Promise.resolve();
  }
  
  async cancelCommands(): Promise<void> {
    return Promise.resolve();
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
