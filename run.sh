#!/usr/bin/with-contenv bashio
# ==============================================================================
# Start the Octo MQTT service
# ==============================================================================

# Enable full error stack traces for debugging
export NODE_OPTIONS="--trace-warnings --trace-uncaught"

# Get MQTT configuration
if bashio::config.is_default 'mqtt_host'; then
    if bashio::services.available 'mqtt'; then
        export MQTTHOST=$(bashio::services mqtt "host")
        if [ "$MQTTHOST" = 'localhost' ] || [ "$MQTTHOST" = '127.0.0.1' ]; then
            bashio::log.info "Overriding localhost MQTT host with core-mosquitto"
            export MQTTHOST="core-mosquitto"
        fi
        bashio::log.info "Using discovered MQTT Host: ${MQTTHOST}"
    else
        export MQTTHOST="172.30.32.1"
        bashio::log.info "No MQTT service found, using default host: ${MQTTHOST}"
    fi
else
    export MQTTHOST=$(bashio::config "mqtt_host")
    bashio::log.info "Using configured MQTT Host: ${MQTTHOST}"
fi

if bashio::config.is_default 'mqtt_port'; then
    if bashio::services.available 'mqtt'; then
        export MQTTPORT=$(bashio::services mqtt "port")
        bashio::log.info "Using discovered MQTT Port: ${MQTTPORT}"
    else
        export MQTTPORT="1883"
        bashio::log.info "Using default MQTT Port: ${MQTTPORT}"
    fi
else
    export MQTTPORT=$(bashio::config "mqtt_port")
    bashio::log.info "Using configured MQTT Port: ${MQTTPORT}"
fi

if bashio::config.is_default 'mqtt_user'; then
    if bashio::services.available 'mqtt'; then
        export MQTTUSER=$(bashio::services mqtt "username")
        bashio::log.info "Using discovered MQTT User: ${MQTTUSER}"
    else
        export MQTTUSER=""
        bashio::log.info "Using anonymous MQTT connection"
    fi
else
    export MQTTUSER=$(bashio::config "mqtt_user")
    bashio::log.info "Using configured MQTT User: ${MQTTUSER}"
fi

if bashio::config.is_default 'mqtt_password'; then
    if bashio::services.available 'mqtt'; then
        export MQTTPASSWORD=$(bashio::services mqtt "password")
        bashio::log.info "Using discovered MQTT password"
    else
        export MQTTPASSWORD=""
        bashio::log.info "Using anonymous MQTT connection"
    fi
else
    export MQTTPASSWORD=$(bashio::config "mqtt_password")
    bashio::log.info "Using configured MQTT password"
fi

# Debug info
bashio::log.info "Starting Octo-MQTT with the following configuration:"
bashio::log.info "- MQTT Host: ${MQTTHOST}"
bashio::log.info "- MQTT Port: ${MQTTPORT}"
bashio::log.info "- BLE Proxy count: $(bashio::config 'bleProxies | length')"
bashio::log.info "- Octo device count: $(bashio::config 'octoDevices | length')"

cd /app || bashio::exit.nok "Could not change to app directory"

# Start the application
bashio::log.info "Starting Octo MQTT..."
exec node index.js
