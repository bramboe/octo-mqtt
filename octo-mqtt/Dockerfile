FROM node:18-alpine

# Force rebuild by changing this version number
ENV BUILD_VERSION=v2025.05.26.1

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

# Install dependencies with verbose logging
RUN echo "=== INSTALLING DEPENDENCIES ===" && \
    npm install --verbose && \
    echo "=== DEPENDENCIES INSTALLED ===" && \
    npm list

# Copy source code
COPY src ./src/
COPY webui ./webui/

# Copy fallback index.js (improved version with working endpoints)
COPY index.js ./index.js

# Build the TypeScript application with detailed logging
RUN echo "=== STARTING TYPESCRIPT BUILD ===" && \
    echo "TypeScript version: $(npx tsc --version)" && \
    echo "Source files:" && \
    find src -name "*.ts" | head -10 && \
    echo "=== RUNNING BUILD COMMAND ===" && \
    npm run build && \
    echo "=== BUILD COMPLETED ===" && \
    echo "Checking build output:" && \
    ls -la dist/ && \
    if [ -d "dist/tsc" ]; then \
        echo "✅ dist/tsc directory exists"; \
        ls -la dist/tsc/; \
        if [ -f "dist/tsc/index.js" ]; then \
            echo "✅ TypeScript build SUCCESS: dist/tsc/index.js exists"; \
            echo "📊 Built file size: $(ls -lh dist/tsc/index.js | awk '{print $5}')"; \
            echo "📄 First 10 lines of built file:"; \
            head -10 dist/tsc/index.js; \
        else \
            echo "❌ TypeScript build FAILED: dist/tsc/index.js missing"; \
            echo "📁 Contents of dist/tsc directory:"; \
            ls -la dist/tsc/ 2>/dev/null || echo "dist/tsc directory is empty"; \
            echo "⚠️  Will use fallback index.js"; \
        fi; \
    else \
        echo "❌ dist/tsc directory missing"; \
        echo "⚠️  Will use fallback index.js"; \
    fi

# Copy run script and make it executable
COPY run.sh ./run.sh
RUN chmod +x ./run.sh

# Set environment
ENV NODE_ENV=production

# Expose port
EXPOSE 8099

# Debug: Show final file structure
RUN echo "=== FINAL FILE STRUCTURE ===" && \
    ls -la /app/ && \
    echo "=== WEBUI FILES ===" && \
    ls -la /app/webui/ && \
    echo "=== RUN SCRIPT PREVIEW ===" && \
    head -20 /app/run.sh

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s \
  CMD curl -f http://localhost:8099/health || exit 1

# Start the application  
ENTRYPOINT ["/bin/bash", "/app/run.sh"]

LABEL \
    io.hass.name="Octo Integration via MQTT" \
    io.hass.description="Home Assistant Community Add-on for Octo actuators star version 2 (TypeScript version with fallback)" \
    io.hass.type="addon" \
    io.hass.version="2.0.5" \
    maintainer="Bram Boersma <bram.boersma@gmail.com>"