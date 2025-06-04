import { Connection } from '@2colors/esphome-native-api';
import { logInfo, logWarn } from '../Utils/logger';
import { ESPConnection } from './ESPConnection';
import { IESPConnection } from './IESPConnection';
import { connect } from './connect';
import { BLEProxy, getProxies } from './options';

const RETRY_DELAY = 5000; // 5 seconds

export const connectToESPHome = async (): Promise<IESPConnection> => {
  logInfo('[ESPHome] Connecting...');

  const proxies = getProxies();
  
  if (proxies.length === 0) {
    logWarn('[ESPHome] No BLE proxies configured. Please check your configuration.');
    logWarn('[ESPHome] You need to configure at least one ESPHome device with BLE proxy capabilities.');
    logWarn('[ESPHome] Add a bleProxies entry to your configuration with the correct host and port.');
    return new ESPConnection([]);
  }
  
  logInfo(`[ESPHome] Found ${proxies.length} BLE proxy configuration(s):`);
  proxies.forEach((proxy, index) => {
    logInfo(`[ESPHome] Proxy #${index + 1}: host=${proxy.host}, port=${proxy.port}, password=${proxy.password ? 'set' : 'not set'}`);
  });
  
  try {
    const connections = await Promise.all(
      proxies.map(async (proxy) => {
        const connection = new Connection({
          host: proxy.host,
          port: proxy.port,
          password: proxy.password,
          clientInfo: 'octo-mqtt',
          encryptionKey: proxy.password,
        });
        return connect(connection);
      })
    );
    
    if (connections.length === 0) {
      logWarn('[ESPHome] Could not connect to any BLE proxies. BLE functionality will be limited.');
      logWarn('[ESPHome] Please check the error messages above and fix your configuration.');
    } else {
      logInfo(`[ESPHome] Successfully connected to ${connections.length} BLE proxies.`);
    }
    
    return new ESPConnection(connections);
  } catch (error) {
    logWarn('[ESPHome] Error connecting to BLE proxies. BLE functionality will be limited.');
    logWarn('[ESPHome] Please check your configuration and ensure your ESPHome devices are accessible.');
    return new ESPConnection([]);
  }
};
