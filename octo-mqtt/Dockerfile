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

# Install bashio for Home Assistant integration
RUN \
  curl -J -L -o /tmp/bashio.tar.gz \
    "https://github.com/hassio-addons/bashio/archive/v0.13.1.tar.gz" \
  && mkdir /tmp/bashio \
  && tar zxvf /tmp/bashio.tar.gz --strip 1 -C /tmp/bashio \
  && mv /tmp/bashio/lib /usr/lib/bashio \
  && ln -s /usr/lib/bashio/bashio /usr/bin/bashio \
  && rm -rf /tmp/bashio.tar.gz /tmp/bashio

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
    io.hass.version="2.3.0" \
    io.hass.arch="armhf|aarch64|i386|amd64|armv7" \
    maintainer="Bram Boersma <bram.boersma@gmail.com>"