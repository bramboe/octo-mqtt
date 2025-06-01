import { EventEmitter } from 'events';
import { IESPConnection } from '../ESPHome/IESPConnection';
import { BLEDeviceAdvertisement } from '../BLE/BLEController';
import { logInfo, logWarn, logError } from '../Utils/logger';
import { getRootOptions } from '../Utils/options';

export class BLEScanner {
  private isScanning = false;
  private scanStartTime: number | null = null;
  private scanTimeout: NodeJS.Timeout | null = null;
  private readonly SCAN_DURATION_MS = 30000; // 30 seconds scan duration
  private discoveredDevices = new Map<string, BLEDeviceAdvertisement>();
  private esphomeConnection: IESPConnection & EventEmitter;
  private readonly RC2_NAME_PATTERN = /^RC2.*$/i;
  private readonly MAC_ADDRESS_PATTERN = /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/i;

  constructor(esphomeConnection: IESPConnection & EventEmitter) {
    this.esphomeConnection = esphomeConnection;
  }

  private formatMacAddress(mac: string): string {
    // Remove colons and convert to uppercase
    const cleanMac = mac.replace(/:/g, '').toUpperCase();
    // Add colons back in the correct positions
    return cleanMac.match(/.{2}/g)?.join(':') || mac;
  }

  private isValidMacAddress(mac: string): boolean {
    return this.MAC_ADDRESS_PATTERN.test(mac);
  }

  private isRC2Device(device: BLEDeviceAdvertisement): boolean {
    return (
      this.RC2_NAME_PATTERN.test(device.name) ||
      (device.service_uuids && device.service_uuids.includes('ffe0'))
    );
  }

  public async startScan(): Promise<void> {
    logInfo('[BLEScanner] Starting BLE scan...');

    if (this.isScanning) {
      logWarn('[BLEScanner] Scan already in progress');
      throw new Error('Scan already in progress');
    }

    try {
      this.cleanupScanState(true);
      this.isScanning = true;
      this.scanStartTime = Date.now();
      
      this.scanTimeout = setTimeout(() => {
        logInfo('[BLEScanner] Scan timeout reached');
        this.cleanupScanState(false);
      }, this.SCAN_DURATION_MS);

      await this.esphomeConnection.startBleScan(this.SCAN_DURATION_MS, (device) => {
        // Format MAC address consistently
        const formattedMac = this.formatMacAddress(device.address);
        if (!this.isValidMacAddress(formattedMac)) {
          logWarn(`[BLEScanner] Invalid MAC address format: ${device.address}`);
          return;
        }

        // Only store RC2 devices or devices with the correct service UUID
        if (this.isRC2Device(device)) {
          const enhancedDevice = {
            ...device,
            address: formattedMac,
            lastSeen: Date.now()
          };
          this.discoveredDevices.set(formattedMac, enhancedDevice);
          logInfo(`[BLEScanner] Discovered RC2 device: ${device.name || 'Unknown'} (${formattedMac})`);
        }
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
    devices: (BLEDeviceAdvertisement & { 
      isConfigured: boolean; 
      configuredName?: string;
      lastSeen?: number;
    })[];
  } {
    const timeRemaining = this.scanStartTime 
      ? Math.max(0, this.SCAN_DURATION_MS - (Date.now() - this.scanStartTime))
      : 0;

    const config = getRootOptions();
    const configuredDevices = config.octoDevices || [];
    
    const devicesWithStatus = Array.from(this.discoveredDevices.values())
      .map(device => {
        const formattedMac = this.formatMacAddress(device.address);
        
        // Check configured status
        const configuredDevice = configuredDevices.find((configured: any) => {
          const configMac = this.formatMacAddress(configured.name);
          return (
            formattedMac === configMac ||
            (configured.mac && this.formatMacAddress(configured.mac) === formattedMac) ||
            (device.name && configured.name === device.name)
          );
        });

        const isConfigured = !!configuredDevice;
        
        logInfo(`[BLEScanner] Device status: ${device.name} (${formattedMac}) - configured: ${isConfigured}`);

        return {
          ...device,
          address: formattedMac,
          isConfigured,
          configuredName: configuredDevice?.friendlyName || configuredDevice?.name,
          lastSeen: device.lastSeen || Date.now()
        };
      })
      .sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0)); // Sort by last seen time

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