import type { IMQTTConnection } from '@mqtt/IMQTTConnection';
import { connectToMQTT } from '@mqtt/connectToMQTT';
import { loadStrings } from '@utils/getString';
import { logError, logInfo, logWarn } from '@utils/logger';
import { getRootOptions } from './Utils/options';
import { connectToESPHome } from 'ESPHome/connectToESPHome';
import { octo } from 'Octo/octo';
import express, { Request, Response } from 'express';
import http from 'http';
import WebSocket from 'ws';
import path from 'path';
import fs from 'fs';
import fetch from 'node-fetch';
import type { IESPConnection } from 'ESPHome/IESPConnection';
import { EventEmitter } from 'events';
import { BLEScanner } from './Scanner/BLEScanner';

// Increase max listeners limit for BLE operations
EventEmitter.defaultMaxListeners = 50;

// Global variables to track scanning state
let esphomeConnection: IESPConnection & EventEmitter | null = null;
let bleScanner: BLEScanner | null = null;
let wsServer: WebSocket.Server | null = null;
let connectedClients: Set<WebSocket> = new Set();

const processExit = (exitCode?: number) => {
  if (exitCode && exitCode > 0) {
    logError(`Exit code: ${exitCode}`);
  }
  process.exit();
};

process.on('exit', () => {
  logWarn('Shutting down Octo-MQTT...');
  processExit(0);
});
process.on('SIGINT', () => processExit(0));
process.on('SIGTERM', () => processExit(0));
process.on('uncaughtException', (err: Error) => {
  logError(err);
  processExit(2);
});

const start = async () => {
  await loadStrings();

  const mqtt: IMQTTConnection = await connectToMQTT();
  const esp = await connectToESPHome();
  esphomeConnection = esp as IESPConnection & EventEmitter;
  
  try {
    await octo(mqtt, esphomeConnection);
  } catch (error) {
    logError('Failed to initialize Octo MQTT:', error);
    processExit(1);
  }

  // Setup Express server for Ingress
  const app = express();
  const port = process.env.PORT || 8099;
  const server = http.createServer(app);

  // Set up WebSocket server for real-time communication
  wsServer = new WebSocket.Server({ 
    server,
    path: '/api/ws'  // Update path to match the frontend expectation
  });
  
  wsServer.on('connection', (ws: WebSocket) => {
    connectedClients.add(ws);
    logInfo('[WebSocket] Client connected');
    
    // Send initial device info if available
    broadcastDeviceInfo();
    
    ws.on('message', (message: string) => {
      try {
        const data = JSON.parse(message);
        handleWebSocketMessage(ws, data);
      } catch (error) {
        logError('[WebSocket] Error parsing message:', error);
        ws.send(JSON.stringify({ 
          type: 'error', 
          payload: { message: 'Invalid message format' }
        }));
      }
    });
    
    ws.on('close', () => {
      connectedClients.delete(ws);
      logInfo('[WebSocket] Client disconnected');
    });
    
    ws.on('error', (error) => {
      logError('[WebSocket] Error:', error);
      connectedClients.delete(ws);
    });
  });
  
  // Helper function to broadcast messages to all connected clients
  function broadcastMessage(type: string, payload: any) {
    const message = JSON.stringify({ type, payload });
    connectedClients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }
  
  // Helper function to broadcast device information
  function broadcastDeviceInfo() {
    const config = getRootOptions();
    const configuredDevices = config.octoDevices || [];
    
    if (configuredDevices.length > 0) {
      // For now, show information about the first configured device
      // TODO: Later this could be enhanced to show a list of all devices or the currently connected device
      const device = configuredDevices[0];
      const deviceName = device.friendlyName || device.name || 'RC2';
      const deviceAddress = device.name || '00:00:00:00:00:00';
      
      broadcastMessage('deviceInfo', {
        name: deviceName,
        address: deviceAddress,
        firmwareVersion: 'Unknown', // TODO: Get actual firmware version when device is connected
        proxy: 'ESPHome Proxy',
        totalConfiguredDevices: configuredDevices.length
      });
      
      logInfo(`[WebSocket] Broadcasted device info for ${deviceName} (${configuredDevices.length} total devices configured)`);
    } else {
      // No devices configured, show default placeholder
      broadcastMessage('deviceInfo', {
        name: 'RC2',
        address: '00:00:00:00:00:00',
        firmwareVersion: 'Unknown',
        proxy: 'ESPHome Proxy',
        totalConfiguredDevices: 0
      });
      
      logInfo('[WebSocket] Broadcasted default device info - no devices configured');
    }
  }
  
  // Handle incoming WebSocket messages
  function handleWebSocketMessage(ws: WebSocket, data: any) {
    const { type } = data;
    
    switch (type) {
      case 'getStatus':
        // Send current status when requested
        broadcastMessage('status', {
          connected: false, // For now - will be updated when device connection is implemented
          positions: { head: 0, feet: 0 },
          lightState: false,
          calibration: { head: 30.0, feet: 30.0 }
        });
        // Also send device info
        broadcastDeviceInfo();
        break;
        
      case 'status':
        // Send current status
        broadcastMessage('status', {
          connected: false, // For now - will be updated when device connection is implemented
          positions: { head: 0, feet: 0 },
          lightState: false,
          calibration: { head: 30.0, feet: 30.0 }
        });
        break;
        
      case 'deviceInfo':
        broadcastDeviceInfo();
        break;
        
      default:
        logWarn(`[WebSocket] Unknown message type: ${type}`);
        ws.send(JSON.stringify({
          type: 'error',
          payload: { message: `Unknown message type: ${type}` }
        }));
    }
  }

  // Serve static files with proper base path for ingress
  const webuiPath = path.join(process.cwd(), 'webui');
  logInfo(`Serving static files from ${webuiPath}`);
  app.use('/api/static', express.static(path.join(webuiPath, 'static')));
  app.use(express.json());

  // Main routes with proper base path
  app.get('/', (_req: Request, res: Response) => {
    res.sendFile(path.join(webuiPath, 'index.html'));
  });

  // Health check endpoint
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
  });

  // Initialize BLE scanner
  bleScanner = new BLEScanner(esphomeConnection as any); // TODO: Fix type casting

  // BLE scanning endpoints with simplified routes
  app.post('/scan/start', async (_req: Request, res: Response): Promise<void> => {
    logInfo('[BLE] Received scan start request');
    
    if (!bleScanner) {
      res.status(500).json({ error: 'BLE scanner not initialized' });
      return;
    }

    try {
      await bleScanner.startScan();
      res.json({ 
        message: 'Scan started',
        scanDuration: 30000 // 30 seconds
      });
    } catch (error) {
      logError('[BLE] Error starting scan:', error);
      res.status(500).json({ 
        error: 'Failed to start scan',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  app.get('/scan/status', (_req: Request, res: Response): void => {
    logInfo('[BLE] Received scan status request');
    
    if (!bleScanner) {
      res.status(500).json({ error: 'BLE scanner not initialized' });
      return;
    }

    try {
      const status = bleScanner.getScanStatus();
      logInfo(`[BLE] Scan status: isScanning=${status.isScanning}, deviceCount=${status.discoveredDevices}, timeRemaining=${status.scanTimeRemaining}`);
      
      // Log each discovered device for debugging
      if (status.devices && status.devices.length > 0) {
        logInfo('[BLE] Discovered devices:');
        status.devices.forEach((device, index) => {
          logInfo(`[BLE]   Device ${index + 1}: ${device.name || 'Unknown'} (${device.address}) RSSI: ${device.rssi}`);
        });
      } else {
        logInfo('[BLE] No devices in status response');
      }
      
      res.json(status);
    } catch (error) {
      logError('[BLE] Error getting scan status:', error);
      res.status(500).json({ error: 'Failed to get scan status' });
    }
  });

  app.post('/scan/stop', async (_req: Request, res: Response): Promise<void> => {
    logInfo('[BLE] Received scan stop request');
    
    if (!bleScanner) {
      res.status(500).json({ error: 'BLE scanner not initialized' });
      return;
    }

    try {
      await bleScanner.stopScan();
      const status = bleScanner.getScanStatus();
      res.json({ 
        message: 'Scan stopped',
        discoveredDevices: status.discoveredDevices
      });
    } catch (error) {
      logError('[BLE] Error stopping scan:', error);
      res.status(500).json({ 
        error: 'Failed to stop scan',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  app.post('/device/add', async (req: Request, res: Response): Promise<void> => {
    const { address, pin } = req.body;
    
    if (!bleScanner) {
      res.status(500).json({ error: 'BLE scanner not initialized' });
      return;
    }

    if (!address || !pin) {
      res.status(400).json({ error: 'Missing required parameters' });
      return;
    }

    if (!/^\d{4}$/.test(pin)) {
      res.status(400).json({ error: 'PIN must be 4 digits' });
      return;
    }

    try {
      logInfo(`[BLE] Starting device addition process for ${address}`);
      
      const device = bleScanner.getDevice(address);
      if (!device) {
        logError(`[BLE] Device ${address} not found in scanner results`);
        res.status(404).json({ error: 'Device not found' });
        return;
      }

      logInfo(`[BLE] Found device: ${device.name} (${device.address})`);

      // Get current configuration with fresh read
      logInfo(`[BLE] Reading current configuration...`);
      const config = getRootOptions();
      logInfo(`[BLE] Current config loaded. Existing devices: ${config.octoDevices?.length || 0}`);
      
      // Use MAC address as unique identifier and create friendly name with MAC suffix
      const macSuffix = device.address.slice(-8).replace(/:/g, '').toUpperCase(); // Last 4 chars of MAC
      
      // Create a unique friendly name based on existing devices
      const existingDevices = config.octoDevices || [];
      const existingRC2Count = existingDevices.filter((d: any) => 
        d.friendlyName && d.friendlyName.startsWith('RC2 Bed')
      ).length;
      
      const bedNumber = existingRC2Count + 1;
      const friendlyName = existingRC2Count === 0 
        ? `RC2 Bed (${macSuffix})` 
        : `RC2 Bed ${bedNumber} (${macSuffix})`;
      
      // Add new device to configuration
      const newDevice = {
        name: device.address, // Use MAC address as unique identifier
        friendlyName: friendlyName, // Include bed number and MAC suffix for uniqueness
        pin: pin
      };

      // Check if device already exists
      const existingDevice = existingDevices.find((d: any) => {
        const deviceNameLower = d.name?.toLowerCase();
        const addressLower = device.address.toLowerCase();
        return deviceNameLower === addressLower || 
               (deviceNameLower && addressLower && deviceNameLower === addressLower);
      });

      if (existingDevice) {
        logWarn(`[BLE] Device ${address} already exists in configuration`);
        res.status(409).json({ error: 'Device already exists in configuration' });
        return;
      }

      // Add the device to config
      config.octoDevices.push(newDevice);
      logInfo(`[BLE] Device added to config array. Total devices: ${config.octoDevices.length}`);

      // Use Home Assistant Supervisor API to persist configuration
      try {
        logInfo(`[BLE] Updating Home Assistant addon configuration via Supervisor API...`);
        
        // Prepare configuration update for HA Supervisor
        const supervisorConfigUpdate = {
          options: config
        };
        
        // Get Supervisor token
        const supervisorToken = process.env.SUPERVISOR_TOKEN;
        if (!supervisorToken) {
          throw new Error('SUPERVISOR_TOKEN not available');
        }
        
        // Update configuration via Supervisor API
        const response = await fetch(`http://supervisor/addons/self/options`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supervisorToken}`
          },
          body: JSON.stringify(supervisorConfigUpdate)
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Supervisor API error ${response.status}: ${errorText}`);
        }
        
        logInfo(`[BLE] Configuration updated successfully via Supervisor API`);
        
        // Also write to local file for immediate availability
        const configJson = JSON.stringify(config, null, 2);
        const tempFile = '/data/options.json.tmp';
        
        await fs.promises.writeFile(tempFile, configJson);
        await fs.promises.rename(tempFile, '/data/options.json');
        
        logInfo(`[BLE] Local configuration file also updated for immediate use`);
        
      } catch (apiError) {
        logError(`[BLE] Failed to update via Supervisor API:`, apiError);
        
        // Fallback to local file write only
        logInfo(`[BLE] Falling back to local file write...`);
        const configJson = JSON.stringify(config, null, 2);
        const tempFile = '/data/options.json.tmp';
        
        await fs.promises.writeFile(tempFile, configJson);
        await fs.promises.rename(tempFile, '/data/options.json');
        
        logWarn(`[BLE] Configuration saved locally only - may not persist across addon restarts`);
      }

      // Verify the configuration was saved
      const verifyConfig = getRootOptions();
      const verifyDevice = verifyConfig.octoDevices?.find((d: { name: string }) => 
        d.name.toLowerCase() === newDevice.name.toLowerCase()
      );
      
      if (verifyDevice) {
        logInfo(`[BLE] Device addition verified successfully`);
        logInfo(`[BLE] Final device count: ${verifyConfig.octoDevices?.length || 0}`);
      } else {
        logError(`[BLE] Device addition verification failed! Device not found after write.`);
        res.status(500).json({ error: 'Configuration verification failed' });
        return;
      }

      logInfo(`[BLE] Added new device: ${newDevice.friendlyName}`);
      logInfo(`[BLE] Device details: name="${newDevice.name}", friendlyName="${newDevice.friendlyName}", pin="${newDevice.pin}"`);
      logInfo(`[BLE] Total devices in config: ${config.octoDevices.length}`);
      
      // Broadcast device info update via WebSocket
      if (wsServer && connectedClients.size > 0) {
        broadcastDeviceInfo();
        logInfo(`[BLE] Broadcasted device info update to ${connectedClients.size} WebSocket client(s)`);
      }
      
      res.json({ 
        message: 'Device added successfully',
        device: newDevice,
        note: 'Configuration updated via Home Assistant Supervisor API'
      });

    } catch (error) {
      logError('[BLE] Error adding device:', error);
      res.status(500).json({ 
        error: 'Failed to add device',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Get configured devices endpoint
  app.get('/devices/configured', (_req: Request, res: Response): void => {
    try {
      const config = getRootOptions();
      const configuredDevices = config.octoDevices || [];
      
      logInfo(`[BLE] Retrieved ${configuredDevices.length} configured device(s)`);
      res.json({ 
        devices: configuredDevices,
        count: configuredDevices.length
      });
    } catch (error) {
      logError('[BLE] Error getting configured devices:', error);
      res.status(500).json({ 
        error: 'Failed to get configured devices',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Debug endpoint to show raw configuration
  app.get('/debug/config', (_req: Request, res: Response): void => {
    try {
      const rawConfigContent = fs.readFileSync('/data/options.json', 'utf8');
      const config = getRootOptions();
      
      res.json({
        rawFileContent: rawConfigContent,
        parsedConfig: config,
        octoDevicesCount: (config.octoDevices || []).length
      });
    } catch (error) {
      logError('[DEBUG] Error reading config:', error);
      res.status(500).json({ 
        error: 'Failed to read configuration',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Diagnostic endpoint to show device configuration state
  app.get('/debug/devices', (_req: Request, res: Response): void => {
    try {
      const config = getRootOptions();
      const configuredDevices = config.octoDevices || [];
      
      let scanStatus: any = null;
      let discoveredDevices: any[] = [];
      
      if (bleScanner) {
        scanStatus = bleScanner.getScanStatus();
        discoveredDevices = scanStatus.devices || [];
      }
      
      res.json({
        configuredDevices: configuredDevices,
        configuredCount: configuredDevices.length,
        scanStatus: scanStatus,
        discoveredDevices: discoveredDevices,
        discoveredCount: discoveredDevices.length,
        mapping: discoveredDevices.map((device: any) => ({
          discovered: {
            name: device.name,
            address: device.address,
            rssi: device.rssi
          },
          configuration: {
            isConfigured: device.isConfigured,
            configuredName: device.configuredName
          }
        }))
      });
    } catch (error) {
      logError('[DEBUG] Error reading device state:', error);
      res.status(500).json({ 
        error: 'Failed to read device state',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Remove device endpoint
  app.delete('/device/remove/:address', async (req: Request, res: Response): Promise<void> => {
    const { address } = req.params;
    
    if (!address) {
      res.status(400).json({ error: 'Missing device address' });
      return;
    }

    try {
      // Get current configuration
      const config = getRootOptions();
      
      if (!config.octoDevices || !Array.isArray(config.octoDevices)) {
        res.status(404).json({ error: 'No devices configured' });
        return;
      }

      // Find the device to remove
      const deviceIndex = config.octoDevices.findIndex((d: { name: string }) => 
        d.name.toLowerCase() === address.toLowerCase()
      );

      if (deviceIndex === -1) {
        res.status(404).json({ error: 'Device not found in configuration' });
        return;
      }

      const deviceToRemove = config.octoDevices[deviceIndex];
      
      // Remove the device from configuration
      config.octoDevices.splice(deviceIndex, 1);

      // Save updated configuration
      await fs.promises.writeFile('/data/options.json', JSON.stringify(config, null, 2));

      logInfo(`[BLE] Removed device: ${deviceToRemove.friendlyName || deviceToRemove.name}`);
      logInfo(`[BLE] Configuration updated. Device removed from addon configuration.`);
      logInfo(`[BLE] Total devices in config: ${config.octoDevices.length}`);
      
      // Broadcast device info update via WebSocket
      if (wsServer && connectedClients.size > 0) {
        broadcastDeviceInfo();
        logInfo(`[BLE] Broadcasted device info update to ${connectedClients.size} WebSocket client(s)`);
      }
      
      res.json({ 
        message: 'Device removed successfully',
        device: deviceToRemove
      });

    } catch (error) {
      logError('[BLE] Error removing device:', error);
      res.status(500).json({ 
        error: 'Failed to remove device',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Start the server with proper host binding
  server.listen(port, () => {
    logInfo(`Octo-MQTT server listening on port ${port}`);
    logInfo(`Web interface available at http://localhost:${port}`);
  });
};

start();
