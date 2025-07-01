import { EventEmitter } from 'events';
import { IESPConnection } from '../ESPHome/IESPConnection';
import { BLEDeviceAdvertisement } from '../BLE/BLEController';
import { logInfo, logWarn, logError } from '../Utils/logger';
import { getRootOptions } from '../Utils/options';

export class BLEScanner {
  private isScanning = false;
  private scanStartTime: number | null = null;
  private scanTimeout: NodeJS.Timeout | null = null;
  private readonly SCAN_DURATION_MS = 30000; // 30 seconds scan duration (matching ESPHome config)
  private discoveredDevices = new Map<string, BLEDeviceAdvertisement>();
  private esphomeConnection: IESPConnection & EventEmitter;

  constructor(esphomeConnection: IESPConnection & EventEmitter) {
    this.esphomeConnection = esphomeConnection;
  }

  public async startScan(): Promise<void> {
    logInfo('[BLEScanner] Starting BLE scan...');

    if (this.isScanning) {
      logWarn('[BLEScanner] Scan already in progress');
      throw new Error('Scan already in progress');
    }

    try {
      // Clean up any previous scan state (including clearing devices for fresh start)
      this.cleanupScanState(true);
      
      // Initialize scan state
      this.isScanning = true;
      this.scanStartTime = Date.now();
      
      // Set up scan timeout
      this.scanTimeout = setTimeout(() => {
        logInfo('[BLEScanner] Scan timeout reached');
        // Don't clear devices when timeout is reached - keep them for UI
        this.cleanupScanState(false);
      }, this.SCAN_DURATION_MS);

      // Start the actual scan
      await this.esphomeConnection.startBleScan(this.SCAN_DURATION_MS, (device) => {
        // Accept all devices that the ESPConnection considers RC2 devices
        // The filtering is now done in ESPConnection.ts with broader criteria
        this.discoveredDevices.set(device.address.toString(), device);
        logInfo(`[BLEScanner] Discovered device: ${device.name || 'Unknown'} (${device.address})`);
      });

    } catch (error: any) {
      if (error.message === 'No active proxy connections.') {
        logError('[BLEScanner] No active ESPHome proxy connections available');
        logError('[BLEScanner] Please check:');
        logError('  1. Your ESPHome device is powered on and connected to your network');
        logError('  2. The IP address in your configuration is correct');
        logError('  3. The ESPHome device has BLE proxy configured');
        logError('  4. You can access the ESPHome device\'s web interface');
      } else {
      logError('[BLEScanner] Error starting scan:', error);
      }
      this.cleanupScanState(false);
      throw error;
    } finally {
      this.isScanning = false;
    }
  }

  public async stopScan(): Promise<void> {
    logInfo('[BLEScanner] Stopping scan...');
    if (!this.isScanning) {
      logWarn('[BLEScanner] No scan in progress');
      return;
    }

    try {
      if (this.esphomeConnection.stopBleScan) {
        await this.esphomeConnection.stopBleScan();
      }
      // Don't clear devices when manually stopped - keep them for UI
      this.cleanupScanState(false);
      logInfo('[BLEScanner] Scan stopped');
    } catch (error) {
      logError('[BLEScanner] Error stopping scan:', error);
      this.cleanupScanState(false);
      throw error;
    }
  }

  public getScanStatus(): { 
    isScanning: boolean; 
    scanTimeRemaining: number; 
    discoveredDevices: number;
    devices: (BLEDeviceAdvertisement & { isConfigured: boolean; configuredName?: string })[];
  } {
    const timeRemaining = this.scanStartTime 
      ? Math.max(0, this.SCAN_DURATION_MS - (Date.now() - this.scanStartTime))
      : 0;

    // Get configured devices from the addon configuration
    const config = getRootOptions();
    const configuredDevices = config.octoDevices || [];
    
    logInfo(`[BLEScanner DEBUG] getScanStatus called. Found ${configuredDevices.length} configured devices:`);
    configuredDevices.forEach((device: any, index: number) => {
      logInfo(`[BLEScanner DEBUG] Configured device ${index}: mac="${device.mac || device.name}", friendlyName="${device.friendlyName}"`);
    });

    // Check each discovered device against configured devices
    const devicesWithStatus = Array.from(this.discoveredDevices.values())
      .map(device => {
        logInfo(`[BLEScanner DEBUG] Checking discovered device: ${device.name || 'Unknown'} (${device.address})`);
        
        // Check if this device is already configured by matching:
        // Priority 1: MAC address matching (most reliable)
        // Priority 2: Device name matching (only if it's a meaningful name, not generic)
        const isConfigured = configuredDevices.some((configuredDevice: any) => {
          // First check: MAC address matching (new format)
          const macMatch = device.address && configuredDevice.mac &&
            device.address.toString().toLowerCase() === configuredDevice.mac.toLowerCase();
          
          // Second check: MAC address pattern matching (backward compatibility with old 'name' field)
          const configuredMacAsAddress = (configuredDevice.mac || configuredDevice.name) && 
            /^[0-9a-f]{2}:[0-9a-f]{2}:[0-9a-f]{2}:[0-9a-f]{2}:[0-9a-f]{2}:[0-9a-f]{2}$/i.test(configuredDevice.mac || configuredDevice.name) &&
            device.address && (configuredDevice.mac || configuredDevice.name).toLowerCase() === device.address.toString().toLowerCase();
          
          // Third check: Device name matching (but avoid generic names)
          const nameMatch = device.name && configuredDevice.name && device.name !== 'Unknown Device' &&
            configuredDevice.name !== 'Unknown Device' && device.name === configuredDevice.name;

          logInfo(`[BLEScanner DEBUG]   Comparing with configured "${configuredDevice.mac || configuredDevice.name}":`);
          logInfo(`[BLEScanner DEBUG]     macMatch: ${macMatch}`);
          logInfo(`[BLEScanner DEBUG]     configuredMacAsAddress: ${configuredMacAsAddress}`);
          logInfo(`[BLEScanner DEBUG]     nameMatch: ${nameMatch}`);
          
          const match = nameMatch || macMatch || configuredMacAsAddress;
          logInfo(`[BLEScanner DEBUG]     Final match result: ${match}`);
          
          return match;
        });

        // Find the configured device name if it exists
        const configuredDevice = configuredDevices.find((configuredDevice: any) => {
          const macMatch = device.address && configuredDevice.mac &&
            device.address.toString().toLowerCase() === configuredDevice.mac.toLowerCase();
          const configuredMacAsAddress = (configuredDevice.mac || configuredDevice.name) && 
            /^[0-9a-f]{2}:[0-9a-f]{2}:[0-9a-f]{2}:[0-9a-f]{2}:[0-9a-f]{2}:[0-9a-f]{2}$/i.test(configuredDevice.mac || configuredDevice.name) &&
            device.address && (configuredDevice.mac || configuredDevice.name).toLowerCase() === device.address.toString().toLowerCase();
          const nameMatch = device.name && configuredDevice.name && device.name !== 'Unknown Device' &&
            configuredDevice.name !== 'Unknown Device' && device.name === configuredDevice.name;
          return nameMatch || macMatch || configuredMacAsAddress;
        });

        logInfo(`[BLEScanner DEBUG] Device ${device.name} (${device.address}) - isConfigured: ${isConfigured}, configuredName: ${configuredDevice?.friendlyName || configuredDevice?.mac || configuredDevice?.name || 'N/A'}`);

        return {
          ...device,
          isConfigured,
          configuredName: configuredDevice?.friendlyName || configuredDevice?.mac || configuredDevice?.name
        };
      });

    return {
      isScanning: this.isScanning,
      scanTimeRemaining: timeRemaining,
      discoveredDevices: this.discoveredDevices.size,
      devices: devicesWithStatus
    };
  }

  public getDevice(address: string): BLEDeviceAdvertisement | undefined {
    return this.discoveredDevices.get(address);
  }

  private cleanupScanState(clearDevices: boolean = true): void {
    this.isScanning = false;
    this.scanStartTime = null;
    if (this.scanTimeout) {
      clearTimeout(this.scanTimeout);
      this.scanTimeout = null;
    }
    
    // Only clear devices when explicitly requested (e.g., starting new scan)
    if (clearDevices) {
      this.discoveredDevices.clear();
    }
    
    // Clean up any remaining listeners
    if (this.esphomeConnection && typeof this.esphomeConnection === 'object') {
      if (typeof this.esphomeConnection.eventNames === 'function' && 
          typeof this.esphomeConnection.removeAllListeners === 'function') {
        const listeners = this.esphomeConnection.eventNames();
        listeners.forEach(event => {
          if (event.toString().includes('BluetoothGATTReadResponse')) {
            this.esphomeConnection?.removeAllListeners(event);
          }
        });
      }
    }
  }
} 