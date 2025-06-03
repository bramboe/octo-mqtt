import { logError, logInfo, logWarn } from '../Utils/logger';
import mqtt from 'mqtt';
import { IMQTTConnection } from './IMQTTConnection';
import MQTTConfig from './MQTTConfig';
import { MQTTConnection } from './MQTTConnection';

export const connectToMQTT = (): Promise<IMQTTConnection> => {
  logInfo('[MQTT] Connecting...');
  
  // Add more detailed logging of connection configuration
  const { host, port, username } = MQTTConfig;
  logInfo(`[MQTT] Connecting to ${host}:${port} with ${username ? 'authentication' : 'no authentication'}`);
  
  const client = mqtt.connect(MQTTConfig);

  return new Promise((resolve, reject) => {
    // Set a connection timeout
    const connectionTimeout = setTimeout(() => {
      logError('[MQTT] Connection timeout after 30 seconds');
      client.end(true);
      reject(new Error('Connection timeout'));
    }, 30000);
    
    client.once('connect', () => {
      clearTimeout(connectionTimeout);
      logInfo('[MQTT] Connected successfully');
      resolve(new MQTTConnection(client));
    });
    
    client.once('error', (error) => {
      clearTimeout(connectionTimeout);
      logError('[MQTT] Connect Error', error);
      
      // Try with anonymous connection if authentication fails
      if (error.message && error.message.includes('Not authorized')) {
        logWarn('[MQTT] Authentication failed, trying anonymous connection');
        
        // Create new config without auth
        const anonymousConfig = { ...MQTTConfig };
        delete anonymousConfig.username;
        delete anonymousConfig.password;
        
        const anonymousClient = mqtt.connect(anonymousConfig);
        
        anonymousClient.once('connect', () => {
          logInfo('[MQTT] Connected anonymously');
          resolve(new MQTTConnection(anonymousClient));
        });
        
        anonymousClient.once('error', (anonError) => {
          logError('[MQTT] Anonymous connection also failed', anonError);
          reject(anonError);
        });
      } else {
        reject(error);
      }
    });
  });
};
