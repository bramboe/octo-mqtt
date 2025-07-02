import { logInfo, logWarn, logError } from '../Utils/logger';
import { createSocket } from 'dgram';

/**
 * Utility to discover ESPHome devices on the network
 * ESPHome devices broadcast their presence via UDP
 */

interface DiscoveredDevice {
  host: string;
  port: number;
  name: string;
  version: string;
}

const discoverESPHomeDevices = (): Promise<DiscoveredDevice[]> => {
  return new Promise((resolve) => {
    const devices = new Map<string, DiscoveredDevice>();
    const socket = createSocket('udp4');
    
    socket.on('error', (error) => {
      logError('[Discovery] UDP socket error:', error);
      socket.close();
      resolve(Array.from(devices.values()));
    });
    
    socket.on('message', (message, remote) => {
      try {
        // ESPHome devices send JSON data via UDP
        const data = JSON.parse(message.toString());
        if (data && data.name) {
          const device: DiscoveredDevice = {
            host: remote.address,
            port: data.port || 6053,
            name: data.name,
            version: data.version || 'unknown'
          };
          
          const key = `${device.host}:${device.port}`;
          devices.set(key, device);
          logInfo(`[Discovery] Found ESPHome device: ${device.name} at ${device.host}:${device.port} (v${device.version})`);
        }
      } catch (error) {
        // Ignore non-JSON messages
      }
    });
    
    socket.on('listening', () => {
      logInfo('[Discovery] Listening for ESPHome devices...');
      logInfo('[Discovery] Broadcasting discovery request...');
      
      // Send discovery broadcast
      const discoveryMessage = JSON.stringify({ type: 'discovery' });
      socket.send(discoveryMessage, 6053, '255.255.255.255');
    });
    
    // Set timeout and close socket
    setTimeout(() => {
      logInfo(`[Discovery] Discovery complete. Found ${devices.size} device(s)`);
      socket.close();
      resolve(Array.from(devices.values()));
    }, 10000); // 10 second timeout
    
    socket.bind();
  });
};

// Allow running from command line
if (require.main === module) {
  logInfo('[Discovery] Starting ESPHome device discovery...');
  logInfo('[Discovery] This will scan your network for ESPHome devices');
  
  discoverESPHomeDevices()
    .then((devices) => {
      if (devices.length === 0) {
        logWarn('[Discovery] No ESPHome devices found on the network');
        logWarn('[Discovery] Please check:');
        logWarn('  1. Your ESPHome devices are powered on and connected to WiFi');
        logWarn('  2. You are on the same network as the ESPHome devices');
        logWarn('  3. Your firewall allows UDP traffic on port 6053');
      } else {
        logInfo('[Discovery] Found devices:');
        devices.forEach((device, index) => {
          logInfo(`  ${index + 1}. ${device.name} - ${device.host}:${device.port} (v${device.version})`);
        });
        logInfo('[Discovery] Update your configuration with the correct host and port');
      }
    })
    .catch((error) => {
      logError('[Discovery] Discovery error:', error);
    });
}

export { discoverESPHomeDevices };
export type { DiscoveredDevice }; 