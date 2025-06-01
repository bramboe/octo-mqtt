import { readFileSync } from 'fs';
import { logInfo, logError } from './logger';

// Export the options
export const getRootOptions = (): any => {
  try {
    // In your Docker container, the app runs at /octo-mqtt
    // and options.json is at /data/options.json
    logInfo('[Options] Attempting to read /data/options.json');
    const fileContents = readFileSync('/data/options.json');
    const options = JSON.parse(fileContents.toString());
    
    // Ensure octoDevices array exists (initialize if missing)
    if (!options.octoDevices) {
      options.octoDevices = [];
    }
    
    logInfo('[Options] Successfully loaded options');
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
