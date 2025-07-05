import { Connection } from '@2colors/esphome-native-api';
import { logError, logInfo, logWarn } from '@utils/logger';

export const connect = (connection: Connection) => {
  return new Promise<Connection>((resolve, reject) => {
    logInfo(`[ESPHome] Attempting to connect to ${connection.host}:${connection.port}`);
    
    const timeout = setTimeout(() => {
      logWarn(`[ESPHome] Connection timeout for ${connection.host}:${connection.port}`);
      reject(new Error(`Connection timeout for ${connection.host}:${connection.port}`));
    }, 10000); // 10 second timeout
    
    const errorHandler = (error: any) => {
      clearTimeout(timeout);
      logError('[ESPHome] Failed Connecting:', error);
      logError(`[ESPHome] Connection details: host=${connection.host}, port=${connection.port}, password=${connection.password ? 'set' : 'not set'}`);
      if (error.code) {
        logError(`[ESPHome] Error code: ${error.code}`);
      }
      reject(error);
    };
    
    connection.once('authorized', async () => {
      clearTimeout(timeout);
      logInfo('[ESPHome] Connected:', connection.host);
      connection.off('error', errorHandler);
      
      try {
      // TODO: Fix next two lines after new version of esphome-native-api is released
      const deviceInfo = await connection.deviceInfoService();
        logInfo('[ESPHome] Device info retrieved:', JSON.stringify(deviceInfo));
      const { bluetoothProxyFeatureFlags } = deviceInfo as any;
        
      if (!bluetoothProxyFeatureFlags) {
          logWarn(`[ESPHome] No Bluetooth proxy features detected on ${connection.host}`);
          return reject(new Error(`No Bluetooth proxy features on ${connection.host}`));
      }
        
      resolve(connection);
      } catch (error) {
        logError('[ESPHome] Error getting device info:', error);
        reject(error);
      }
    });
    
    const doConnect = (handler: (error: any) => void) => {
      try {
        connection.once('error', handler);
        logInfo(`[ESPHome] Initiating connection to ${connection.host}:${connection.port}`);
        connection.connect();
        connection.off('error', handler);
        connection.once('error', errorHandler);
      } catch (err) {
        clearTimeout(timeout);
        logError('[ESPHome] Exception during connection attempt:', err);
        errorHandler(err);
      }
    };
    
    const retryHandler = (error: any) => {
      logWarn('[ESPHome] Failed Connecting (will retry once):', error);
      if (error.code) {
        logWarn(`[ESPHome] First attempt error code: ${error.code}`);
      }
      doConnect(errorHandler);
    };
    
    doConnect(retryHandler);
  });
};
