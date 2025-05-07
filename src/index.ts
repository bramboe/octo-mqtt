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

// Storage paths for devices
const DATA_DIR = process.env.DATA_DIR || './data';
const DEVICES_FILE = path.join(DATA_DIR, 'devices.json');

// Graceful exit
process.on('SIGTERM', () => {
  logWarn('Received SIGTERM');
  processExit();
});

// Handles subscription messages to update the UI state
const setupMQTTSubscriptions = (mqtt: IMQTTConnection) => {
  // Get device IDs from stored devices
  let deviceIds: string[] = [];
  try {
    if (fs.existsSync(DEVICES_FILE)) {
      const data = fs.readFileSync(DEVICES_FILE, 'utf8');
      const devices = JSON.parse(data);
      deviceIds = devices.map((device: any) => device.id);
      logInfo(`Setting up MQTT subscriptions for ${deviceIds.length} devices`);
    } else {
      logInfo('No devices file found, using default device ID: RC2');
      deviceIds = ['RC2']; // Default device if none configured
    }
  } catch (error: any) {
    logError('Error loading devices for MQTT subscriptions:', error);
    deviceIds = ['RC2']; // Default device if error
  }
  
  // Subscribe to topics for all devices
  deviceIds.forEach(deviceId => {
    // Subscribe to motor position updates
    mqtt.subscribe(`octo/${deviceId}/MotorHead/position/state`);
    mqtt.on(`octo/${deviceId}/MotorHead/position/state`, (message: string) => {
      const position = parseInt(message);
      if (!isNaN(position)) {
        updatePosition('head', position);
      }
    });
    
    mqtt.subscribe(`octo/${deviceId}/MotorLegs/position/state`);
    mqtt.on(`octo/${deviceId}/MotorLegs/position/state`, (message: string) => {
      const position = parseInt(message);
      if (!isNaN(position)) {
        updatePosition('feet', position);
      }
    });
    
    // Subscribe to light state updates
    mqtt.subscribe(`octo/${deviceId}/UnderBedLights/state`);
    mqtt.on(`octo/${deviceId}/UnderBedLights/state`, (message: string) => {
      updateLightState(message === 'ON');
    });
    
    // Subscribe to calibration values
    mqtt.subscribe(`octo/${deviceId}/MotorHeadCalibration/state`);
    mqtt.on(`octo/${deviceId}/MotorHeadCalibration/state`, (message: string) => {
      const value = parseFloat(message);
      if (!isNaN(value)) {
        updateCalibration('head', value);
      }
    });
    
    mqtt.subscribe(`octo/${deviceId}/MotorFeetCalibration/state`);
    mqtt.on(`octo/${deviceId}/MotorFeetCalibration/state`, (message: string) => {
      const value = parseFloat(message);
      if (!isNaN(value)) {
        updateCalibration('feet', value);
      }
    });
    
    logInfo(`MQTT subscriptions set up for device: ${deviceId}`);
  });
  
  // Also subscribe to "wildcard" topics for any new devices added later
  mqtt.subscribe('octo/+/MotorHead/position/state');
  mqtt.subscribe('octo/+/MotorLegs/position/state');
  mqtt.subscribe('octo/+/UnderBedLights/state');
  mqtt.subscribe('octo/+/MotorHeadCalibration/state');
  mqtt.subscribe('octo/+/MotorFeetCalibration/state');
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
