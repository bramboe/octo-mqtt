import { logInfo, logWarn, logError } from '@utils/logger';
import { getRootOptions } from '@utils/options';

// Type assertion for process.env to avoid TypeScript errors
const env = process.env as any;

// Function to get MQTT configuration with auto-detection
const getMQTTConfig = () => {
  let host: string;
  let port: number;
  let username: string;
  let password: string;

  try {
    // Get configuration from options.json
    const options = getRootOptions();
    
    // Check if we need to auto-detect MQTT settings
    const needsAutoDetect = 
      options.mqtt_host === '<auto_detect>' || 
      options.mqtt_port === '<auto_detect>' ||
      options.mqtt_user === '<auto_detect>' ||
      options.mqtt_password === '<auto_detect>';

    if (needsAutoDetect) {
      logInfo('[MQTT] Auto-detection required, using Home Assistant default MQTT settings');
      
      // Check if we have MQTT credentials from bashio
      if (env.MQTT_HOST && env.MQTT_USER && env.MQTT_PASSWORD) {
        logInfo('[MQTT] Using MQTT credentials from Home Assistant services');
        host = env.MQTT_HOST;
        port = parseInt(env.MQTT_PORT || '1883', 10);
        username = env.MQTT_USER;
        password = env.MQTT_PASSWORD;
        
        logInfo(`[MQTT] Using ${host}:${port} with authentication`);
      } else {
        logWarn('[MQTT] No MQTT credentials found, using fallback configuration');
        host = 'core-mosquitto';
        port = 1883;
        username = '';
        password = '';
        
        logInfo('[MQTT] Using core-mosquitto:1883 (anonymous connection)');
      }
    } else {
      // Use configured values
      logInfo('[MQTT] Using configured MQTT settings');
      host = options.mqtt_host || 'localhost';
      port = parseInt(options.mqtt_port || '1883', 10);
      username = options.mqtt_user || '';
      password = options.mqtt_password || '';
    }
  } catch (error) {
    logError('[MQTT] Error reading configuration, using fallback:', error);
    host = 'core-mosquitto';
    port = 1883;
    username = '';
    password = '';
  }

  // Generate a unique client ID to avoid connection conflicts
  const clientId = `octo_mqtt_${Math.random().toString(16).substring(2, 10)}`;

  // Log MQTT configuration for debugging
  logInfo(`[MQTT] Connecting to ${host}:${port}`);
  logInfo(`[MQTT] Authentication: ${username ? 'Using credentials' : 'Anonymous'}`);
  logInfo(`[MQTT] Client ID: ${clientId}`);

  // Create base configuration
  const config: any = {
    protocol: 'mqtt',
    host,
    port,
    clientId,
    clean: true,
    reconnectPeriod: 5000,
    connectTimeout: 10000,
    rejectUnauthorized: false
  };

  // Only add auth credentials if we have them
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

  return config;
};

export default getMQTTConfig();
