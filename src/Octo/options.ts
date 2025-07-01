import { getRootOptions } from '../Utils/options';

export interface OctoDevice {
  friendlyName: string;
  name: string;
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