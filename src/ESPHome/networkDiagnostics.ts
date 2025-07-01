import { logInfo, logWarn, logError } from '../Utils/logger';
import { createConnection } from 'net';
import { promises as dns } from 'dns';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface NetworkDiagnosticResult {
  host: string;
  port: number;
  dnsResolution: boolean;
  pingResult: boolean;
  tcpConnectivity: boolean;
  espHomeConnectivity: boolean;
  errors: string[];
}

const checkDNSResolution = async (host: string): Promise<boolean> => {
  try {
    const isIPAddress = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(host);
    
    if (isIPAddress) {
      logInfo(`[Network] Host is an IP address: ${host}`);
      return true;
    }
    
    logInfo(`[Network] Resolving hostname: ${host}`);
    const addresses = await dns.resolve4(host);
    logInfo(`[Network] Resolved ${host} to: ${addresses.join(', ')}`);
    return true;
  } catch (error) {
    logError(`[Network] DNS resolution failed for ${host}:`, error);
    return false;
  }
};

const checkPingConnectivity = async (host: string): Promise<boolean> => {
  try {
    logInfo(`[Network] Testing ping connectivity to ${host}`);
    
    // Use system ping command
    const { stdout, stderr } = await execAsync(`ping -c 3 -W 5 ${host}`);
    
    if (stderr) {
      logWarn(`[Network] Ping stderr: ${stderr}`);
    }
    
    // Check if ping was successful
    const success = stdout.includes('3 packets transmitted, 3 received') || 
                   stdout.includes('3 packets transmitted, 2 received') ||
                   stdout.includes('3 packets transmitted, 1 received');
    
    if (success) {
      logInfo(`[Network] Ping successful to ${host}`);
      return true;
    } else {
      logError(`[Network] Ping failed to ${host}`);
      logError(`[Network] Ping output: ${stdout}`);
      return false;
    }
  } catch (error) {
    logError(`[Network] Ping error for ${host}:`, error);
    return false;
  }
};

const checkTCPConnectivity = async (host: string, port: number): Promise<boolean> => {
  return new Promise<boolean>((resolve) => {
    logInfo(`[Network] Testing TCP connection to ${host}:${port}`);
    
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
};

const checkESPHomeConnectivity = async (host: string, port: number): Promise<boolean> => {
  try {
    logInfo(`[ESPHome] Testing ESPHome connectivity to ${host}:${port}`);
    
    // Import the ESPHome native API
    const { Connection } = require('@2colors/esphome-native-api');
    
    const connection = new Connection({
      host,
      port
    });
    
    return new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => {
        logError(`[ESPHome] Connection timeout for ${host}:${port}`);
        connection.disconnect();
        resolve(false);
      }, 10000);
      
      connection.once('error', (error: any) => {
        clearTimeout(timeout);
        logError(`[ESPHome] Connection error: ${error.message}`);
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
          const deviceInfo = await connection.deviceInfoService();
          logInfo(`[ESPHome] Device info:`, JSON.stringify(deviceInfo, null, 2));
          
          const bluetoothProxyFeatureFlags = (deviceInfo as any)?.bluetoothProxyFeatureFlags;
          if (bluetoothProxyFeatureFlags) {
            logInfo(`[ESPHome] BLE proxy features detected: ${bluetoothProxyFeatureFlags}`);
          } else {
            logWarn(`[ESPHome] No BLE proxy features detected on ${host}`);
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
  } catch (error) {
    logError(`[ESPHome] ESPHome connectivity test error:`, error);
    return false;
  }
};

const runNetworkDiagnostics = async (host: string, port: number): Promise<NetworkDiagnosticResult> => {
  const result: NetworkDiagnosticResult = {
    host,
    port,
    dnsResolution: false,
    pingResult: false,
    tcpConnectivity: false,
    espHomeConnectivity: false,
    errors: []
  };
  
  logInfo(`[Diagnostics] Starting comprehensive network diagnostics for ${host}:${port}`);
  
  // Test DNS resolution
  result.dnsResolution = await checkDNSResolution(host);
  if (!result.dnsResolution) {
    result.errors.push('DNS resolution failed');
  }
  
  // Test ping connectivity
  result.pingResult = await checkPingConnectivity(host);
  if (!result.pingResult) {
    result.errors.push('Ping connectivity failed');
  }
  
  // Test TCP connectivity
  result.tcpConnectivity = await checkTCPConnectivity(host, port);
  if (!result.tcpConnectivity) {
    result.errors.push('TCP connectivity failed');
  }
  
  // Test ESPHome connectivity
  if (result.tcpConnectivity) {
    result.espHomeConnectivity = await checkESPHomeConnectivity(host, port);
    if (!result.espHomeConnectivity) {
      result.errors.push('ESPHome connectivity failed');
    }
  }
  
  // Summary
  logInfo(`[Diagnostics] Network diagnostics complete for ${host}:${port}`);
  logInfo(`[Diagnostics] DNS Resolution: ${result.dnsResolution ? '✅' : '❌'}`);
  logInfo(`[Diagnostics] Ping Connectivity: ${result.pingResult ? '✅' : '❌'}`);
  logInfo(`[Diagnostics] TCP Connectivity: ${result.tcpConnectivity ? '✅' : '❌'}`);
  logInfo(`[Diagnostics] ESPHome Connectivity: ${result.espHomeConnectivity ? '✅' : '❌'}`);
  
  if (result.errors.length > 0) {
    logError(`[Diagnostics] Issues found: ${result.errors.join(', ')}`);
  } else {
    logInfo(`[Diagnostics] All connectivity tests passed!`);
  }
  
  return result;
};

// Allow running from command line
if (require.main === module) {
  const args = process.argv.slice(2);
  const host = args[0] || '192.168.2.102';
  const port = parseInt(args[1] || '6053', 10);
  
  logInfo(`[Diagnostics] Starting network diagnostics...`);
  logInfo(`[Diagnostics] Target: ${host}:${port}`);
  
  runNetworkDiagnostics(host, port)
    .then((result) => {
      if (result.errors.length === 0) {
        logInfo('[Diagnostics] ✅ All connectivity tests passed');
        logInfo('[Diagnostics] Your ESPHome device is accessible and properly configured');
        process.exit(0);
      } else {
        logError('[Diagnostics] ❌ Connectivity issues detected');
        logError('[Diagnostics] Please check the error messages above for troubleshooting steps');
        process.exit(1);
      }
    })
    .catch((error) => {
      logError('[Diagnostics] ❌ Diagnostic error:', error);
      process.exit(2);
    });
}

export { runNetworkDiagnostics };
export type { NetworkDiagnosticResult }; 