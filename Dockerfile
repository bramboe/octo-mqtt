ARG BUILD_FROM
FROM $BUILD_FROM

# Set shell
SHELL ["/bin/bash", "-o", "pipefail", "-c"]

# Add a cache-busting argument that changes on each build
ARG BUILD_TIME_CACHE_BUST

# Install requirements for add-on
RUN \
    apk add --no-cache \
        nodejs \
        npm \
        git \
        python3 \
        make \
        g++ \
        linux-headers \
        udev \
        bluez \
        execline \
        s6 \
        s6-portable-utils && \
    npm install -g yarn

WORKDIR /app

# Copy package.json and yarn.lock first
COPY package.json yarn.lock ./

# Install dependencies
# Using --production=false to ensure devDependencies are available for the build script
RUN yarn install --frozen-lockfile --production=false

# Copy the rest of the application code
# This will copy files into the current WORKDIR (/app)
COPY . .

# Build
RUN yarn build:ci

# Clean up development dependencies
RUN yarn install --frozen-lockfile --production=true

# Copy root filesystem
COPY rootfs /

# Set correct permissions for scripts and s6-overlay
RUN \
    chmod a+x /etc/services.d/octo-mqtt/* && \
    chmod a+x /etc/cont-init.d/* || true && \
    chmod a+x /etc/fix-attrs.d/* || true && \
    chown -R root:root /etc/services.d && \
    chown -R root:root /etc/cont-init.d || true && \
    chown -R root:root /etc/fix-attrs.d || true && \
    chown -R root:root /app

# Create necessary s6 directories and symlinks
RUN \
    mkdir -p /var/run/s6 /var/run/s6/services /var/run/s6/container_environment /command && \
    # Remove existing symlinks if they exist
    rm -f /command/execlineb /command/with-contenv /command/s6-test && \
    # Create new symlinks
    ln -s /usr/bin/execlineb /command/execlineb && \
    ln -s /usr/bin/with-contenv /command/with-contenv && \
    ln -s /usr/bin/s6-test /command/s6-test

# Echo the cache buster to ensure it's used and changes the layer
RUN echo "Build time cache buster: ${BUILD_TIME_CACHE_BUST}"

# Labels
LABEL \
    io.hass.name="Octo MQTT" \
    io.hass.description="A Home Assistant add-on to enable controlling Octo actuators star version 2." \
    io.hass.type="addon" \
    io.hass.arch="aarch64|amd64|armhf|armv7|i386" \
    io.hass.version="1.2.4" \
    maintainer="Bram Boersma <bram.boersma@gmail.com>"

# Set environment variables for s6-overlay
ENV S6_KEEP_ENV=1 \
    S6_BEHAVIOUR_IF_STAGE2_FAILS=2 \
    S6_CMD_WAIT_FOR_SERVICES_MAXTIME=0 \
    S6_SERVICES_GRACETIME=0 \
    S6_VERBOSITY=1 \
    S6_LOGGING=1

# Use s6-overlay entrypoint
ENTRYPOINT ["/init"]