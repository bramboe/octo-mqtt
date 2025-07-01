import express from 'express';
import { logInfo, logError, logWarn } from './Utils/logger';
import { getRootOptions, resetOptionsCache, saveRootOptions } from './Utils/options';
import { connectToMQTT } from './MQTT/connectToMQTT';
import { connectToESPHome } from './ESPHome/connectToESPHome';
import { octo } from './Octo/octo';
import { IMQTTConnection } from './MQTT/IMQTTConnection';
import { IESPConnection } from './ESPHome/IESPConnection';
import { BLEController } from './BLE/BLEController';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { BLEDeviceAdvertisement } from './BLE/BLEController';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });
const PORT = process.env.PORT || 8099;

// Middleware
app.use(express.json());
app.use(express.static('webui'));

// Global variables for addon state
let mqttConnection: IMQTTConnection | null = null;
let esphomeConnection: IESPConnection | null = null;
let bleController: BLEController | null = null;
let isInitialized = false;
let isScanning = false;
let discoveredDevices = new Map<string, BLEDeviceAdvertisement>();

// WebSocket connection handling
wss.on('connection', (ws) => {
  logInfo('[WebSocket] New client connected');
  
  // Send initial status
  sendToClient(ws, {
    type: 'status',
    payload: {
      connected: true,
      positions: { head: 0, feet: 0 },
      lightState: false,
      calibration: { head: 30.0, feet: 30.0 }
    }
  });
  
  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message.toString());
      await handleWebSocketMessage(ws, data);
    } catch (error) {
      logError('[WebSocket] Error handling message:', error);
      sendToClient(ws, {
        type: 'error',
        payload: { message: 'Invalid message format' }
      });
    }
  });
  
  ws.on('close', () => {
    logInfo('[WebSocket] Client disconnected');
  });
});

function sendToClient(ws: any, data: any) {
  if (ws.readyState === 1) { // WebSocket.OPEN
    ws.send(JSON.stringify(data));
  }
}

function broadcastToAllClients(data: any) {
  wss.clients.forEach((client) => {
    sendToClient(client, data);
  });
}

async function handleWebSocketMessage(ws: any, data: any) {
  switch (data.type) {
    case 'getStatus':
      // Send current status
      sendToClient(ws, {
        type: 'status',
        payload: {
          connected: esphomeConnection !== null && esphomeConnection.hasActiveConnections(),
          positions: { head: 0, feet: 0 }, // TODO: Get actual positions
          lightState: false, // TODO: Get actual light state
          calibration: { head: 30.0, feet: 30.0 } // TODO: Get actual calibration
        }
      });
      break;
      
    case 'scanBeds':
      logInfo('[WebSocket] Received scanBeds request');
      await startDeviceDiscovery(ws);
      break;
      
    case 'stopScan':
      await stopDeviceDiscovery();
      break;
      
    case 'addDevice':
      await addDevice(data.payload);
      break;
      
    case 'removeDevice':
      await removeDevice(data.payload);
      break;
      
    case 'getConfiguredDevices':
      await getConfiguredDevices(ws);
      break;
      
    default:
      logWarn('[WebSocket] Unknown message type:', data.type);
  }
}

async function startDeviceDiscovery(ws: any) {
  logInfo('[Device Discovery] Starting device discovery...');
  
  if (isScanning) {
    logInfo('[Device Discovery] Scan already in progress');
    sendToClient(ws, {
      type: 'scanStatus',
      payload: { scanning: true, message: 'Scan already in progress' }
    });
    return;
  }
  
  if (!esphomeConnection) {
    logError('[Device Discovery] No ESPHome connection available');
    sendToClient(ws, {
      type: 'error',
      payload: { message: 'No ESPHome connection available for BLE scanning' }
    });
    return;
  }
  
  if (!esphomeConnection.hasActiveConnections()) {
    logError('[Device Discovery] ESPHome connection has no active connections');
    sendToClient(ws, {
      type: 'error',
      payload: { message: 'No active BLE proxy connections available' }
    });
    return;
  }
  
  try {
    isScanning = true;
    discoveredDevices.clear();
    
    sendToClient(ws, {
      type: 'scanStatus',
      payload: { scanning: true, message: 'Starting BLE scan...' }
    });
    
    // Start BLE scan with callback for discovered devices
    logInfo('[Device Discovery] Starting BLE scan via ESPHome...');
    await esphomeConnection.startBleScan(30000, (device: BLEDeviceAdvertisement) => {
      logInfo(`[Device Discovery] Device discovered: ${device.name || 'Unknown'} (${device.address})`);
      discoveredDevices.set(device.address.toString(), device);
      
      // Send device to client
      sendToClient(ws, {
        type: 'deviceDiscovered',
        payload: {
          address: device.address.toString(),
          name: device.name || 'Unknown',
          rssi: device.rssi,
          service_uuids: device.service_uuids || []
        }
      });
    });
    
    sendToClient(ws, {
      type: 'scanStatus',
      payload: { scanning: true, message: 'Scanning for BLE devices...' }
    });
    
  } catch (error) {
    logError('[Device Discovery] Error starting scan:', error);
    isScanning = false;
    sendToClient(ws, {
      type: 'error',
      payload: { message: 'Failed to start BLE scan' }
    });
  }
}

async function stopDeviceDiscovery() {
  if (!isScanning) {
    return;
  }
  
  try {
    if (esphomeConnection && esphomeConnection.stopBleScan) {
      await esphomeConnection.stopBleScan();
    }
    
    isScanning = false;
    
    broadcastToAllClients({
      type: 'scanStatus',
      payload: { 
        scanning: false, 
        message: `Scan completed. Found ${discoveredDevices.size} device(s).`,
        deviceCount: discoveredDevices.size
      }
    });
    
  } catch (error) {
    logError('[Device Discovery] Error stopping scan:', error);
    isScanning = false;
  }
}

async function addDevice(payload: { address: string; name: string; pin: string }) {
  try {
    const config = getRootOptions();
    
    // Add device to configuration
    if (!config.octoDevices) {
      config.octoDevices = [];
    }
    
    const newDevice = {
      name: payload.name,
      mac: payload.address,
      pin: payload.pin
    };
    
    // Check if device already exists
    const existingIndex = config.octoDevices.findIndex(
      (device: any) => device.mac?.toLowerCase() === payload.address.toLowerCase()
    );
    
    if (existingIndex >= 0) {
      config.octoDevices[existingIndex] = newDevice;
    } else {
      config.octoDevices.push(newDevice);
    }
    
    // Save configuration
    saveRootOptions(config);
    logInfo(`[Device Management] Added device: ${payload.name} (${payload.address})`);
    
    broadcastToAllClients({
      type: 'addDeviceStatus',
      payload: { 
        success: true, 
        message: `Device ${payload.name} added successfully`,
        device: newDevice
      }
    });
    
  } catch (error) {
    logError('[Device Management] Error adding device:', error);
    broadcastToAllClients({
      type: 'addDeviceStatus',
      payload: { 
        success: false, 
        message: 'Failed to add device' 
      }
    });
  }
}

async function removeDevice(payload: { address: string }) {
  try {
    const config = getRootOptions();
    
    if (config.octoDevices) {
      const index = config.octoDevices.findIndex(
        (device: any) => device.mac?.toLowerCase() === payload.address.toLowerCase()
      );
      
      if (index >= 0) {
        const removedDevice = config.octoDevices[index];
        config.octoDevices.splice(index, 1);
        
        // Save configuration
        saveRootOptions(config);
        
        logInfo(`[Device Management] Removed device: ${removedDevice.name} (${removedDevice.mac})`);
        
        broadcastToAllClients({
          type: 'removeDeviceStatus',
          payload: { 
            success: true, 
            message: `Device ${removedDevice.name} removed successfully`,
            address: payload.address
          }
        });
      }
    }
    
  } catch (error) {
    logError('[Device Management] Error removing device:', error);
    broadcastToAllClients({
      type: 'removeDeviceStatus',
      payload: { 
        success: false, 
        message: 'Failed to remove device' 
      }
    });
  }
}

async function getConfiguredDevices(ws: any) {
  try {
    const config = getRootOptions();
    const devices = config.octoDevices || [];
    
    sendToClient(ws, {
      type: 'configuredDevices',
      payload: { devices }
    });
    
  } catch (error) {
    logError('[Device Management] Error getting configured devices:', error);
    sendToClient(ws, {
      type: 'error',
      payload: { message: 'Failed to get configured devices' }
    });
  }
}

// Health check endpoint
app.get('/health', (_req, res) => {
  const status = {
    status: isInitialized ? 'healthy' : 'initializing',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    bleControllerInitialized: bleController !== null,
    mqttConnected: mqttConnection !== null,
    esphomeConnected: esphomeConnection !== null,
    isInitialized,
    version: process.env.npm_package_version || '1.2.7'
  };
  res.json(status);
});

// Home Assistant addon info endpoint
app.get('/api/addon-info', (_req, res) => {
  res.json({
    name: 'Octo MQTT',
    version: process.env.npm_package_version || '1.2.7',
    description: 'A Home Assistant add-on to enable controlling Octo actuators star version 2.',
    url: 'https://github.com/bramboe/octo-mqtt.git'
  });
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
          await esphomeConnection.startBleScan(10000, () => {});
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
server.listen(PORT, () => {
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
  
  // Give connections time to close properly
  setTimeout(() => {
    process.exit(0);
  }, 1000);
});

process.on('SIGINT', () => {
  logInfo('[Octo MQTT] Received SIGINT, shutting down gracefully');
  process.exit(0);
});

// Handle SIGHUP for configuration reload
process.on('SIGHUP', () => {
  logInfo('[Octo MQTT] Received SIGHUP, reloading configuration...');
  // Reset options cache to force reload
  resetOptionsCache();
  // Reinitialize the addon
  initializeAddon().catch(error => {
    logError('[Octo MQTT] Failed to reinitialize addon:', error);
  });
});

// Error handling - don't exit for Home Assistant addon stability
process.on('uncaughtException', (error) => {
  logError('[Octo MQTT] Uncaught Exception:', error);
  // Don't exit, just log the error for Home Assistant addon stability
});

process.on('unhandledRejection', (reason, promise) => {
  logError('[Octo MQTT] Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit, just log the error for Home Assistant addon stability
}); 