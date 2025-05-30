import { IClientOptions } from 'mqtt/types/lib/client';
import { logInfo, logWarn } from '@utils/logger';
import { getRootOptions } from '../Utils/options';

// Get Home Assistant options
const options = getRootOptions();

// Get MQTT configuration
const host = 'core-mosquitto';
const port = 1883;

// Create base configuration
const config: IClientOptions = {
  protocol: 'mqtt',
  host,
  port,
  clientId: `octo_mqtt_${Math.random().toString(16).substring(2, 10)}`,
  clean: true,
  reconnectPeriod: 5000,
  connectTimeout: 10000,
  rejectUnauthorized: false,
  username: 'octo_mqtt',
  password: 'mqtt_secure_password'
};

logInfo(`[MQTT] Connecting with username: ${config.username}`);

export default config;
