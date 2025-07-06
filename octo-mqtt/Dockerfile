ARG BUILD_FROM
FROM $BUILD_FROM

# Install Node.js and system dependencies
RUN \
  apk add --no-cache \
    nodejs \
    npm \
    bash \
    curl \
    jq \
    tzdata

# Bashio is already included in Home Assistant base images

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Copy all source code
COPY . .

# Build TypeScript
RUN npm run build

# Copy application files
COPY webui ./webui/

# Copy run script and make it executable
COPY run.sh ./run.sh
RUN chmod +x ./run.sh && ls -la ./run.sh

# Set environment
ENV NODE_ENV=production

# Expose port
EXPOSE 8099

# Verify installation
RUN ls -la /app/

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s \
  CMD curl -f http://localhost:8099/health || exit 1

# Start the application
ENTRYPOINT ["/bin/bash", "/app/run.sh"]

LABEL \
    io.hass.name="Octo MQTT" \
    io.hass.description="Home Assistant add-on to enable controlling Octo actuators star version 2" \
    io.hass.type="addon" \
    io.hass.version="2.6.0" \
    io.hass.arch="armhf|aarch64|i386|amd64|armv7" \
    maintainer="Bram Boersma <bram.boersma@gmail.com>"