import * as fs from 'fs';
import * as path from 'path';
import { logInfo, logError } from './logger';

interface Config {
  octoDevices: Array<{
    name: string;
    friendlyName: string;
    pin?: string;
  }>;
}

const CONFIG_FILE = path.join(process.env.DATA_DIR || './data', 'config.json');

export async function getConfig(): Promise<Config> {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = fs.readFileSync(CONFIG_FILE, 'utf8');
      return JSON.parse(data);
    }
    return { octoDevices: [] };
  } catch (error) {
    logError('[Config] Error reading config:', error);
    return { octoDevices: [] };
  }
}

export async function saveConfig(config: Config): Promise<void> {
  try {
    const dir = path.dirname(CONFIG_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    logInfo('[Config] Saved config to storage');
  } catch (error) {
    logError('[Config] Error saving config:', error);
    throw error;
  }
} 