#!/usr/bin/env bashio

# Log startup with unique identifier
bashio::log.info "🚀 Starting Octo MQTT addon v2.0.4..."
bashio::log.info "📅 Build: v2025.05.25.8"
bashio::log.info "⚡ Process ID: $$"
bashio::log.info "🔧 Repository: https://github.com/bramboe/octo-mqtt"
bashio::log.info "🏷️  Git Tag: v2.0.4"

# Read configuration from Home Assistant
export MQTTHOST=$(bashio::config "mqtt_host")
export MQTTPORT=$(bashio::config "mqtt_port")
export MQTTUSER=$(bashio::config "mqtt_username")
export MQTTPASSWORD=$(bashio::config "mqtt_password")

# Enable full error stack traces for debugging
export NODE_OPTIONS="--trace-warnings --trace-uncaught"

# Auto-detect MQTT Host
if [ "$MQTTHOST" = '<auto_detect>' ]; then
    if bashio::services.available 'mqtt'; then
        MQTTHOST=$(bashio::services mqtt "host")
        if [ "$MQTTHOST" = 'localhost' ] || [ "$MQTTHOST" = '127.0.0.1' ]; then
            bashio::log.info "Discovered invalid value for MQTT host: ${MQTTHOST}"
            bashio::log.info "Overriding with default alias for Mosquitto MQTT addon"
            MQTTHOST="core-mosquitto"
        fi
        bashio::log.info "Using discovered MQTT Host: ${MQTTHOST}"
    else
        bashio::log.info "No Home Assistant MQTT service found, using defaults"
        MQTTHOST="172.30.32.1"
        bashio::log.info "Using default MQTT Host: ${MQTTHOST}"
    fi
else
    bashio::log.info "Using configured MQTT Host: ${MQTTHOST}"
fi

# Auto-detect MQTT Port
if [ "$MQTTPORT" = '<auto_detect>' ]; then
    if bashio::services.available 'mqtt'; then
        MQTTPORT=$(bashio::services mqtt "port")
        bashio::log.info "Using discovered MQTT Port: ${MQTTPORT}"
    else
        MQTTPORT="1883"
        bashio::log.info "Using default MQTT Port: ${MQTTPORT}"
    fi
else
    bashio::log.info "Using configured MQTT Port: ${MQTTPORT}"
fi

# Auto-detect MQTT User
if [ "$MQTTUSER" = '<auto_detect>' ]; then
    if bashio::services.available 'mqtt'; then
        MQTTUSER=$(bashio::services mqtt "username")
        bashio::log.info "Using discovered MQTT User: ${MQTTUSER}"
    else
        MQTTUSER=""
        bashio::log.info "Using anonymous MQTT connection"
    fi
else
    bashio::log.info "Using configured MQTT User: ${MQTTUSER}"
fi

# Auto-detect MQTT Password
if [ "$MQTTPASSWORD" = '<auto_detect>' ]; then
    if bashio::services.available 'mqtt'; then
        MQTTPASSWORD=$(bashio::services mqtt "password")
        bashio::log.info "Using discovered MQTT password: <hidden>"
    else
        MQTTPASSWORD=""
    fi
else
    bashio::log.info "Using configured MQTT password: <hidden>"
fi

# Export the final values for the application
export MQTTHOST
export MQTTPORT
export MQTTUSER
export MQTTPASSWORD

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
    MAIN_FILE="dist/tsc/index.js"
elif [ -f "index.js" ]; then
    bashio::log.warning "⚠️  Using fallback debug index.js - this indicates a caching issue!"
    bashio::log.warning "🚨 Home Assistant may be using an old cached version of the repository"
    MAIN_FILE="index.js"
else
    bashio::log.error "❌ No main file found! Neither dist/tsc/index.js nor index.js exists"
    exit 1
fi

# Create default config if needed
CONFIG_FILE="/data/options.json"
if [ ! -f "$CONFIG_FILE" ]; then
    bashio::log.info "Creating default config..."
    cat > "$CONFIG_FILE" << 'EOF'
{
  "mqtt_host": "<auto_detect>",
  "mqtt_port": "<auto_detect>",
  "mqtt_username": "<auto_detect>",
  "mqtt_password": "<auto_detect>",
  "esphome_proxies": [],
  "octoDevices": [],
  "log_level": "info"
}
EOF
fi

# Debug info
bashio::log.info "Starting Octo-MQTT with the following configuration:"
bashio::log.info "- MQTT Host: ${MQTTHOST}"
bashio::log.info "- MQTT Port: ${MQTTPORT}"
bashio::log.info "- ESPHome Proxy count: $(bashio::config 'esphome_proxies | length')"
bashio::log.info "- Octo device count: $(bashio::config 'octoDevices | length')"

# Final startup message
bashio::log.info "🎯 Starting application with: $MAIN_FILE"

# Start the application with proper error handling
exec node "$MAIN_FILE"
