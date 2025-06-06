#!/bin/bash

# Map Home Assistant architecture to s6-overlay architecture
case "${BUILD_ARCH}" in
    "aarch64")
        S6_ARCH="aarch64"
        ;;
    "armhf" | "armv7")
        S6_ARCH="arm"
        ;;
    "amd64")
        S6_ARCH="x86_64"
        ;;
    "i386")
        S6_ARCH="i686"
        ;;
    *)
        echo "Error: Unsupported architecture: ${BUILD_ARCH}"
        exit 1
        ;;
esac

# Build the Docker image with the correct architecture
docker build \
    --build-arg BUILD_FROM="homeassistant/${BUILD_ARCH}-base:latest" \
    --build-arg ARCH="${S6_ARCH}" \
    --build-arg BUILD_TIME_CACHE_BUST="$(date +%s)" \
    -t "local/octo-mqtt" . 