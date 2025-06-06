#!/bin/bash

# Map Home Assistant architecture to s6-overlay architecture
case "$(uname -m)" in
    x86_64)
        S6_ARCH="x86_64"
        ;;
    aarch64)
        S6_ARCH="aarch64"
        ;;
    armv7l)
        S6_ARCH="arm"
        ;;
    armv6l)
        S6_ARCH="arm"
        ;;
    i386|i686)
        S6_ARCH="i686"
        ;;
    *)
        echo "Unsupported architecture: $(uname -m)"
        exit 1
        ;;
esac

# Build the Docker image with the correct architecture
docker build \
    --build-arg BUILD_FROM="$BUILD_FROM" \
    --build-arg ARCH="$S6_ARCH" \
    --build-arg BUILD_TIME_CACHE_BUST="$(date +%s)" \
    -t "local/octo-mqtt" . 