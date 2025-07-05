#!/usr/bin/with-contenv bashio

# Function to safely log messages with bashio fallback
log_message() {
    local level=$1
    local message=$2
    if command -v bashio >/dev/null 2>&1; then
        case $level in
            "info") bashio::log.info "$message" 2>/dev/null || echo "[$(date '+%Y-%m-%d %H:%M:%S')] [INFO] $message" ;;
            "warning") bashio::log.warning "$message" 2>/dev/null || echo "[$(date '+%Y-%m-%d %H:%M:%S')] [WARN] $message" ;;
            "error") bashio::log.error "$message" 2>/dev/null || echo "[$(date '+%Y-%m-%d %H:%M:%S')] [ERROR] $message" ;;
            *) echo "[$(date '+%Y-%m-%d %H:%M:%S')] [$level] $message" ;;
        esac
    else
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] [$level] $message"
    fi
}

# Function to check if bashio services are available
check_bashio_service() {
    local service=$1
    if command -v bashio >/dev/null 2>&1; then
        bashio::services.available "$service" 2>/dev/null
    else
        return 1
    fi
}

# Function to get bashio service info
get_bashio_service_info() {
    local service=$1
    local info=$2
    if command -v bashio >/dev/null 2>&1; then
        bashio::services."$service" "$info" 2>/dev/null || echo ""
    else
        echo ""
    fi
}

# Log startup with unique identifier
log_message "info" "🚀 Starting Octo MQTT addon v2.0.4..."
log_message "info" "📅 Build: v2025.07.05.3"
log_message "info" "⚡ Process ID: $$"

# Check if any Node.js processes are already running on port 8099
if netstat -tulpn 2>/dev/null | grep -q ':8099 '; then
    log_message "warning" "⚠️  Port 8099 already in use! Killing existing processes..."
    pkill -f "node.*index.js" || true
    sleep 2
fi

# Create data directory
mkdir -p /data

# Log debug info
log_message "info" "Working directory: $(pwd)"
log_message "info" "Node version: $(node --version)"
log_message "info" "Files:"
ls -la

# Create default config if needed
if [ ! -f "/data/options.json" ]; then
    log_message "info" "Creating default config..."
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

# Simple MQTT configuration - using Home Assistant MQTT broker
log_message "info" "🔧 Using Home Assistant MQTT configuration (core-mosquitto:1883)"
log_message "info" "📝 This connects to the Home Assistant MQTT broker service"

# Final startup message
log_message "info" "🎯 Starting Node.js application..."

# Start Node.js app with proper error handling
exec node index.js
