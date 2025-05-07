import { connectToMQTT } from '@mqtt/connectToMQTT';
import { loadStrings } from '@utils/getString';
import { logError, logInfo, logWarn } from '@utils/logger';
import { connectToESPHome } from 'ESPHome/connectToESPHome';
import { octo } from 'Octo/octo';
import { IMQTTConnection } from '@mqtt/IMQTTConnection';
import { IESPConnection } from 'ESPHome/IESPConnection';
import { startServer, updateLightState, updatePosition, updateCalibration } from 'webui/server';
import { getProxies } from 'ESPHome/options';

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

// Main entry point
(async () => {
  try {
    await loadStrings();

    const mqtt = await connectToMQTT();
    const esp = await connectToESPHome();
    
    // Start the octo functionality
    await octo(mqtt, esp);
    
    // Set up MQTT subscriptions for the UI
    setupMQTTSubscriptions(mqtt);
    
    // Start the web UI server with default port (8099)
    startServer(mqtt, esp);
    
    logInfo('Octo MQTT and Web UI started successfully');
  } catch (e) {
    logError('Error starting application:', e);
    processExit(1);
  }
})();
