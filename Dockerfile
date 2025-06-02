FROM node:18-alpine

# Install build dependencies
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    linux-headers \
    udev \
    bluez

# Create app directory
WORKDIR /usr/src/app

# Copy package files
COPY package.json yarn.lock ./
COPY tsconfig.json tsconfig.build.json ./

# Install dependencies
RUN yarn install --frozen-lockfile

# Copy source code
COPY . .

# Build the application
RUN yarn build:ci

# Expose port
EXPOSE 8099

# Start the application
CMD ["node", "dist/tsc/index.js"]

# Set correct permissions
RUN chown -R root:root /usr/src/app

# Labels
LABEL \
    io.hass.name="Octo MQTT" \
    io.hass.description="A Home Assistant add-on to enable controlling Octo actuators star version 2." \
    io.hass.type="addon" \
    io.hass.version="1.2.0" \
    maintainer="Bram Boersma <bram.boersma@gmail.com>"