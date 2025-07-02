# Octo MQTT - Home Assistant Add-on

A Home Assistant add-on to enable controlling Octo actuators star version 2 via MQTT and BLE.

## Features

- **BLE Integration**: Connects to Octo RC2 devices via ESPHome BLE proxy
- **MQTT Control**: Provides MQTT entities for Home Assistant integration
- **Position Control**: Full head and feet position control (0-100%)
- **Memory Positions**: Save and recall favorite bed positions
- **Light Control**: Control bed lighting
- **Web Interface**: Built-in web UI for device management
- **Auto-discovery**: Automatic device discovery and configuration

## Installation

1. Add this repository to your Home Assistant add-on store
2. Install the "Octo MQTT" add-on
3. Configure your BLE proxy and Octo devices
4. Start the add-on
5. Check the logs for successful startup and device discovery.

## Configuration

### MQTT Settings

The add-on automatically detects and connects to the Home Assistant MQTT broker. You can override these settings if needed:

- `mqtt_host`: MQTT broker hostname (default: auto-detect)
- `mqtt_port`: MQTT broker port (default: auto-detect)
- `mqtt_username`: MQTT username (default: auto-detect)
- `mqtt_password`: MQTT password (default: auto-detect)

### BLE Proxy Configuration

Configure your ESPHome BLE proxy devices:

```yaml
bleProxies:
  - host: "192.168.1.109"
    port: 6053
    password: ""
```

### Octo Device Configuration

Configure your Octo RC2 devices:

```yaml
octoDevices:
  - mac: "f6:21:dd:dd:6f:19"
    friendlyName: "RC2 Bed"
    pin: "1987"
```

## ESPHome BLE Proxy Setup

You need an ESP32 device running ESPHome with BLE proxy functionality. The ESPHome configuration should include:

```yaml
esp32_ble_tracker:
  id: ble_tracker
  scan_parameters:
    duration: 30s
    interval: 100ms
    window: 50ms
    active: true

ble_client:
  id: star2octo
  mac_address: "00:00:00:00:00:00"
  auto_connect: false
```

## Usage

### Web Interface

Access the web interface at `http://[your-home-assistant]:8099` to:
- View device status
- Control bed positions
- Configure devices
- Monitor BLE scanning

### MQTT Topics

The add-on creates MQTT entities for each configured device:

- `octo/[device_name]/head_position` - Head position (0-100%)
- `octo/[device_name]/feet_position` - Feet position (0-100%)
- `octo/[device_name]/light` - Bed light control
- `octo/[device_name]/memory_[1-4]` - Memory position controls

### Home Assistant Integration

The add-on automatically creates Home Assistant entities:
- Cover entities for head and feet position control
- Light entity for bed lighting
- Button entities for memory positions
- Sensor entities for position feedback

## Troubleshooting

### Device Not Found

1. Ensure your ESPHome BLE proxy is running and accessible
2. Check that the Octo device is powered on and in range
3. Verify the MAC address is correct
4. Check the add-on logs for BLE scanning results

### Connection Issues

1. Verify ESPHome device IP address and port
2. Check network connectivity between Home Assistant and ESPHome device
3. Ensure ESPHome device has BLE proxy configured
4. Check firewall settings

### MQTT Issues

1. Verify MQTT broker is running
2. Check MQTT credentials if authentication is enabled
3. Ensure MQTT service is available in Home Assistant

## Development

### Building Locally

```bash
npm install
npm run build
npm start
```

### Docker Build

```bash
docker build -t octo-mqtt .
```

## Support

For issues and feature requests, please visit the [GitHub repository](https://github.com/bramboe/octo-mqtt).

## License

This project is licensed under the MIT License.

## Overview
This add-on enables Home Assistant to control Octo actuators (smart beds) via MQTT and BLE, using an ESPHome BLE proxy.

## Configuration Options
- `mqtt_host`: MQTT broker host (default: `<auto_detect>`)
- `mqtt_port`: MQTT broker port (default: `<auto_detect>`)
- `mqtt_user`: MQTT username (default: `<auto_detect>`)
- `mqtt_password`: MQTT password (default: `<auto_detect>`)
- `bleProxies`: List of ESPHome BLE proxy hosts
- `octoDevices`: List of Octo devices (MAC, friendlyName, pin)
- `target_mac`, `target_pin`: Optional filtering for BLE devices
- `enable_mac_filtering`, `enable_pin_filtering`: Enable/disable filtering
- `scan_duration`, `scan_interval`: BLE scan timing
- `target_device_name`: Optional BLE device name filter
- `ble_scan_duration`, `ble_scan_interval`, `ble_scan_window`, `ble_scan_active`: Advanced BLE scan settings

## Example Configuration
```
mqtt_host: "<auto_detect>"
mqtt_port: "<auto_detect>"
mqtt_user: "<auto_detect>"
mqtt_password: "<auto_detect>"
bleProxies:
  - host: "192.168.1.109"
    port: 6053
    password: ""
octoDevices:
  - mac: "f6:21:dd:dd:6f:19"
    friendlyName: "RC2 Bed"
    pin: "1987"
target_mac: "f6:21:dd:dd:6f:19"
target_pin: "1987"
enable_mac_filtering: true
enable_pin_filtering: true
scan_duration: 30000
scan_interval: 5000
target_device_name: "RC2 Bed"
ble_scan_duration: 30000
ble_scan_interval: 100
ble_scan_window: 50
ble_scan_active: true
```

## Troubleshooting
- **MQTT connection issues:** Ensure MQTT is running and credentials are correct. The add-on auto-detects Home Assistant's MQTT service if available.
- **BLE device not found:** Check BLE proxy IP/port, ensure the proxy is online, and increase scan duration if needed.
- **WebSocket connection not ready:** Ensure the add-on is running, port 8099 is open, and no other add-on is using the same port. Use the web UI debug tools for diagnostics.
- **Schema errors:** After changing config options, always rebuild the add-on.

## Support
For issues, open an issue on [GitHub](https://github.com/bramboe/octo-mqtt).
