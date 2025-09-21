#!/bin/bash

# N10L Fresh Build Script with Latest NPM Packages
# This script ensures you're using the absolute latest versions

echo "🔄 Building N10L with Latest NPM Packages"
echo "=========================================="

# Function to check command availability
check_command() {
    if ! command -v $1 &> /dev/null; then
        echo "❌ $1 is not installed. Please install it first."
        exit 1
    fi
}

# Check prerequisites
check_command docker
check_command docker-compose

# Build options
BUILD_TYPE=${1:-dev}

case $BUILD_TYPE in
    "dev"|"development")
        echo "🛠️  Building for DEVELOPMENT with latest packages..."
        
        # Stop existing containers
        docker-compose down
        
        # Remove existing images to force rebuild
        docker rmi n10l_n10l-app:latest 2>/dev/null || true
        
        # Build with no cache to ensure latest packages
        docker-compose build --no-cache n10l-app
        
        # Start services
        docker-compose up -d
        
        echo "✅ Development build complete!"
        echo "📊 Server: http://localhost:3001"
        echo "📝 Logs: docker-compose logs -f n10l-app"
        ;;
        
    "prod"|"production")
        echo "🏭 Building for PRODUCTION with latest packages..."
        
        # Build production image
        docker build -f Dockerfile.production -t n10l-eval-prod:latest --no-cache .
        
        echo "✅ Production image built: n10l-eval-prod:latest"
        echo "🚀 Run with: docker run -d -p 3001:3000 --name n10l-prod n10l-eval-prod:latest"
        ;;
        
    "fresh"|"clean")
        echo "🧹 Fresh clean build..."
        
        # Stop and remove everything
        docker-compose down -v
        docker system prune -f
        docker volume prune -f
        
        # Remove all N10L related images
        docker images | grep n10l | awk '{print $3}' | xargs docker rmi -f 2>/dev/null || true
        
        # Rebuild from scratch
        docker-compose build --no-cache
        docker-compose up -d
        
        echo "✅ Fresh build complete!"
        ;;
        
    "update"|"upgrade")
        echo "📦 Updating NPM packages only..."
        
        # Run npm update inside container
        docker-compose exec n10l-app npm update
        docker-compose exec n10l-app npm audit fix
        
        # Restart to apply changes
        docker-compose restart n10l-app
        
        echo "✅ Packages updated!"
        ;;
        
    *)
        echo "Usage: $0 [dev|prod|fresh|update]"
        echo ""
        echo "Options:"
        echo "  dev     - Development build with latest packages (default)"
        echo "  prod    - Production build optimized"
        echo "  fresh   - Clean everything and rebuild from scratch"
        echo "  update  - Update NPM packages in existing container"
        exit 1
        ;;
esac

# Show package versions if successful
if [ $? -eq 0 ]; then
    echo ""
    echo "📋 Package Versions:"
    echo "==================="
    
    if [ "$BUILD_TYPE" = "prod" ] || [ "$BUILD_TYPE" = "production" ]; then
        docker run --rm n10l-eval-prod:latest npm list --depth=0
    else
        docker-compose exec n10l-app npm list --depth=0 2>/dev/null || echo "Container not running"
    fi
fi
