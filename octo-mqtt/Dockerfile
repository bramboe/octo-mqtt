FROM node:18-alpine

# Force rebuild by changing this version number
ENV BUILD_VERSION=v2025.07.05.1

# Install system dependencies
RUN apk add --no-cache bash curl jq

# Install bashio for Home Assistant integration
RUN curl -J -L -o /tmp/bashio.tar.gz "https://github.com/hassio-addons/bashio/archive/v0.13.1.tar.gz" && \
    mkdir /tmp/bashio && \
    tar zxvf /tmp/bashio.tar.gz --strip 1 -C /tmp/bashio && \
    mv /tmp/bashio/lib /usr/lib/bashio && \
    ln -s /usr/lib/bashio/bashio /usr/bin/bashio && \
    rm -rf /tmp/bashio.tar.gz /tmp/bashio

# Set working directory
WORKDIR /app

# Copy package file and install dependencies
COPY package-simple.json package.json
RUN npm install --production

# Copy application files
COPY index.js ./
COPY webui ./webui/

# Copy run script and make it executable
COPY run.sh ./run.sh
RUN chmod +x ./run.sh && ls -la ./run.sh

# Set environment
ENV NODE_ENV=production

# Expose port
EXPOSE 8099

# Debug: Show what files we have
RUN echo "=== FILES IN /app ===" && ls -la /app/ && \
    echo "=== CONTENT OF index.js FIRST 10 LINES ===" && head -10 /app/index.js && \
    echo "=== CONTENT OF run.sh FIRST 10 LINES ===" && head -10 /app/run.sh

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s \
  CMD curl -f http://localhost:8099/health || exit 1

# Start the application  
ENTRYPOINT ["/bin/bash", "/app/run.sh"]

LABEL \
    io.hass.name="Octo Integration via MQTT" \
    io.hass.description="Home Assistant Community Add-on for Octo actuators star version 2 (Simplified JavaScript version)" \
    io.hass.type="addon" \
    io.hass.version="2.0.2" \
    maintainer="Bram Boersma <bram.boersma@gmail.com>"