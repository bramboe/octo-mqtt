import express from 'express';
import type { Request, Response } from 'express';
import * as fs from 'fs';
import * as http from 'http';
import * as WebSocket from 'ws';
import * as path from 'path';
import { logInfo, logError } from './Utils/logger';
import { getRootOptions } from './Utils/options';
import { BLEController } from './BLE/BLEController';
import { connectToESPHome } from './ESPHome/connectToESPHome';

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
      const success = await bleController.connectToDevice(deviceAddress, device.pin || '0000');
      if (success) {
        logInfo(`[BLE] Successfully connected to device: ${device.name}`);
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
    const success = await bleController.connectToDevice(deviceAddress, pin);
    if (success) {
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