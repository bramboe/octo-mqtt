// TEMPORARY DEBUG FILE - This file should not be needed
// If you see this file being used, it means Home Assistant is using an old cached version
// The real application should be built from TypeScript and run from dist/tsc/index.js

const express = require('express');
const path = require('path');

console.log('[FALLBACK-v2.0.6] 🚨 Using fallback index.js - TypeScript build not available');
console.log('[FALLBACK-v2.0.6] 🔧 This should only be used temporarily');
console.log('[FALLBACK-v2.0.6] 📅 Build: v2025.05.26.3');
console.log('[FALLBACK-v2.0.6] 🔄 Cache Bust: 20250526203230');

const app = express();
const port = process.env.PORT || 8099;

// Serve static files
const webuiPath = path.join(process.cwd(), 'webui');
console.log(`[FALLBACK-v2.0.6] Serving static files from ${webuiPath}`);
app.use(express.static(webuiPath));
app.use(express.json());

// Add request logging
app.use((req, res, next) => {
  console.log(`[FALLBACK-v2.0.6] ${req.method} ${req.url}`);
  next();
});

// Main route
app.get('/', (req, res) => {
  res.sendFile(path.join(webuiPath, 'index.html'));
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Fallback server running v2.0.6', version: '2.0.6' });
});

// Scan endpoints with proper JSON responses
app.post('/scan/start', (req, res) => {
  console.log('[FALLBACK-v2.0.6] 🔍 Scan start requested');
  res.json({ 
    success: true, 
    message: 'Scan started (fallback mode)', 
    scanning: true,
    version: '2.0.6',
    mode: 'fallback'
  });
});

app.get('/scan/status', (req, res) => {
  console.log('[FALLBACK-v2.0.6] 📊 Scan status requested');
  res.json({ 
    scanning: false, 
    devices: [], 
    message: 'No devices found (fallback mode)',
    version: '2.0.6',
    mode: 'fallback'
  });
});

app.post('/scan/stop', (req, res) => {
  console.log('[FALLBACK-v2.0.6] ⏹️ Scan stop requested');
  res.json({ 
    success: true, 
    message: 'Scan stopped (fallback mode)', 
    scanning: false,
    version: '2.0.6',
    mode: 'fallback'
  });
});

// Device endpoints
app.get('/devices/configured', (req, res) => {
  console.log('[FALLBACK-v2.0.6] 📱 Configured devices requested');
  res.json({ devices: [], message: 'No devices configured (fallback mode)', version: '2.0.6' });
});

app.post('/device/add', (req, res) => {
  console.log('[FALLBACK-v2.0.6] ➕ Add device requested');
  res.json({ 
    success: false, 
    message: 'Device addition not available in fallback mode',
    version: '2.0.6',
    mode: 'fallback'
  });
});

// Debug endpoint
app.get('/debug/access', (req, res) => {
  res.json({
    message: 'Fallback server v2.0.6 is running',
    timestamp: new Date().toISOString(),
    headers: req.headers,
    version: '2.0.6',
    mode: 'fallback'
  });
});

// Catch-all for debugging
app.use('*', (req, res) => {
  console.log(`[FALLBACK-v2.0.6] ❓ Unhandled request: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ 
    error: 'Not Found', 
    path: req.originalUrl,
    message: 'Endpoint not available in fallback mode',
    version: '2.0.6',
    mode: 'fallback'
  });
});

// Start server
app.listen(port, '0.0.0.0', () => {
  console.log(`[FALLBACK-v2.0.6] ✅ Fallback server listening on port ${port}`);
  console.log(`[FALLBACK-v2.0.6] 🌐 Access: http://0.0.0.0:${port}`);
  console.log(`[FALLBACK-v2.0.6] 📡 Endpoints: /scan/start, /scan/status, /scan/stop, /health`);
  console.log(`[FALLBACK-v2.0.6] ⚠️  This is a temporary fallback - TypeScript build should be used`);
}); 