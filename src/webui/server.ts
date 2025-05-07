import * as http from 'http';
import * as path from 'path';
import * as fs from 'fs';
import * as ws from 'ws';
import * as url from 'url';
import { IMQTTConnection } from '@mqtt/IMQTTConnection';
import { IESPConnection } from 'ESPHome/IESPConnection';
import { logInfo, logError, logWarn } from '@utils/logger';
import { getProxies } from 'ESPHome/options';
import * as crypto from 'crypto';

// Simple mime type mapper
const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

// WebSocket clients
const clients = new Set<any>();

// Current state
let state = {
  connected: false,
  positions: {
    head: 0,
    feet: 0,
  },
  lightState: false,
  calibration: {
    head: 30.0,
    feet: 30.0,
  },
};

// Device info
let deviceInfo = {
  name: 'RC2',
  address: 'Unknown',
  firmwareVersion: 'Unknown',
  proxy: 'ESPHome Proxy',
};

// Add-on info
let addonInfo = {
  version: '1.0.0',
  status: 'Running',
};

// Device and link storage
interface Device {
  id: string;
  friendlyName: string;
  pin?: string;
  connectionType: 'proxy' | 'direct';
  proxyId?: string;
  address?: string;
}

interface DeviceLink {
  id: string;
  name: string;
  deviceIds: string[];
}

// Stored devices and links
let devices: Device[] = [];
let deviceLinks: DeviceLink[] = [];
let activeDevice = 'all';

// Storage paths
const DATA_DIR = process.env.DATA_DIR || './data';
const DEVICES_FILE = path.join(DATA_DIR, 'devices.json');
const LINKS_FILE = path.join(DATA_DIR, 'device_links.json');

// Load devices and links from storage
function loadDevices() {
  try {
    if (fs.existsSync(DEVICES_FILE)) {
      const data = fs.readFileSync(DEVICES_FILE, 'utf8');
      devices = JSON.parse(data);
      logInfo(`[WebUI] Loaded ${devices.length} devices from storage`);
    } else {
      logInfo('[WebUI] No devices file found, starting with empty list');
      devices = [];
    }
  } catch (error) {
    logError('[WebUI] Error loading devices:', error);
    devices = [];
  }
}

function loadDeviceLinks() {
  try {
    if (fs.existsSync(LINKS_FILE)) {
      const data = fs.readFileSync(LINKS_FILE, 'utf8');
      deviceLinks = JSON.parse(data);
      logInfo(`[WebUI] Loaded ${deviceLinks.length} device links from storage`);
    } else {
      logInfo('[WebUI] No device links file found, starting with empty list');
      deviceLinks = [];
    }
  } catch (error) {
    logError('[WebUI] Error loading device links:', error);
    deviceLinks = [];
  }
}

// Save devices and links to storage
function saveDevices() {
  try {
    // Ensure data directory exists
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DEVICES_FILE, JSON.stringify(devices, null, 2));
    logInfo('[WebUI] Saved devices to storage');
  } catch (error) {
    logError('[WebUI] Error saving devices:', error);
  }
}

function saveDeviceLinks() {
  try {
    // Ensure data directory exists
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(LINKS_FILE, JSON.stringify(deviceLinks, null, 2));
    logInfo('[WebUI] Saved device links to storage');
  } catch (error) {
    logError('[WebUI] Error saving device links:', error);
  }
}

// Add, update, and remove devices
function addDevice(device: Device) {
  // Check if device with same ID already exists
  const existingDeviceIndex = devices.findIndex(d => d.id === device.id);
  
  if (existingDeviceIndex >= 0) {
    // Update existing device
    devices[existingDeviceIndex] = device;
    logInfo(`[WebUI] Updated device ${device.id}`);
  } else {
    // Add new device
    devices.push(device);
    logInfo(`[WebUI] Added new device ${device.id}`);
  }
  
  saveDevices();
  return device;
}

function removeDevice(deviceId: string) {
  const initialCount = devices.length;
  devices = devices.filter(d => d.id !== deviceId);
  
  if (devices.length !== initialCount) {
    logInfo(`[WebUI] Removed device ${deviceId}`);
    saveDevices();
    
    // Also remove device from any links
    let linksChanged = false;
    
    deviceLinks.forEach(link => {
      const initialDeviceCount = link.deviceIds.length;
      link.deviceIds = link.deviceIds.filter(id => id !== deviceId);
      
      if (link.deviceIds.length !== initialDeviceCount) {
        linksChanged = true;
      }
    });
    
    // Filter out links with less than 2 devices
    const initialLinkCount = deviceLinks.length;
    deviceLinks = deviceLinks.filter(link => link.deviceIds.length >= 2);
    
    if (deviceLinks.length !== initialLinkCount) {
      linksChanged = true;
    }
    
    if (linksChanged) {
      saveDeviceLinks();
    }
    
    return true;
  }
  
  return false;
}

// Add, update, and remove device links
function createDeviceLink(name: string, deviceIds: string[]) {
  if (deviceIds.length < 2) {
    throw new Error('Device link must include at least 2 devices');
  }
  
  // Validate that all devices exist
  const validDeviceIds = devices.map(d => d.id);
  if (!deviceIds.every(id => validDeviceIds.includes(id))) {
    throw new Error('One or more device IDs are invalid');
  }
  
  const link: DeviceLink = {
    id: crypto.randomUUID(),
    name,
    deviceIds
  };
  
  deviceLinks.push(link);
  saveDeviceLinks();
  logInfo(`[WebUI] Created device link "${name}" with ${deviceIds.length} devices`);
  
  return link;
}

function removeDeviceLink(linkId: string) {
  const initialCount = deviceLinks.length;
  deviceLinks = deviceLinks.filter(l => l.id !== linkId);
  
  if (deviceLinks.length !== initialCount) {
    logInfo(`[WebUI] Removed device link ${linkId}`);
    saveDeviceLinks();
    return true;
  }
  
  return false;
}

export const startServer = (mqtt: IMQTTConnection, esphome: IESPConnection, port: number = 8099) => {
  // Load devices and links from storage
  loadDevices();
  loadDeviceLinks();
  
  const server = http.createServer((req, res) => {
    handleHttpRequest(req, res);
  });

  // Create WebSocket server
  const wsServer = new ws.Server({ server, path: '/api/ws' });

  wsServer.on('connection', (socket) => {
    logInfo('[WebUI] WebSocket client connected');
    clients.add(socket);
    
    // Send initial state
    sendToClient(socket, 'status', state);
    sendToClient(socket, 'deviceInfo', deviceInfo);
    sendToClient(socket, 'addonInfo', addonInfo);
    sendToClient(socket, 'devices', devices);
    sendToClient(socket, 'deviceLinks', deviceLinks);
    sendToClient(socket, 'proxies', getProxies());

    socket.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());
        handleWebSocketMessage(mqtt, esphome, socket, data);
      } catch (error) {
        logError('[WebUI] Error parsing WebSocket message:', error);
      }
    });

    socket.on('close', () => {
      logInfo('[WebUI] WebSocket client disconnected');
      clients.delete(socket);
    });

    socket.on('error', (error) => {
      logError('[WebUI] WebSocket error:', error);
      clients.delete(socket);
    });
  });

  // Start the server
  server.listen(port, () => {
    logInfo(`[WebUI] Server running on port ${port}`);
  });

  return server;
};

// Update state and broadcast to all clients
export const updateState = (newState: Partial<typeof state>) => {
  state = { ...state, ...newState };
  broadcastToAll('status', state);
};

// Update specific position
export const updatePosition = (motor: 'head' | 'feet', position: number) => {
  state.positions[motor] = position;
  broadcastToAll('positionUpdate', state.positions);
};

// Update light state
export const updateLightState = (lightState: boolean) => {
  state.lightState = lightState;
  broadcastToAll('lightState', { state: lightState });
};

// Update calibration values
export const updateCalibration = (motor: 'head' | 'feet', value: number) => {
  state.calibration[motor] = value;
  broadcastToAll('calibrationValues', state.calibration);
};

// Send data to a specific client
function sendToClient(client: any, type: string, payload: any) {
  try {
    if (client.readyState === 1) { // 1 = OPEN state
      client.send(JSON.stringify({ type, payload }));
    }
  } catch (error) {
    logError('[WebUI] Error sending to client:', error);
  }
}

// Broadcast data to all connected clients
function broadcastToAll(type: string, payload: any) {
  clients.forEach(client => {
    sendToClient(client, type, payload);
  });
}

// Scan for Bluetooth devices
async function scanForDevices(esphome: IESPConnection) {
  try {
    // This is just a stub implementation - replace with actual BLE scanning when implemented
    // Return some mock results for now
    return [
      { name: 'RC2', address: '00:11:22:33:44:55' },
      { name: 'RC3', address: '66:77:88:99:AA:BB' }
    ];
  } catch (error) {
    logError('[WebUI] Error scanning for devices:', error);
    return [];
  }
}

// Find the appropriate devices to control based on the activeDevice selection
function getTargetDevices(deviceId: string) {
  if (deviceId === 'all') {
    return devices;
  }
  
  // Check if it's a device ID
  const device = devices.find(d => d.id === deviceId);
  if (device) {
    return [device];
  }
  
  // Check if it's a link ID
  const link = deviceLinks.find(l => l.id === deviceId);
  if (link) {
    return devices.filter(d => link.deviceIds.includes(d.id));
  }
  
  return [];
}

// Handle WebSocket messages from clients
async function handleWebSocketMessage(
  mqtt: IMQTTConnection, 
  esphome: IESPConnection, 
  client: any, 
  data: any
) {
  logInfo(`[WebUI] Received WebSocket message: ${JSON.stringify(data)}`);

  try {
    switch (data.type) {
      case 'getStatus':
        sendToClient(client, 'status', state);
        break;

      case 'getDevices':
        sendToClient(client, 'devices', devices);
        break;

      case 'getDeviceLinks':
        sendToClient(client, 'deviceLinks', deviceLinks);
        break;

      case 'getProxies':
        sendToClient(client, 'proxies', getProxies());
        break;

      case 'setActiveDevice':
        activeDevice = data.deviceId || 'all';
        break;

      case 'addDevice':
        try {
          const device = addDevice(data.device);
          sendToClient(client, 'deviceAdded', device);
        } catch (error: any) {
          sendToClient(client, 'error', { message: `Error adding device: ${error.message}` });
        }
        break;

      case 'removeDevice':
        try {
          const success = removeDevice(data.deviceId);
          if (success) {
            sendToClient(client, 'deviceRemoved', { deviceId: data.deviceId });
          } else {
            sendToClient(client, 'error', { message: 'Device not found' });
          }
        } catch (error: any) {
          sendToClient(client, 'error', { message: `Error removing device: ${error.message}` });
        }
        break;

      case 'createLink':
        try {
          const link = createDeviceLink(data.name, data.deviceIds);
          sendToClient(client, 'linkCreated', link);
        } catch (error: any) {
          sendToClient(client, 'error', { message: `Error creating link: ${error.message}` });
        }
        break;

      case 'removeLink':
        try {
          const success = removeDeviceLink(data.linkId);
          if (success) {
            sendToClient(client, 'linkRemoved', { linkId: data.linkId });
          } else {
            sendToClient(client, 'error', { message: 'Link not found' });
          }
        } catch (error: any) {
          sendToClient(client, 'error', { message: `Error removing link: ${error.message}` });
        }
        break;

      case 'scanDevices':
        try {
          const results = await scanForDevices(esphome);
          sendToClient(client, 'scanResults', results);
        } catch (error: any) {
          sendToClient(client, 'error', { message: `Error scanning for devices: ${error.message}` });
        }
        break;

      case 'motorControl': {
        const { motor, direction, deviceId } = data;
        const targetDevices = getTargetDevices(deviceId || activeDevice);
        
        if (targetDevices.length === 0) {
          sendToClient(client, 'error', { message: 'No devices selected' });
          return;
        }
        
        // Convert UI direction to MQTT command
        let command = 'STOP';
        if (direction === 'up') command = 'OPEN';
        if (direction === 'down') command = 'CLOSE';
        
        for (const device of targetDevices) {
          // Determine the correct topic based on the motor and device
          let topic = '';
          if (motor === 'head') {
            topic = `octo/${device.id}/MotorHead/command`;
          } else if (motor === 'feet') {
            topic = `octo/${device.id}/MotorLegs/command`;
          } else if (motor === 'both') {
            if (direction === 'up') {
              mqtt.publish(`octo/${device.id}/MotorBothUp/command`, 'PRESS');
              continue;
            } else if (direction === 'down') {
              mqtt.publish(`octo/${device.id}/MotorBothDown/command`, 'PRESS');
              continue;
            } else {
              mqtt.publish(`octo/${device.id}/MotorHead/command`, 'STOP');
              mqtt.publish(`octo/${device.id}/MotorLegs/command`, 'STOP');
              continue;
            }
          }
          
          if (topic) {
            mqtt.publish(topic, command);
          }
        }
        break;
      }

      case 'setPosition': {
        const { motor, position, deviceId } = data;
        const targetDevices = getTargetDevices(deviceId || activeDevice);
        
        if (targetDevices.length === 0) {
          sendToClient(client, 'error', { message: 'No devices selected' });
          return;
        }
        
        for (const device of targetDevices) {
          // Determine the correct topic based on the motor and device
          let topic = '';
          if (motor === 'head') {
            topic = `octo/${device.id}/MotorHead/position`;
          } else if (motor === 'feet') {
            topic = `octo/${device.id}/MotorLegs/position`;
          }
          
          if (topic) {
            mqtt.publish(topic, position.toString());
          }
        }
        break;
      }

      case 'preset': {
        const { preset, deviceId } = data;
        const targetDevices = getTargetDevices(deviceId || activeDevice);
        
        if (targetDevices.length === 0) {
          sendToClient(client, 'error', { message: 'No devices selected' });
          return;
        }
        
        for (const device of targetDevices) {
          // Map preset to the corresponding MQTT command
          let topic = '';
          if (preset === 'flat') {
            topic = `octo/${device.id}/PresetFlat/command`;
          } else if (preset === 'zerog') {
            topic = `octo/${device.id}/PresetZeroG/command`;
          } else if (preset === 'tv') {
            topic = `octo/${device.id}/PresetTV/command`;
          } else if (preset === 'reading') {
            topic = `octo/${device.id}/PresetMemory/command`;
          }
          
          if (topic) {
            mqtt.publish(topic, 'PRESS');
          }
        }
        break;
      }

      case 'light': {
        const { state, deviceId } = data;
        const targetDevices = getTargetDevices(deviceId || activeDevice);
        
        if (targetDevices.length === 0) {
          sendToClient(client, 'error', { message: 'No devices selected' });
          return;
        }
        
        for (const device of targetDevices) {
          mqtt.publish(`octo/${device.id}/UnderBedLights/command`, state ? 'ON' : 'OFF');
        }
        break;
      }

      case 'calibrate': {
        const { motor, deviceId } = data;
        const targetDevices = getTargetDevices(deviceId || activeDevice);
        
        if (targetDevices.length === 0) {
          sendToClient(client, 'error', { message: 'No devices selected' });
          return;
        }
        
        for (const device of targetDevices) {
          // Determine the correct topic based on the motor
          let topic = '';
          if (motor === 'head') {
            topic = `octo/${device.id}/MotorHeadCalibrate/command`;
          } else if (motor === 'feet') {
            topic = `octo/${device.id}/MotorFeetCalibrate/command`;
          }
          
          if (topic) {
            mqtt.publish(topic, 'PRESS');
          }
        }
        break;
      }

      default:
        logWarn(`[WebUI] Unknown message type: ${data.type}`);
    }
  } catch (error) {
    logError('[WebUI] Error handling WebSocket message:', error);
    sendToClient(client, 'error', { message: 'Error processing your request' });
  }
}

// Handle HTTP requests for static files
function handleHttpRequest(req: http.IncomingMessage, res: http.ServerResponse) {
  try {
    // Parse URL
    const parsedUrl = url.parse(req.url || '');
    
    // Extract the pathname and get the filepath
    let pathname = parsedUrl.pathname || '/';
    
    // Default to index.html if requesting the root
    if (pathname === '/') {
      pathname = '/index.html';
    }
    
    // Resolve the file path - Try multiple locations to support both development and production
    let filePath = path.join(__dirname, pathname);
    
    // Check if file exists, if not try alternate paths
    if (!fs.existsSync(filePath)) {
      // Try the 'webui' subdirectory (for production/Docker container)
      filePath = path.join(__dirname, '..', 'webui', pathname);
      
      // If still not found, try relative to the working directory
      if (!fs.existsSync(filePath)) {
        filePath = path.join(process.cwd(), 'webui', pathname);
        
        // One last attempt - check if it's in a 'dist/webui' directory
        if (!fs.existsSync(filePath)) {
          filePath = path.join(process.cwd(), 'dist', 'webui', pathname);
        }
      }
    }
    
    logInfo(`[WebUI] Serving file: ${filePath} for path: ${pathname}`);
    
    // Get the file extension
    const ext = path.extname(filePath).toLowerCase();
    
    // Get the MIME type or default to octet-stream
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    
    // Check if the file exists
    fs.access(filePath, fs.constants.F_OK, (err) => {
      if (err) {
        // File doesn't exist
        logError(`[WebUI] File not found: ${filePath}`);
        res.writeHead(404);
        res.end('File Not Found');
        return;
      }
      
      // Read and serve the file
      fs.readFile(filePath, (err, data) => {
        if (err) {
          logError(`[WebUI] Error reading file: ${err.message}`);
          res.writeHead(500);
          res.end(`Server Error: ${err.message}`);
          return;
        }
        
        // Serve the file with the appropriate content type
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
      });
    });
  } catch (error) {
    logError('[WebUI] Error handling HTTP request:', error);
    res.writeHead(500);
    res.end('Server Error');
  }
} 