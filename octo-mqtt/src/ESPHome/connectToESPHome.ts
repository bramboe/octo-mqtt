import { Connection } from '@2colors/esphome-native-api';
import { logInfo, logWarn } from '@utils/logger';
import { ESPConnection } from './ESPConnection';
import { IESPConnection } from './IESPConnection';
import { connect } from './connect';
import { BLEProxy, getProxies } from './options';

export const connectToESPHome = async (): Promise<IESPConnection> => {
  logInfo('[ESPHome] Connecting...');

  const proxies = getProxies();
  logInfo(`[ESPHome] Proxies to connect: ${JSON.stringify(proxies)}`);
  
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
          const result = await connect(connection);
          logInfo(`[ESPHome] Successfully connected to ${config.host}:${config.port}`);
          return result;
        } catch (error) {
          logWarn(`[ESPHome] Failed to connect to proxy at ${config.host}:${config.port}: ${error instanceof Error ? error.message : String(error)}`);
          return null;
        }
      })
    );
    
    const validConnections = connections.filter(c => c !== null);
    logInfo(`[ESPHome] Number of successful BLE proxy connections: ${validConnections.length}`);
    
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
