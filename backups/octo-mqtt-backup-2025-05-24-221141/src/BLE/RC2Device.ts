import { EventEmitter } from 'events';
import { logError, logInfo, logWarn, logDebug } from '@utils/logger';

export interface RC2DeviceConfig {
  address: string;
  pin: string;
  friendlyName: string;
  headCalibrationSeconds?: number;
  feetCalibrationSeconds?: number;
}

export interface RC2Position {
  head: number;  // 0-100%
  feet: number;  // 0-100%
}

export interface RC2Status {
  connected: boolean;
  positions: RC2Position;
  lightState: boolean;
  calibration: {
    head: number;  // seconds
    feet: number;  // seconds
  };
  lastUpdate: Date;
}

// RC2 Command Constants (from ESPHome analysis)
export const RC2_COMMANDS = {
  // Movement commands
  HEAD_UP: [0x40, 0x02, 0x70, 0x00, 0x01, 0x0b, 0x02, 0x40],
  HEAD_DOWN: [0x40, 0x02, 0x71, 0x00, 0x01, 0x0a, 0x02, 0x40],
  FEET_UP: [0x40, 0x02, 0x70, 0x00, 0x01, 0x09, 0x04, 0x40],
  FEET_DOWN: [0x40, 0x02, 0x71, 0x00, 0x01, 0x08, 0x04, 0x40],
  BOTH_UP: [0x40, 0x02, 0x70, 0x00, 0x01, 0x07, 0x06, 0x40],
  BOTH_DOWN: [0x40, 0x02, 0x71, 0x00, 0x01, 0x06, 0x06, 0x40],
  STOP: [0x40, 0x02, 0x73, 0x00, 0x00, 0x0b, 0x40],
  
  // Light commands
  LIGHT_ON: [0x40, 0x20, 0x72, 0x00, 0x08, 0xde, 0x00, 0x01, 0x02, 0x01, 0x01, 0x01, 0x01, 0x01, 0x40],
  LIGHT_OFF: [0x40, 0x20, 0x72, 0x00, 0x08, 0xdf, 0x00, 0x01, 0x02, 0x01, 0x01, 0x01, 0x01, 0x00, 0x40]
};

// RC2 Service and Characteristic UUIDs (from ESPHome analysis)
export const RC2_SERVICE_UUID = 'ffe0';
export const RC2_CHARACTERISTIC_UUID = 'ffe1';

export class RC2Device extends EventEmitter {
  private config: RC2DeviceConfig;
  private esphomeConnection: any;
  private status: RC2Status;
  private keepAliveInterval: NodeJS.Timeout | null = null;
  private movementStartTime: number | null = null;
  private movementDirection: 'head_up' | 'head_down' | 'feet_up' | 'feet_down' | 'both_up' | 'both_down' | null = null;
  private positionUpdateInterval: NodeJS.Timeout | null = null;
  private connected = false;

  constructor(config: RC2DeviceConfig, esphomeConnection: any) {
    super();
    this.config = config;
    this.esphomeConnection = esphomeConnection;
    
    // Initialize status
    this.status = {
      connected: false,
      positions: { head: 0, feet: 0 },
      lightState: false,
      calibration: {
        head: config.headCalibrationSeconds || 30.0,
        feet: config.feetCalibrationSeconds || 30.0
      },
      lastUpdate: new Date()
    };

    logInfo(`[RC2Device] Created device: ${config.friendlyName} (${config.address})`);
  }

  /**
   * Connect to the RC2 device
   */
  async connect(): Promise<void> {
    try {
      logInfo(`[RC2Device] Connecting to ${this.config.friendlyName}...`);
      
      // Connect via ESPHome proxy
      await this.esphomeConnection.connectToDevice({
        address: this.config.address,
        serviceUuid: RC2_SERVICE_UUID,
        characteristicUuid: RC2_CHARACTERISTIC_UUID
      });

      this.connected = true;
      this.status.connected = true;
      this.status.lastUpdate = new Date();
      
      // Start keep-alive mechanism
      this.startKeepAlive();
      
      logInfo(`[RC2Device] Successfully connected to ${this.config.friendlyName}`);
      this.emit('connected', this.status);
      
    } catch (error) {
      logError(`[RC2Device] Failed to connect to ${this.config.friendlyName}:`, error);
      this.connected = false;
      this.status.connected = false;
      throw error;
    }
  }

  /**
   * Disconnect from the RC2 device
   */
  async disconnect(): Promise<void> {
    try {
      logInfo(`[RC2Device] Disconnecting from ${this.config.friendlyName}...`);
      
      // Stop keep-alive
      this.stopKeepAlive();
      
      // Stop any ongoing movements
      await this.stopAllMovement();
      
      // Disconnect via ESPHome proxy
      if (this.esphomeConnection.disconnectFromDevice) {
        await this.esphomeConnection.disconnectFromDevice();
      }

      this.connected = false;
      this.status.connected = false;
      this.status.lastUpdate = new Date();
      
      logInfo(`[RC2Device] Successfully disconnected from ${this.config.friendlyName}`);
      this.emit('disconnected', this.status);
      
    } catch (error) {
      logError(`[RC2Device] Error disconnecting from ${this.config.friendlyName}:`, error);
      throw error;
    }
  }

  /**
   * Get current device status
   */
  getStatus(): RC2Status {
    return { ...this.status };
  }

  /**
   * Set position with time-based movement
   */
  async setPosition(head: number, feet: number): Promise<void> {
    if (!this.connected) {
      throw new Error('Device not connected');
    }

    logInfo(`[RC2Device] Setting position - Head: ${head}%, Feet: ${feet}%`);
    
    // Validate positions
    head = Math.max(0, Math.min(100, head));
    feet = Math.max(0, Math.min(100, feet));

    // Stop any current movement
    await this.stopAllMovement();
    
    // Calculate movement directions and durations
    const currentHead = this.status.positions.head;
    const currentFeet = this.status.positions.feet;
    
    const headDiff = head - currentHead;
    const feetDiff = feet - currentFeet;
    
    // Skip if no movement needed
    if (Math.abs(headDiff) < 0.5 && Math.abs(feetDiff) < 0.5) {
      logInfo(`[RC2Device] Already at target position`);
      return;
    }

    // Calculate movement durations (in milliseconds)
    const headDuration = Math.abs(headDiff) / 100 * this.status.calibration.head * 1000;
    const feetDuration = Math.abs(feetDiff) / 100 * this.status.calibration.feet * 1000;

    // Determine movement strategy
    if (Math.abs(headDiff) > 0.5 && Math.abs(feetDiff) > 0.5) {
      // Both need to move
      if ((headDiff > 0 && feetDiff > 0) || (headDiff < 0 && feetDiff < 0)) {
        // Same direction - move both together
        await this.moveBoth(headDiff > 0 ? 'up' : 'down', Math.max(headDuration, feetDuration));
      } else {
        // Different directions - move sequentially
        if (Math.abs(headDiff) > Math.abs(feetDiff)) {
          await this.moveHead(headDiff > 0 ? 'up' : 'down', headDuration);
          await this.moveFeet(feetDiff > 0 ? 'up' : 'down', feetDuration);
        } else {
          await this.moveFeet(feetDiff > 0 ? 'up' : 'down', feetDuration);
          await this.moveHead(headDiff > 0 ? 'up' : 'down', headDuration);
        }
      }
    } else if (Math.abs(headDiff) > 0.5) {
      // Only head needs to move
      await this.moveHead(headDiff > 0 ? 'up' : 'down', headDuration);
    } else if (Math.abs(feetDiff) > 0.5) {
      // Only feet need to move
      await this.moveFeet(feetDiff > 0 ? 'up' : 'down', feetDuration);
    }

    // Update final positions
    this.status.positions.head = head;
    this.status.positions.feet = feet;
    this.status.lastUpdate = new Date();
    
    this.emit('positionChanged', this.status.positions);
    logInfo(`[RC2Device] Position set completed - Head: ${head}%, Feet: ${feet}%`);
  }

  /**
   * Set light state
   */
  async setLight(state: boolean): Promise<void> {
    if (!this.connected) {
      throw new Error('Device not connected');
    }

    logInfo(`[RC2Device] Setting light: ${state ? 'ON' : 'OFF'}`);
    
    const command = state ? RC2_COMMANDS.LIGHT_ON : RC2_COMMANDS.LIGHT_OFF;
    await this.sendCommand(command);
    
    this.status.lightState = state;
    this.status.lastUpdate = new Date();
    
    this.emit('lightChanged', state);
    logInfo(`[RC2Device] Light ${state ? 'turned on' : 'turned off'}`);
  }

  /**
   * Stop all movement immediately
   */
  async stopAllMovement(): Promise<void> {
    if (!this.connected) {
      return;
    }

    logInfo(`[RC2Device] Stopping all movement`);
    
    // Clear movement tracking
    this.movementDirection = null;
    this.movementStartTime = null;
    if (this.positionUpdateInterval) {
      clearInterval(this.positionUpdateInterval);
      this.positionUpdateInterval = null;
    }

    // Send stop command twice for reliability (ESPHome pattern)
    await this.sendCommand(RC2_COMMANDS.STOP);
    await new Promise(resolve => setTimeout(resolve, 100));
    await this.sendCommand(RC2_COMMANDS.STOP);
    
    this.emit('movementStopped');
    logInfo(`[RC2Device] All movement stopped`);
  }

  /**
   * Update calibration settings
   */
  updateCalibration(headSeconds: number, feetSeconds: number): void {
    this.status.calibration.head = Math.max(1, Math.min(120, headSeconds));
    this.status.calibration.feet = Math.max(1, Math.min(120, feetSeconds));
    this.status.lastUpdate = new Date();
    
    logInfo(`[RC2Device] Calibration updated - Head: ${this.status.calibration.head}s, Feet: ${this.status.calibration.feet}s`);
    this.emit('calibrationChanged', this.status.calibration);
  }

  /**
   * Move head in specified direction for specified duration
   */
  private async moveHead(direction: 'up' | 'down', durationMs: number): Promise<void> {
    const command = direction === 'up' ? RC2_COMMANDS.HEAD_UP : RC2_COMMANDS.HEAD_DOWN;
    const movementType = direction === 'up' ? 'head_up' : 'head_down';
    
    await this.executeTimedMovement(command, movementType, durationMs);
  }

  /**
   * Move feet in specified direction for specified duration
   */
  private async moveFeet(direction: 'up' | 'down', durationMs: number): Promise<void> {
    const command = direction === 'up' ? RC2_COMMANDS.FEET_UP : RC2_COMMANDS.FEET_DOWN;
    const movementType = direction === 'up' ? 'feet_up' : 'feet_down';
    
    await this.executeTimedMovement(command, movementType, durationMs);
  }

  /**
   * Move both head and feet in specified direction for specified duration
   */
  private async moveBoth(direction: 'up' | 'down', durationMs: number): Promise<void> {
    const command = direction === 'up' ? RC2_COMMANDS.BOTH_UP : RC2_COMMANDS.BOTH_DOWN;
    const movementType = direction === 'up' ? 'both_up' : 'both_down';
    
    await this.executeTimedMovement(command, movementType, durationMs);
  }

  /**
   * Execute a timed movement with position tracking
   */
  private async executeTimedMovement(command: number[], movementType: string, durationMs: number): Promise<void> {
    // Set up movement tracking
    this.movementDirection = movementType as any;
    this.movementStartTime = Date.now();
    
    // Start position updates
    this.startPositionUpdates(movementType, durationMs);
    
    // Send movement command repeatedly during the movement (ESPHome pattern)
    const commandInterval = setInterval(async () => {
      if (this.movementDirection === movementType) {
        await this.sendCommand(command);
      }
    }, 300); // Send command every 300ms during movement
    
    // Wait for movement duration
    await new Promise(resolve => setTimeout(resolve, durationMs));
    
    // Stop command interval
    clearInterval(commandInterval);
    
    // Send stop command
    await this.stopAllMovement();
  }

  /**
   * Start position updates during movement
   */
  private startPositionUpdates(movementType: string, totalDurationMs: number): void {
    if (this.positionUpdateInterval) {
      clearInterval(this.positionUpdateInterval);
    }

    const startPositions = { ...this.status.positions };
    const startTime = Date.now();

    this.positionUpdateInterval = setInterval(() => {
      if (!this.movementStartTime || this.movementDirection !== movementType) {
        clearInterval(this.positionUpdateInterval!);
        this.positionUpdateInterval = null;
        return;
      }

      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / totalDurationMs, 1.0);

      // Update positions based on movement type
      const newPositions = { ...startPositions };
      
      if (movementType.includes('head')) {
        const direction = movementType.includes('up') ? 1 : -1;
        const headChange = progress * 100 * direction;
        newPositions.head = Math.max(0, Math.min(100, startPositions.head + headChange));
      }
      
      if (movementType.includes('feet')) {
        const direction = movementType.includes('up') ? 1 : -1;
        const feetChange = progress * 100 * direction;
        newPositions.feet = Math.max(0, Math.min(100, startPositions.feet + feetChange));
      }

      if (movementType.includes('both')) {
        const direction = movementType.includes('up') ? 1 : -1;
        const change = progress * 100 * direction;
        newPositions.head = Math.max(0, Math.min(100, startPositions.head + change));
        newPositions.feet = Math.max(0, Math.min(100, startPositions.feet + change));
      }

      this.status.positions = newPositions;
      this.status.lastUpdate = new Date();
      this.emit('positionChanged', newPositions);

    }, 100); // Update every 100ms
  }

  /**
   * Send command via ESPHome proxy
   */
  private async sendCommand(command: number[]): Promise<void> {
    try {
      if (!this.connected) {
        throw new Error('Device not connected');
      }

      logDebug(`[RC2Device] Sending command: [${command.map(b => '0x' + b.toString(16)).join(', ')}]`);
      
      await this.esphomeConnection.writeCharacteristic({
        serviceUuid: RC2_SERVICE_UUID,
        characteristicUuid: RC2_CHARACTERISTIC_UUID,
        data: command
      });

    } catch (error) {
      logError(`[RC2Device] Error sending command:`, error);
      throw error;
    }
  }

  /**
   * Start keep-alive mechanism with PIN authentication
   */
  private startKeepAlive(): void {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
    }

    logInfo(`[RC2Device] Starting keep-alive mechanism`);
    
    // Send keep-alive every 30 seconds (ESPHome pattern)
    this.keepAliveInterval = setInterval(async () => {
      try {
        if (!this.connected) {
          logWarn(`[RC2Device] Device not connected, skipping keep-alive`);
          return;
        }

        // Create PIN-based keep-alive command (from ESPHome analysis)
        const pinDigits = this.config.pin.split('').map(digit => parseInt(digit));
        const keepAliveCommand = [
          0x40,   // Prefix
          0x20,   // Command type
          0x43,   // Keep-alive command
          0x00,   // Length
          0x04,   // Additional length
          0x00,   // Extra byte
          ...pinDigits, // PIN digits
          0x40    // Suffix
        ];

        await this.sendCommand(keepAliveCommand);
        logDebug(`[RC2Device] Keep-alive sent for ${this.config.friendlyName}`);
        
      } catch (error) {
        logError(`[RC2Device] Error sending keep-alive:`, error);
        // On keep-alive failure, mark as disconnected
        this.connected = false;
        this.status.connected = false;
        this.emit('disconnected', this.status);
      }
    }, 30000); // 30 seconds
  }

  /**
   * Stop keep-alive mechanism
   */
  private stopKeepAlive(): void {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
      logInfo(`[RC2Device] Keep-alive stopped`);
    }
  }

  /**
   * Cleanup when device is disposed
   */
  dispose(): void {
    this.stopKeepAlive();
    if (this.positionUpdateInterval) {
      clearInterval(this.positionUpdateInterval);
      this.positionUpdateInterval = null;
    }
    this.removeAllListeners();
    logInfo(`[RC2Device] Device ${this.config.friendlyName} disposed`);
  }
} 