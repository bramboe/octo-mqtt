// TEMPORARY DEBUG FILE - This file should not be needed
// If you see this file being used, it means Home Assistant is using an old cached version
// The real application should be built from TypeScript and run from dist/tsc/index.js

const express = require('express');
const path = require('path');

console.log('[FALLBACK] 🚨 Using fallback index.js - TypeScript build not available');
console.log('[FALLBACK] 🔧 This should only be used temporarily');

const app = express();
const port = process.env.PORT || 8099;

// Serve static files
const webuiPath = path.join(process.cwd(), 'webui');
console.log(`[FALLBACK] Serving static files from ${webuiPath}`);
app.use(express.static(webuiPath));
app.use(express.json());

// Add request logging
app.use((req, res, next) => {
  console.log(`[FALLBACK] ${req.method} ${req.url}`);
  next();
});

// Main route
app.get('/', (req, res) => {
  res.sendFile(path.join(webuiPath, 'index.html'));
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Fallback server running', timestamp: new Date().toISOString() });
});

// Scan endpoints - basic implementation
app.post('/scan/start', (req, res) => {
  console.log('[FALLBACK] Scan start requested');
  res.json({ 
    success: true, 
    message: 'Scan started (fallback mode)', 
    scanning: true,
    timestamp: new Date().toISOString()
  });
});

app.get('/scan/status', (req, res) => {
  console.log('[FALLBACK] Scan status requested');
  res.json({ 
    scanning: false, 
    devices: [], 
    message: 'No devices found (fallback mode)',
    timestamp: new Date().toISOString()
  });
});

app.post('/scan/stop', (req, res) => {
  console.log('[FALLBACK] Scan stop requested');
  res.json({ 
    success: true, 
    message: 'Scan stopped (fallback mode)', 
    scanning: false,
    timestamp: new Date().toISOString()
  });
});

// Device endpoints
app.get('/devices/configured', (req, res) => {
  console.log('[FALLBACK] Configured devices requested');
  res.json({ devices: [] });
});

app.post('/device/add', (req, res) => {
  console.log('[FALLBACK] Device add requested:', req.body);
  res.json({ success: false, message: 'Device addition not available in fallback mode' });
});

// Catch-all for debugging
app.use('*', (req, res) => {
  console.log(`[FALLBACK] Unhandled request: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ 
    error: 'Not Found', 
    message: `Endpoint ${req.method} ${req.originalUrl} not available in fallback mode`,
    availableEndpoints: [
      'GET /',
      'GET /health', 
      'POST /scan/start',
      'GET /scan/status',
      'POST /scan/stop',
      'GET /devices/configured',
      'POST /device/add'
    ]
  });
});

// Start server
app.listen(port, '0.0.0.0', () => {
  console.log(`[FALLBACK] ✅ Fallback server listening on port ${port}`);
  console.log(`[FALLBACK] 🌐 Access at: http://0.0.0.0:${port}`);
  console.log(`[FALLBACK] 📡 Available endpoints:`);
  console.log(`[FALLBACK]   - GET /health`);
  console.log(`[FALLBACK]   - POST /scan/start`);
  console.log(`[FALLBACK]   - GET /scan/status`);
  console.log(`[FALLBACK]   - POST /scan/stop`);
  console.log(`[FALLBACK] ⚠️  This is a fallback server - TypeScript version should be used in production`);
}); 