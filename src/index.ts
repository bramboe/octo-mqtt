import express from 'express';
import { logInfo, logError, logWarn } from './Utils/logger';
import { getRootOptions } from './Utils/options';
import { connectToMQTT } from './MQTT/connectToMQTT';
import { connectToESPHome } from './ESPHome/connectToESPHome';
import { octo } from './Octo/octo';
import { IMQTTConnection } from './MQTT/IMQTTConnection';
import { IESPConnection } from './ESPHome/IESPConnection';
import { BLEController } from './BLE/BLEController';

const app = express();
const PORT = process.env.PORT || 8099;

// Middleware
app.use(express.json());
app.use(express.static('webui'));

// Global variables for addon state
let mqttConnection: IMQTTConnection | null = null;
let esphomeConnection: IESPConnection | null = null;
let bleController: BLEController | null = null;
let isInitialized = false;

// Health check endpoint
app.get('/health', (_req, res) => {
  const status = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    bleControllerInitialized: bleController !== null,
    mqttConnected: mqttConnection !== null,
    esphomeConnected: esphomeConnection !== null,
    isInitialized
  };
  res.json(status);
});

// Configuration endpoint
app.get('/api/config', (_req, res) => {
  try {
    const config = getRootOptions();
    res.json(config);
  } catch (error) {
    logError('[API] Error getting config:', error);
    res.status(500).json({ error: 'Failed to get configuration' });
  }
});

// Status endpoint
app.get('/api/status', (_req, res) => {
  res.json({
    mqttConnected: mqttConnection !== null,
    esphomeConnected: esphomeConnection !== null,
    bleControllerInitialized: bleController !== null,
    isInitialized
  });
});

// Initialize the addon
async function initializeAddon() {
  try {
    logInfo('[Octo MQTT] Initializing addon...');
    
    // Get configuration
    const config = getRootOptions();
    logInfo('[Octo MQTT] Configuration loaded successfully');
    
    // Connect to MQTT
    logInfo('[Octo MQTT] Connecting to MQTT...');
    mqttConnection = await connectToMQTT();
    logInfo('[Octo MQTT] MQTT connected successfully');
    
    // Connect to ESPHome
    logInfo('[Octo MQTT] Connecting to ESPHome...');
    esphomeConnection = await connectToESPHome();
    
    // Check if ESPHome connection actually has active connections
    if (esphomeConnection && esphomeConnection.hasActiveConnections()) {
      logInfo('[Octo MQTT] ESPHome connected successfully');
    } else {
      logWarn('[Octo MQTT] ESPHome connection failed - no active BLE proxy connections available');
      logWarn('[Octo MQTT] Waiting for connections to be established...');
      
      // Wait for connections to be established (up to 30 seconds)
      const connectionEstablished = await esphomeConnection.waitForConnection(30000);
      
      if (connectionEstablished) {
        logInfo('[Octo MQTT] ESPHome connection established after waiting');
      } else {
        logWarn('[Octo MQTT] ESPHome connection failed - no active BLE proxy connections available');
        logWarn('[Octo MQTT] BLE functionality will be disabled');
        esphomeConnection = null;
      }
    }
    
    // Initialize BLE controller if ESPHome connection is available
    // Try to start a BLE scan to test if connections are working
    try {
      if (esphomeConnection && esphomeConnection.hasActiveConnections()) {
        // Test the ESPHome connection by attempting a short scan
        try {
          await esphomeConnection.startBleScan(5000, () => {});
          if (esphomeConnection.stopBleScan) {
            await esphomeConnection.stopBleScan();
          }
          // BLEController is now created per device in octo.ts
          logInfo('[Octo MQTT] BLE controller initialized successfully');
          
          // Set up memory position entities if we have devices configured
          if (config.octoDevices && config.octoDevices.length > 0) {
            // Memory position entities are now set up per device in octo.ts
            logInfo('[Octo MQTT] Memory position entities setup complete');
          }
        } catch (bleError) {
          logWarn('[Octo MQTT] BLE scan test failed, BLE functionality will be disabled:', bleError);
          // Don't create BLE controller if scan fails
          bleController = null;
        }
      } else {
        logWarn('[Octo MQTT] No ESPHome connection available, BLE functionality disabled');
      }
    } catch (error) {
      logWarn('[Octo MQTT] No ESPHome connections available, BLE functionality disabled:', error);
      bleController = null;
    }
    
    // Initialize Octo devices
    if (bleController && mqttConnection && esphomeConnection) {
      await octo(mqttConnection, esphomeConnection);
      logInfo('[Octo MQTT] Octo devices initialized');
    }
    
    isInitialized = true;
    logInfo('[Octo MQTT] Addon initialization complete');
    
  } catch (error) {
    logError('[Octo MQTT] Error during initialization:', error);
    // Don't exit, let the addon continue running with limited functionality
  }
}

// Start the server
app.listen(PORT, () => {
  logInfo(`[Octo MQTT] Server started on port ${PORT}`);
  logInfo(`[Octo MQTT] Web interface available at http://localhost:${PORT}`);
  
  // Initialize the addon after server starts
  initializeAddon().catch(error => {
    logError('[Octo MQTT] Failed to initialize addon:', error);
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logInfo('[Octo MQTT] Received SIGTERM, shutting down gracefully');
  
  // Cleanup connections
  if (mqttConnection) {
    try {
      mqttConnection.disconnect();
    } catch (error) {
      logError('[Octo MQTT] Error disconnecting MQTT:', error);
    }
  }
  
  if (esphomeConnection) {
    try {
      esphomeConnection.disconnect();
    } catch (error) {
      logError('[Octo MQTT] Error disconnecting ESPHome:', error);
    }
  }
  
  process.exit(0);
});

process.on('SIGINT', () => {
  logInfo('[Octo MQTT] Received SIGINT, shutting down gracefully');
  process.exit(0);
});

// Error handling
process.on('uncaughtException', (error) => {
  logError('[Octo MQTT] Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logError('[Octo MQTT] Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
}); 