import { Connection } from '@2colors/esphome-native-api';
import { logInfo, logWarn, logError } from '@utils/logger';
import { ESPConnection } from './ESPConnection';
import { IESPConnection } from './IESPConnection';
import { connect } from './connect';
import { BLEProxy, getProxies } from './options';

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
    const connectionResults = await Promise.all(
          proxies.map(async (config: BLEProxy) => {
        try {
          logInfo(`[ESPHome] Creating connection to ${config.host}:${config.port}`);
            const connection = new Connection(config);
          return {
            success: true,
            connection: await connect(connection),
            config
          };
        } catch (error: any) {
          const errorCode = error.code || 'UNKNOWN';
          let errorMessage = '';
          
          switch (errorCode) {
            case 'ECONNREFUSED':
              errorMessage = 'Connection refused. Make sure the ESPHome device is running and the port is correct.';
              break;
            case 'ETIMEDOUT':
              errorMessage = 'Connection timed out. Check if the device is powered on and connected to your network.';
              break;
            case 'EHOSTUNREACH':
              errorMessage = 'Host unreachable. Verify the IP address is correct and the device is on your network.';
              break;
            default:
              errorMessage = `Connection failed: ${error.message || 'Unknown error'}`;
          }
          
          logWarn(`[ESPHome] Failed to connect to proxy at ${config.host}:${config.port}`);
          logWarn(`[ESPHome] ${errorMessage}`);
          logWarn('[ESPHome] Troubleshooting steps:');
          logWarn('  1. Verify the ESPHome device is powered on');
          logWarn('  2. Check if you can ping the device');
          logWarn('  3. Confirm the IP address is correct');
          logWarn('  4. Ensure the ESPHome device has BLE proxy configured');
          logWarn('  5. Check if the port number matches your ESPHome configuration');
          
          return {
            success: false,
            error: errorMessage,
            config
          };
        }
      })
    );
    
    const validConnections = connectionResults
      .filter(result => result.success)
      .map(result => (result as any).connection);
    
    if (validConnections.length === 0) {
      logWarn('[ESPHome] Could not connect to any BLE proxies. BLE functionality will be limited.');
      logWarn('[ESPHome] Please check the error messages above and fix your configuration.');
    } else {
      logInfo(`[ESPHome] Successfully connected to ${validConnections.length} BLE proxies.`);
    }
    
    return new ESPConnection(validConnections);
  } catch (error) {
    logWarn('[ESPHome] Error connecting to BLE proxies. BLE functionality will be limited.');
    logWarn('[ESPHome] Please check your configuration and ensure your ESPHome devices are accessible.');
    return new ESPConnection([]);
  }
};
