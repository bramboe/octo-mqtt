import express, { Request, Response } from 'express';
import * as fs from 'fs';
import * as http from 'http';
import WebSocket from 'ws';
import * as path from 'path';
import { logInfo, logError, logWarn } from '@utils/logger';
import { getRootOptions, setRootOptions } from '@utils/options';
import { BLEController, CommandInput } from './BLE/BLEController';
import { connectToESPHome } from './ESPHome/connectToESPHome';
import { IMQTTConnection } from '@mqtt/IMQTTConnection';
import { IESPConnection } from './ESPHome/IESPConnection';
import { OctoStorage } from './Octo/storage';
import { OctoMQTTEntities } from './Octo/mqttEntities';
import { buildMQTTDeviceData, Device } from './Common/buildMQTTDeviceData';
import { IDeviceData } from '@homeassistant/IDeviceData';
import { Command } from './Octo/commands';
import { MQTTDevicePlaceholder } from '@homeassistant/MQTTDevicePlaceholder';
import { octo } from './Octo/octo';
import { OctoDevice } from './Utils/options';

let bleController: BLEController | null = null;

const app = express();
const port = process.env.PORT || 8099;
const server = http.createServer(app);

// Set up WebSocket server for real-time communication
const wss = new WebSocket.Server({
  server,
  path: '/ws',
  verifyClient: (info: { req: http.IncomingMessage }) => {
    // Allow connections from the ingress path
    const requestPath = info.req.url || '';
    return requestPath.endsWith('/ws');
  }
});

// WebSocket connection handling
wss.on('connection', function(ws: WebSocket.WebSocket, req: http.IncomingMessage) {
  logInfo('[WebSocket] Client connected from:', req.url);
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      handleWebSocketMessage(ws, data);
    } catch (error) {
      logError('[WebSocket] Error handling message:', error);
    }
  });
  
  ws.on('close', () => {
    logInfo('[WebSocket] Client disconnected');
  });

  ws.on('error', (error) => {
    logError('[WebSocket] Client error:', error);
  });
});

function handleWebSocketMessage(ws: WebSocket.WebSocket, data: any) {
  // Handle different message types
  switch (data.type) {
    case 'getStatus':
      sendStatus(ws);
      break;
    default:
      logWarn('Unknown WebSocket message type:', data.type);
  }
}

function sendStatus(ws: WebSocket.WebSocket) {
  ws.send(JSON.stringify({
    type: 'status',
    data: {
      bleControllerInitialized: bleController !== null,
      timestamp: new Date().toISOString()
    }
  }));
}

// Serve static files
const webuiPath = path.join(process.cwd(), 'webui');
logInfo(`Serving static files from ${webuiPath}`);
app.use(express.static(webuiPath));
app.use(express.json());

// Helper function to convert MAC address to number
function macToNumber(mac: string): number {
  // Remove colons and convert to number
  return parseInt(mac.replace(/:/g, ''), 16);
}

// Initialize BLE controller
async function initializeBLE() {
  try {
    const espConnection = await connectToESPHome();
    bleController = new BLEController(espConnection);
    
    // Connect to any previously configured devices
    const config = getRootOptions();
    const devices = config.octoDevices || [];
    
    for (const device of devices) {
      const deviceAddress = macToNumber(device.name);
      const success = await bleController.connect(deviceAddress);
      if (success) {
        logInfo(`[BLE] Successfully connected to device: ${device.name}`);
        if (device.pin) {
          await bleController.setPin(device.pin);
        }
      } else {
        logError(`[BLE] Failed to connect to device: ${device.name}`);
      }
    }
  } catch (error) {
    logError('[BLE] Error initializing BLE controller:', error);
  }
}

// Initialize BLE when the application starts
initializeBLE();

// API Routes
app.post('/api/scan/start', async (req: Request, res: Response) => {
  try {
    if (!bleController) {
      res.status(500).json({ error: 'BLE controller not initialized' });
      return;
    }
    
    await bleController.scan();
    res.json({ message: 'Scan started' });
    
    // Broadcast scan status to all WebSocket clients
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({
          type: 'scan_status',
          scanning: true
        }));
      }
    });
  } catch (error) {
    logError('[BLE] Error starting scan:', error);
    res.status(500).json({ error: 'Failed to start scan' });
  }
});

app.post('/api/scan/stop', async (req: Request, res: Response) => {
  try {
    if (!bleController) {
      res.status(500).json({ error: 'BLE controller not initialized' });
      return;
    }
    
    await bleController.stopScan();
    res.json({ message: 'Scan stopped' });
    
    // Broadcast scan status to all WebSocket clients
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({
          type: 'scan_status',
          scanning: false
        }));
      }
    });
  } catch (error) {
    logError('[BLE] Error stopping scan:', error);
    res.status(500).json({ error: 'Failed to stop scan' });
  }
});

app.post('/api/devices', async (req: Request, res: Response) => {
  try {
    const { name, pin } = req.body;
    
    // Validate input
    if (!name) {
      res.status(400).json({ error: 'Device name is required' });
      return;
    }

    // Create new device configuration
    const newDevice: OctoDevice = {
      name,
      pin,
      friendlyName: name // Use name as friendlyName if not provided
    };

    // Update configuration
    const config = getRootOptions();
    config.octoDevices = [...(config.octoDevices || []), newDevice];
    
    // Save configuration
    await fs.promises.writeFile('/data/options.json', JSON.stringify(config, null, 2));
    
    res.json({ 
      message: 'Device added successfully',
      device: newDevice
    });
  } catch (error) {
    logError('[Config] Error adding device:', error);
    res.status(500).json({ error: 'Failed to add device' });
  }
});

app.delete('/api/device/remove/:address', async (req: Request, res: Response) => {
  try {
    const { address } = req.params;
    
    // Update configuration
    const config = getRootOptions();
    const devices = config.octoDevices || [];
    config.octoDevices = devices.filter(d => d.name !== address);
    
    // Save configuration
    await fs.promises.writeFile('/data/options.json', JSON.stringify(config, null, 2));
    
    res.json({ message: 'Device removed successfully' });
    
    // Broadcast device removed status
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({
          type: 'device_removed',
          address
        }));
      }
    });
  } catch (error) {
    logError('[BLE] Error removing device:', error);
    res.status(500).json({ error: 'Failed to remove device' });
  }
});

app.get('/api/devices/configured', async (req: Request, res: Response) => {
  try {
    const config = getRootOptions();
    const devices = config.octoDevices || [];
    res.json({ devices });
  } catch (error) {
    logError('[BLE] Error getting configured devices:', error);
    res.status(500).json({ error: 'Failed to get configured devices' });
  }
});

app.get('/api/config/ble-proxies', async (req: Request, res: Response) => {
  try {
    const config = getRootOptions();
    const proxies = config.bleProxies || [];
    
    res.json({
      proxies,
      count: proxies.length,
      hasValidProxies: proxies.length > 0 && proxies.every(p => p.host && p.port)
    });
  } catch (error) {
    logError('[Config] Error getting BLE proxies:', error);
    res.status(500).json({ error: 'Failed to get BLE proxies' });
  }
});

app.post('/api/config/ble-proxies', async (req: Request, res: Response) => {
  try {
    const { proxies } = req.body;
    
    if (!Array.isArray(proxies)) {
      res.status(400).json({ error: 'Invalid proxies data' });
      return;
    }
    
    // Validate proxy data
    const validProxies = proxies.filter(p => p.host && p.port);
    if (validProxies.length === 0) {
      res.status(400).json({ 
        error: 'No valid proxies provided',
        details: 'Each proxy must have a host and port'
      });
      return;
    }
    
    // Update configuration
    const config = getRootOptions();
    config.bleProxies = validProxies;
    
    // Save configuration
    await fs.promises.writeFile('/data/options.json', JSON.stringify(config, null, 2));
    
    res.json({ 
      message: 'BLE proxies updated successfully',
      proxies: validProxies
    });
  } catch (error) {
    logError('[Config] Error updating BLE proxies:', error);
    res.status(500).json({ error: 'Failed to update BLE proxies' });
  }
});

// Main routes
app.get('/', (_req: Request, res: Response) => {
  res.sendFile(path.join(webuiPath, 'index.html'));
});

// Health check endpoint
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    bleControllerInitialized: bleController !== null
  });
});

// Start the server with proper error handling
const portNumber = typeof port === 'string' ? parseInt(port) : port;
server.listen(portNumber, '0.0.0.0', () => {
  logInfo(`Octo-MQTT server listening on port ${port}`);
}).on('error', (error: Error) => {
  logError(`Failed to start server: ${error.message}`);
  process.exit(1);
});

interface OctoControllerMinimal {
  deviceData: MQTTDevicePlaceholder;
  writeCommand: (command: CommandInput) => Promise<void>;
  writeCommands: (commands: CommandInput[]) => Promise<void>;
  cancelCommands: () => Promise<void>;
  on: () => Promise<void>;
  off: () => Promise<void>;
  setPin: (pin: string) => Promise<void>;
}

export class OctoMQTT {
  private bleController: BLEController;
  private storage: OctoStorage;
  private mqttEntities: OctoMQTTEntities;
  private currentDeviceData?: MQTTDevicePlaceholder;

  constructor(
    private mqtt: IMQTTConnection,
    private esphome: IESPConnection
  ) {
    this.bleController = new BLEController(esphome);
    this.storage = new OctoStorage();
    this.mqttEntities = new OctoMQTTEntities(mqtt, this.storage);
  }

  public async start(deviceAddress: number, deviceName: string, devicePin?: string) {
    try {
      logInfo('[OctoMQTT] Starting...');

      // Connect to the device
      const device = await this.bleController.connect(deviceAddress);
      if (!device) {
        throw new Error(`Failed to connect to device ${deviceAddress}`);
      }

      // Set up MQTT entities
      const deviceAddressHex = deviceAddress.toString(16).toUpperCase();
      const deviceData = buildMQTTDeviceData({
        friendlyName: deviceName,
        name: 'RC2',
        address: deviceAddressHex
      }, 'Ergomotion');

      this.currentDeviceData = {
        identifiers: [deviceAddressHex],
        name: deviceName,
        model: 'RC2',
        manufacturer: 'Ergomotion',
        sw_version: deviceData.device.sw_version
      };
      
      const controller: OctoControllerMinimal = {
        deviceData: this.currentDeviceData,
        writeCommand: this.bleController.writeCommand.bind(this.bleController),
        writeCommands: this.bleController.writeCommands.bind(this.bleController),
        cancelCommands: this.bleController.cancelCommands.bind(this.bleController),
        on: async () => {
          await this.bleController.writeCommand({ command: [0x20, 0x71] });
        },
        off: async () => {
          await this.bleController.writeCommand({ command: [0x20, 0x72] });
        },
        setPin: async (pin: string) => {
          const pinBytes = pin.split('').map(c => parseInt(c));
          await this.bleController.writeCommand({ command: [0x20, 0x73, ...pinBytes] });
        }
      };

      this.mqttEntities.setupOctoMqttEntities(controller, devicePin, this.currentDeviceData);

      logInfo('[OctoMQTT] Started successfully');
    } catch (error) {
      logError('[OctoMQTT] Failed to start:', error);
      throw error;
    }
  }

  public async stop() {
    try {
      logInfo('[OctoMQTT] Stopping...');

      // Clean up MQTT entities
      if (this.currentDeviceData) {
        this.mqttEntities.cleanupOctoMqttEntities(this.currentDeviceData);
      }

      // Disconnect from the device
      await this.bleController.disconnectAll();

      logInfo('[OctoMQTT] Stopped successfully');
    } catch (error) {
      logError('[OctoMQTT] Failed to stop:', error);
      throw error;
    }
  }
} 