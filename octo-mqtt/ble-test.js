#!/usr/bin/env node

// Simple test script to verify BLE functionality
const logInfo = (msg) => console.log(`[INFO] ${msg}`);
const logError = (msg, error) => console.error(`[ERROR] ${msg}`, error);

async function testBLE() {
  try {
    logInfo('Starting BLE test...');
    
    // Import the ESPHome native API
    const { Connection } = require('@2colors/esphome-native-api');
    
    // Configuration from config.json
    const config = {
      host: '192.168.2.102',
      port: 6053
    };
    
    logInfo(`Connecting to ESPHome at ${config.host}:${config.port}...`);
    
    // Create a connection to ESPHome
    const connection = new Connection(config);
    
    // Setup error handler
    connection.on('error', (error) => {
      logError('Connection error:', error);
    });
    
    // Connection handler
    connection.on('authorized', async () => {
      logInfo('Connected to ESPHome!');
      
      try {
        // Get device info
        const deviceInfo = await connection.deviceInfoService();
        logInfo('Device info:', JSON.stringify(deviceInfo));
        
        // List all available BLE devices
        logInfo('Searching for BLE devices...');
        await connection.subscribeBluetoothAdvertisementService();
        
        // Listen for BLE advertisements for 10 seconds
        setTimeout(() => {
          logInfo('Test completed, disconnecting...');
          connection.disconnect();
          process.exit(0);
        }, 10000);
      } catch (error) {
        logError('Error during BLE operations:', error);
        connection.disconnect();
        process.exit(1);
      }
    });
    
    // Connect to ESPHome
    connection.connect();
    
  } catch (error) {
    logError('Error during BLE test:', error);
    process.exit(1);
  }
}

// Run the test
testBLE(); 