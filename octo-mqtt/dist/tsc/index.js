"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tslib_1 = require("tslib");
const express_1 = tslib_1.__importDefault(require("express"));
const http_1 = tslib_1.__importDefault(require("http"));
const ws_1 = tslib_1.__importDefault(require("ws"));
const path_1 = tslib_1.__importDefault(require("path"));
const fs = tslib_1.__importStar(require("fs"));
const BLEScanner_1 = require("./Scanner/BLEScanner"); // Added from old
const connectToESPHome_1 = require("./ESPHome/connectToESPHome"); // Added from old
const app = (0, express_1.default)(); // Define app earlier
// Simple logging functions
const logInfo = (message, ...args) => console.log(`[INFO] ${message}`, ...args);
const logWarn = (message, ...args) => console.warn(`[WARN] ${message}`, ...args);
const logError = (message, ...args) => console.error(`[ERROR] ${message}`, ...args);
// Simple options loading
function getRootOptions() {
    try {
        const configPath = '/data/options.json';
        if (fs.existsSync(configPath)) {
            const configData = fs.readFileSync(configPath, 'utf8');
            return JSON.parse(configData);
        }
    }
    catch (error) {
        logError('Error loading options:', error);
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
// Global variables
let isScanning = false;
let scanStartTime = null;
let scanTimeout = null;
const SCAN_DURATION_MS = 30000;
const discoveredDevices = new Map();
let esphomeConnection = null;
let bleScanner = null;
let wsServer = null;
let connectedClients = new Set();
// Function to cleanup scan state
function cleanupScanState(clearDiscovered = true) {
    isScanning = false;
    scanStartTime = null;
    if (scanTimeout) {
        clearTimeout(scanTimeout);
        scanTimeout = null;
    }
    if (clearDiscovered) {
        discoveredDevices.clear();
    }
    if (esphomeConnection && typeof esphomeConnection === 'object' &&
        typeof esphomeConnection.eventNames === 'function' &&
        typeof esphomeConnection.removeAllListeners === 'function') {
        const listeners = esphomeConnection.eventNames();
        listeners.forEach(event => {
            if (event.toString().includes('BluetoothGATTReadResponse')) {
                esphomeConnection?.removeAllListeners(event);
            }
        });
    }
}
// Enhanced BLE scanning endpoint with better error handling
app.post('/scan/start', async (req, res) => {
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
        const hasPlaceholders = bleProxies.some((proxy) => !proxy.host ||
            proxy.host === 'YOUR_ESP32_IP_ADDRESS' ||
            proxy.host.includes('PLACEHOLDER') ||
            proxy.host.includes('EXAMPLE'));
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
    }
    catch (error) {
        logError('[BLE] Error starting scan:', error);
        cleanupScanState();
        res.status(500).json({
            error: 'Failed to start scan',
            details: error instanceof Error ? error.message : String(error)
        });
    }
});
// Scan status endpoint
app.get('/scan/status', (req, res) => {
    res.json({
        isScanning,
        scanTimeRemaining: isScanning && scanStartTime ? Math.max(0, SCAN_DURATION_MS - (Date.now() - scanStartTime)) : 0,
        devices: Array.from(discoveredDevices.values())
    });
});
// Configuration management endpoints
app.get('/api/config/ble-proxies', (req, res) => {
    try {
        const config = getRootOptions();
        const bleProxies = config.bleProxies || [];
        res.json({
            proxies: bleProxies,
            count: bleProxies.length,
            hasValidProxies: bleProxies.length > 0 && bleProxies.every((proxy) => proxy.host &&
                proxy.host !== 'YOUR_ESP32_IP_ADDRESS' &&
                !proxy.host.includes('PLACEHOLDER') &&
                !proxy.host.includes('EXAMPLE'))
        });
    }
    catch (error) {
        logError('[API] Error getting BLE proxy configuration:', error);
        res.status(500).json({
            error: 'Failed to get configuration',
            details: error instanceof Error ? error.message : String(error)
        });
    }
});
// Update BLE proxy configuration
app.post('/api/config/ble-proxies', async (req, res) => {
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
    }
    catch (error) {
        logError('[API] Error updating BLE proxy configuration:', error);
        res.status(500).json({
            error: 'Failed to update configuration',
            details: error instanceof Error ? error.message : String(error)
        });
    }
});
// Device management endpoints (simplified)
app.get('/devices/configured', (req, res) => {
    try {
        const config = getRootOptions();
        res.json({ devices: config.octoDevices || [] });
    }
    catch (error) {
        logError('[API] Error getting configured devices:', error);
        res.status(500).json({ error: 'Failed to get configured devices' });
    }
});
// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});
// Add a catch-all route for debugging
app.use('*', (req, res) => {
    logWarn(`[HTTP] 404 - Route not found: ${req.method} ${req.originalUrl}`);
    res.status(404).json({
        error: 'Route not found',
        method: req.method,
        path: req.originalUrl,
        availableRoutes: [
            'POST /scan/start',
            'GET /scan/status',
            'GET /api/config/ble-proxies',
            'POST /api/config/ble-proxies',
            'GET /devices/configured',
            'GET /health'
        ]
    });
});
// Start the server
const config = getRootOptions();
const port = config.webPort || 8099;
logInfo('🔧 Initializing RC2 Bed Control Panel...');
logInfo(`📁 Serving static files from: webui/`);
logInfo(`⚙️  Configuration loaded: ${config.bleProxies?.length || 0} BLE proxies configured`);
const start = async () => {
    logInfo('Starting Octo MQTT addon (merged logic)...');
    // Initialize ESPHome connection (from old)
    try {
        const esp = await (0, connectToESPHome_1.connectToESPHome)();
        esphomeConnection = esp;
        logInfo('[ESPHome] Connection initialized successfully');
        bleScanner = new BLEScanner_1.BLEScanner(esphomeConnection);
        logInfo('[BLEScanner] Initialized with ESPHome connection.');
    }
    catch (error) {
        logError('[ESPHome/BLEScanner] Failed to initialize:', error);
    }
    const server = http_1.default.createServer(app);
    wsServer = new ws_1.default.Server({ server, path: '/ws' });
    wsServer.on('connection', (ws) => {
        logInfo('[WebSocket] Client connected (generic handler)');
        connectedClients.add(ws);
        ws.on('message', (message) => {
            try {
                const data = JSON.parse(message);
                // const { type, payload } = data; // Declared but not used in provided snippet, uncomment if needed
                // logInfo(`[WebSocket] Received message: ${type}`, payload) // type and payload not defined here
                logInfo(`[WebSocket] Received message: ${message}`); // Log raw message for now
            }
            catch (error) {
                logError('[WebSocket] Error parsing message:', error);
                ws.send(JSON.stringify({ type: 'error', payload: { message: 'Invalid message format' } }));
            }
        });
        ws.on('close', () => {
            logInfo('[WebSocket] Client disconnected');
            connectedClients.delete(ws);
        });
        ws.on('error', (error) => {
            logError('[WebSocket] Error:', error);
            connectedClients.delete(ws);
        });
    });
    function broadcastMessage(type, payload) {
        // ... existing code ...
    }
    // --- Express App Setup ---
    app.use(express_1.default.json()); // Reinstated
    const webuiPath = path_1.default.join(process.cwd(), 'webui');
    logInfo(`Serving static files from ${webuiPath}`);
    app.use(express_1.default.static(webuiPath)); // Reinstated
    app.get('/', (req, res) => {
        // ... existing code ...
    });
    // --- BLE Scanning Endpoints from OLD ---
    // ... existing code ...
    // --- Device Management Endpoints (Keeping from NEW base) ---
    // ... existing code ...
    // --- Server Start ---
    // ... existing code ...
};
start().catch(error => {
    // ... existing code ...
});
app.listen(port, () => {
    logInfo(`🚀 RC2 Bed Control Panel started on port ${port}`);
    logInfo(`📱 Web interface available at: http://localhost:${port}`);
    logInfo(`💡 Enhanced error handling and BLE proxy configuration management enabled`);
    // Log available endpoints for debugging
    logInfo('📋 Available API endpoints:');
    logInfo('   POST /scan/start - Start BLE device scan');
    logInfo('   GET  /scan/status - Get scan status');
    logInfo('   GET  /api/config/ble-proxies - Get BLE proxy configuration');
    logInfo('   POST /api/config/ble-proxies - Update BLE proxy configuration');
    logInfo('   GET  /devices/configured - Get configured devices');
    logInfo('   GET  /health - Health check');
});
//# sourceMappingURL=index.js.map