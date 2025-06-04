import express from 'express';
import type { Request, Response } from 'express';
import * as fs from 'fs';
import * as http from 'http';
import * as WebSocket from 'ws';
import * as path from 'path';
import { logInfo, logError } from '@utils/logger';
import { getRootOptions } from '@utils/options';
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

let bleController: BLEController | null = null;

const app = express();
const port = process.env.PORT || 8099;
const server = http.createServer(app);

// Set up WebSocket server for real-time communication
new WebSocket.Server({
  server,
  path: '/api/ws'
});

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

// Add device endpoint
app.post('/device/add', async (req: Request, res: Response) => {
  try {
    const { name, pin } = req.body;
    
    if (!bleController) {
      res.status(500).json({ error: 'BLE controller not initialized' });
      return;
    }
    
    const deviceAddress = macToNumber(name);
    const device = await bleController.connect(deviceAddress);
    if (device) {
      if (pin) {
        await bleController.setPin(pin);
      }

      // Update configuration
      const config = getRootOptions();
      const devices = config.octoDevices || [];
      devices.push({ name, pin });
      config.octoDevices = devices;
      
      // Save configuration
      await fs.promises.writeFile('/data/options.json', JSON.stringify(config, null, 2));
      
      res.json({ message: 'Device added successfully' });
    } else {
      res.status(500).json({ error: 'Failed to connect to device' });
    }
  } catch (error) {
    logError('[BLE] Error adding device:', error);
    res.status(500).json({ error: 'Failed to add device' });
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
      const deviceData = buildMQTTDeviceData({
        friendlyName: deviceName,
        name: 'RC2',
        address: deviceAddress
      }, 'Ergomotion');

      this.currentDeviceData = {
        identifiers: [deviceAddress.toString(16)],
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