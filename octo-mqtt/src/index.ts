/// <reference types="node" />
import express, { Request, Response } from 'express';
import * as fs from 'fs';
import net from 'net';

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
    const configPath = '/data/options.json';
    if (fs.existsSync(configPath)) {
      const configData = fs.readFileSync(configPath, 'utf8');
      return JSON.parse(configData);
    }
  } catch (error) {
    logWithTimestamp('ERROR', 'Error loading options:', error);
  }
  
  // Default configuration
  return {
    mqtt: {
      host: "192.168.1.2",
      port: 1883,
      username: "mqtt",
      password: "mqtt"
    },
    bleProxies: [
      {
        host: "YOUR_ESP32_IP_ADDRESS", 
        port: 6052,
        name: "BLE Proxy",
        enabled: false
      }
    ],
    octoDevices: [],
    webPort: 8099
  };
}

// Global state
let isScanning = false;
let scanStartTime: number | null = null;
let scanTimeout: NodeJS.Timeout | null = null;
const SCAN_DURATION_MS = 30000;
const discoveredDevices = new Map<string, any>();

// Simulated BLE device discovery (replace with real ESPHome integration)
function simulateBLEDiscovery() {
  const mockDevices = [
    {
      name: "RC2 Bed",
      address: "c3:e7:63:12:34:56",
      rssi: -45,
      service_uuids: ["1800", "1801"],
      isConfigured: false
    },
    {
      name: "SmartBed-001",
      address: "f6:21:dd:78:9a:bc",
      rssi: -52,
      service_uuids: ["1800", "1801"],
      isConfigured: false
    },
    {
      name: "Unknown Device",
      address: "aa:bb:cc:dd:ee:ff",
      rssi: -65,
      service_uuids: ["1800"],
      isConfigured: false
    }
  ];

  mockDevices.forEach((device, index) => {
    setTimeout(() => {
      logWithTimestamp('INFO', `📱 Device discovered: ${device.name} (${device.address}) RSSI: ${device.rssi}`);
      discoveredDevices.set(device.address, device);
    }, index * 2000); // Stagger device discovery
  });
}

// Start BLE scan
app.post('/scan/start', async (_req: Request, res: Response): Promise<void> => {
  logWithTimestamp('INFO', '📡 Received scan start request');
  
  if (isScanning) {
    logWithTimestamp('WARN', '⚠️  BLE scan already in progress');
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
        details: 'You need to configure at least one ESPHome BLE proxy in the addon configuration.',
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
        details: 'One or more BLE proxies have placeholder IP addresses.',
        troubleshooting: [
          'Find your ESPHome device IP address in your router admin panel',
          'Update the addon configuration with the correct IP address',
          'Restart the addon after making changes'
        ],
        currentConfiguration: bleProxies
      });
      return;
    }

    // Start scan
    isScanning = true;
    scanStartTime = Date.now();
    discoveredDevices.clear();
    
    logWithTimestamp('INFO', '🚀 Starting BLE device scan...');
    
    // Simulate device discovery (replace with real ESPHome scan)
    simulateBLEDiscovery();
    
    // Set up scan timeout
    scanTimeout = setTimeout(() => {
      logWithTimestamp('INFO', '⏰ Scan timeout reached');
      isScanning = false;
      scanStartTime = null;
    }, SCAN_DURATION_MS);

    res.json({ 
      message: 'BLE scan started successfully',
      scanDuration: SCAN_DURATION_MS,
      proxiesConfigured: bleProxies.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logWithTimestamp('ERROR', '❌ Failed to start scan:', error);
    isScanning = false;
    res.status(500).json({ 
      error: 'Failed to start scan',
      details: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString()
    });
  }
});

// Stop BLE scan
app.post('/scan/stop', async (_req: Request, res: Response): Promise<void> => {
  logWithTimestamp('INFO', '⏹️  Received scan stop request');
  
  try {
    if (scanTimeout) {
      clearTimeout(scanTimeout);
      scanTimeout = null;
    }
    
    isScanning = false;
    scanStartTime = null;
    
    logWithTimestamp('INFO', '✅ BLE scan stopped');
    
    res.json({ 
      message: 'BLE scan stopped successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logWithTimestamp('ERROR', '❌ Failed to stop scan:', error);
    res.status(500).json({ 
      error: 'Failed to stop scan',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// Get scan status
app.get('/scan/status', (_req: Request, res: Response) => {
  const timeRemaining = isScanning && scanStartTime 
    ? Math.max(0, SCAN_DURATION_MS - (Date.now() - scanStartTime))
    : 0;

  const status = {
    isScanning,
    scanTimeRemaining: timeRemaining,
    discoveredDevices: Array.from(discoveredDevices.values()),
    deviceCount: discoveredDevices.size,
    timestamp: new Date().toISOString()
  };

  logWithTimestamp('DEBUG', '📊 Scan status requested:', status);
  res.json(status);
});

// BLE Proxy diagnostics
app.get('/debug/ble-proxy', async (_req: Request, res: Response) => {
  logWithTimestamp('INFO', '🧪 BLE proxy diagnostics requested');
  
  const config = getRootOptions();
  const bleProxies = config.bleProxies || [];
  
  if (!Array.isArray(bleProxies) || bleProxies.length === 0) {
    return res.json({ 
      results: [], 
      error: 'No BLE proxies configured',
      timestamp: new Date().toISOString()
    });
  }

  const results = await Promise.all(bleProxies.map(async (proxy: any) => {
    if (!proxy.host || !proxy.port) {
      return { 
        host: proxy.host, 
        port: proxy.port, 
        status: 'invalid', 
        error: 'Missing host or port' 
      };
    }

    return new Promise((resolve) => {
      const socket = new net.Socket();
      let resolved = false;
      
      socket.setTimeout(5000); // 5 second timeout
      
      socket.on('connect', () => {
        resolved = true;
        socket.destroy();
        logWithTimestamp('INFO', `✅ BLE proxy connected: ${proxy.host}:${proxy.port}`);
        resolve({ 
          host: proxy.host, 
          port: proxy.port, 
          status: 'connected',
          timestamp: new Date().toISOString()
        });
      });
      
      socket.on('timeout', () => {
        if (!resolved) {
          resolved = true;
          socket.destroy();
          logWithTimestamp('WARN', `⏰ BLE proxy timeout: ${proxy.host}:${proxy.port}`);
          resolve({ 
            host: proxy.host, 
            port: proxy.port, 
            status: 'timeout', 
            error: 'Connection timed out' 
          });
        }
      });
      
      socket.on('error', (err) => {
        if (!resolved) {
          resolved = true;
          socket.destroy();
          logWithTimestamp('ERROR', `❌ BLE proxy error: ${proxy.host}:${proxy.port} - ${err.message}`);
          resolve({ 
            host: proxy.host, 
            port: proxy.port, 
            status: 'error', 
            error: err.message 
          });
        }
      });
      
      logWithTimestamp('INFO', `🔍 Testing BLE proxy: ${proxy.host}:${proxy.port}`);
      socket.connect(proxy.port, proxy.host);
    });
  }));

  const response = { 
    results,
    timestamp: new Date().toISOString()
  };
  
  logWithTimestamp('INFO', '🧪 BLE proxy diagnostics completed:', response);
  res.json(response);
  return;
});

// Add device to MQTT configuration
app.post('/devices/add', async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, address, friendlyName } = req.body;
    
    if (!name || !address) {
      res.status(400).json({ error: 'Device name and address are required' });
      return;
    }

    const config = getRootOptions();
    const devices = config.octoDevices || [];
    
    // Check if device already exists
    const existingDevice = devices.find((device: any) => 
      device.name === name || device.address === address
    );
    
    if (existingDevice) {
      res.status(400).json({ error: 'Device already configured' });
      return;
    }

    // Add new device
    const newDevice = {
      name,
      address,
      friendlyName: friendlyName || name,
      addedAt: new Date().toISOString()
    };
    
    devices.push(newDevice);
    config.octoDevices = devices;

    // Save configuration
    const configJson = JSON.stringify(config, null, 2);
    await fs.promises.writeFile('/data/options.json', configJson);
    
    logWithTimestamp('INFO', `✅ Device added to MQTT: ${friendlyName} (${address})`);
    
    res.json({ 
      message: 'Device added successfully',
      device: newDevice,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logWithTimestamp('ERROR', '❌ Error adding device:', error);
    res.status(500).json({ 
      error: 'Failed to add device',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// Get configured devices
app.get('/devices/configured', (_req: Request, res: Response) => {
  try {
    const config = getRootOptions();
    const devices = config.octoDevices || [];
    
    logWithTimestamp('INFO', `📋 Returning ${devices.length} configured devices`);
    res.json({ 
      devices,
      count: devices.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logWithTimestamp('ERROR', '❌ Error getting configured devices:', error);
    res.status(500).json({ error: 'Failed to get configured devices' });
  }
});

// Health check
app.get('/health', (_req: Request, res: Response) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    isScanning,
    deviceCount: discoveredDevices.size
  };
  
  res.json(health);
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
      'POST /devices/add',
      'GET /devices/configured',
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
logWithTimestamp('INFO', `⚙️  Configuration loaded: ${config.bleProxies?.length || 0} BLE proxies configured`);

app.listen(port, () => {
  logWithTimestamp('INFO', `🚀 Server started on port ${port}`);
  logWithTimestamp('INFO', `📱 Web interface: http://localhost:${port}`);
  logWithTimestamp('INFO', '💡 BLE scanning and device management ready');
  
  // Log available endpoints for debugging
  logWithTimestamp('INFO', '📋 Available API endpoints:');
  logWithTimestamp('INFO', '   POST /scan/start - Start BLE device scan');
  logWithTimestamp('INFO', '   POST /scan/stop - Stop BLE device scan');
  logWithTimestamp('INFO', '   GET  /scan/status - Get scan status');
  logWithTimestamp('INFO', '   GET  /debug/ble-proxy - Get BLE proxy diagnostics');
  logWithTimestamp('INFO', '   POST /devices/add - Add device to MQTT');
  logWithTimestamp('INFO', '   GET  /devices/configured - Get configured devices');
  logWithTimestamp('INFO', '   GET  /health - Health check');
}); 