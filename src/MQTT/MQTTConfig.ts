import { IClientOptions } from 'mqtt/types/lib/client';
import { logInfo } from '@utils/logger';
import { getRootOptions } from '../Utils/options';

// Get Home Assistant options
const options = getRootOptions();

// Get MQTT configuration
const host = 'core-mosquitto';
const port = 1883;

// When using auto-detect, use the Supervisor token for authentication
const supervisorToken = process.env.SUPERVISOR_TOKEN;

// Create base configuration
const config: IClientOptions = {
  protocol: 'mqtt',
  host,
  port,
  clientId: `octo_mqtt_${Math.random().toString(16).substring(2, 10)}`,
  clean: true,
  reconnectPeriod: 5000,
  connectTimeout: 10000,
  rejectUnauthorized: false
};

// Add authentication if we have a Supervisor token
if (supervisorToken) {
  config.username = 'addon';
  config.password = supervisorToken;
  logInfo('[MQTT] Using Supervisor token for authentication');
}

export default config;
