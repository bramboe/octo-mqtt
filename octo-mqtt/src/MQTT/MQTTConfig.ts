import { IClientOptions } from 'mqtt/types/lib/client';
import { logInfo, logWarn } from '@utils/logger';
import { getRootOptions } from '../Utils/options';

// Get Home Assistant options
const options = getRootOptions();

// Get MQTT configuration from Home Assistant options with fallbacks
const host = options.mqtt_host || process.env.MQTTHOST || 'core-mosquitto';
const port = options.mqtt_port || parseInt(process.env.MQTTPORT || '1883', 10);
const username = options.mqtt_username || process.env.MQTTUSER || '';
const password = options.mqtt_password || process.env.MQTTPASSWORD || '';

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

// Only add auth if username is provided
if (username) {
  config.username = username;
  
  // Only set password if provided
  if (password) {
    config.password = password;
  } else {
    logWarn('[MQTT] Username provided but password is empty');
  }
} else {
  logInfo('[MQTT] No authentication credentials provided, connecting anonymously');
}

export default config;
