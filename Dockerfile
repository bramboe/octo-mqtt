FROM node:18-alpine AS builder

RUN apk --no-cache add git

# Add a build argument that can be changed to bust cache - use timestamp for uniqueness
ARG CACHEBUST=default
ENV CACHEBUST_ENV=${CACHEBUST}

COPY package.json /octo-mqtt/
COPY package-lock.json /octo-mqtt/
WORKDIR /octo-mqtt

RUN npm ci --legacy-peer-deps

# Force fresh copy of source code with timestamp-based cache busting
COPY tsconfig.build.json /octo-mqtt/
COPY tsconfig.json /octo-mqtt/
COPY --chown=node:node src /octo-mqtt/src/

# Add cache bust info to ensure source changes are detected
RUN echo "Cache bust: ${CACHEBUST_ENV}" > /octo-mqtt/build_info.txt && \
    echo "Build timestamp: $(date)" >> /octo-mqtt/build_info.txt

RUN npm run build:ci

FROM node:18-alpine

# Add env
ENV LANG C.UTF-8
ENV PORT=8099

# Install s6-overlay for service management
RUN apk add --no-cache bash curl jq s6-overlay && \
    curl -J -L -o /tmp/bashio.tar.gz "https://github.com/hassio-addons/bashio/archive/v0.13.1.tar.gz" && \
    mkdir /tmp/bashio && \
    tar zxvf /tmp/bashio.tar.gz --strip 1 -C /tmp/bashio && \
    mv /tmp/bashio/lib /usr/lib/bashio && \
    ln -s /usr/lib/bashio/bashio /usr/bin/bashio

# Set shell
SHELL ["/bin/bash", "-o", "pipefail", "-c"]

WORKDIR /octo-mqtt
COPY run.sh /octo-mqtt/
RUN chmod a+x run.sh

COPY --from=builder /octo-mqtt/node_modules /octo-mqtt/node_modules
COPY --from=builder /octo-mqtt/dist/ /octo-mqtt/dist/
COPY webui /octo-mqtt/webui/

# Copy s6 service files
COPY rootfs /

ENTRYPOINT [ "/init" ]
LABEL \
    io.hass.name="Octo MQTT" \
    io.hass.description="A Home Assistant add-on to enable controlling Octo actuators star version 2." \
    io.hass.type="addon" \
    io.hass.version="1.2.3" \
    maintainer="Bram Boersma <bram.boersma@gmail.com>"