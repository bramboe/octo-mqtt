ARG BUILD_FROM
FROM ${BUILD_FROM} as builder

# Add env
ENV LANG C.UTF-8
ENV PORT=8099

# Install build dependencies
RUN \
    apk add --no-cache --virtual .build-dependencies \
        git=2.40.1-r0 \
        python3=3.11.6-r1 \
        make=4.4.1-r1 \
        g++=12.2.1_git20220924-r10 \
        nodejs=18.18.2-r0 \
        npm=9.6.6-r0

WORKDIR /octo-mqtt

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source
COPY tsconfig.build.json ./
COPY tsconfig.json ./
COPY src ./src/

# Build
RUN npm run build:ci

FROM ${BUILD_FROM}

# Add env
ENV LANG C.UTF-8
ENV PORT=8099

# Install runtime dependencies
RUN \
    apk add --no-cache \
        nodejs=18.18.2-r0 \
        npm=9.6.6-r0 \
        bash=5.2.15-r5 \
        curl=8.4.0-r0 \
        jq=1.6-r3

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

# Copy built files
COPY --from=builder /octo-mqtt/node_modules ./node_modules
COPY --from=builder /octo-mqtt/dist/tsc/ ./
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
    io.hass.version="1.1.4" \
    maintainer="Bram Boersma <bram.boersma@gmail.com>"

ENTRYPOINT ["/octo-mqtt/run.sh"]