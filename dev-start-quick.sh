#!/bin/bash

# N10L Quick Development Startup
echo "🏥 Starting N10L Development Environment..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi

# Check if network exists, create if not
if ! docker network ls | grep -q "touthao_va-education"; then
    echo "📡 Creating va-education network..."
    docker network create touthao_va-education
fi

# Stop any existing containers
echo "🛑 Stopping existing N10L containers..."
docker-compose -f docker-compose.dev.yml down

# Start the development environment
echo "🚀 Starting N10L development container..."
docker-compose -f docker-compose.dev.yml up --build -d

# Wait for services
echo "⏳ Waiting for services to start..."
sleep 15

# Check health
echo "🔍 Checking service health..."
HEALTH=$(curl -s http://localhost:3001/api/health 2>/dev/null | grep -o '"ok":true' || echo "not ready")
echo "Health Status: $HEALTH"

# Show container status
echo ""
echo "📋 Container Status:"
docker-compose -f docker-compose.dev.yml ps

echo ""
echo "🎯 Access Points:"
echo "   Local:      http://localhost:3001"
echo "   Production: https://educationservice.net/N10L/"
echo "   Admin:      https://educationservice.net/N10L/admin"
echo "   Student:    https://educationservice.net/N10L/personal-care"
echo ""
echo "📝 View logs with: docker-compose -f docker-compose.dev.yml logs -f n10voice"
echo "🛑 Stop with: docker-compose -f docker-compose.dev.yml down"
