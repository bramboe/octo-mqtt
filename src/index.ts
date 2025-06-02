import express from 'express';
import type { Request, Response } from 'express';
import * as fs from 'fs';
import * as http from 'http';
import * as WebSocket from 'ws';
import * as path from 'path';
import { logInfo, logError } from '@utils/logger';
import { getRootOptions } from '@utils/options';

const app = express();
const port = process.env.PORT || 8099;
const server = http.createServer(app);

// Set up WebSocket server for real-time communication
const wsServer = new WebSocket.Server({ 
  server,
  path: '/api/ws'  // Update WebSocket path to match client expectations
});

// Serve static files
const webuiPath = path.join(process.cwd(), 'webui');
logInfo(`Serving static files from ${webuiPath}`);
app.use(express.static(webuiPath));
app.use(express.json());

// Simple logging functions
const logInfo = (message: string, ...args: any[]) => console.log(`[INFO] ${message}`, ...args);
const logWarn = (message: string, ...args: any[]) => console.warn(`[WARN] ${message}`, ...args);
const logError = (message: string, ...args: any[]) => console.error(`[ERROR] ${message}`, ...args);

// Global variables
let isScanning = false;
let scanStartTime: number | null = null;
let scanTimeout: any = null;
const SCAN_DURATION_MS = 30000;
const discoveredDevices = new Map<string, any>();

// Function to cleanup scan state
function cleanupScanState() {
  isScanning = false;
  scanStartTime = null;
  if (scanTimeout) {
    clearTimeout(scanTimeout);
    scanTimeout = null;
  }
  discoveredDevices.clear();
}

// Enhanced BLE scanning endpoint with better error handling
app.post('/scan/start', async (req: Request, res: Response): Promise<void> => {
  logInfo('[BLE] Received scan start request');
  
  if (isScanning) {
    logWarn('[BLE] Scan already in progress');
    res.status(400).json({ error: 'Scan already in progress' });
    return;
  }

  try {
    // Check BLE proxy configuration
    const config = getRootOptions();
    const bleProxies = config.bleProxies || [];
    
    if (bleProxies.length === 0) {
      res.status(500).json({ 
        error: 'No BLE proxies configured',
        details: 'You need to configure at least one ESPHome BLE proxy in the addon configuration to scan for devices.',
        troubleshooting: [
          'Add your ESPHome BLE proxy device to the addon configuration',
          'Ensure the IP address and port are correct',
          'Restart the addon after updating the configuration'
        ]
      });
      return;
    }

    // Check for placeholder IP addresses
    const hasPlaceholders = bleProxies.some((proxy: any) => 
      !proxy.host || 
      proxy.host === 'YOUR_ESP32_IP_ADDRESS' || 
      proxy.host.includes('PLACEHOLDER') ||
      proxy.host.includes('EXAMPLE')
    );

    if (hasPlaceholders) {
      res.status(500).json({ 
        error: 'Invalid BLE proxy configuration',
        details: 'One or more BLE proxies have placeholder IP addresses. Please update your configuration with the actual IP addresses of your ESPHome devices.',
        troubleshooting: [
          'Find your ESPHome device IP address in your router admin panel',
          'Update the addon configuration with the correct IP address',
          'Restart the addon after making changes'
        ],
        currentConfiguration: bleProxies
      });
      return;
    }

    // Simulate scan start (since we don't have actual ESPHome connection)
    cleanupScanState();
    isScanning = true;
    scanStartTime = Date.now();
    
    logInfo('[BLE] Starting BLE scan simulation...');
    
    // Set up scan timeout
    scanTimeout = setTimeout(() => {
      logInfo('[BLE] Scan timeout reached');
      cleanupScanState();
    }, SCAN_DURATION_MS);

    res.json({ 
      message: 'Scan started',
      scanDuration: SCAN_DURATION_MS,
      proxiesConfigured: bleProxies.length
    });

  } catch (error) {
    logError('[BLE] Error starting scan:', error);
    cleanupScanState();
    res.status(500).json({ 
      error: 'Failed to start scan',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// Scan status endpoint
app.get('/scan/status', (req: Request, res: Response) => {
  res.json({
    isScanning,
    scanTimeRemaining: isScanning && scanStartTime ? Math.max(0, SCAN_DURATION_MS - (Date.now() - scanStartTime)) : 0,
    devices: Array.from(discoveredDevices.values())
  });
});

// Configuration management endpoints
app.get('/api/config/ble-proxies', (req: Request, res: Response) => {
  try {
    const config = getRootOptions();
    const bleProxies = config.bleProxies || [];
    
    res.json({
      proxies: bleProxies,
      count: bleProxies.length,
      hasValidProxies: bleProxies.length > 0 && bleProxies.every((proxy: any) => 
        proxy.host && 
        proxy.host !== 'YOUR_ESP32_IP_ADDRESS' &&
        !proxy.host.includes('PLACEHOLDER') &&
        !proxy.host.includes('EXAMPLE')
      )
    });
  } catch (error) {
    logError('[API] Error getting BLE proxy configuration:', error);
    res.status(500).json({ 
      error: 'Failed to get configuration',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// Update BLE proxy configuration
app.post('/api/config/ble-proxies', async (req: Request, res: Response): Promise<void> => {
  try {
    const { proxies } = req.body;
    
    if (!Array.isArray(proxies)) {
      res.status(400).json({ error: 'Proxies must be an array' });
      return;
    }

    // Validate proxy configuration
    for (const proxy of proxies) {
      if (!proxy.host || !proxy.port) {
        res.status(400).json({ error: 'Each proxy must have host and port' });
        return;
      }
    }

    const config = getRootOptions();
    config.bleProxies = proxies;

    // Save configuration
    const configJson = JSON.stringify(config, null, 2);
    const configPath = '/data/options.json';
    
    await fs.promises.writeFile(configPath, configJson);
    
    logInfo(`[API] Updated BLE proxy configuration with ${proxies.length} proxies`);
    
    res.json({ 
      message: 'Configuration updated successfully',
      proxies: proxies,
      note: 'Restart the addon for changes to take effect'
    });

  } catch (error) {
    logError('[API] Error updating BLE proxy configuration:', error);
    res.status(500).json({ 
      error: 'Failed to update configuration',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// Device management endpoints (simplified)
app.get('/devices/configured', (req: Request, res: Response) => {
  try {
    const config = getRootOptions();
    res.json({ devices: config.octoDevices || [] });
  } catch (error) {
    logError('[API] Error getting configured devices:', error);
    res.status(500).json({ error: 'Failed to get configured devices' });
  }
});

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Main routes
app.get('/', (_req: Request, res: Response) => {
  res.sendFile(path.join(webuiPath, 'index.html'));
});

// Start the server with proper error handling
server.listen(port, '0.0.0.0', () => {  // Listen on all interfaces
  logInfo(`Octo-MQTT server listening on port ${port}`);
}).on('error', (error: Error) => {
  logError(`Failed to start server: ${error.message}`);
  processExit(1);
}); 