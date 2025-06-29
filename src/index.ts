import express from 'express';
import { logInfo, logError } from './Utils/logger';
import { getRootOptions } from './Utils/options';

const app = express();
const PORT = process.env.PORT || 8099;

// Middleware
app.use(express.json());
app.use(express.static('webui'));

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Configuration endpoint
app.get('/api/config', (_req, res) => {
  try {
    const config = getRootOptions();
    res.json(config);
  } catch (error) {
    logError('[API] Error getting config:', error);
    res.status(500).json({ error: 'Failed to get configuration' });
  }
});

// Start the server
app.listen(PORT, () => {
  logInfo(`[Octo MQTT] Server started on port ${PORT}`);
  logInfo(`[Octo MQTT] Web interface available at http://localhost:${PORT}`);
  
  // Log configuration
  const config = getRootOptions();
  logInfo(`[Octo MQTT] Configuration loaded:`);
  logInfo(`  - MQTT Host: ${config.mqtt_host}`);
  logInfo(`  - MQTT Port: ${config.mqtt_port}`);
  logInfo(`  - BLE Proxies: ${config.bleProxies?.length || 0}`);
  logInfo(`  - Octo Devices: ${config.octoDevices?.length || 0}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logInfo('[Octo MQTT] Received SIGTERM, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logInfo('[Octo MQTT] Received SIGINT, shutting down gracefully');
  process.exit(0);
});

// Error handling
process.on('uncaughtException', (error) => {
  logError('[Octo MQTT] Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logError('[Octo MQTT] Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
}); 