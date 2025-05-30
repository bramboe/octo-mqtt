import { IClientOptions } from 'mqtt/types/lib/client';
import { logInfo, logWarn } from '@utils/logger';
import { getRootOptions } from '../Utils/options';
import fs from 'fs';

// Get Home Assistant options
const options = getRootOptions();

// Try to read MQTT credentials from Home Assistant services file
let haServices: any = {};
try {
  const servicesPath = '/etc/services.d/mqtt/mqtt.conf';
  if (fs.existsSync(servicesPath)) {
    const servicesContent = fs.readFileSync(servicesPath, 'utf8');
    haServices = JSON.parse(servicesContent);
    logInfo('[MQTT] Successfully loaded Home Assistant MQTT credentials');
  }
} catch (error) {
  logWarn('[MQTT] Could not load Home Assistant MQTT credentials:', error);
}

// Get MQTT configuration from Home Assistant options with fallbacks
const host = options.mqtt_host === '<auto_detect>' ? 'core-mosquitto' : (options.mqtt_host || process.env.MQTTHOST || 'core-mosquitto');
const port = options.mqtt_port || parseInt(process.env.MQTTPORT || '1883', 10);

// Use Home Assistant MQTT credentials if available and auto-detect is enabled
const username = options.mqtt_username === '<auto_detect>' 
  ? (haServices.username || process.env.SUPERVISOR_TOKEN || '')
  : (options.mqtt_username || process.env.MQTTUSER || '');

const password = options.mqtt_password === '<auto_detect>'
  ? (haServices.password || process.env.SUPERVISOR_TOKEN || '')
  : (options.mqtt_password || process.env.MQTTPASSWORD || '');

// Generate a unique client ID to avoid connection conflicts
const clientId = `octo_mqtt_${Math.random().toString(16).substring(2, 10)}`;

// Log MQTT configuration for debugging
logInfo(`[MQTT] Connecting to ${host}:${port}`);
logInfo(`[MQTT] Authentication: ${username ? 'Using credentials' : 'Anonymous'}`);
logInfo(`[MQTT] Client ID: ${clientId}`);

// Create base configuration
const config: IClientOptions = {
  protocol: 'mqtt',
  host,
  port,
  clientId,
  clean: true,
  reconnectPeriod: 5000,
  connectTimeout: 10000,
  rejectUnauthorized: false
};

// Always try to use authentication when available
if (username) {
  config.username = username;
  if (password) {
    config.password = password;
  } else {
    logWarn('[MQTT] Username provided but password is empty');
  }
} else {
  logInfo('[MQTT] No authentication credentials provided, connecting anonymously');
}

export default config;
