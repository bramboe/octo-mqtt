import { readFileSync } from 'fs';

interface OptionsJson {
  mqtt_host: string;
  mqtt_port: string;
  mqtt_user: string;
  mqtt_password: string;
  bleProxies: Array<{
    host: string;
    port: number;
    password?: string;
    encryptionKey?: string;
    expectedServerName?: string;
  }>;
  octoDevices: Array<{
    name: string;
    friendlyName: string;
    pin?: string;
  }>;
}

const fileContents = readFileSync('../data/options.json');
const options: OptionsJson = JSON.parse(fileContents.toString());

export const getRootOptions = (): OptionsJson => options;
