#!/bin/bash
# Simple script to test ESPHome connection

HOST=${1:-"192.168.2.102"}
PORT=${2:-"6053"}

echo "Testing ESPHome connection to $HOST:$PORT..."

# Try to ping the device to ensure it's on the network
echo "Pinging $HOST..."
ping -c 3 $HOST

# Try to connect with a TCP connection to the port
echo "Trying TCP connection to $HOST:$PORT..."
nc -zv $HOST $PORT

# Try to diagnose by identifying what's listening on that port on the target device
# Note: This requires SSH access to the target device, which may not be available
if command -v ssh >/dev/null 2>&1; then
  echo "If you have SSH access to the ESPHome device, you can try:"
  echo "ssh user@$HOST 'netstat -tuln | grep $PORT'"
fi

# Try with curl (this likely won't work as it's not HTTP, but worth a try)
echo "Trying curl to check for any HTTP service..."
curl -v telnet://$HOST:$PORT

echo "Testing complete!" 