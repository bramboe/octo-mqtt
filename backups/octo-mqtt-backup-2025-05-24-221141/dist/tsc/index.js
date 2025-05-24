"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tslib_1 = require("tslib");
const connectToMQTT_1 = require("./MQTT/connectToMQTT");
const getString_1 = require("./Utils/getString");
const logger_1 = require("./Utils/logger");
const options_1 = require("./Utils/options");
const connectToESPHome_1 = require("./ESPHome/connectToESPHome");
const octo_1 = require("./Octo/octo");
const express_1 = tslib_1.__importDefault(require("express"));
const http_1 = tslib_1.__importDefault(require("http"));
const ws_1 = tslib_1.__importDefault(require("ws"));
const path_1 = tslib_1.__importDefault(require("path"));
const fs_1 = tslib_1.__importDefault(require("fs"));
const node_fetch_1 = tslib_1.__importDefault(require("node-fetch"));
const events_1 = require("events");
const BLEScanner_1 = require("./Scanner/BLEScanner");
// Increase max listeners limit for BLE operations
events_1.EventEmitter.defaultMaxListeners = 50;
// Global variables to track scanning state
let isScanning = false;
let scanTimeout = null;
let scanStartTime = null;
const SCAN_DURATION_MS = 30000; // 30 seconds scan duration
const discoveredDevices = new Map();
let esphomeConnection = null;
let bleScanner = null;
let wsServer = null;
let connectedClients = new Set();
// Function to cleanup scan state and remove listeners
function cleanupScanState() {
    isScanning = false;
    scanStartTime = null;
    if (scanTimeout) {
        clearTimeout(scanTimeout);
        scanTimeout = null;
    }
    discoveredDevices.clear();
    // Clean up any remaining listeners
    if (esphomeConnection && typeof esphomeConnection === 'object') {
        // Only try to clean up listeners if the connection has the necessary methods
        if (typeof esphomeConnection.eventNames === 'function' &&
            typeof esphomeConnection.removeAllListeners === 'function') {
            const listeners = esphomeConnection.eventNames();
            listeners.forEach(event => {
                if (event.toString().includes('BluetoothGATTReadResponse')) {
                    esphomeConnection?.removeAllListeners(event);
                }
            });
        }
    }
}
// Function to get strongest signal device from multiple readings
function updateDeviceWithStrongestSignal(device) {
    if (!device.address) {
        (0, logger_1.logWarn)('[BLE] Device found without address, skipping');
        return;
    }
    const existingDevice = discoveredDevices.get(device.address);
    if (!existingDevice || (device.rssi && existingDevice.rssi && device.rssi > existingDevice.rssi)) {
        discoveredDevices.set(device.address, device);
    }
}
const processExit = (exitCode) => {
    if (exitCode && exitCode > 0) {
        (0, logger_1.logError)(`Exit code: ${exitCode}`);
    }
    process.exit();
};
process.on('exit', () => {
    (0, logger_1.logWarn)('Shutting down Octo-MQTT...');
    cleanupScanState();
    processExit(0);
});
process.on('SIGINT', () => processExit(0));
process.on('SIGTERM', () => processExit(0));
process.on('uncaughtException', (err) => {
    (0, logger_1.logError)(err);
    cleanupScanState();
    processExit(2);
});
const start = async () => {
    await (0, getString_1.loadStrings)();
    const mqtt = await (0, connectToMQTT_1.connectToMQTT)();
    const esp = await (0, connectToESPHome_1.connectToESPHome)();
    esphomeConnection = esp;
    try {
        await (0, octo_1.octo)(mqtt, esphomeConnection);
    }
    catch (error) {
        (0, logger_1.logError)('Failed to initialize Octo MQTT:', error);
        processExit(1);
    }
    // Setup Express server for Ingress
    const app = (0, express_1.default)();
    const port = process.env.PORT || 8099;
    const server = http_1.default.createServer(app);
    // Set up WebSocket server for real-time communication
    wsServer = new ws_1.default.Server({
        server,
        path: '/ws'
    });
    wsServer.on('connection', (ws) => {
        connectedClients.add(ws);
        (0, logger_1.logInfo)('[WebSocket] Client connected');
        // Send initial device info if available
        broadcastDeviceInfo();
        ws.on('message', (message) => {
            try {
                const data = JSON.parse(message);
                handleWebSocketMessage(ws, data);
            }
            catch (error) {
                (0, logger_1.logError)('[WebSocket] Error parsing message:', error);
                ws.send(JSON.stringify({
                    type: 'error',
                    payload: { message: 'Invalid message format' }
                }));
            }
        });
        ws.on('close', () => {
            connectedClients.delete(ws);
            (0, logger_1.logInfo)('[WebSocket] Client disconnected');
        });
        ws.on('error', (error) => {
            (0, logger_1.logError)('[WebSocket] Error:', error);
            connectedClients.delete(ws);
        });
    });
    // Helper function to broadcast messages to all connected clients
    function broadcastMessage(type, payload) {
        const message = JSON.stringify({ type, payload });
        connectedClients.forEach(client => {
            if (client.readyState === ws_1.default.OPEN) {
                client.send(message);
            }
        });
    }
    // Helper function to broadcast device information
    function broadcastDeviceInfo() {
        const config = (0, options_1.getRootOptions)();
        const configuredDevices = config.octoDevices || [];
        if (configuredDevices.length > 0) {
            // Use the first configured device for now
            const device = configuredDevices[0];
            broadcastMessage('deviceInfo', {
                name: device.friendlyName || device.name || 'RC2',
                address: device.name || '00:00:00:00:00:00',
                firmwareVersion: 'Unknown',
                proxy: 'ESPHome Proxy'
            });
        }
    }
    // Handle incoming WebSocket messages
    function handleWebSocketMessage(ws, data) {
        const { type, payload } = data;
        switch (type) {
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
                (0, logger_1.logWarn)(`[WebSocket] Unknown message type: ${type}`);
                ws.send(JSON.stringify({
                    type: 'error',
                    payload: { message: `Unknown message type: ${type}` }
                }));
        }
    }
    // Serve static files
    const webuiPath = path_1.default.join(process.cwd(), 'webui');
    (0, logger_1.logInfo)(`Serving static files from ${webuiPath}`);
    app.use(express_1.default.static(webuiPath));
    app.use(express_1.default.json());
    // Main routes
    app.get('/', (req, res) => {
        res.sendFile(path_1.default.join(webuiPath, 'index.html'));
    });
    // Initialize BLE scanner
    bleScanner = new BLEScanner_1.BLEScanner(esphomeConnection); // TODO: Fix type casting
    // BLE scanning endpoints with simplified routes
    app.post('/scan/start', async (req, res) => {
        (0, logger_1.logInfo)('[BLE] Received scan start request');
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
        }
        catch (error) {
            (0, logger_1.logError)('[BLE] Error starting scan:', error);
            res.status(500).json({
                error: 'Failed to start scan',
                details: error instanceof Error ? error.message : String(error)
            });
        }
    });
    app.get('/scan/status', (req, res) => {
        (0, logger_1.logInfo)('[BLE] Received scan status request');
        if (!bleScanner) {
            res.status(500).json({ error: 'BLE scanner not initialized' });
            return;
        }
        try {
            const status = bleScanner.getScanStatus();
            (0, logger_1.logInfo)(`[BLE] Scan status: isScanning=${status.isScanning}, deviceCount=${status.discoveredDevices}, timeRemaining=${status.scanTimeRemaining}`);
            // Log each discovered device for debugging
            if (status.devices && status.devices.length > 0) {
                (0, logger_1.logInfo)('[BLE] Discovered devices:');
                status.devices.forEach((device, index) => {
                    (0, logger_1.logInfo)(`[BLE]   Device ${index + 1}: ${device.name || 'Unknown'} (${device.address}) RSSI: ${device.rssi}`);
                });
            }
            else {
                (0, logger_1.logInfo)('[BLE] No devices in status response');
            }
            res.json(status);
        }
        catch (error) {
            (0, logger_1.logError)('[BLE] Error getting scan status:', error);
            res.status(500).json({ error: 'Failed to get scan status' });
        }
    });
    app.post('/scan/stop', async (req, res) => {
        (0, logger_1.logInfo)('[BLE] Received scan stop request');
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
        }
        catch (error) {
            (0, logger_1.logError)('[BLE] Error stopping scan:', error);
            res.status(500).json({
                error: 'Failed to stop scan',
                details: error instanceof Error ? error.message : String(error)
            });
        }
    });
    app.post('/device/add', async (req, res) => {
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
            (0, logger_1.logInfo)(`[BLE] Starting device addition process for ${address}`);
            const device = bleScanner.getDevice(address);
            if (!device) {
                (0, logger_1.logError)(`[BLE] Device ${address} not found in scanner results`);
                res.status(404).json({ error: 'Device not found' });
                return;
            }
            (0, logger_1.logInfo)(`[BLE] Found device: ${device.name} (${device.address})`);
            // Get current configuration with fresh read
            (0, logger_1.logInfo)(`[BLE] Reading current configuration...`);
            const config = (0, options_1.getRootOptions)();
            (0, logger_1.logInfo)(`[BLE] Current config loaded. Existing devices: ${config.octoDevices?.length || 0}`);
            // Use MAC address as unique identifier and create friendly name with MAC suffix
            const macSuffix = device.address.slice(-8).replace(/:/g, '').toUpperCase(); // Last 4 chars of MAC
            const deviceDisplayName = device.name || 'RC2';
            // Create a unique friendly name based on existing devices
            const existingDevices = config.octoDevices || [];
            const existingRC2Count = existingDevices.filter((d) => d.friendlyName && d.friendlyName.startsWith('RC2 Bed')).length;
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
            const existingDevice = existingDevices.find((d) => {
                const deviceNameLower = d.name?.toLowerCase();
                const addressLower = device.address.toLowerCase();
                return deviceNameLower === addressLower ||
                    (deviceNameLower && addressLower && deviceNameLower === addressLower);
            });
            if (existingDevice) {
                (0, logger_1.logWarn)(`[BLE] Device ${address} already exists in configuration`);
                res.status(409).json({ error: 'Device already exists in configuration' });
                return;
            }
            // Add the device to config
            config.octoDevices.push(newDevice);
            (0, logger_1.logInfo)(`[BLE] Device added to config array. Total devices: ${config.octoDevices.length}`);
            // Use Home Assistant Supervisor API to persist configuration
            try {
                (0, logger_1.logInfo)(`[BLE] Updating Home Assistant addon configuration via Supervisor API...`);
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
                const response = await (0, node_fetch_1.default)(`http://supervisor/addons/self/options`, {
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
                (0, logger_1.logInfo)(`[BLE] Configuration updated successfully via Supervisor API`);
                // Also write to local file for immediate availability
                const configJson = JSON.stringify(config, null, 2);
                const tempFile = '/data/options.json.tmp';
                await fs_1.default.promises.writeFile(tempFile, configJson);
                await fs_1.default.promises.rename(tempFile, '/data/options.json');
                (0, logger_1.logInfo)(`[BLE] Local configuration file also updated for immediate use`);
            }
            catch (apiError) {
                (0, logger_1.logError)(`[BLE] Failed to update via Supervisor API:`, apiError);
                // Fallback to local file write only
                (0, logger_1.logInfo)(`[BLE] Falling back to local file write...`);
                const configJson = JSON.stringify(config, null, 2);
                const tempFile = '/data/options.json.tmp';
                await fs_1.default.promises.writeFile(tempFile, configJson);
                await fs_1.default.promises.rename(tempFile, '/data/options.json');
                (0, logger_1.logWarn)(`[BLE] Configuration saved locally only - may not persist across addon restarts`);
            }
            // Verify the configuration was saved
            const verifyConfig = (0, options_1.getRootOptions)();
            const verifyDevice = verifyConfig.octoDevices?.find((d) => d.name.toLowerCase() === newDevice.name.toLowerCase());
            if (verifyDevice) {
                (0, logger_1.logInfo)(`[BLE] Device addition verified successfully`);
                (0, logger_1.logInfo)(`[BLE] Final device count: ${verifyConfig.octoDevices?.length || 0}`);
            }
            else {
                (0, logger_1.logError)(`[BLE] Device addition verification failed! Device not found after write.`);
                res.status(500).json({ error: 'Configuration verification failed' });
                return;
            }
            (0, logger_1.logInfo)(`[BLE] Added new device: ${newDevice.friendlyName}`);
            (0, logger_1.logInfo)(`[BLE] Device details: name="${newDevice.name}", friendlyName="${newDevice.friendlyName}", pin="${newDevice.pin}"`);
            (0, logger_1.logInfo)(`[BLE] Total devices in config: ${config.octoDevices.length}`);
            // Broadcast device info update via WebSocket
            if (wsServer && connectedClients.size > 0) {
                broadcastDeviceInfo();
                (0, logger_1.logInfo)(`[BLE] Broadcasted device info update to ${connectedClients.size} WebSocket client(s)`);
            }
            res.json({
                message: 'Device added successfully',
                device: newDevice,
                note: 'Configuration updated via Home Assistant Supervisor API'
            });
        }
        catch (error) {
            (0, logger_1.logError)('[BLE] Error adding device:', error);
            res.status(500).json({
                error: 'Failed to add device',
                details: error instanceof Error ? error.message : String(error)
            });
        }
    });
    // Get configured devices endpoint
    app.get('/devices/configured', (req, res) => {
        try {
            const config = (0, options_1.getRootOptions)();
            const configuredDevices = config.octoDevices || [];
            (0, logger_1.logInfo)(`[BLE] Retrieved ${configuredDevices.length} configured device(s)`);
            res.json({
                devices: configuredDevices,
                count: configuredDevices.length
            });
        }
        catch (error) {
            (0, logger_1.logError)('[BLE] Error getting configured devices:', error);
            res.status(500).json({
                error: 'Failed to get configured devices',
                details: error instanceof Error ? error.message : String(error)
            });
        }
    });
    // Debug endpoint to show raw configuration
    app.get('/debug/config', (req, res) => {
        try {
            const rawConfigContent = fs_1.default.readFileSync('/data/options.json', 'utf8');
            const config = (0, options_1.getRootOptions)();
            res.json({
                rawFileContent: rawConfigContent,
                parsedConfig: config,
                octoDevicesCount: (config.octoDevices || []).length
            });
        }
        catch (error) {
            (0, logger_1.logError)('[DEBUG] Error reading config:', error);
            res.status(500).json({
                error: 'Failed to read configuration',
                details: error instanceof Error ? error.message : String(error)
            });
        }
    });
    // Diagnostic endpoint to show device configuration state
    app.get('/debug/devices', (req, res) => {
        try {
            const config = (0, options_1.getRootOptions)();
            const configuredDevices = config.octoDevices || [];
            let scanStatus = null;
            let discoveredDevices = [];
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
                mapping: discoveredDevices.map((device) => ({
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
        }
        catch (error) {
            (0, logger_1.logError)('[DEBUG] Error reading device state:', error);
            res.status(500).json({
                error: 'Failed to read device state',
                details: error instanceof Error ? error.message : String(error)
            });
        }
    });
    // Remove device endpoint
    app.delete('/device/remove/:address', async (req, res) => {
        const { address } = req.params;
        if (!address) {
            res.status(400).json({ error: 'Missing device address' });
            return;
        }
        try {
            // Get current configuration
            const config = (0, options_1.getRootOptions)();
            if (!config.octoDevices || !Array.isArray(config.octoDevices)) {
                res.status(404).json({ error: 'No devices configured' });
                return;
            }
            // Find the device to remove
            const deviceIndex = config.octoDevices.findIndex((d) => d.name.toLowerCase() === address.toLowerCase());
            if (deviceIndex === -1) {
                res.status(404).json({ error: 'Device not found in configuration' });
                return;
            }
            const deviceToRemove = config.octoDevices[deviceIndex];
            // Remove the device from configuration
            config.octoDevices.splice(deviceIndex, 1);
            // Save updated configuration
            await fs_1.default.promises.writeFile('/data/options.json', JSON.stringify(config, null, 2));
            (0, logger_1.logInfo)(`[BLE] Removed device: ${deviceToRemove.friendlyName || deviceToRemove.name}`);
            (0, logger_1.logInfo)(`[BLE] Configuration updated. Device removed from addon configuration.`);
            (0, logger_1.logInfo)(`[BLE] NOTE: Configuration caching has been fixed - changes should be immediate.`);
            res.json({
                message: 'Device removed successfully and configuration updated',
                removedDevice: deviceToRemove
            });
        }
        catch (error) {
            (0, logger_1.logError)('[BLE] Error removing device:', error);
            res.status(500).json({
                error: 'Failed to remove device',
                details: error instanceof Error ? error.message : String(error)
            });
        }
    });
    app.get('/api/devices', (req, res) => {
        // This endpoint would return the list of discovered devices
        // You'll need to implement device storage if you want to persist the list
        res.json({ devices: Array.from(discoveredDevices.values()) });
    });
    server.listen(port, () => {
        (0, logger_1.logInfo)(`Octo-MQTT server listening on port ${port}`);
    });
};
void start();
//# sourceMappingURL=index.js.map