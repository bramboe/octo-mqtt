import * as http from 'http';
import * as path from 'path';
import * as fs from 'fs';
import * as ws from 'ws';
import * as url from 'url';
import { IMQTTConnection } from '@mqtt/IMQTTConnection';
import { IESPConnection } from 'ESPHome/IESPConnection';
import { logInfo, logError, logWarn } from '@utils/logger';

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

export const startServer = (mqtt: IMQTTConnection, esphome: IESPConnection, port: number = 8099) => {
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

      case 'motorControl': {
        const { motor, direction } = data;
        
        // Convert UI direction to MQTT command
        let command = 'STOP';
        if (direction === 'up') command = 'OPEN';
        if (direction === 'down') command = 'CLOSE';
        
        // Determine the correct topic based on the motor
        let topic = '';
        if (motor === 'head') {
          topic = 'octo/MotorHead/command';
        } else if (motor === 'feet') {
          topic = 'octo/MotorLegs/command';
        } else if (motor === 'both') {
          if (direction === 'up') {
            mqtt.publish('octo/MotorBothUp/command', 'PRESS');
            return;
          } else if (direction === 'down') {
            mqtt.publish('octo/MotorBothDown/command', 'PRESS');
            return;
          } else {
            mqtt.publish('octo/MotorHead/command', 'STOP');
            mqtt.publish('octo/MotorLegs/command', 'STOP');
            return;
          }
        }
        
        if (topic) {
          mqtt.publish(topic, command);
        }
        break;
      }

      case 'setPosition': {
        const { motor, position } = data;
        
        // Determine the correct topic based on the motor
        let topic = '';
        if (motor === 'head') {
          topic = 'octo/MotorHead/position';
        } else if (motor === 'feet') {
          topic = 'octo/MotorLegs/position';
        }
        
        if (topic) {
          mqtt.publish(topic, position.toString());
        }
        break;
      }

      case 'preset': {
        const { preset } = data;
        
        // Map preset to the corresponding MQTT command
        let topic = '';
        if (preset === 'flat') {
          topic = 'octo/PresetFlat/command';
        } else if (preset === 'zerog') {
          topic = 'octo/PresetZeroG/command';
        } else if (preset === 'tv') {
          topic = 'octo/PresetTV/command';
        } else if (preset === 'reading') {
          topic = 'octo/PresetMemory/command';
        }
        
        if (topic) {
          mqtt.publish(topic, 'PRESS');
        }
        break;
      }

      case 'light': {
        const { state } = data;
        mqtt.publish('octo/UnderBedLights/command', state ? 'ON' : 'OFF');
        break;
      }

      case 'calibrate': {
        const { motor } = data;
        
        // Determine the correct topic based on the motor
        let topic = '';
        if (motor === 'head') {
          topic = 'octo/MotorHeadCalibrate/command';
        } else if (motor === 'feet') {
          topic = 'octo/MotorFeetCalibrate/command';
        }
        
        if (topic) {
          mqtt.publish(topic, 'PRESS');
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