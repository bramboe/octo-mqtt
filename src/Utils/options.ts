import fs from 'fs';
import path from 'path';
import { logInfo } from './logger';

let rootOptions: any = null;

export function getRootOptions() {
  if (rootOptions) return rootOptions;

  logInfo('[Options] Attempting to read options');
  
  // First try development config
  const devPath = path.join(process.cwd(), 'dev.config.json');
  try {
    const content = fs.readFileSync(devPath, 'utf8');
    rootOptions = JSON.parse(content);
    logInfo('[Options] Successfully read development config from:', devPath);
    return rootOptions;
  } catch (error) {
    logInfo('[Options] No development config found, checking Home Assistant paths');
  }

  // Try to read from data directory
  const localPath = path.join(process.cwd(), 'data', 'options.json');
  try {
    const content = fs.readFileSync(localPath, 'utf8');
    rootOptions = JSON.parse(content);
    logInfo('[Options] Successfully read options from local path:', localPath);
    return rootOptions;
  } catch (error) {
    logInfo('[Options] Could not read from local path, trying /data/options.json');
  }

  // Try to read from /data/options.json (Home Assistant environment)
  try {
    const content = fs.readFileSync('/data/options.json', 'utf8');
    rootOptions = JSON.parse(content);
    logInfo('[Options] Successfully read options from /data/options.json');
    return rootOptions;
  } catch (error) {
    logInfo('[Options] Could not read from /data/options.json, using default development options');
  }

  // If no options file could be read, return development defaults
  rootOptions = {
    mqtt_host: process.env.MQTTHOST || "localhost",
    mqtt_port: process.env.MQTTPORT || "1883",
    mqtt_user: process.env.MQTTUSER || "",
    mqtt_password: process.env.MQTTPASSWORD || "",
    bleProxies: [
      {
        host: "localhost",
        port: 6053
      }
    ],
    octoDevices: []
  };

  logInfo('[Options] Using default development options');
  return rootOptions;
}

export function resetOptionsCache() {
  rootOptions = null;
  logInfo('[Options] Options cache reset');
}
