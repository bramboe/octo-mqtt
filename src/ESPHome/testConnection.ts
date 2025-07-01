import { Connection } from '@2colors/esphome-native-api';
import { logError, logInfo, logWarn } from '../Utils/logger';
import { promises as dns } from 'dns';
import { createConnection } from 'net';

/**
 * A comprehensive utility to test if an ESPHome device is accessible
 * This can be called from the command line with: 
 * ts-node src/ESPHome/testConnection.ts <host> <port>
 */

const testNetworkConnectivity = async (host: string, port: number): Promise<boolean> => {
  logInfo(`[Network] Testing network connectivity to ${host}:${port}`);
  
  try {
    // Check if host is an IP address
    const isIPAddress = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(host);
    
    if (!isIPAddress) {
      // Test DNS resolution first for hostnames
      logInfo(`[Network] Resolving hostname: ${host}`);
      const addresses = await dns.resolve4(host);
      logInfo(`[Network] Resolved ${host} to: ${addresses.join(', ')}`);
    } else {
      logInfo(`[Network] Host is an IP address: ${host}`);
    }
    
    // Test TCP connectivity
    logInfo(`[Network] Testing TCP connection to ${host}:${port}`);
    return new Promise<boolean>((resolve) => {
      const socket = createConnection(port, host);
      
      const timeout = setTimeout(() => {
        logError(`[Network] TCP connection timeout to ${host}:${port}`);
        socket.destroy();
        resolve(false);
      }, 5000);
      
      socket.on('connect', () => {
        clearTimeout(timeout);
        logInfo(`[Network] TCP connection successful to ${host}:${port}`);
        socket.destroy();
        resolve(true);
      });
      
      socket.on('error', (error: any) => {
        clearTimeout(timeout);
        logError(`[Network] TCP connection error: ${error.message}`);
        if (error.code) {
          logError(`[Network] Error code: ${error.code}`);
        }
        resolve(false);
      });
    });
  } catch (error) {
    logError(`[Network] DNS resolution failed for ${host}:`, error);
    return false;
  }
};

const testConnection = async (host: string, port: number): Promise<boolean> => {
  logInfo(`[ESPHome] Testing ESPHome connection to ${host}:${port}`);
  
  // First test basic network connectivity
  const networkOk = await testNetworkConnectivity(host, port);
  if (!networkOk) {
    logError(`[ESPHome] Network connectivity test failed for ${host}:${port}`);
    logError(`[ESPHome] Please check:`);
    logError(`  1. The ESP32 device is powered on and connected to your network`);
    logError(`  2. The hostname/IP address is correct`);
    logError(`  3. The device is on the same network as this machine`);
    logError(`  4. Try using the IP address instead of hostname if DNS resolution fails`);
    return false;
  }
  
  const connection = new Connection({
    host,
    port,
  });
  
  return new Promise<boolean>((resolve) => {
    const timeout = setTimeout(() => {
      logError(`[ESPHome] Connection timeout for ${host}:${port}`);
      connection.disconnect();
      resolve(false);
    }, 10000); // Increased timeout to 10 seconds
    
    connection.once('error', (error) => {
      clearTimeout(timeout);
      logError(`[ESPHome] Connection error: ${error}`);
      if (error.code) {
        logError(`[ESPHome] Error code: ${error.code}`);
      }
      connection.disconnect();
      resolve(false);
    });
    
    connection.once('authorized', async () => {
      clearTimeout(timeout);
      logInfo(`[ESPHome] Successfully connected to ${host}:${port}`);
      
      try {
        // Test if the device has BLE proxy capabilities
        const deviceInfo = await connection.deviceInfoService();
        logInfo(`[ESPHome] Device info:`, JSON.stringify(deviceInfo, null, 2));
        
        const bluetoothProxyFeatureFlags = (deviceInfo as any)?.bluetoothProxyFeatureFlags;
        if (bluetoothProxyFeatureFlags) {
          logInfo(`[ESPHome] BLE proxy features detected: ${bluetoothProxyFeatureFlags}`);
        } else {
          logWarn(`[ESPHome] No BLE proxy features detected on ${host}`);
          logWarn(`[ESPHome] This ESP32 device may not have BLE proxy configured`);
          logWarn(`[ESPHome] Please check your ESPHome configuration includes BLE proxy`);
        }
      } catch (error) {
        logError(`[ESPHome] Error getting device info:`, error);
      }
      
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
  const host = args[0] || 'esp32-bluetooth-proxy-5f037c.local';
  const port = parseInt(args[1] || '6053', 10);
  
  logInfo(`[Test] Starting comprehensive connection test...`);
  logInfo(`[Test] Target: ${host}:${port}`);
  
  testConnection(host, port)
    .then((success) => {
      if (success) {
        logInfo('[Test] ✅ ESPHome connection test successful');
        logInfo('[Test] Your ESP32 device is properly configured and accessible');
        process.exit(0);
      } else {
        logError('[Test] ❌ ESPHome connection test failed');
        logError('[Test] Please check the error messages above for troubleshooting steps');
        process.exit(1);
      }
    })
    .catch((error) => {
      logError('[Test] ❌ Test error:', error);
      process.exit(2);
    });
}

export { testConnection, testNetworkConnectivity }; 