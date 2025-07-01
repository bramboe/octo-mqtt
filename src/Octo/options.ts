import { getRootOptions } from '../Utils/options';

export interface OctoDevice {
  friendlyName: string;
  name?: string;  // Optional for backward compatibility
  mac?: string;   // New field for MAC addresses
  pin?: string;
}

interface OptionsJson {
  octoDevices: OctoDevice[];
}

const options: OptionsJson = getRootOptions();

export const getDevices = () => {
  // Read fresh configuration each time instead of caching
  const devices = options.octoDevices;
  if (Array.isArray(devices)) {
    return devices;
  }
  return [];
}; 