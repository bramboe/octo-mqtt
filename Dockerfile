ARG BUILD_FROM
FROM $BUILD_FROM

# Set shell
SHELL ["/bin/bash", "-o", "pipefail", "-c"]

# Install dependencies
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

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy your code
COPY . .

# Build the application
RUN npm run build

# Labels
LABEL \
    io.hass.name="Octo MQTT" \
    io.hass.description="A Home Assistant add-on to enable controlling Octo actuators star version 2." \
    io.hass.type="addon" \
    io.hass.version="1.2.0" \
    maintainer="Bram Boersma" \
    org.opencontainers.image.title="Octo MQTT" \
    org.opencontainers.image.description="A Home Assistant add-on to enable controlling Octo actuators star version 2." \
    org.opencontainers.image.source="https://github.com/bramboe/octo-mqtt" \
    org.opencontainers.image.licenses="MIT"

CMD [ "npm", "start" ]