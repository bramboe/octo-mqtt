FROM node:18.19-alpine AS builder

WORKDIR /octo-mqtt

# Install build dependencies
RUN apk add --no-cache python3 make g++ git

# Copy configuration files first
COPY .npmrc package.json ./
COPY tsconfig*.json ./

# Install dependencies and global packages
RUN npm install && \
    npm install -g typescript ts-node tsc-alias

# Copy source files
COPY . .

# Build the application
RUN npm run build:ci

# Start fresh from Home Assistant base image
ARG BUILD_FROM
FROM ${BUILD_FROM}

# Add env
ENV LANG C.UTF-8
ENV PORT=8099

# Install runtime dependencies
RUN \
    apk add --no-cache \
        nodejs \
        npm \
        python3 \
        make \
        g++ \
        bash \
        curl \
        jq

# Install bashio
ARG BASHIO_VERSION
RUN \
    curl -J -L -o /tmp/bashio.tar.gz "https://github.com/hassio-addons/bashio/archive/v${BASHIO_VERSION}.tar.gz" \
    && mkdir /tmp/bashio \
    && tar zxvf /tmp/bashio.tar.gz --strip 1 -C /tmp/bashio \
    && mv /tmp/bashio/lib /usr/lib/bashio \
    && ln -s /usr/lib/bashio/bashio /usr/bin/bashio \
    && rm -rf /tmp/bashio*

WORKDIR /octo-mqtt

# Copy package files and install production dependencies
COPY .npmrc package.json ./
RUN npm install --omit=dev

# Copy built files and other necessary files
COPY --from=builder /octo-mqtt/dist ./dist
COPY webui ./webui/
COPY run.sh ./
RUN chmod a+x run.sh

# Labels
ARG BUILD_ARCH
LABEL \
    io.hass.name="Octo Integration via MQTT" \
    io.hass.description="Home Assistant Community Add-on for Octo actuators star version 2" \
    io.hass.type="addon" \
    io.hass.arch="${BUILD_ARCH}" \
    io.hass.version="1.1.5" \
    maintainer="Bram Boersma <bram.boersma@gmail.com>"

ENTRYPOINT ["/octo-mqtt/run.sh"]