# Home Assistant Add-on: Octo MQTT

Control Octo smart beds via MQTT and BLE proxy integration.

## About

This add-on provides integration between Octo smart beds and Home Assistant through:
- ESPHome BLE proxy connections
- MQTT communication
- Real-time BLE device scanning
- Home Assistant entity auto-discovery

## Installation

1. Add this repository to your Home Assistant add-on store
2. Install the "Octo MQTT" add-on
3. Configure your ESPHome BLE proxy settings
4. Start the add-on

## Configuration

### ESPHome BLE Proxies

Configure your ESPHome BLE proxy devices:

```yaml
bleProxies:
  - host: "192.168.1.100"
    port: 6053
```

### MQTT Settings

MQTT configuration (auto-detected from Home Assistant):

```yaml
mqtt_host: "core-mosquitto"
mqtt_port: 1883
mqtt_user: "your-user"
mqtt_password: "your-password"
```

### Octo Devices

Add your Octo bed devices:

```yaml
octoDevices:
  - name: "Master Bedroom Bed"
    address: "AA:BB:CC:DD:EE:FF"
    pin: "1234"
```

## Usage

1. Start the add-on
2. Access the web interface through Home Assistant
3. Scan for BLE devices
4. Add discovered Octo beds to your configuration
5. Control your beds through Home Assistant entities

## Support

For issues and support, visit: https://github.com/bramboe/octo-mqtt

## Authors & contributors

The original setup of this repository is by [Bram Boersma](https://github.com/bramboe). 