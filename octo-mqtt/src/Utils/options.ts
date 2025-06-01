import fs from 'fs';
import path from 'path';
import { logError, logInfo } from './logger';

let rootOptions: any = null;

export function getRootOptions() {
  if (rootOptions) return rootOptions;

  logInfo('[Options] Attempting to read options.json');
  
  // Try to read from current directory first
  const localPath = path.join(process.cwd(), 'data', 'options.json');
  try {
    const content = fs.readFileSync(localPath, 'utf8');
    rootOptions = JSON.parse(content);
    logInfo('[Options] Successfully read options from local path:', localPath);
    return rootOptions;
  } catch (error) {
    logInfo('[Options] Could not read from local path, trying /data/options.json');
  }

  // Try to read from /data/options.json
  try {
    const content = fs.readFileSync('/data/options.json', 'utf8');
    rootOptions = JSON.parse(content);
    logInfo('[Options] Successfully read options from /data/options.json');
    return rootOptions;
  } catch (error) {
    logInfo('[Options] Could not read from /data/options.json, using default options');
  }

  // If no options file could be read, return default options
  rootOptions = {
    octoDevices: [],
    mqttHost: "localhost",
    mqttPort: 1883,
    mqttUser: "",
    mqttPassword: "",
    mqttClientId: "octo_mqtt",
    mqttTopic: "octo",
    proxyHost: "localhost",
    proxyPort: 6053,
    proxyPassword: ""
  };
  
  logInfo('[Options] Using default options');
  return rootOptions;
}
