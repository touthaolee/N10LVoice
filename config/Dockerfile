# Use the latest stable Node.js LTS version
FROM node:20-alpine

# Install curl for health checks
RUN apk add --no-cache curl

# Set working directory
WORKDIR /app

# Create the server directory structure
RUN mkdir -p server client logs

# Copy package files first for better caching
COPY src/server/package*.json ./server/

# Change to server directory and install dependencies
WORKDIR /app/server
RUN npm cache clean --force && \
    npm install --no-package-lock

# Copy server code
COPY src/server/ ./

# Copy client files to client directory
WORKDIR /app
COPY src/client/ ./client/

# Create logs directory with proper permissions
RUN mkdir -p logs && chmod 755 logs

# Change ownership to existing node user
RUN chown -R node:node /app

# Switch to non-root user
USER node

# Set working directory back to server
WORKDIR /app/server

# Expose port
EXPOSE 3000

# Add health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

# Default command for development with nodemon
CMD ["npm", "run", "dev"]
