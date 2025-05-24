import { getRootOptions } from '@utils/options';

export interface OctoDevice {
  friendlyName: string;
  name: string;
  pin?: string;
}

interface OptionsJson {
  octoDevices: OctoDevice[];
}

export const getDevices = () => {
  // Read fresh configuration each time instead of caching
  const options: OptionsJson = getRootOptions();
  const devices = options.octoDevices;
  if (Array.isArray(devices)) {
    return devices;
  }
  return [];
};
