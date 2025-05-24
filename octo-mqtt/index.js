const express = require('express');
const fs = require('fs');
const os = require('os');

const app = express();
app.use(express.json());
app.use(express.static('webui'));

// Ultra-simple logging
const log = (msg) => console.log(`[ULTRA-SIMPLE] ${new Date().toISOString()} - ${msg}`);

log('🔥 ULTRA-SIMPLE SERVER STARTING 🔥');
log('✨ Back to basics - minimal working version');

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

// Basic scan endpoint - just return success immediately
app.post('/scan/start', (req, res) => {
  log('🎯 SCAN ENDPOINT HIT! This proves the server is reachable!');
  
  res.json({ 
    message: '✅ Scan endpoint reached successfully!',
    timestamp: new Date().toISOString(),
    note: 'This proves the server is working and reachable',
    accessMethod: req.headers['x-ingress-path'] ? 'Home Assistant Ingress' : 'Direct Access'
  });
});

// Basic status endpoint
app.get('/scan/status', (req, res) => {
  log('📊 STATUS ENDPOINT HIT!');
  res.json({
    isScanning: false,
    message: 'Status endpoint working',
    timestamp: new Date().toISOString()
  });
});

// Health check
app.get('/health', (req, res) => {
  log('💚 HEALTH CHECK HIT!');
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Debug endpoint to show access methods
app.get('/debug/access', (req, res) => {
  log('🔍 DEBUG ACCESS INFO REQUESTED');
  const networkInfo = getNetworkInfo();
  
  res.json({
    serverStatus: 'ULTRA-SIMPLE SERVER RUNNING',
    port: 8099,
    networkInterfaces: networkInfo,
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

// Debug what requests we're getting
app.use((req, res, next) => {
  log(`📨 Request: ${req.method} ${req.url}`);
  log(`📍 Headers: ${JSON.stringify(req.headers, null, 2)}`);
  next();
});

// Catch-all for debugging
app.use('*', (req, res) => {
  log(`❌ 404 - Unknown route: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ 
    error: 'Route not found',
    method: req.method,
    path: req.originalUrl,
    availableRoutes: ['POST /scan/start', 'GET /scan/status', 'GET /health', 'GET /debug/access']
  });
});

// Start server
const port = 8099;
log(`🚀 Starting ultra-simple server on port ${port}...`);

const server = app.listen(port, '0.0.0.0', () => {
  log(`✅ ULTRA-SIMPLE SERVER LISTENING ON PORT ${port}`);
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
});

server.on('error', (error) => {
  log(`❌ SERVER ERROR: ${error.message}`);
  if (error.code === 'EADDRINUSE') {
    log(`🔥 PORT ${port} IS IN USE - Another server is running!`);
  }
});

log('🎉 ULTRA-SIMPLE SERVER SETUP COMPLETE!'); 