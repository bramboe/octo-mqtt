import { Connection } from '@2colors/esphome-native-api';
import { logError, logInfo, logWarn } from '../Utils/logger';

export const connect = (connection: Connection, retryCount = 0): Promise<Connection> => {
  const maxRetries = 3;
  const retryDelay = 2000; // 2 seconds between retries
  
  return new Promise<Connection>((resolve, reject) => {
    logInfo(`[ESPHome] Attempting to connect to ${connection.host}:${connection.port} (attempt ${retryCount + 1}/${maxRetries + 1})`);
    
    const timeout = setTimeout(() => {
      logWarn(`[ESPHome] Connection timeout for ${connection.host}:${connection.port}`);
      reject(new Error(`Connection timeout for ${connection.host}:${connection.port}`));
    }, 20000); // Increased timeout to 20 seconds
    
    const errorHandler = (error: any) => {
      clearTimeout(timeout);
      logError('[ESPHome] Failed Connecting:', error);
      logError(`[ESPHome] Connection details: host=${connection.host}, port=${connection.port}, password=${connection.password ? 'set' : 'not set'}`);
      if (error.code) {
        logError(`[ESPHome] Error code: ${error.code}`);
      }
      
      // Retry on EHOSTUNREACH errors (device might be starting up)
      if (error.code === 'EHOSTUNREACH' && retryCount < maxRetries) {
        logWarn(`[ESPHome] Host unreachable, retrying in ${retryDelay}ms... (${retryCount + 1}/${maxRetries})`);
        setTimeout(() => {
          connect(connection, retryCount + 1).then(resolve).catch(reject);
        }, retryDelay);
        return;
      }
      
      reject(error);
    };
    
    connection.once('authorized', async () => {
      clearTimeout(timeout);
      logInfo('[ESPHome] Connected:', connection.host);
      connection.off('error', errorHandler);
      
      try {
        const deviceInfo = await connection.deviceInfoService();
        logInfo('[ESPHome] Device info retrieved:', JSON.stringify(deviceInfo));
        const bluetoothProxyFeatureFlags = (deviceInfo as any)?.bluetoothProxyFeatureFlags;
        
        if (!bluetoothProxyFeatureFlags) {
          logWarn(`[ESPHome] No Bluetooth proxy features detected on ${connection.host}`);
          return reject(new Error(`No Bluetooth proxy features on ${connection.host}`));
        }
        
        logInfo(`[ESPHome] Successfully connected to ${connection.host} with BLE proxy features`);
        resolve(connection);
      } catch (error) {
        logError('[ESPHome] Error getting device info:', error);
        reject(error);
      }
    });

    connection.once('error', errorHandler);
    
    // Explicitly start the connection
    try {
      logInfo(`[ESPHome] Starting connection to ${connection.host}:${connection.port}`);
      connection.connect();
    } catch (error) {
      clearTimeout(timeout);
      logError('[ESPHome] Connection start error:', error);
      reject(error);
    }
  });
}; 