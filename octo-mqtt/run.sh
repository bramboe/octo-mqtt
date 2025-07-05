#!/usr/bin/with-contenv bashio

# Log startup with unique identifier
bashio::log.info "🚀 Starting Octo MQTT addon v2.0.0..."
bashio::log.info "📅 Build: v2025.05.24.1"
bashio::log.info "⚡ Process ID: $$"

# Check if any Node.js processes are already running on port 8099
if netstat -tulpn 2>/dev/null | grep -q ':8099 '; then
    bashio::log.warning "⚠️  Port 8099 already in use! Killing existing processes..."
    pkill -f "node.*index.js" || true
    sleep 2
fi

# Create data directory
mkdir -p /data

# Log debug info
bashio::log.info "Working directory: $(pwd)"
bashio::log.info "Node version: $(node --version)"
bashio::log.info "Files:"
ls -la

# Create default config if needed
if [ ! -f "/data/options.json" ]; then
    bashio::log.info "Creating default config..."
    cat > /data/options.json << 'EOF'
{
  "mqtt_host": "<auto_detect>",
  "mqtt_port": "<auto_detect>",
  "mqtt_user": "<auto_detect>",
  "mqtt_password": "<auto_detect>",
  "bleProxies": [
    {
      "host": "192.168.1.100",
      "port": 6053
    }
  ],
  "octoDevices": []
}
EOF
fi

# Check MQTT service availability
bashio::log.info "Checking MQTT service availability..."
if bashio::services.available "mqtt"; then
    bashio::log.info "✅ MQTT service is available"
    MQTT_HOST=$(bashio::services.mqtt "host")
    MQTT_PORT=$(bashio::services.mqtt "port")
    bashio::log.info "MQTT Host: $MQTT_HOST"
    bashio::log.info "MQTT Port: $MQTT_PORT"
else
    bashio::log.warning "⚠️  MQTT service not available - will use fallback configuration"
fi

# Final startup message
bashio::log.info "🎯 Starting Node.js application..."

# Start Node.js app with proper error handling
exec node index.js
