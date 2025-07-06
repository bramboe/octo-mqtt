/// <reference types="node" />
import express, { Request, Response } from 'express';
import * as fs from 'fs';
import { connectToESPHome } from './ESPHome/connectToESPHome';
import { BLEScanner } from './Scanner/BLEScanner';
import { IESPConnection } from './ESPHome/IESPConnection';
import { EventEmitter } from 'events';

const app = express();
app.use(express.json());
app.use(express.static('webui'));

// Enhanced logging
const logWithTimestamp = (level: string, message: string, ...args: any[]) => {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${level}] ${message}`;
  console.log(logMessage, ...args);
  
  // Also log to file for debugging
  try {
    // Use different log paths for development vs production
    const logPath = process.env.NODE_ENV === 'production' ? '/data/app.log' : './app.log';
    
    // Ensure directory exists
    const logDir = logPath.split('/').slice(0, -1).join('/');
    if (logDir && !fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    
    const logEntry = `${timestamp} [${level}] ${message} ${args.map(arg => JSON.stringify(arg)).join(' ')}\n`;
    fs.appendFileSync(logPath, logEntry);
  } catch (error) {
    // Fallback to console if file write fails
    console.error('Log file write failed:', error);
  }
};

// Simple options loading
function getRootOptions() {
  try {
    // Try production path first (/data/options.json)
    let configPath = '/data/options.json';
    let configData: string;
    
    try {
      configData = fs.readFileSync(configPath, 'utf8');
    } catch (err) {
      // If production path fails, try local development path
      configPath = './data/options.json';
      logWithTimestamp('INFO', `Production path failed, trying local path: ${configPath}`);
      configData = fs.readFileSync(configPath, 'utf8');
    }
    
    logWithTimestamp('INFO', `Successfully loaded options from ${configPath}`);
    return JSON.parse(configData);
  } catch (error) {
    logWithTimestamp('ERROR', 'Error loading options:', error);
  }
  
  // Default configuration
  return {
    mqtt: {},
    bleProxies: [],
    octoDevices: [],
    webPort: 8099
  };
}

let espConnection: IESPConnection & EventEmitter | null = null;
let bleScanner: BLEScanner | null = null;
let isScanning = false;
let scanStartTime: number | null = null;
let scanTimeout: NodeJS.Timeout | null = null;
const SCAN_DURATION_MS = 30000;

async function initializeESPHome() {
  try {
    logWithTimestamp('INFO', '🔌 Connecting to ESPHome BLE proxy...');
    const conn = await connectToESPHome();
    if (conn && (conn as any).connections && (conn as any).connections.length > 0) {
      espConnection = conn as IESPConnection & EventEmitter;
      logWithTimestamp('INFO', `✅ Connected to ${(conn as any).connections.length} ESPHome BLE proxy(ies)`);
      bleScanner = new BLEScanner(espConnection);
    } else {
      logWithTimestamp('ERROR', '❌ No ESPHome BLE proxies connected');
    }
  } catch (error) {
    logWithTimestamp('ERROR', '❌ Failed to connect to ESPHome:', error instanceof Error ? error.message : String(error));
  }
}

// Start BLE scan
app.post('/scan/start', async (_req: Request, res: Response): Promise<void> => {
  logWithTimestamp('INFO', '📡 Received scan start request');
  
  if (isScanning) {
    logWithTimestamp('WARN', '⚠️  BLE scan already in progress');
    res.status(400).json({ error: 'Scan already in progress' });
    return;
  }

  if (!bleScanner) {
    logWithTimestamp('ERROR', '❌ BLE scanner not initialized');
    res.status(500).json({ error: 'BLE scanner not initialized' });
    return;
  }

  try {
    isScanning = true;
    scanStartTime = Date.now();
    logWithTimestamp('INFO', '🚀 Starting real BLE scan...');
    await bleScanner.startScan();
    scanTimeout = setTimeout(() => {
      isScanning = false;
      logWithTimestamp('INFO', '⏹️  BLE scan timeout reached');
    }, SCAN_DURATION_MS);
    res.json({ message: 'BLE scan started', scanDuration: SCAN_DURATION_MS });
  } catch (error) {
    isScanning = false;
    logWithTimestamp('ERROR', '❌ Failed to start BLE scan:', error instanceof Error ? error.message : String(error));
    res.status(500).json({ error: 'Failed to start BLE scan', details: error instanceof Error ? error.message : String(error) });
  }
});

// Stop BLE scan
app.post('/scan/stop', async (_req: Request, res: Response): Promise<void> => {
  logWithTimestamp('INFO', '⏹️  Received scan stop request');
  
  if (!isScanning) {
    res.json({ message: 'No scan in progress' });
    return;
  }

  try {
    if (bleScanner) await bleScanner.stopScan();
    if (scanTimeout) clearTimeout(scanTimeout);
    isScanning = false;
    logWithTimestamp('INFO', '✅ BLE scan stopped');
    res.json({ message: 'BLE scan stopped' });
  } catch (error) {
    logWithTimestamp('ERROR', '❌ Failed to stop BLE scan:', error instanceof Error ? error.message : String(error));
    res.status(500).json({ error: 'Failed to stop BLE scan', details: error instanceof Error ? error.message : String(error) });
  }
});

// Get scan status
app.get('/scan/status', (_req: Request, res: Response) => {
  let devices: any[] = [];
  if (bleScanner) {
    const status = bleScanner.getScanStatus();
    devices = status.devices || [];
  }
  res.json({
    isScanning,
    scanTimeRemaining: isScanning && scanStartTime ? Math.max(0, SCAN_DURATION_MS - (Date.now() - scanStartTime)) : 0,
    devices,
    deviceCount: devices.length,
    timestamp: new Date().toISOString()
  });
});

// BLE Proxy diagnostics
app.get('/debug/ble-proxy', async (_req: Request, res: Response) => {
  logWithTimestamp('INFO', '🧪 BLE proxy diagnostics requested');
  
  if (!espConnection || !(espConnection as any).connections || (espConnection as any).connections.length === 0) {
    res.json({ status: 'disconnected', error: 'No ESPHome BLE proxy connected' });
    return;
  }

  res.json({ status: 'connected', proxies: (espConnection as any).connections.length });
});

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    isScanning,
    bleProxyConnected: espConnection && (espConnection as any).connections && (espConnection as any).connections.length > 0
  });
});

// Root endpoint
app.get('/', (_req: Request, res: Response) => {
  res.sendFile('webui/index.html', { root: '.' });
});

// Catch-all route
app.use('*', (req: Request, res: Response) => {
  logWithTimestamp('WARN', `❌ 404 - Route not found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ 
    error: 'Route not found',
    method: req.method,
    path: req.originalUrl,
    availableRoutes: [
      'POST /scan/start',
      'POST /scan/stop', 
      'GET /scan/status',
      'GET /debug/ble-proxy',
      'GET /health'
    ],
    timestamp: new Date().toISOString()
  });
});

// Start server
const config = getRootOptions();
const port = config.webPort || 8099;

logWithTimestamp('INFO', '🔧 Initializing Octo MQTT BLE Scanner...');
logWithTimestamp('INFO', `📁 Serving static files from: webui/`);

app.listen(port, async () => {
  logWithTimestamp('INFO', `🚀 Server started on port ${port}`);
  await initializeESPHome();
}); 