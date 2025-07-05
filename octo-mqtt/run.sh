#!/usr/bin/with-contenv bashio

# Function to safely log messages with bashio fallback
log_message() {
    local level=$1
    local message=$2
    if command -v bashio >/dev/null 2>&1; then
        case $level in
            "info") bashio::log.info "$message" ;;
            "warning") bashio::log.warning "$message" ;;
            "error") bashio::log.error "$message" ;;
            *) echo "[$level] $message" ;;
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
log_message "info" "🚀 Starting Octo MQTT addon v2.0.0..."
log_message "info" "📅 Build: v2025.05.24.1"
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

# Check MQTT service availability
log_message "info" "Checking MQTT service availability..."

# Try multiple methods to get MQTT credentials
MQTT_HOST=""
MQTT_PORT=""
MQTT_USER=""
MQTT_PASS=""

# Method 1: Try bashio services
if check_bashio_service "mqtt"; then
    log_message "info" "✅ MQTT service is available via bashio"
    MQTT_HOST=$(get_bashio_service_info "mqtt" "host")
    MQTT_PORT=$(get_bashio_service_info "mqtt" "port")
    MQTT_USER=$(get_bashio_service_info "mqtt" "username")
    MQTT_PASS=$(get_bashio_service_info "mqtt" "password")
    
    if [ -n "$MQTT_HOST" ] && [ -n "$MQTT_PORT" ]; then
        log_message "info" "MQTT Host: $MQTT_HOST"
        log_message "info" "MQTT Port: $MQTT_PORT"
        if [ -n "$MQTT_USER" ]; then
            log_message "info" "MQTT User: $MQTT_USER"
        fi
    else
        log_message "warning" "⚠️  bashio MQTT service detected but could not get connection details"
    fi
fi

# Method 2: Try to read from Home Assistant configuration
if [ -z "$MQTT_HOST" ] || [ -z "$MQTT_PORT" ]; then
    log_message "info" "🔍 Trying to read MQTT configuration from Home Assistant..."
    
    # Try to read from configuration.yaml
    if [ -f "/config/configuration.yaml" ]; then
        log_message "info" "📄 Found configuration.yaml, checking for MQTT settings..."
        
        # Extract MQTT host and port from configuration
        CONFIG_HOST=$(grep -E "^\s*host:\s*" /config/configuration.yaml | head -1 | sed 's/.*host:\s*//' | tr -d ' "')
        CONFIG_PORT=$(grep -E "^\s*port:\s*" /config/configuration.yaml | head -1 | sed 's/.*port:\s*//' | tr -d ' "')
        
        if [ -n "$CONFIG_HOST" ]; then
            MQTT_HOST="$CONFIG_HOST"
            log_message "info" "📋 Found MQTT host in config: $MQTT_HOST"
        fi
        
        if [ -n "$CONFIG_PORT" ]; then
            MQTT_PORT="$CONFIG_PORT"
            log_message "info" "📋 Found MQTT port in config: $MQTT_PORT"
        fi
    fi
    
    # Try to read from secrets.yaml
    if [ -f "/config/secrets.yaml" ]; then
        log_message "info" "🔐 Found secrets.yaml, checking for MQTT credentials..."
        
        SECRET_USER=$(grep -E "^\s*mqtt_username:\s*" /config/secrets.yaml | head -1 | sed 's/.*mqtt_username:\s*//' | tr -d ' "')
        SECRET_PASS=$(grep -E "^\s*mqtt_password:\s*" /config/secrets.yaml | head -1 | sed 's/.*mqtt_password:\s*//' | tr -d ' "')
        
        if [ -n "$SECRET_USER" ]; then
            MQTT_USER="$SECRET_USER"
            log_message "info" "🔐 Found MQTT username in secrets: $MQTT_USER"
        fi
        
        if [ -n "$SECRET_PASS" ]; then
            MQTT_PASS="$SECRET_PASS"
            log_message "info" "🔐 Found MQTT password in secrets"
        fi
    fi
fi

# Method 3: Try common Home Assistant defaults
if [ -z "$MQTT_HOST" ]; then
    MQTT_HOST="core-mosquitto"
    log_message "info" "🏠 Using default MQTT host: $MQTT_HOST"
fi

if [ -z "$MQTT_PORT" ]; then
    MQTT_PORT="1883"
    log_message "info" "🏠 Using default MQTT port: $MQTT_PORT"
fi

# Method 4: Try common MQTT credentials
if [ -z "$MQTT_USER" ]; then
    # Try common Home Assistant MQTT credentials
    COMMON_CREDS=("mqtt:mqtt" "homeassistant:homeassistant" "admin:admin" "hass:hass")
    
    for cred in "${COMMON_CREDS[@]}"; do
        IFS=':' read -r user pass <<< "$cred"
        log_message "info" "🔑 Trying common credentials: $user"
        
        # Test connection with these credentials
        if command -v mosquitto_pub >/dev/null 2>&1; then
            if timeout 5 mosquitto_pub -h "$MQTT_HOST" -p "$MQTT_PORT" -u "$user" -P "$pass" -t "test/connection" -m "test" >/dev/null 2>&1; then
                MQTT_USER="$user"
                MQTT_PASS="$pass"
                log_message "info" "✅ Found working MQTT credentials: $user"
                break
            fi
        fi
    done
fi

# Update options.json with detected MQTT settings
if [ -n "$MQTT_HOST" ] && [ -n "$MQTT_PORT" ]; then
    log_message "info" "📝 Updating options.json with detected MQTT settings..."
    jq --arg host "$MQTT_HOST" \
       --arg port "$MQTT_PORT" \
       --arg user "${MQTT_USER:-}" \
       --arg pass "${MQTT_PASS:-}" \
       '.mqtt_host = $host | .mqtt_port = $port | .mqtt_user = $user | .mqtt_password = $pass' \
       /data/options.json > /data/options.json.tmp && mv /data/options.json.tmp /data/options.json
    
    # Set environment variables for Node.js to use (only if we have credentials)
    if [ -n "$MQTT_USER" ]; then
        export MQTT_USERNAME="$MQTT_USER"
        export MQTT_PASSWORD="$MQTT_PASS"
        log_message "info" "🔧 Set environment variables for MQTT credentials"
    else
        log_message "info" "🔧 No MQTT credentials found, will try anonymous connection"
    fi
else
    log_message "warning" "⚠️  Could not detect MQTT settings, will use fallback configuration"
fi

# Final startup message
log_message "info" "🎯 Starting Node.js application..."

# Start Node.js app with proper error handling
exec node index.js
