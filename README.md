# 🛏️ Octo MQTT v2.6.7

A Home Assistant add-on to enable controlling Octo adjustable beds via MQTT and ESPHome BLE proxy.

## Features

- Control your Octo bed's elevation for head and feet positions
- Toggle the underbed lighting
- Integration with Home Assistant's MQTT broker
- Support for Octo BLE beds using an ESP32 as a BLE proxy
- BLE Proxy and MQTT connection for Octo beds
- Web UI with live status, scan, and configuration
- **Diagnostics panel** with API call logging and error reporting
- **Test Backend** button to verify backend connectivity
- Robust error handling and clear error banners if backend is unreachable
- Web UI now loads and stays loaded: JS module loader fixed in index.html

## Requirements

1. Home Assistant installation
2. Octo smart bed
3. ESP32 device running ESPHome with BLE proxy configured

## Installation

### Option 1: Using Home Assistant Add-on Repository

1. Navigate to your Home Assistant instance
2. Go to **Settings** → **Add-ons** → **Add-on Store**
3. Click the menu in the top right (⋮) and select **Repositories**
4. Add this repository URL: `https://github.com/bramboe/octo-mqtt`
5. Click **Add**
6. Find the "Octo MQTT" add-on in the store and click **Install**

### Option 2: Manual Installation

1. Copy this repository to the `/addons` directory of your Home Assistant installation
2. Restart Home Assistant
3. Go to **Settings** → **Add-ons** → **Add-on Store**
4. Find "Octo MQTT" in the **Local add-ons** section and click **Install**

## Configuration

After installing the add-on, you'll need to configure it:

1. **BLE Proxy**: You need an ESPHome BLE proxy that can connect to your Octo bed
   - Set up an ESP32 device with ESPHome
   - Configure it as a Bluetooth proxy
   - Note its IP address and port (usually 6053)

2. **Add-on Configuration**:
   - `mqtt_host`, `mqtt_port`, `mqtt_user`, `mqtt_password`: Your MQTT broker details (usually Auto-detect works)
   - `bleProxies`: List of your ESPHome BLE proxies with their host and port
   - `octoDevices`: Configuration for your Octo beds
     - `name`: The device name (usually "RC2")
     - `friendlyName`: A user-friendly name for the device
     - `pin`: The PIN code for your bed (default: "0000")

Example configuration:

```yaml
mqtt_host: homeassistant.local
mqtt_port: "1883"
mqtt_user: mqtt
mqtt_password: mqtt
bleProxies:
  - host: 192.168.1.100
    port: 6053
octoDevices:
  - name: RC2
    friendlyName: Octo Bed
    pin: "0000"
```

## Usage

After configuration, the add-on will:

1. Connect to your ESPHome BLE proxy
2. Discover your Octo bed
3. Create MQTT entities for controlling the bed
4. Expose these entities to Home Assistant

You can then control your bed through:
- Home Assistant UI
- Automations
- Scripts
- Voice assistants like Alexa or Google Home (if configured)

## Troubleshooting

If you encounter issues:

1. Check the add-on logs
2. Verify your BLE proxy is working correctly
3. Ensure your Octo bed is powered on and in range
4. Double-check your PIN code

## Support

For help with setup, or for sharing feedback please join the Discord server: https://discord.gg/Hf3kpFjbZs

This add-on is based on the work at [richardhopton/smartbed-mqtt](https://github.com/richardhopton/smartbed-mqtt)

## License

This project is licensed under the MIT License - see the LICENSE file for details.
