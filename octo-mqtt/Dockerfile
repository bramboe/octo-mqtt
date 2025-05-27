FROM node:18-alpine

# Force rebuild by changing this version number
ENV BUILD_VERSION=v2025.05.26.3
ENV CACHE_BUST=20250526203230

# Install system dependencies
RUN apk add --no-cache bash curl jq

# Install bashio for Home Assistant integration
RUN curl -J -L -o /tmp/bashio.tar.gz "https://github.com/hassio-addons/bashio/archive/v0.13.1.tar.gz" && \
    mkdir /tmp/bashio && \
    tar zxvf /tmp/bashio.tar.gz --strip 1 -C /tmp/bashio && \
    mv /tmp/bashio/lib /usr/lib/bashio && \
    ln -s /usr/lib/bashio/bashio /usr/bin/bashio && \
    rm -rf /tmp/bashio.tar.gz /tmp/bashio

# Set working directory
WORKDIR /app

# Copy production package file and TypeScript config
COPY package.prod.json package.json
COPY package-lock.json ./
COPY tsconfig.prod.json ./

# Install dependencies with verbose logging
RUN echo "=== INSTALLING DEPENDENCIES ===" && \
    npm ci --production --verbose && \
    echo "=== DEPENDENCIES INSTALLED ==="

# Copy source code
COPY src/ ./src/
COPY webui/ ./webui/

# Build TypeScript with detailed logging
RUN echo "=== BUILDING TYPESCRIPT ===" && \
    echo "TypeScript config:" && \
    cat tsconfig.prod.json && \
    echo "Source files:" && \
    find src -name "*.ts" | head -20 && \
    npx tsc --project tsconfig.prod.json --verbose && \
    echo "=== BUILD COMPLETE ===" && \
    echo "Built files:" && \
    find dist -name "*.js" | head -10 && \
    ls -la dist/tsc/ || echo "No dist/tsc directory found"

# Copy fallback and run script
COPY index.js ./
COPY run.sh ./
RUN chmod +x run.sh

# Expose port
EXPOSE 8099

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8099/health || exit 1

# Start the application  
CMD ["./run.sh"]

LABEL \
    io.hass.name="Octo Integration via MQTT" \
    io.hass.description="Home Assistant Community Add-on for Octo actuators star version 2 (TypeScript version with fallback)" \
    io.hass.type="addon" \
    io.hass.version="2.0.9" \
    maintainer="Bram Boersma <bram.boersma@gmail.com>"