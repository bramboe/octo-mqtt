ARG BUILD_FROM
FROM $BUILD_FROM as base

# Add env
ENV LANG C.UTF-8
ENV PORT=8099

# Install required packages
RUN apk add --no-cache \
    nodejs \
    npm \
    git \
    bash \
    curl \
    jq

# Install bashio
ARG BASHIO_VERSION
RUN curl -J -L -o /tmp/bashio.tar.gz "https://github.com/hassio-addons/bashio/archive/v${BASHIO_VERSION}.tar.gz" \
    && mkdir /tmp/bashio \
    && tar zxvf /tmp/bashio.tar.gz --strip 1 -C /tmp/bashio \
    && mv /tmp/bashio/lib /usr/lib/bashio \
    && ln -s /usr/lib/bashio/bashio /usr/bin/bashio \
    && rm -rf /tmp/bashio*

# Set shell
SHELL ["/bin/bash", "-o", "pipefail", "-c"]

FROM base AS builder

WORKDIR /octo-mqtt

# Copy package files
COPY package.json ./

# Install dependencies
RUN npm install

# Copy source
COPY tsconfig.build.json ./
COPY tsconfig.json ./
COPY src ./src/

# Build
RUN npm run build:ci

FROM base AS runner

WORKDIR /octo-mqtt

# Copy built files
COPY --from=builder /octo-mqtt/node_modules ./node_modules
COPY --from=builder /octo-mqtt/dist/tsc/ ./
COPY webui ./webui/
COPY run.sh ./
RUN chmod a+x run.sh

# Labels
ARG BUILD_VERSION
ARG BUILD_ARCH
LABEL \
    io.hass.name="Octo Integration via MQTT" \
    io.hass.description="Home Assistant Community Add-on for Octo actuators star version 2" \
    io.hass.type="addon" \
    io.hass.arch="${BUILD_ARCH}" \
    io.hass.version="${BUILD_VERSION}" \
    maintainer="Bram Boersma <bram.boersma@gmail.com>"

ENTRYPOINT ["/octo-mqtt/run.sh"]