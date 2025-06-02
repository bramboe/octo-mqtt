ARG BUILD_FROM
FROM $BUILD_FROM

# Install required packages
RUN apk add --no-cache \
    nodejs \
    npm \
    git \
    python3 \
    make \
    g++ \
    linux-headers \
    udev \
    bluez

# Set work directory
WORKDIR /app

# Copy package files
COPY package.json yarn.lock ./
COPY tsconfig.json tsconfig.build.json ./

# Install dependencies
RUN npm install -g yarn && \
    yarn install --frozen-lockfile

# Copy source code
COPY src ./src
COPY webui ./webui

# Build the application
RUN yarn build:ci

# Labels
LABEL \
    io.hass.name="Octo MQTT" \
    io.hass.description="Octo MQTT integration for Octo actuators star version 2" \
    io.hass.type="addon" \
    io.hass.version="1.1.9"

# Copy run script
COPY run.sh /
RUN chmod a+x /run.sh

CMD [ "/run.sh" ]