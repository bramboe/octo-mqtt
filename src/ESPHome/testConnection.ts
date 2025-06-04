import { Connection } from '@2colors/esphome-native-api';
import { logError, logInfo } from '../Utils/logger';

/**
 * A simple utility to test if an ESPHome device is accessible
 * This can be called from the command line with: 
 * ts-node src/ESPHome/testConnection.ts <host> <port>
 */

const testConnection = async (host: string, port: number): Promise<boolean> => {
  logInfo(`[ESPHome] Testing connection to ${host}:${port}`);
  
  const connection = new Connection({
    host,
    port,
  });
  
  return new Promise<boolean>((resolve) => {
    const timeout = setTimeout(() => {
      logError(`[ESPHome] Connection timeout for ${host}:${port}`);
      connection.disconnect();
      resolve(false);
    }, 5000);
    
    connection.once('error', (error) => {
      clearTimeout(timeout);
      logError(`[ESPHome] Connection error: ${error}`);
      if (error.code) {
        logError(`[ESPHome] Error code: ${error.code}`);
      }
      connection.disconnect();
      resolve(false);
    });
    
    connection.once('authorized', () => {
      clearTimeout(timeout);
      logInfo(`[ESPHome] Successfully connected to ${host}:${port}`);
      connection.disconnect();
      resolve(true);
    });
    
    try {
      connection.connect();
    } catch (error) {
      clearTimeout(timeout);
      logError(`[ESPHome] Connection exception: ${error}`);
      resolve(false);
    }
  });
};

// Allow running from command line
if (require.main === module) {
  const args = process.argv.slice(2);
  const host = args[0] || '192.168.2.102';
  const port = parseInt(args[1] || '6053', 10);
  
  testConnection(host, port)
    .then((success) => {
      if (success) {
        logInfo('[ESPHome] Connection test successful');
        process.exit(0);
      } else {
        logError('[ESPHome] Connection test failed');
        process.exit(1);
      }
    })
    .catch((error) => {
      logError('[ESPHome] Test error:', error);
      process.exit(2);
    });
}

export { testConnection }; 