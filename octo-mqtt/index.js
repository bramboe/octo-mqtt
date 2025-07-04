const express = require('express');
const fs = require('fs');
const os = require('os');
const mqtt = require('mqtt');

const app = express();
app.use(express.json());
app.use(express.static('webui', {
  setHeaders: (res, path, stat) => {
    log(`[STATIC] Served: ${path}`);
  }
}));

// Log every incoming request
app.use((req, res, next) => {
  log(`[HTTP] ${req.method} ${req.originalUrl}`);
  next();
});

// Logging
const log = (msg) => console.log(`[OCTO-MQTT] ${new Date().toISOString()} - ${msg}`);
const logError = (msg, error) => console.error(`[OCTO-MQTT-ERROR] ${new Date().toISOString()} - ${msg}`, error);

log('🚀 Starting Octo MQTT Addon...');

// Global variables
let mqttClient = null;
let isScanning = false;
let scanStartTime = null;
let scanTimeout = null;
const SCAN_DURATION_MS = 30000;
const discoveredDevices = new Map();
let bleProxyConnected = false;

// Get network interfaces for debugging
function getNetworkInfo() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  
  for (const name in interfaces) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push(`${name}: ${iface.address}`);
      }
    }
  }
  
  return addresses;
}

// Load configuration
function getRootOptions() {
  try {
    const configPath = '/data/options.json';
    if (fs.existsSync(configPath)) {
      const configData = fs.readFileSync(configPath, 'utf8');
      return JSON.parse(configData);
    }
  } catch (error) {
    logError('Error loading options:', error);
  }
  
  // Default configuration
  return {
    mqtt_host: '<auto_detect>',
    mqtt_port: '<auto_detect>',
    mqtt_user: '<auto_detect>',
    mqtt_password: '<auto_detect>',
    bleProxies: [
      {
        host: "192.168.1.100",
        port: 6053
      }
    ],
    octoDevices: [],
    webPort: 8099
  };
}

// MQTT Configuration with auto-detection
function getMQTTConfig() {
  const options = getRootOptions();
  
  // Check if we need to auto-detect MQTT settings
  const needsAutoDetect = 
    options.mqtt_host === '<auto_detect>' || 
    options.mqtt_port === '<auto_detect>' ||
    options.mqtt_user === '<auto_detect>' ||
    options.mqtt_password === '<auto_detect>';

  if (needsAutoDetect) {
    log('🔍 Auto-detection required, using Home Assistant default MQTT settings');
    
    // Use environment variables if available, otherwise use defaults
    const host = process.env.MQTT_HOST || 'core-mosquitto';
    const port = parseInt(process.env.MQTT_PORT || '1883', 10);
    const username = process.env.MQTT_USER || '';
    const password = process.env.MQTT_PASSWORD || '';
    
    log(`🔧 MQTT Config: ${host}:${port} (${username ? 'authenticated' : 'anonymous'})`);
    
    return {
      host,
      port,
      username,
      password
    };
  } else {
    log('⚙️ Using configured MQTT settings');
    return {
      host: options.mqtt_host || 'localhost',
      port: parseInt(options.mqtt_port || '1883', 10),
      username: options.mqtt_user || '',
      password: options.mqtt_password || ''
    };
  }
}

// Connect to MQTT using the simple approach from smartbed-mqtt
async function connectToMQTT() {
  try {
    const config = getMQTTConfig();
    const clientId = `octo_mqtt_${Math.random().toString(16).substring(2, 10)}`;
    
    log(`🔌 Connecting to MQTT: ${config.host}:${config.port}`);
    log(`🔑 Authentication: ${config.username ? 'Using credentials' : 'Anonymous'}`);
    log(`🆔 Client ID: ${clientId}`);

    const mqttConfig = {
      protocol: 'mqtt',
      host: config.host,
      port: config.port,
      clientId,
      clean: true,
      reconnectPeriod: 5000,
      connectTimeout: 10000,
      rejectUnauthorized: false
    };

    if (config.username) {
      mqttConfig.username = config.username;
      if (config.password) {
        mqttConfig.password = config.password;
      }
    }

    return new Promise((resolve, reject) => {
      const client = mqtt.connect(mqttConfig);
      
      const connectionTimeout = setTimeout(() => {
        logError('MQTT connection timeout after 30 seconds', null);
        client.end(true);
        reject(new Error('Connection timeout'));
      }, 30000);
      
      client.once('connect', () => {
        clearTimeout(connectionTimeout);
        log('✅ MQTT Connected successfully');
        resolve(client);
      });
      
      client.once('error', (error) => {
        clearTimeout(connectionTimeout);
        logError('MQTT Connect Error', error);
        
        // Provide helpful error message for common issues
        if (error.message && error.message.includes('Not authorized')) {
          logError('🔐 MQTT Authentication failed. Please check your MQTT credentials in the addon configuration.');
          logError('💡 You can set mqtt_user and mqtt_password in the addon options to fix this.');
        } else if (error.message && error.message.includes('ECONNREFUSED')) {
          logError('🔌 MQTT Connection refused. Please check if the MQTT broker is running.');
        }
        
        reject(error);
      });
    });
  } catch (error) {
    logError('Failed to connect to MQTT', error);
    throw error;
  }
}

// Initialize the application
async function initializeApp() {
  try {
    log('🔧 Initializing Octo MQTT addon...');
    
    // Load configuration
    const config = getRootOptions();
    log(`📋 Configuration loaded successfully`);
    log(`🔌 MQTT Host: ${config.mqtt_host}`);
    log(`🔌 MQTT Port: ${config.mqtt_port}`);
    log(`📡 BLE Proxy count: ${config.bleProxies ? config.bleProxies.length : 0}`);
    log(`🛏️ Octo device count: ${config.octoDevices ? config.octoDevices.length : 0}`);
    
    // Connect to MQTT
    log('🔌 Connecting to MQTT...');
    mqttClient = await connectToMQTT();
    
    // Set up MQTT event handlers
    mqttClient.on('error', (error) => {
      logError('MQTT Error', error);
    });
    
    mqttClient.on('close', () => {
      log('🔌 MQTT connection closed');
    });
    
    mqttClient.on('reconnect', () => {
      log('🔄 MQTT reconnecting...');
    });
    
    log('✅ Octo MQTT addon initialized successfully');
    
  } catch (error) {
    logError('Error during initialization', error);
    throw error;
  }
}

// Cleanup scan state
function cleanupScanState() {
  isScanning = false;
  scanStartTime = null;
  if (scanTimeout) {
    clearTimeout(scanTimeout);
    scanTimeout = null;
  }
  discoveredDevices.clear();
}

// Enhanced BLE scanning endpoint
app.post('/scan/start', async (req, res) => {
  log('📡 [API] Received scan start request');

  if (isScanning) {
    log('⚠️ Scan already in progress');
    return res.status(400).json({ error: 'Scan already in progress' });
  }

  try {
    const config = getRootOptions();
    const bleProxies = config.bleProxies || [];
    if (bleProxies.length === 0) {
      return res.status(500).json({ 
        error: 'No BLE proxies configured',
        details: 'You need to configure at least one ESPHome BLE proxy in the addon configuration to scan for devices.'
      });
    }
    // Check for placeholder IP addresses
    const hasPlaceholders = bleProxies.some((proxy) => 
      !proxy.host || 
      proxy.host === 'YOUR_ESP32_IP_ADDRESS' || 
      proxy.host.includes('PLACEHOLDER') ||
      proxy.host.includes('EXAMPLE')
    );
    if (hasPlaceholders) {
      return res.status(500).json({ 
        error: 'Invalid BLE proxy configuration',
        details: 'One or more BLE proxies have placeholder IP addresses. Please update your configuration with the actual IP addresses of your ESPHome devices.',
        currentConfiguration: bleProxies
      });
    }
    // Real BLE scan using ESPHome
    cleanupScanState();
    isScanning = true;
    scanStartTime = Date.now();
    discoveredDevices.clear();
    log('📡 Starting BLE scan via ESPHome proxy...');
    
    // Direct ESPHome implementation (no TypeScript dependencies)
    const { Connection } = require('@2colors/esphome-native-api');
    
    // Start the scan in the background
    setTimeout(async () => {
      try {
        // Connect to all configured BLE proxies
        const connections = await Promise.all(
          bleProxies.map(async (proxy) => {
            try {
              log(`📡 Connecting to ESPHome proxy at ${proxy.host}:${proxy.port}...`);
              const connection = new Connection({
                host: proxy.host,
                port: proxy.port,
                password: proxy.password || undefined
              });
              
              return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                  reject(new Error(`Connection timeout for ${proxy.host}:${proxy.port}`));
                }, 10000);
                
                connection.once('authorized', async () => {
                  clearTimeout(timeout);
                  log(`✅ Connected to ESPHome proxy at ${proxy.host}:${proxy.port}`);
                  resolve(connection);
                });
                
                connection.once('error', (error) => {
                  clearTimeout(timeout);
                  log(`❌ Failed to connect to ${proxy.host}:${proxy.port}: ${error.message}`);
                  reject(error);
                });
                
                connection.connect();
              });
            } catch (error) {
              log(`❌ Error connecting to ${proxy.host}:${proxy.port}: ${error.message}`);
              return null;
            }
          })
        );
        
        const validConnections = connections.filter(c => c !== null);
        
        if (validConnections.length === 0) {
          throw new Error('Could not connect to any BLE proxies');
        }
        
        log(`✅ Connected to ${validConnections.length} BLE proxy(ies)`);
        
        // Start BLE scan on the first available connection
        const primaryConnection = validConnections[0];
        const discoveredDevicesDuringScan = new Map();
        
        const advertisementListener = (data) => {
          if (data && data.name && data.address) {
            const device = {
              name: data.name,
              address: data.address,
              rssi: data.rssi || 0,
              service_uuids: data.serviceUuids || data.service_uuids || []
            };
            
            if (!discoveredDevicesDuringScan.has(device.address)) {
              log(`📱 Found BLE device: ${device.name} (${device.address})`);
              discoveredDevicesDuringScan.set(device.address, device);
              discoveredDevices.set(device.address, device);
            }
          }
        };
        
        primaryConnection.on('message.BluetoothLEAdvertisementResponse', advertisementListener);
        await primaryConnection.subscribeBluetoothAdvertisementService();
        
        log('📡 BLE scan started. Waiting for devices...');
        
        // Wait for scan duration
        await new Promise((resolve) => {
          setTimeout(() => {
            log('⏰ Scan timeout reached');
            resolve();
          }, SCAN_DURATION_MS);
        });
        
        // Cleanup
        primaryConnection.off('message.BluetoothLEAdvertisementResponse', advertisementListener);
        validConnections.forEach(conn => conn.disconnect());
        
        const scanResults = Array.from(discoveredDevicesDuringScan.values());
        log(`📡 BLE scan complete. Found ${scanResults.length} device(s).`);
        
        bleProxyConnected = validConnections.length > 0;
        
      } catch (err) {
        logError('Error during BLE scan', err);
      } finally {
        cleanupScanState();
        bleProxyConnected = false;
      }
    }, 100); // Small delay to ensure response is sent first

    // Return immediately with scan started response
    return res.json({ 
      scanDuration: SCAN_DURATION_MS
    });
    
  } catch (error) {
    logError('Error starting scan', error);
    cleanupScanState();
    bleProxyConnected = false;
    return res.status(500).json({ error: 'Failed to start scan', details: error instanceof Error ? error.message : String(error) });
  }
});

// Scan status endpoint
app.get('/scan/status', (req, res) => {
  log('📡 [API] /scan/status hit');
  const result = {
    isScanning,
    scanTimeRemaining: isScanning && scanStartTime ? Math.max(0, SCAN_DURATION_MS - (Date.now() - scanStartTime)) : 0,
    devices: Array.from(discoveredDevices.values()),
    mqttConnected: mqttClient ? mqttClient.connected : false,
    bleProxyConnected
  };
  log('📡 [API] /scan/status result:', result);
  return res.json(result);
});

// Health check
app.get('/health', (req, res) => {
  log('💚 [API] /health hit');
  const result = {
    mqttConnected: mqttClient ? mqttClient.connected : false,
    isScanning,
    bleProxyConnected
  };
  log('💚 [API] /health result:', result);
  return res.json(result);
});

// Debug endpoint
app.get('/debug/access', (req, res) => {
  log('🔍 [API] /debug/access hit');
  const networkInfo = getNetworkInfo();
  
  res.json({
    serverStatus: 'OCTO MQTT SERVER RUNNING',
    port: 8099,
    networkInterfaces: networkInfo,
    mqttConnected: mqttClient ? mqttClient.connected : false,
    accessMethods: {
      directAccess: networkInfo.map(info => {
        const ip = info.split(': ')[1];
        return `http://${ip}:8099`;
      }),
      homeAssistantIngress: 'Use the addon panel in Home Assistant sidebar'
    },
    testCommands: {
      curlTest: networkInfo.map(info => {
        const ip = info.split(': ')[1];
        return `curl -X POST http://${ip}:8099/scan/start`;
      })
    }
  });
});

// Root endpoint for server reachability
app.get('/', (req, res) => {
  log('[API] / root endpoint hit');
  res.json({ status: 'ok', message: 'Octo MQTT server is running', cwd: process.cwd() });
});

// Debug ping endpoint
app.get('/debug/ping', (req, res) => {
  log('[API] /debug/ping endpoint hit');
  res.json({ status: 'pong', time: new Date().toISOString() });
});

// Start server
const port = 8099;
log(`🚀 Starting Octo MQTT server on port ${port}...`);
log(`[DEBUG] Current working directory: ${process.cwd()}`);
try {
  const files = require('fs').readdirSync(process.cwd());
  log(`[DEBUG] Files in working directory: ${files.join(', ')}`);
} catch (e) {
  log(`[DEBUG] Could not list files in working directory: ${e.message}`);
}

const server = app.listen(port, '0.0.0.0', async () => {
  log(`✅ OCTO MQTT SERVER LISTENING ON PORT ${port}`);
  log(`🌐 Binding to: 0.0.0.0:${port} (all interfaces)`);
  
  const networkInfo = getNetworkInfo();
  log(`📡 Network interfaces detected:`);
  networkInfo.forEach(info => log(`   ${info}`));
  
  log(`📋 Access methods:`);
  log(`   1. Home Assistant Ingress: Use addon panel in sidebar`);
  networkInfo.forEach(info => {
    const ip = info.split(': ')[1];
    log(`   2. Direct access: http://${ip}:8099`);
  });
  
  log(`🧪 Test commands:`);
  networkInfo.forEach(info => {
    const ip = info.split(': ')[1];
    log(`   curl -X POST http://${ip}:8099/scan/start`);
  });
  
  log(`📡 Endpoints: POST /scan/start, GET /scan/status, GET /health, GET /debug/access`);
  
  // Initialize the application after server is running
  try {
    await initializeApp();
  } catch (error) {
    logError('Failed to initialize application', error);
    process.exit(1);
  }
});

server.on('error', (error) => {
  logError('Server error', error);
  if (error.code === 'EADDRINUSE') {
    log(`🔥 PORT ${port} IS IN USE - Another server is running!`);
  }
});

log('🎉 OCTO MQTT SERVER SETUP COMPLETE!'); 