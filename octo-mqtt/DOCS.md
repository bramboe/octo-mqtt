# Octo MQTT

A Home Assistant add-on to enable controlling Octo adjustable beds via MQTT and ESPHome BLE proxy.

## About

This add-on allows you to control your Octo smart bed through Home Assistant by connecting to the bed's BLE interface via an ESPHome BLE proxy. It creates MQTT entities that Home Assistant can discover and control.

## Features

- **Bed Control**: Adjust head and feet elevation positions
- **Lighting Control**: Toggle underbed lighting
- **MQTT Integration**: Seamless integration with Home Assistant's MQTT broker
- **BLE Proxy Support**: Uses ESP32 devices running ESPHome as BLE proxies
- **Web Interface**: Built-in web UI for device management and diagnostics
- **Auto-Discovery**: Automatically discovers and configures MQTT entities

## Installation

1. Navigate to your Home Assistant instance
2. Go to **Settings** → **Add-ons** → **Add-on Store**
3. Click the menu in the top right (⋮) and select **Repositories**
4. Add this repository URL: `https://github.com/bramboe/octo-mqtt`
5. Click **Add**
6. Find the "Octo MQTT" add-on in the store and click **Install**

## Configuration

### Prerequisites

Before configuring the add-on, you need:

1. **ESPHome BLE Proxy**: An ESP32 device running ESPHome configured as a Bluetooth proxy
2. **Octo Smart Bed**: A compatible Octo adjustable bed
3. **MQTT Broker**: Home Assistant's built-in MQTT broker (Mosquitto) or external broker

### ESPHome BLE Proxy Setup

Configure your ESP32 device with ESPHome using this configuration:

```yaml
esphome:
  name: esp32-bluetooth-proxy
  
esp32:
  board: esp32dev
  framework:
    type: arduino

wifi:
  ssid: "Your_WiFi_SSID"
  password: "Your_WiFi_Password"

api:
  encryption:
    key: "your-api-key"

ota:
  password: "your-ota-password"

bluetooth_proxy:
  active: true
```

### Add-on Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `mqtt_host` | string | `<auto_detect>` | MQTT broker hostname |
| `mqtt_port` | string | `<auto_detect>` | MQTT broker port |
| `mqtt_user` | string | `<auto_detect>` | MQTT username |
| `mqtt_password` | password | `<auto_detect>` | MQTT password |
| `bleProxies` | list | - | List of ESPHome BLE proxies |
| `octoDevices` | list | - | List of Octo devices to control |

#### BLE Proxy Configuration

Each BLE proxy entry supports:

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `host` | string | Yes | IP address of the ESPHome device |
| `port` | integer | No | Port number (default: 6053) |
| `password` | password | No | ESPHome API password |
| `encryptionKey` | string | No | Base64 encoded encryption key |
| `expectedServerName` | string | No | Expected server name for validation |

#### Octo Device Configuration

Each Octo device entry supports:

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `name` | string | Yes | Device name (usually "RC2") |
| `friendlyName` | string | Yes | User-friendly name for the device |
| `pin` | string | No | PIN code for the bed (default: "0000") |

### Example Configuration

```yaml
mqtt_host: homeassistant.local
mqtt_port: "1883"
mqtt_user: mqtt
mqtt_password: mqtt_password
bleProxies:
  - host: 192.168.1.109
    port: 6053
octoDevices:
  - name: RC2
    friendlyName: Master Bedroom Bed
    pin: "0000"
```

## Usage

### Web Interface

The add-on provides a web interface accessible through:
- **Ingress**: Click "OPEN WEB UI" in the add-on page
- **Direct Access**: Navigate to `http://your-ha-ip:8099`

The web interface allows you to:
- Test BLE proxy connections
- Scan for and discover Octo devices
- Add discovered devices to your configuration
- View connection status and logs

### Home Assistant Integration

Once configured, the add-on will:

1. Connect to your ESPHome BLE proxy
2. Discover your Octo bed
3. Create MQTT entities automatically
4. Make them available in Home Assistant

The following entities will be created:
- **Cover entities**: For head and feet position control
- **Light entities**: For underbed lighting
- **Button entities**: For preset positions
- **Sensor entities**: For status monitoring

### Automation Examples

#### Set bed to reading position
```yaml
automation:
  - alias: "Bedtime Reading Position"
    trigger:
      platform: time
      at: "21:00:00"
    action:
      service: cover.set_cover_position
      target:
        entity_id: cover.master_bedroom_bed_head
      data:
        position: 30
```

#### Turn on underbed lighting
```yaml
automation:
  - alias: "Underbed Light Motion"
    trigger:
      platform: state
      entity_id: binary_sensor.bedroom_motion
      to: "on"
    condition:
      condition: sun
      after: sunset
    action:
      service: light.turn_on
      target:
        entity_id: light.master_bedroom_bed_underbed
```

## Troubleshooting

### Common Issues

#### BLE Proxy Connection Issues
- Ensure the ESP32 is powered on and connected to WiFi
- Check that the IP address in configuration is correct
- Verify the ESPHome API is accessible (try `http://esp32-ip:80`)

#### Bed Not Discovered
- Ensure the bed is powered on and in pairing mode
- Check that the bed is within BLE range of the ESP32
- Verify the PIN code is correct (default is usually "0000")

#### MQTT Connection Issues
- Check Home Assistant's MQTT broker is running
- Verify MQTT credentials are correct
- Ensure the add-on has permission to access MQTT

### Logs

Check the add-on logs for detailed error information:
1. Go to **Settings** → **Add-ons** → **Octo MQTT**
2. Click the **Log** tab
3. Look for error messages or connection issues

### Health Check

The add-on includes a health check endpoint at `/health` that returns:
- Service status
- Connection states
- Last update timestamps

## Support

For help with setup or to share feedback:
- **Discord**: https://discord.gg/Hf3kpFjbZs
- **GitHub Issues**: https://github.com/bramboe/octo-mqtt/issues

## Credits

This add-on is based on the work at [richardhopton/smartbed-mqtt](https://github.com/richardhopton/smartbed-mqtt).

## License

This project is licensed under the MIT License - see the LICENSE file for details. 