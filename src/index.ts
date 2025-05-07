import { connectToMQTT } from '@mqtt/connectToMQTT';
import { loadStrings } from '@utils/getString';
import { logError, logInfo, logWarn } from '@utils/logger';
import { connectToESPHome } from 'ESPHome/connectToESPHome';
import { octo } from 'Octo/octo';
import { IMQTTConnection } from '@mqtt/IMQTTConnection';
import { IESPConnection } from 'ESPHome/IESPConnection';
import { startServer, updateLightState, updatePosition, updateCalibration } from 'webui/server';
import { getProxies } from 'ESPHome/options';
import * as fs from 'fs';
import * as path from 'path';

const processExit = (exitCode?: number) => {
  setTimeout(() => process.exit(exitCode), 250);
};

// Graceful exit
process.on('SIGTERM', () => {
  logWarn('Received SIGTERM');
  processExit();
});

// Handles subscription messages to update the UI state
const setupMQTTSubscriptions = (mqtt: IMQTTConnection) => {
  // Subscribe to motor position updates
  mqtt.subscribe('octo/MotorHead/position/state');
  mqtt.on('octo/MotorHead/position/state', (message: string) => {
    const position = parseInt(message);
    if (!isNaN(position)) {
      updatePosition('head', position);
    }
  });
  
  mqtt.subscribe('octo/MotorLegs/position/state');
  mqtt.on('octo/MotorLegs/position/state', (message: string) => {
    const position = parseInt(message);
    if (!isNaN(position)) {
      updatePosition('feet', position);
    }
  });
  
  // Subscribe to light state updates
  mqtt.subscribe('octo/UnderBedLights/state');
  mqtt.on('octo/UnderBedLights/state', (message: string) => {
    updateLightState(message === 'ON');
  });
  
  // Subscribe to calibration values
  mqtt.subscribe('octo/MotorHeadCalibration/state');
  mqtt.on('octo/MotorHeadCalibration/state', (message: string) => {
    const value = parseFloat(message);
    if (!isNaN(value)) {
      updateCalibration('head', value);
    }
  });
  
  mqtt.subscribe('octo/MotorFeetCalibration/state');
  mqtt.on('octo/MotorFeetCalibration/state', (message: string) => {
    const value = parseFloat(message);
    if (!isNaN(value)) {
      updateCalibration('feet', value);
    }
  });
};

// Check if we can find the web UI files
const checkWebUIFiles = () => {
  const possiblePaths = [
    path.join(__dirname, 'webui', 'index.html'),
    path.join(__dirname, '..', 'webui', 'index.html'),
    path.join(process.cwd(), 'webui', 'index.html'),
    path.join(process.cwd(), 'dist', 'webui', 'index.html')
  ];

  for (const filePath of possiblePaths) {
    if (fs.existsSync(filePath)) {
      logInfo(`WebUI files found at: ${filePath}`);
      return true;
    }
  }

  logError('WebUI files not found. Checked paths:', possiblePaths);
  return false;
};

// Main entry point
(async () => {
  try {
    logInfo('Starting Octo MQTT application');
    logInfo(`Current directory: ${process.cwd()}`);
    logInfo(`__dirname: ${__dirname}`);
    
    // Check if WebUI files exist
    checkWebUIFiles();
    
    await loadStrings();
    logInfo('Strings loaded successfully');

    const mqtt = await connectToMQTT();
    logInfo('MQTT connected successfully');
    
    const esp = await connectToESPHome();
    logInfo('ESPHome connected successfully');
    
    // Start the octo functionality
    await octo(mqtt, esp);
    logInfo('Octo functionality initialized successfully');
    
    // Set up MQTT subscriptions for the UI
    setupMQTTSubscriptions(mqtt);
    logInfo('MQTT subscriptions set up successfully');
    
    // Start the web UI server with default port (8099)
    const server = startServer(mqtt, esp);
    logInfo('Web UI server started successfully');
    
    // Handle server errors
    server.on('error', (error) => {
      logError('Web UI server error:', error);
    });
    
    logInfo('Octo MQTT and Web UI started successfully');
  } catch (e) {
    logError('Error starting application:', e);
    if (e instanceof Error) {
      logError('Error details:', e.message);
      logError('Stack trace:', e.stack);
    }
    processExit(1);
  }
})();
