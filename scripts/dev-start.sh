#!/bin/bash

# N10L Development Server Startup Script

echo "🏥 Starting N10L Real-Time Evaluation System"
echo "============================================"

# Check if we're in the right directory
if [ ! -d "src/server" ]; then
    echo "❌ Error: Please run this script from the N10L project root directory"
    exit 1
fi

# Option 1: Docker Development
if [ "$1" == "docker" ]; then
    echo "🐳 Starting with Docker..."
    
    # Check if Docker is running
    if ! docker info > /dev/null 2>&1; then
        echo "❌ Docker is not running. Please start Docker first."
        exit 1
    fi

    # Check if network exists
    if ! docker network ls | grep -q "va-education"; then
        echo "📡 Creating va-education network..."
        docker network create va-education
    fi

    # Navigate to config directory and start
    cd config
    echo "🛑 Stopping existing containers..."
    docker-compose down
    
    echo "🚀 Building and starting services..."
    docker-compose up --build -d
    
    echo "⏳ Waiting for services to start..."
    sleep 10
    
    echo "🔍 Checking service health..."
    echo "Server Health: $(curl -s http://localhost:3001/api/health | jq -r '.ok // "Error"' 2>/dev/null || echo "Not Ready")"
    
    echo ""
    echo "📝 Service logs (press Ctrl+C to stop viewing logs):"
    echo "=============================================================="
    docker-compose logs -f n10l-app
    
else
    # Option 2: Local Development
    echo "💻 Starting local development server..."
    
    # Navigate to server directory
    cd src/server
    
    # Check if .env file exists
    if [ ! -f ".env" ]; then
        echo "📝 Creating .env file from template..."
        cp .env.example .env
        echo "⚠️  Please edit src/server/.env with your database credentials"
    fi
    
    # Check if node_modules exists
    if [ ! -d "node_modules" ]; then
        echo "📦 Installing dependencies..."
        npm install
    fi
    
    # Start the development server
    echo "🚀 Starting development server with nodemon..."
    echo "📍 Server will be available at: http://localhost:3001"
    echo "🎓 Student Interface: http://localhost:3001/personal-care"
    echo "👨‍🏫 Admin Dashboard: http://localhost:3001/admin"
    echo ""
    echo "Press Ctrl+C to stop the server"
    echo "============================================"
    
    npm run dev
fi
