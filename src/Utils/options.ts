import { readFileSync } from 'fs';
import { join } from 'path';
import { logInfo } from './logger';

export interface OctoDevice {
  name: string;
  model: string;
  manufacturer: string;
}

export interface OctoOptions {
  octoDevices: OctoDevice[];
}

let rootOptions: OctoOptions = { octoDevices: [] };

export const getRootOptions = (): OctoOptions => {
  try {
    const optionsPath = join(process.env.OPTIONS_PATH || '/data/options.json');
    const optionsContent = readFileSync(optionsPath, 'utf8');
    rootOptions = JSON.parse(optionsContent);
  } catch (error) {
    rootOptions = { octoDevices: [] };
  }
  return rootOptions;
};
