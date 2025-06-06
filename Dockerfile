ARG BUILD_FROM
FROM $BUILD_FROM

# Add S6 Overlay
ARG S6_OVERLAY_VERSION=3.1.5.0
ARG ARCH=x86_64
ADD https://github.com/just-containers/s6-overlay/releases/download/v${S6_OVERLAY_VERSION}/s6-overlay-noarch.tar.xz /tmp
ADD https://github.com/just-containers/s6-overlay/releases/download/v${S6_OVERLAY_VERSION}/s6-overlay-${ARCH}.tar.xz /tmp
RUN tar -C / -Jxpf /tmp/s6-overlay-noarch.tar.xz \
    && tar -C / -Jxpf /tmp/s6-overlay-${ARCH}.tar.xz \
    && rm /tmp/s6-overlay-noarch.tar.xz /tmp/s6-overlay-${ARCH}.tar.xz

# Set shell
SHELL ["/bin/bash", "-o", "pipefail", "-c"]

# Add a cache-busting argument that changes on each build
ARG BUILD_TIME_CACHE_BUST

# Install requirements for add-on
RUN \
    apk add --no-cache \
        bluez \
        udev \
        nodejs \
        npm \
        xz && \
    npm install -g yarn@1.22.19

WORKDIR /app

# Copy package.json and yarn.lock first
COPY package.json yarn.lock ./

# Install dependencies
# Using --production=false to ensure devDependencies are available for the build script
RUN yarn install --frozen-lockfile --production=false

# Copy the rest of the application code
COPY . .

# Build
RUN yarn build:ci

# Clean up development dependencies
RUN yarn install --frozen-lockfile --production=true

# Copy root filesystem
COPY rootfs /

# Set correct permissions for scripts and s6 directories
RUN \
    chmod -R a+x /etc/services.d/octo-mqtt && \
    chmod -R a+x /etc/cont-init.d && \
    chown -R root:root /etc/services.d && \
    chown -R root:root /etc/cont-init.d && \
    chown -R root:root /app && \
    mkdir -p /var/run/s6 && \
    chmod -R 755 /var/run/s6

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

# Set S6 Overlay entrypoint
ENTRYPOINT ["/init"]