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

  private startKeepAlive() {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
    }
    logInfo('[BLE] Starting keep-alive mechanism');
    
    // Send keep-alive every 30 seconds
    this.keepAliveInterval = setInterval(async () => {
      try {
        if (!this.bleDevice.connected) {
          logWarn('[BLE] Device disconnected, attempting to reconnect...');
          try {
            await this.bleDevice.connect();
            logInfo('[BLE] Successfully reconnected');
          } catch (error) {
            logError('[BLE] Failed to reconnect:', error);
            return;
          }
        }
        
        // Send PIN-based keep-alive command (0x20, 0x43)
        const pinDigits = this.pin.split('').map(digit => parseInt(digit));
        const keepAliveCommand = {
          command: [0x20, 0x43],
          data: [...pinDigits, 0x09, 0x08, 0x07] // Added standard suffix
        };
        
        await this.writeCommand(keepAliveCommand);
        logInfo('[BLE] Keep-alive sent successfully');
      } catch (error) {
        logError('[BLE] Error sending keep-alive:', error);
      }
    }, 30000); // 30 seconds
  } 
} 