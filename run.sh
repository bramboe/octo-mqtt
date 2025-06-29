#!/usr/bin/env bashio

export MQTTHOST=$(bashio::config "mqtt_host")
export MQTTPORT=$(bashio::config "mqtt_port")
export MQTTUSER=$(bashio::config "mqtt_user")
export MQTTPASSWORD=$(bashio::config "mqtt_password")

# Enable full error stack traces for debugging
export NODE_OPTIONS="--trace-warnings --trace-uncaught"

# Debug: Print all environment variables
echo "=== Environment Variables ==="
echo "MQTTHOST: ${MQTTHOST}"
echo "MQTTPORT: ${MQTTPORT}"
echo "MQTTUSER: ${MQTTUSER}"
echo "MQTTPASSWORD: ${MQTTPASSWORD:0:3}***"
echo "NODE_OPTIONS: ${NODE_OPTIONS}"
echo "=============================="

if [ $MQTTHOST = '<auto_detect>' ]; then
    if bashio::services.available 'mqtt'; then
        MQTTHOST=$(bashio::services mqtt "host")
	if [ $MQTTHOST = 'localhost' ] || [ $MQTTHOST = '127.0.0.1' ]; then
	    echo "Discovered invalid value for MQTT host: ${MQTTHOST}"
	    echo "Overriding with default alias for Mosquitto MQTT addon"
	    MQTTHOST="core-mosquitto"
	fi
        echo "Using discovered MQTT Host: ${MQTTHOST}"
    else
    	echo "No Home Assistant MQTT service found, using defaults"
        MQTTHOST="172.30.32.1"
        echo "Using default MQTT Host: ${MQTTHOST}"
    fi
else
    echo "Using configured MQTT Host: ${MQTTHOST}"
fi

if [ $MQTTPORT = '<auto_detect>' ]; then
    if bashio::services.available 'mqtt'; then
        MQTTPORT=$(bashio::services mqtt "port")
        echo "Using discovered MQTT Port: ${MQTTPORT}"
    else
        MQTTPORT="1883"
        echo "Using default MQTT Port: ${MQTTPORT}"
    fi
else
    echo "Using configured MQTT Port: ${MQTTPORT}"
fi

if [ $MQTTUSER = '<auto_detect>' ]; then
    if bashio::services.available 'mqtt'; then
        MQTTUSER=$(bashio::services mqtt "username")
        echo "Using discovered MQTT User: ${MQTTUSER}"
    else
        MQTTUSER=""
        echo "Using anonymous MQTT connection"
    fi
else
    echo "Using configured MQTT User: ${MQTTUSER}"
fi

if [ $MQTTPASSWORD = '<auto_detect>' ]; then
    if bashio::services.available 'mqtt'; then
        MQTTPASSWORD=$(bashio::services mqtt "password")
        echo "Using discovered MQTT password: <hidden>"
    else
        MQTTPASSWORD=""
    fi
else
    echo "Using configured MQTT password: <hidden>"
fi

# Debug info
echo "Starting Octo-MQTT with the following configuration:"
echo "- MQTT Host: ${MQTTHOST}"
echo "- MQTT Port: ${MQTTPORT}"
echo "- BLE Proxy count: $(bashio::config 'bleProxies | length')"
echo "- Octo device count: $(bashio::config 'octoDevices | length')"

echo "Contents of /octo-mqtt/dist before starting Node.js:" 
ls -l /octo-mqtt/dist

# Export the final values for Node.js
export MQTTHOST
export MQTTPORT
export MQTTUSER
export MQTTPASSWORD

# Run without debugger for better stability
node dist/index.js
