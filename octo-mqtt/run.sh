#!/usr/bin/with-contenv bashio

# Log startup with unique identifier
echo "🚀 Starting Octo MQTT addon v2.0.6..."
echo "📅 Build: v2025.05.26.3"
echo "⚡ Process ID: $$"
echo "🔧 Repository: https://github.com/bramboe/octo-mqtt"
echo "🏷️  Git Tag: v2.0.6"
echo "🔄 Cache Bust: 20250526203230"

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
    
    # Read MQTT configuration from Home Assistant
    if [ -f "/data/options.json" ]; then
        echo "📋 Configuration:"
        echo "  MQTT Host: $(jq -r '.mqtt_host // "core-mosquitto"' /data/options.json)"
        echo "  MQTT Port: $(jq -r '.mqtt_port // 1883' /data/options.json)"
        echo "  MQTT Username: $(jq -r '.mqtt_user // ""' /data/options.json)"
        echo "  MQTT Password: $(if [ "$(jq -r '.mqtt_password // ""' /data/options.json)" = "" ]; then echo "<empty>"; else echo "<hidden>"; fi)"
        echo "  Log Level: $(jq -r '.log_level // "info"' /data/options.json)"
    fi
    
    echo "🎯 Starting application with: dist/tsc/index.js"
    exec node dist/tsc/index.js
else
    echo "⚠️  TypeScript build not found, using fallback: index.js"
    echo "📄 Fallback file size: $(ls -lh index.js | awk '{print $5}')"
    echo "🎯 Starting fallback application with: index.js"
exec node index.js
fi
