#!/bin/bash

# Log startup with unique identifier
echo "🚀 Starting Octo MQTT addon v2.0.4..."
echo "📅 Build: v2025.05.25.8"
echo "⚡ Process ID: $$"
echo "🔧 Repository: https://github.com/bramboe/octo-mqtt"
echo "🏷️  Git Tag: v2.0.4"

# Check if any Node.js processes are already running on port 8099
if netstat -tulpn 2>/dev/null | grep -q ':8099 '; then
    echo "⚠️  Port 8099 already in use! Killing existing processes..."
    pkill -f "node.*8099" || true
    sleep 2
fi

# Create data directory
mkdir -p /data

# Log debug info
echo "Working directory: $(pwd)"
echo "Node version: $(node --version)"
echo "Files:"
ls -la

# Check which version we're actually running
if [ -f "dist/tsc/index.js" ]; then
    echo "✅ TypeScript build found: dist/tsc/index.js"
    echo "📊 Built file size: $(ls -lh dist/tsc/index.js | awk '{print $5}')"
    MAIN_FILE="dist/tsc/index.js"
elif [ -f "index.js" ]; then
    echo "⚠️  Using fallback debug index.js - this indicates a caching issue!"
    echo "🚨 Home Assistant may be using an old cached version of the repository"
    MAIN_FILE="index.js"
else
    echo "❌ No main file found! Neither dist/tsc/index.js nor index.js exists"
    exit 1
fi

# Read Home Assistant configuration
CONFIG_FILE="/data/options.json"

# Create default config if needed
if [ ! -f "$CONFIG_FILE" ]; then
    echo "Creating default config..."
    cat > "$CONFIG_FILE" << 'EOF'
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

# Read configuration values using jq (if available) or fallback to defaults
if command -v jq >/dev/null 2>&1; then
    MQTT_HOST=$(jq -r '.mqtt_host // "core-mosquitto"' "$CONFIG_FILE")
    MQTT_PORT=$(jq -r '.mqtt_port // 1883' "$CONFIG_FILE")
    MQTT_USERNAME=$(jq -r '.mqtt_username // ""' "$CONFIG_FILE")
    MQTT_PASSWORD=$(jq -r '.mqtt_password // ""' "$CONFIG_FILE")
    LOG_LEVEL=$(jq -r '.log_level // "info"' "$CONFIG_FILE")
else
    echo "⚠️  jq not available, using default values"
    MQTT_HOST="core-mosquitto"
    MQTT_PORT="1883"
    MQTT_USERNAME=""
    MQTT_PASSWORD=""
    LOG_LEVEL="info"
fi

# Export environment variables for the application
export MQTT_HOST="$MQTT_HOST"
export MQTT_PORT="$MQTT_PORT"
export MQTT_USERNAME="$MQTT_USERNAME"
export MQTT_PASSWORD="$MQTT_PASSWORD"
export LOG_LEVEL="$LOG_LEVEL"

# Log configuration (hide password)
echo "📋 Configuration:"
echo "  MQTT Host: $MQTT_HOST"
echo "  MQTT Port: $MQTT_PORT"
echo "  MQTT Username: $MQTT_USERNAME"
echo "  MQTT Password: $([ -n "$MQTT_PASSWORD" ] && echo '<set>' || echo '<empty>')"
echo "  Log Level: $LOG_LEVEL"

# Final startup message
echo "🎯 Starting application with: $MAIN_FILE"

# Start the application with proper error handling
exec node "$MAIN_FILE"
