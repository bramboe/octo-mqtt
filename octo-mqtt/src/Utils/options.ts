import { readFileSync } from 'fs';
import { logInfo, logError } from './logger';
import path from 'path';

// Export the options
export const getRootOptions = (): any => {
  try {
    // Try production path first (/data/options.json)
    let optionsPath = '/data/options.json';
    let fileContents: Buffer;
    
    try {
      logInfo('[Options] Attempting to read /data/options.json');
      fileContents = readFileSync(optionsPath);
    } catch (err) {
      // If production path fails, try local development path
      optionsPath = path.join(process.cwd(), 'data', 'options.json');
      logInfo(`[Options] Production path failed, trying local path: ${optionsPath}`);
      fileContents = readFileSync(optionsPath);
    }
    
    const options = JSON.parse(fileContents.toString());
    
    // Ensure octoDevices array exists (initialize if missing)
    if (!options.octoDevices) {
      options.octoDevices = [];
    }
    
    logInfo(`[Options] Successfully loaded options from ${optionsPath}`);
    return options;
  } catch (err) {
    logError('[Options] Failed to read options:', err);

    // Empty fallback options
    const emptyOptions = {
      bleProxies: [],
      octoDevices: []
    };

    logError('[Options] Using empty default options');
    return emptyOptions;
  }
};
