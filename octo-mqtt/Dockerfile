# --- Build stage ---
ARG BUILD_FROM
FROM $BUILD_FROM as build

# Install Node.js and system dependencies
RUN \
  apk add --no-cache \
    nodejs \
    npm \
    bash \
    curl \
    jq \
    tzdata

# Bashio is already included in Home Assistant base images

# Set working directory
WORKDIR /app

# Install all dependencies (including dev) for build
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps

# Copy all source code and build
COPY . .
RUN npm run build

# --- Final image ---
FROM $BUILD_FROM
RUN apk add --no-cache nodejs npm bash curl jq tzdata
WORKDIR /app

# Install only production dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --legacy-peer-deps --ignore-scripts

# Copy built output and webui from build stage
COPY --from=build /app/dist/tsc ./dist/tsc
COPY --from=build /app/webui ./webui
COPY --from=build /app/run.sh ./run.sh
RUN chmod +x ./run.sh

# Set environment
ENV NODE_ENV=production

# Expose port
EXPOSE 8099

# Verify installation
RUN ls -la /app/

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s \
  CMD curl -f http://localhost:8099/health || exit 1

# Start the application
ENTRYPOINT ["/bin/bash", "/app/run.sh"]

LABEL \
    io.hass.name="Octo MQTT" \
    io.hass.description="Home Assistant add-on to enable controlling Octo actuators star version 2" \
    io.hass.type="addon" \
    io.hass.version="2.6.5" \
    io.hass.arch="armhf|aarch64|i386|amd64|armv7" \
    maintainer="Bram Boersma <bram.boersma@gmail.com>"