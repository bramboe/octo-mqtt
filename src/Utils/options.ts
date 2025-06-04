import { logInfo } from './logger';

export interface RootOptions {
  octoDevices: OctoDevice[];
  bleProxies: BLEProxy[];
}

export interface OctoDevice {
  name: string;
  friendlyName?: string;
  pin?: string;
}

export interface BLEProxy {
  host: string;
  port: number;
  password?: string;
}

let rootOptions: RootOptions = {
  octoDevices: [],
  bleProxies: []
};

export const setRootOptions = (options: RootOptions) => {
  logInfo('[Options] Setting root options:', options);
  rootOptions = options;
};

export const getRootOptions = (): RootOptions => {
  return rootOptions;
};
