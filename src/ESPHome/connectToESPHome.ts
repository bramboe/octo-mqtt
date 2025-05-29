import { Connection } from '@2colors/esphome-native-api';
import { logInfo, logWarn } from '@utils/logger';
import { ESPConnection } from './ESPConnection';
import { IESPConnection } from './IESPConnection';
import { connect } from './connect';
import { BLEProxy, getProxies } from './options';

export const connectToESPHome = async (): Promise<IESPConnection> => {
  logInfo('[ESPHome] Connecting...');

  const proxies = getProxies();
  
  if (proxies.length === 0) {
    logWarn('[ESPHome] No BLE proxies configured. BLE functionality will not be available.');
    return new ESPConnection([]);
  }
  
  logInfo(`[ESPHome] Found ${proxies.length} BLE proxy configuration(s):`);
  proxies.forEach((proxy, index) => {
    logInfo(`[ESPHome] Proxy #${index + 1}: host=${proxy.host}, port=${proxy.port}, password=${proxy.password ? 'set' : 'not set'}`);
  });
  
  try {
    const connections = await Promise.all(
          proxies.map(async (config: BLEProxy) => {
        try {
          logInfo(`[ESPHome] Creating connection to ${config.host}:${config.port}`);
            const connection = new Connection(config);
            return await connect(connection);
        } catch (error) {
          logWarn(`[ESPHome] Failed to connect to proxy at ${config.host}:${config.port}`);
          return null;
        }
      })
    );
    
    const validConnections = connections.filter((c): c is Connection => c !== null);
    
    if (validConnections.length === 0) {
      logWarn('[ESPHome] Could not connect to any BLE proxies. BLE functionality will be limited.');
    } else {
      logInfo(`[ESPHome] Successfully connected to ${validConnections.length} BLE proxies.`);
    }
    
    return new ESPConnection(validConnections);
  } catch (error) {
    logWarn('[ESPHome] Error connecting to BLE proxies. BLE functionality will be limited.');
    return new ESPConnection([]);
  }
};
