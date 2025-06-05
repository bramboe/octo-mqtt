import { logInfo } from './logger';
import * as fs from 'fs';
import * as path from 'path';

export interface RootOptions {
  octoDevices: OctoDevice[];
  bleProxies: BLEProxy[];
  mqtt_host: string;
  mqtt_port: string;
  mqtt_user: string;
  mqtt_password: string;
}

export interface OctoDevice {
  name: string;
  pin?: string;
  friendlyName: string;
}

export interface BLEProxy {
  host: string;
  port?: number;
  password?: string;
}

const DEFAULT_BLE_PORT = 6053;

let rootOptions: RootOptions = {
  octoDevices: [],
  bleProxies: [],
  mqtt_host: 'localhost',
  mqtt_port: '1883',
  mqtt_user: '',
  mqtt_password: ''
};

export const setRootOptions = (options: RootOptions) => {
  logInfo('[Options] Setting root options:', options);
  rootOptions = options;
};

export const getRootOptions = (): RootOptions => {
  try {
    // Try to read from Home Assistant's options.json
    const haOptionsPath = '/data/options.json';
    if (fs.existsSync(haOptionsPath)) {
      const haOptions = JSON.parse(fs.readFileSync(haOptionsPath, 'utf8'));
      
      // Convert Home Assistant options format to our format if needed
      const bleProxies = (haOptions.bleProxies || []).map((proxy: BLEProxy) => ({
        ...proxy,
        port: proxy.port || DEFAULT_BLE_PORT
      }));
      const octoDevices = haOptions.octoDevices || [];

      return {
        octoDevices,
        bleProxies,
        mqtt_host: haOptions.mqtt_host || 'localhost',
        mqtt_port: haOptions.mqtt_port || '1883',
        mqtt_user: haOptions.mqtt_user || '',
        mqtt_password: haOptions.mqtt_password || ''
      };
    }

    // For development, try to read from dev.config.json
    const devConfigPath = path.join(process.cwd(), 'dev.config.json');
    if (fs.existsSync(devConfigPath)) {
      const devOptions = JSON.parse(fs.readFileSync(devConfigPath, 'utf8'));
      // Apply default port to dev config as well
      devOptions.bleProxies = (devOptions.bleProxies || []).map((proxy: BLEProxy) => ({
        ...proxy,
        port: proxy.port || DEFAULT_BLE_PORT
      }));
      return devOptions;
    }

    // Return default options if no configuration file is found
    return rootOptions;
  } catch (error) {
    logInfo('[Options] Error reading options:', error);
    return rootOptions;
  }
};
