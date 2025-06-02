ARG BUILD_FROM
FROM $BUILD_FROM

# Set shell
SHELL ["/bin/bash", "-o", "pipefail", "-c"]

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

# Copy root filesystem
COPY rootfs /

# Copy app
COPY . /app

WORKDIR /app

# Install dependencies
RUN npm install

# Build
RUN npm run build

# Set correct permissions
RUN chown -R root:root /app

# Labels
LABEL \
    io.hass.name="Octo MQTT" \
    io.hass.description="A Home Assistant add-on to enable controlling Octo actuators star version 2." \
    io.hass.type="addon" \
    io.hass.version="1.2.0" \
    maintainer="Bram Boersma <bram.boersma@gmail.com>"