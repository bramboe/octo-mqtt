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
    logWithTimestamp('INFO', `Loaded options: ${configData}`);
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
    const config = getRootOptions();
    logWithTimestamp('INFO', '[DIAG] Initializing ESPHome connection with config:', JSON.stringify(config));
    logWithTimestamp('INFO', `[DIAG] BLE Proxies in config: ${JSON.stringify(config.bleProxies)}`);
    logWithTimestamp('INFO', '🔌 Connecting to ESPHome BLE proxy...');
    const conn = await connectToESPHome();
    if (conn && (conn as any).connections && (conn as any).connections.length > 0) {
      espConnection = conn as IESPConnection & EventEmitter;
      logWithTimestamp('INFO', `✅ Connected to ${(conn as any).connections.length} ESPHome BLE proxy(ies)`);
      bleScanner = new BLEScanner(espConnection);
    } else {
      logWithTimestamp('ERROR', '[DIAG] ❌ No ESPHome BLE proxies connected after connectToESPHome()');
    }
  } catch (error) {
    logWithTimestamp('ERROR', '[DIAG] ❌ Failed to connect to ESPHome:', error instanceof Error ? error.message : String(error));
  }
}

// Start BLE scan
app.post('/scan/start', async (req: Request, res: Response): Promise<void> => {
  const userAgent = req.headers['user-agent'] || 'Unknown';
  const clientInfo = req.body?.clientInfo || 'Web UI';
  
  logWithTimestamp('INFO', '🎯 [UI ACTION] User clicked "Start BLE Scan" button');
  logWithTimestamp('INFO', `📡 Received scan start request from ${clientInfo} (${userAgent.substring(0, 50)}...)`);
  logWithTimestamp('INFO', `🔍 Current state - isScanning: ${isScanning}, bleScanner: ${bleScanner ? 'initialized' : 'not initialized'}`);
  
  if (isScanning) {
    logWithTimestamp('WARN', '⚠️  BLE scan already in progress - rejecting request');
    res.status(400).json({ error: 'Scan already in progress' });
    return;
  }

  if (!bleScanner) {
    logWithTimestamp('ERROR', '❌ BLE scanner not initialized - cannot start scan');
    logWithTimestamp('ERROR', '💡 Troubleshooting: Check ESPHome BLE proxy connection');
    res.status(500).json({ error: 'BLE scanner not initialized' });
    return;
  }

  try {
    logWithTimestamp('INFO', '🚀 [SCAN START] Initiating BLE scan sequence...');
    isScanning = true;
    scanStartTime = Date.now();
    logWithTimestamp('INFO', `⏰ Scan started at: ${new Date(scanStartTime).toISOString()}`);
    logWithTimestamp('INFO', `⏱️  Scan duration: ${SCAN_DURATION_MS}ms (${SCAN_DURATION_MS/1000}s)`);
    
    await bleScanner.startScan();
    logWithTimestamp('INFO', '✅ BLE scanner started successfully');
    
    scanTimeout = setTimeout(() => {
      isScanning = false;
      logWithTimestamp('INFO', '⏹️  [SCAN TIMEOUT] BLE scan timeout reached - stopping scan');
    }, SCAN_DURATION_MS);
    
    logWithTimestamp('INFO', '📤 Sending success response to frontend');
    res.json({ 
      message: 'BLE scan started', 
      scanDuration: SCAN_DURATION_MS,
      startTime: new Date(scanStartTime).toISOString()
    });
  } catch (error) {
    isScanning = false;
    const errorMsg = error instanceof Error ? error.message : String(error);
    logWithTimestamp('ERROR', '❌ [SCAN FAILED] Failed to start BLE scan:', errorMsg);
    logWithTimestamp('ERROR', '🔧 Error details:', error);
    res.status(500).json({ error: 'Failed to start BLE scan', details: errorMsg });
  }
});

// Stop BLE scan
app.post('/scan/stop', async (req: Request, res: Response): Promise<void> => {
  const clientInfo = req.body?.clientInfo || 'Web UI';
  
  logWithTimestamp('INFO', '🎯 [UI ACTION] User clicked "Stop BLE Scan" button');
  logWithTimestamp('INFO', `⏹️  Received scan stop request from ${clientInfo}`);
  logWithTimestamp('INFO', `🔍 Current state - isScanning: ${isScanning}`);
  
  if (!isScanning) {
    logWithTimestamp('INFO', '💭 No scan in progress - nothing to stop');
    res.json({ message: 'No scan in progress' });
    return;
  }

  try {
    logWithTimestamp('INFO', '🛑 [SCAN STOP] Initiating scan stop sequence...');
    
    if (bleScanner) {
      logWithTimestamp('INFO', '📡 Calling bleScanner.stopScan()...');
      await bleScanner.stopScan();
      logWithTimestamp('INFO', '✅ BLE scanner stopped successfully');
    }
    
    if (scanTimeout) {
      logWithTimestamp('INFO', '⏰ Clearing scan timeout...');
      clearTimeout(scanTimeout);
      scanTimeout = null;
    }
    
    isScanning = false;
    const stopTime = new Date().toISOString();
    logWithTimestamp('INFO', `✅ [SCAN STOPPED] BLE scan stopped at: ${stopTime}`);
    
    if (scanStartTime) {
      const duration = Date.now() - scanStartTime;
      logWithTimestamp('INFO', `📊 Scan duration: ${duration}ms (${(duration/1000).toFixed(1)}s)`);
    }
    
    logWithTimestamp('INFO', '📤 Sending stop confirmation to frontend');
    res.json({ 
      message: 'BLE scan stopped',
      stopTime: stopTime,
      duration: scanStartTime ? Date.now() - scanStartTime : null
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logWithTimestamp('ERROR', '❌ [STOP FAILED] Failed to stop BLE scan:', errorMsg);
    logWithTimestamp('ERROR', '🔧 Error details:', error);
    res.status(500).json({ error: 'Failed to stop BLE scan', details: errorMsg });
  }
});

// Get scan status
app.get('/scan/status', (req: Request, res: Response) => {
  const isRefreshButton = req.query.source === 'refresh-button';
  
  if (isRefreshButton) {
    logWithTimestamp('INFO', '🎯 [UI ACTION] User clicked "Refresh Status" button');
  }
  
  let devices: any[] = [];
  if (bleScanner) {
    const status = bleScanner.getScanStatus();
    devices = status.devices || [];
  }
  
  const timeRemaining = isScanning && scanStartTime ? Math.max(0, SCAN_DURATION_MS - (Date.now() - scanStartTime)) : 0;
  
  if (isRefreshButton) {
    logWithTimestamp('INFO', `📊 Status refresh - isScanning: ${isScanning}, devices: ${devices.length}, timeRemaining: ${timeRemaining}ms`);
  }
  
  res.json({
    isScanning,
    scanTimeRemaining: timeRemaining,
    devices,
    deviceCount: devices.length,
    timestamp: new Date().toISOString()
  });
});

// BLE Proxy diagnostics
app.get('/debug/ble-proxy', async (req: Request, res: Response) => {
  const isTestButton = req.query.source === 'test-button';
  if (isTestButton) {
    logWithTimestamp('INFO', '🎯 [UI ACTION] User clicked "Test BLE Proxy" button');
  }
  logWithTimestamp('INFO', '[DIAG] 🧪 BLE proxy diagnostics requested');
  logWithTimestamp('INFO', `[DIAG] 🔍 Connection check - espConnection: ${espConnection ? 'exists' : 'null'}`);
  if (!espConnection || !(espConnection as any).connections || (espConnection as any).connections.length === 0) {
    logWithTimestamp('WARN', '[DIAG] ❌ No ESPHome BLE proxy connected');
    logWithTimestamp('INFO', '[DIAG] 💡 Troubleshooting: Check ESPHome configuration and network connectivity');
    res.json({ status: 'disconnected', error: 'No ESPHome BLE proxy connected' });
    return;
  }
  const proxyCount = (espConnection as any).connections.length;
  logWithTimestamp('INFO', `[DIAG] ✅ BLE proxy test successful - ${proxyCount} proxy(ies) connected`);
  res.json({ status: 'connected', proxies: proxyCount });
});

// Health check
app.get('/health', (_req: Request, res: Response) => {
  logWithTimestamp('INFO', '[DIAG] /health endpoint called.');
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