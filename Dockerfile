ARG BUILD_FROM
FROM $BUILD_FROM

# Add Home Assistant dependencies
RUN \
    apk add --no-cache \
        bash \
        jq \
        tzdata \
        curl \
        ca-certificates \
        git \
        python3 \
        make \
        g++ \
        linux-headers \
        udev \
        bluez

# Install bashio
RUN \
    curl -J -L -o /tmp/bashio.tar.gz \
        "https://github.com/hassio-addons/bashio/archive/v0.14.3.tar.gz" \
    && mkdir /tmp/bashio \
    && tar zxvf \
        /tmp/bashio.tar.gz \
        --strip 1 -C /tmp/bashio \
    && mv /tmp/bashio/lib /usr/lib/bashio \
    && ln -s /usr/lib/bashio/bashio /usr/bin/bashio \
    && rm -rf /tmp/bashio*

# Install S6 overlay
RUN \
    curl -L -s "https://github.com/just-containers/s6-overlay/releases/download/v2.2.0.3/s6-overlay-aarch64.tar.gz" > /tmp/s6-overlay.tar.gz \
    && tar xzf /tmp/s6-overlay.tar.gz -C / \
    && rm /tmp/s6-overlay.tar.gz

# Copy root filesystem
COPY rootfs /

# Copy app
COPY . /app

WORKDIR /app

# Install dependencies and build
RUN \
    npm install && \
    npm run build && \
    npm prune --production

# Set correct permissions
RUN \
    chown -R root:root /app && \
    chmod a+x /app/run.sh

# S6 overlay
ENTRYPOINT ["/init"]
CMD []

# Labels
LABEL \
    io.hass.name="Octo MQTT" \
    io.hass.description="A Home Assistant add-on to enable controlling Octo actuators star version 2." \
    io.hass.type="addon" \
    io.hass.version="1.2.0" \
    maintainer="Bram Boersma <bram.boersma@gmail.com>"