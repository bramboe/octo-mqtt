#!/usr/bin/with-contenv bashio

# Log startup with unique identifier
bashio::log.info "🚀 Starting Octo MQTT addon v2.0.5..."
bashio::log.info "📅 Build: v2025.05.26.1"
bashio::log.info "⚡ Process ID: $$"
bashio::log.info "🔧 Repository: https://github.com/bramboe/octo-mqtt"
bashio::log.info "🏷️  Git Tag: v2.0.5"

# Check if any Node.js processes are already running on port 8099
if netstat -tulpn 2>/dev/null | grep -q ':8099 '; then
    bashio::log.warning "⚠️  Port 8099 already in use! Killing existing processes..."
    pkill -f "node.*8099" || true
    sleep 2
fi

# Create data directory
mkdir -p /data

# Log debug info
bashio::log.info "Working directory: $(pwd)"
bashio::log.info "Node version: $(node --version)"
bashio::log.info "Files:"
ls -la

# Check which version we're actually running
if [ -f "dist/tsc/index.js" ]; then
    bashio::log.info "✅ TypeScript build found: dist/tsc/index.js"
    bashio::log.info "📊 Built file size: $(ls -lh dist/tsc/index.js | awk '{print $5}')"
    bashio::log.info "🎯 Using TypeScript compiled version"
    MAIN_FILE="dist/tsc/index.js"
elif [ -f "index.js" ]; then
    bashio::log.warning "⚠️  TypeScript build not found, using fallback index.js"
    bashio::log.warning "🔧 This fallback provides basic scan endpoints"
    bashio::log.info "📊 Fallback file size: $(ls -lh index.js | awk '{print $5}')"
    bashio::log.info "🎯 Using fallback JavaScript version"
    MAIN_FILE="index.js"
else
    bashio::log.error "❌ No main file found! Neither dist/tsc/index.js nor index.js exists"
    bashio::log.error "📁 Available files:"
    ls -la
    exit 1
fi

# Create default config if needed
if [ ! -f "/data/options.json" ]; then
    bashio::log.info "Creating default config..."
    cat > /data/options.json << 'EOF'
{
  "mqtt_host": "core-mosquitto",
  "mqtt_port": 1883,
  "mqtt_username": "",
  "mqtt_password": "",
  "esphome_proxies": [],
  "octoDevices": [],
  "log_level": "info"
}
EOF
fi

# Log which endpoints will be available
if [ "$MAIN_FILE" = "dist/tsc/index.js" ]; then
    bashio::log.info "📡 Full TypeScript endpoints available:"
    bashio::log.info "   - Complete BLE scanning with ESPHome integration"
    bashio::log.info "   - Device management and control"
    bashio::log.info "   - WebSocket real-time communication"
    bashio::log.info "   - MQTT integration"
else
    bashio::log.info "📡 Fallback endpoints available:"
    bashio::log.info "   - POST /scan/start (basic response)"
    bashio::log.info "   - GET /scan/status (basic response)"
    bashio::log.info "   - POST /scan/stop (basic response)"
    bashio::log.info "   - GET /health (status check)"
    bashio::log.warning "⚠️  Limited functionality - no actual BLE scanning"
fi

# Final startup message
bashio::log.info "🎯 Starting application with: $MAIN_FILE"

# Start the application with proper error handling
exec node "$MAIN_FILE"
