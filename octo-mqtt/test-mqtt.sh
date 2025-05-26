#!/bin/bash

echo "🔍 MQTT Connection Diagnostics"
echo "=============================="

# Test network connectivity
echo "📡 Testing network connectivity..."
if ping -c 1 core-mosquitto >/dev/null 2>&1; then
    echo "✅ Can reach core-mosquitto"
else
    echo "❌ Cannot reach core-mosquitto"
    echo "🔍 Trying localhost..."
    if ping -c 1 localhost >/dev/null 2>&1; then
        echo "✅ Can reach localhost"
    else
        echo "❌ Cannot reach localhost"
    fi
fi

# Test port connectivity
echo "🔌 Testing port connectivity..."
if nc -z core-mosquitto 1883 2>/dev/null; then
    echo "✅ Port 1883 is open on core-mosquitto"
else
    echo "❌ Port 1883 is not accessible on core-mosquitto"
fi

# Test with mosquitto_pub if available
if command -v mosquitto_pub >/dev/null 2>&1; then
    echo "🧪 Testing MQTT publish (anonymous)..."
    if mosquitto_pub -h core-mosquitto -p 1883 -t "test/topic" -m "test message" -q 0 2>/dev/null; then
        echo "✅ Anonymous MQTT publish successful"
    else
        echo "❌ Anonymous MQTT publish failed"
    fi
else
    echo "⚠️  mosquitto_pub not available for testing"
fi

# Show current configuration
echo "📋 Current configuration:"
echo "  CONFIG_FILE: ${CONFIG_FILE:-/data/options.json}"
if [ -f "${CONFIG_FILE:-/data/options.json}" ]; then
    echo "  Content:"
    cat "${CONFIG_FILE:-/data/options.json}" | jq . 2>/dev/null || cat "${CONFIG_FILE:-/data/options.json}"
else
    echo "  ❌ Config file not found"
fi

echo "🌐 Environment variables:"
echo "  MQTT_HOST: ${MQTT_HOST:-<not set>}"
echo "  MQTT_PORT: ${MQTT_PORT:-<not set>}"
echo "  MQTT_USERNAME: ${MQTT_USERNAME:-<not set>}"
echo "  MQTT_PASSWORD: $([ -n "$MQTT_PASSWORD" ] && echo '<set>' || echo '<not set>')"

echo "=============================="
echo "🏁 Diagnostics complete" 