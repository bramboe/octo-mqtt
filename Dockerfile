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
        bluez

WORKDIR /app

# Copy package.json and yarn.lock first
COPY package.json yarn.lock ./

# Install dependencies
# Using --production=false to ensure devDependencies are available for the build script
RUN yarn install --frozen-lockfile --production=false

# Copy the rest of the application code
# This will copy files into the current WORKDIR (/app)
COPY . .

# Copy root filesystem
# This copies to the root of the image.
# Ensure this doesn't unintentionally overwrite anything in /app if rootfs has an /app dir.
# Or, if rootfs contents are meant for /, this is fine.
COPY rootfs /

# Echo the cache buster to ensure it's used and changes the layer
RUN echo "Build time cache buster: ${BUILD_TIME_CACHE_BUST}"

# Build
RUN yarn build:ci

# Set correct permissions
RUN chown -R root:root /app

# Labels
LABEL \
    io.hass.name="Octo MQTT" \
    io.hass.description="A Home Assistant add-on to enable controlling Octo actuators star version 2." \
    io.hass.type="addon" \
    io.hass.arch="aarch64|amd64|armhf|armv7|i386" \
    io.hass.version="1.2.4" \
    maintainer="Bram Boersma <bram.boersma@gmail.com>"