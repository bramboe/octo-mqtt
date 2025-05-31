import { IClientOptions } from 'mqtt/types/lib/client';
import { logInfo, logWarn, logError } from '@utils/logger';

// Log all environment variables for debugging
logInfo('[MQTT Env Vars] Logging all environment variables:');
for (const key in process.env) {
  if (Object.prototype.hasOwnProperty.call(process.env, key)) {
    // Be careful not to log sensitive variables like passwords directly in production
    if (key.includes('PASS') || key.includes('TOKEN') || key.includes('KEY')) {
      logInfo(`[MQTT Env Vars] ${key}=<hidden>`);
    } else {
      logInfo(`[MQTT Env Vars] ${key}=${process.env[key]}`);
    }
  }
}
logInfo('[MQTT Env Vars] Finished logging all environment variables.');

// Get MQTT configuration from environment variables provided by Supervisor
const host = process.env.MQTTHOST || 'core-mosquitto'; // Fallback if not provided
const portEnv = process.env.MQTTPORT;
const username = process.env.MQTTUSER;
const password = process.env.MQTTPASSWORD;

let port = 1883; // Default port
if (portEnv) {
  const parsedPort = parseInt(portEnv, 10);
  if (!isNaN(parsedPort)) {
    port = parsedPort;
  } else {
    logWarn(`[MQTT] Invalid MQTTPORT environment variable: ${portEnv}. Using default port ${port}.`);
  }
}

logInfo(`[MQTT] Attempting to connect to ${host}:${port}`);
if (username) {
  logInfo(`[MQTT] Using username from environment: ${username}`);
} else {
  logWarn('[MQTT] No MQTTUSER environment variable set by Supervisor. Connection will likely be anonymous or fail.');
}

// Generate a unique client ID
const clientId = `octo_mqtt_${Math.random().toString(16).substring(2, 10)}`;

// Create base configuration
const config: IClientOptions = {
  protocol: 'mqtt',
  host,
  port,
  clientId,
  clean: true,
  reconnectPeriod: 5000,
  connectTimeout: 10000,
  rejectUnauthorized: false,
};

if (username) {
  config.username = username;
  if (password) {
    // Password is intentionally not logged for security
    config.password = password;
  } else {
    logWarn('[MQTT] MQTTUSER is set, but MQTTPASSWORD is not. Attempting authentication without password.');
  }
}

export default config;
