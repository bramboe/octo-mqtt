FROM node:18-alpine

# Force rebuild by changing this version number
ENV BUILD_VERSION=v2025.05.27.1
ENV CACHE_BUST=20250527120000

# Install system dependencies
RUN apk add --no-cache bash curl jq dos2unix

# Install bashio for Home Assistant integration
RUN curl -J -L -o /tmp/bashio.tar.gz "https://github.com/hassio-addons/bashio/archive/v0.13.1.tar.gz" && \
    mkdir /tmp/bashio && \
    tar zxvf /tmp/bashio.tar.gz --strip 1 -C /tmp/bashio && \
    mv /tmp/bashio/lib /usr/lib/bashio && \
    ln -s /usr/lib/bashio/bashio /usr/bin/bashio && \
    rm -rf /tmp/bashio.tar.gz /tmp/bashio

# Set working directory
WORKDIR /app

# Copy production package file and TypeScript config
COPY --chown=root:root package.json .
COPY --chown=root:root package-lock.json .
COPY --chown=root:root tsconfig.prod.json ./

# Install dependencies with verbose logging
RUN echo "=== INSTALLING DEPENDENCIES ===" && \
    apk add --no-cache npm && \
    npm ci --production --legacy-peer-deps --verbose && \
    echo "=== DEPENDENCIES INSTALLED ==="

# Copy source code
COPY --chown=root:root src/ ./src/
COPY --chown=root:root webui/ ./webui/

# Build TypeScript with detailed logging
RUN echo "=== BUILDING TYPESCRIPT ===" && \
    echo "TypeScript config:" && \
    cat tsconfig.prod.json && \
    echo "Source files:" && \
    find src -name "*.ts" | head -20 && \
    npx tsc --project tsconfig.prod.json --verbose && \
    echo "=== BUILD COMPLETE ===" && \
    echo "Built files:" && \
    find dist -name "*.js" | head -10 && \
    ls -la dist/tsc/ || echo "No dist/tsc directory found"

# Copy fallback and run script
COPY --chown=root:root index.js ./

# Copy root filesystem
COPY rootfs /

# Fix permissions
RUN chmod a+x /etc/services.d/octo-mqtt/run && \
    dos2unix /etc/services.d/octo-mqtt/run && \
    echo "=== FILE PERMISSIONS ===" && \
    ls -la /etc/services.d/octo-mqtt/run && \
    echo "=== SHELL CHECK ===" && \
    which bash && \
    bash --version && \
    echo "=== SCRIPT CHECK ===" && \
    cat /etc/services.d/octo-mqtt/run

# Expose port
EXPOSE 8099

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8099/health || exit 1

# Start the application with s6-overlay
CMD ["/init"]

LABEL \
    io.hass.name="Octo Integration via MQTT" \
    io.hass.description="Home Assistant Community Add-on for Octo actuators star version 2 (TypeScript version with fallback)" \
    io.hass.type="addon" \
    io.hass.version="2.0.8" \
    maintainer="Bram Boersma <bram.boersma@gmail.com>"