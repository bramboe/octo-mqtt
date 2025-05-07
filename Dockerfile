FROM node:18-alpine

RUN apk --no-cache add git

COPY package.json /octo-mqtt/
COPY yarn.lock /octo-mqtt/
WORKDIR /octo-mqtt

RUN yarn install

COPY src /octo-mqtt/src/
COPY tsconfig.build.json /octo-mqtt/
COPY tsconfig.json /octo-mqtt/

RUN yarn build:ci

FROM node:18-alpine

# Add env
ENV LANG C.UTF-8

RUN apk add --no-cache bash curl jq && \
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

COPY --from=0 /octo-mqtt/node_modules /octo-mqtt/node_modules
COPY --from=0 /octo-mqtt/dist/tsc/ /octo-mqtt/

ENTRYPOINT [ "/octo-mqtt/run.sh" ]
#ENTRYPOINT [ "node", "index.js" ]
LABEL \
    io.hass.name="Octo Integration via MQTT" \
    io.hass.description="Home Assistant Community Add-on for Octo actuators star version 2" \
    io.hass.type="addon" \
    io.hass.version="1.0.0" \
    maintainer="Bram Boersma <bram.boersma@gmail.com>"