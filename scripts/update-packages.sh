#!/bin/bash

# NPM Package Update and Security Check Script
echo "🔍 N10L Package Update & Security Check"
echo "======================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# Check if we're in the right directory
if [ ! -f "server/package.json" ]; then
    print_error "server/package.json not found. Please run this script from the N10L project root."
    exit 1
fi

cd server

print_info "Current directory: $(pwd)"

# 1. Check current package versions
print_info "Checking current package versions..."
echo "Current installed packages:"
npm list --depth=0

echo ""
print_info "Checking for outdated packages..."
npm outdated

# 2. Security audit
echo ""
print_info "Running security audit..."
npm audit

# 3. Update packages
echo ""
read -p "Do you want to update packages? (y/N): " update_packages

if [[ $update_packages =~ ^[Yy]$ ]]; then
    print_info "Updating packages to latest versions..."
    
    # Backup current package-lock.json
    if [ -f "package-lock.json" ]; then
        cp package-lock.json package-lock.json.backup
        print_status "Backed up package-lock.json"
    fi
    
    # Update packages
    npm update
    
    # Fix security vulnerabilities
    npm audit fix
    
    # If there are high severity issues, try force fix
    if npm audit | grep -q "high\|critical"; then
        print_warning "High/Critical vulnerabilities found. Attempting force fix..."
        npm audit fix --force
    fi
    
    print_status "Packages updated successfully!"
    
    echo ""
    print_info "New package versions:"
    npm list --depth=0
fi

# 4. Check for major version updates
echo ""
print_info "Checking for major version updates available..."

# List of our main dependencies
PACKAGES=("express" "mysql2" "socket.io" "jsonwebtoken" "bcryptjs" "cors" "dotenv" "winston" "winston-daily-rotate-file" "morgan" "nodemon")

echo "Major updates available:"
for package in "${PACKAGES[@]}"; do
    current=$(npm list $package --depth=0 2>/dev/null | grep $package | awk '{print $2}' | sed 's/@//')
    latest=$(npm view $package version 2>/dev/null)
    
    if [ ! -z "$current" ] && [ ! -z "$latest" ]; then
        if [ "$current" != "$latest" ]; then
            echo "  📦 $package: $current → $latest"
        fi
    fi
done

# 5. Security recommendations
echo ""
print_info "Security Recommendations:"
echo "=========================="

# Check Node.js version in package.json
node_version=$(node --version)
echo "Current Node.js version: $node_version"

# Check for known vulnerabilities
echo ""
print_info "Running final security audit..."
audit_result=$(npm audit --json 2>/dev/null)

if echo "$audit_result" | grep -q '"vulnerabilities"'; then
    vulnerabilities=$(echo "$audit_result" | grep -o '"vulnerabilities":[0-9]*' | grep -o '[0-9]*')
    if [ "$vulnerabilities" -gt 0 ]; then
        print_warning "$vulnerabilities vulnerabilities found"
    else
        print_status "No vulnerabilities found"
    fi
else
    print_status "No vulnerabilities found"
fi

# 6. Dockerfile optimization suggestions
echo ""
print_info "Docker Build Optimization:"
echo "=========================="
echo "To build with latest packages:"
echo "  ./build-latest.sh dev     # Development build"
echo "  ./build-latest.sh prod    # Production build"
echo "  ./build-latest.sh fresh   # Clean rebuild"
echo ""
echo "To update packages in running container:"
echo "  docker-compose exec n10l-app npm update"
echo "  docker-compose exec n10l-app npm audit fix"
echo "  docker-compose restart n10l-app"

# 7. Generate update summary
echo ""
print_info "Update Summary:"
echo "==============="
echo "Date: $(date)"
echo "Node.js: $node_version"
echo "NPM: $(npm --version)"
echo ""

if [[ $update_packages =~ ^[Yy]$ ]]; then
    print_status "Packages have been updated"
    print_warning "Recommended: Test the application thoroughly before deploying"
    print_info "Backup created: package-lock.json.backup"
else
    print_info "No packages were updated"
fi

echo ""
print_info "Next steps:"
echo "1. Test the application: npm run dev"
echo "2. Check Docker build: docker-compose up --build"
echo "3. Run integration tests if available"
echo "4. Deploy to staging environment first"

cd ..
