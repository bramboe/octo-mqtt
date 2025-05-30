ARG BUILD_FROM=ghcr.io/hassio-addons/base:14.3.3

# hadolint ignore=DL3006
FROM ${BUILD_FROM}

# Set shell
SHELL ["/bin/bash", "-o", "pipefail", "-c"]

# Setup base
ARG BUILD_ARCH=aarch64

# Force rebuild by changing this version number
ENV BUILD_VERSION=v2025.05.29.2
ENV CACHE_BUST=20250529225900

# Install required packages
RUN \
    apk add --no-cache \
        nodejs \
        npm \
        nginx

# Copy root filesystem
COPY rootfs /

# Create required NGINX directories
RUN \
    mkdir -p /var/log/nginx \
    && mkdir -p /var/lib/nginx/body \
    && mkdir -p /var/lib/nginx/fastcgi \
    && chown -R nginx:nginx /var/log/nginx \
    && chown -R nginx:nginx /var/lib/nginx

# Set working directory
WORKDIR /app

# Copy package files and TypeScript config
COPY package.json package-lock.json tsconfig.prod.json ./

# Install Node.js dependencies including development dependencies for build
RUN \
    npm install --no-optional --no-package-lock \
    && echo "=== Dependencies Installed ==="

# Copy source code and web UI
COPY src/ ./src/
COPY webui/ ./webui/

# Build TypeScript with path alias resolution
RUN \
    echo "=== Building TypeScript ===" \
    && ./node_modules/.bin/tsc --project tsconfig.prod.json \
    && ./node_modules/.bin/tsc-alias -p tsconfig.prod.json \
    && echo "=== Build Complete ===" \
    && ls -la dist/tsc/ \
    && echo "=== Cleaning up development dependencies ===" \
    && npm prune --production \
    && npm cache clean --force

# Copy fallback file
COPY index.js ./

# Build arguments
ARG BUILD_DATE
ARG BUILD_REF
ARG BUILD_VERSION
ARG BUILD_REPOSITORY

# Labels
LABEL \
    io.hass.name="Octo Integration via MQTT" \
    io.hass.description="Home Assistant Community Add-on for Octo actuators star version 2" \
    io.hass.arch="${BUILD_ARCH}" \
    io.hass.type="addon" \
    io.hass.version=${BUILD_VERSION} \
    maintainer="Bram Boersma <bram.boersma@gmail.com>" \
    org.opencontainers.image.title="Octo Integration via MQTT" \
    org.opencontainers.image.description="Home Assistant Community Add-on for Octo actuators star version 2" \
    org.opencontainers.image.vendor="Home Assistant Community Add-ons" \
    org.opencontainers.image.authors="Bram Boersma <bram.boersma@gmail.com>" \
    org.opencontainers.image.licenses="MIT" \
    org.opencontainers.image.url="https://github.com/bramboe/octo-mqtt" \
    org.opencontainers.image.source="https://github.com/bramboe/octo-mqtt" \
    org.opencontainers.image.documentation="https://github.com/bramboe/octo-mqtt/blob/main/README.md" \
    org.opencontainers.image.created=${BUILD_DATE} \
    org.opencontainers.image.revision=${BUILD_REF} \
    org.opencontainers.image.version=${BUILD_VERSION}