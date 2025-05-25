FROM node:18-alpine

# Force rebuild by changing this version number
ENV BUILD_VERSION=v2025.05.25.7

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
COPY tsconfig.prod.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY src ./src/
COPY webui ./webui/

# Copy debug index.js (temporary - should not be used)
COPY index.js ./index.js

# Build the TypeScript application
RUN npm run build

# Copy run script and make it executable
COPY run.sh ./run.sh
RUN chmod +x ./run.sh

# Set environment
ENV NODE_ENV=production

# Expose port
EXPOSE 8099

# Debug: Show what files we have and check if build succeeded
RUN echo "=== FILES IN /app ===" && ls -la /app/ && \
    echo "=== BUILT FILES ===" && ls -la /app/dist/ && \
    echo "=== CHECKING BUILD SUCCESS ===" && \
    if [ -f "dist/tsc/index.js" ]; then \
        echo "✅ TypeScript build SUCCESS: dist/tsc/index.js exists"; \
        echo "📊 Built file size: $(ls -lh dist/tsc/index.js | awk '{print $5}')"; \
    else \
        echo "❌ TypeScript build FAILED: dist/tsc/index.js missing"; \
        echo "📁 Contents of dist directory:"; \
        ls -la dist/ 2>/dev/null || echo "dist directory does not exist"; \
        exit 1; \
    fi && \
    echo "=== CONTENT OF run.sh FIRST 10 LINES ===" && head -10 /app/run.sh

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s \
  CMD curl -f http://localhost:8099/health || exit 1

# Start the application  
ENTRYPOINT ["/bin/bash", "/app/run.sh"]

LABEL \
    io.hass.name="Octo Integration via MQTT" \
    io.hass.description="Home Assistant Community Add-on for Octo actuators star version 2 (TypeScript version)" \
    io.hass.type="addon" \
    io.hass.version="2.0.3" \
    maintainer="Bram Boersma <bram.boersma@gmail.com>"