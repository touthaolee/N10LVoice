#!/bin/bash

# N10L External Database Migration Script
# Optimizes external MySQL database for comprehensive admin interface

echo "🎓 N10L Database Migration to External MySQL"
echo "=============================================="

# Check if we're in the correct directory
if [ ! -f "docker-compose.dev.yml" ]; then
    echo "❌ Error: Please run this script from the N10L project root directory"
    exit 1
fi

echo "📍 Project: $(pwd)"
echo "🗄️  Target: External MySQL (mysql-va-units)"
echo ""

# Run the migration using the Node.js container
echo "🚀 Starting migration process..."
docker run --rm \
    --network touthao_va-education \
    -v $(pwd)/scripts:/app/scripts:ro \
    -v $(pwd)/database:/app/database:ro \
    -e DB_HOST=mysql-va-units \
    -e DB_PORT=3306 \
    -e DB_USER=va_service \
    -e DB_PASSWORD=service_pass_2024 \
    -e DB_NAME=N10L \
    -w /app \
    node:18-alpine sh -c "
        echo '📦 Installing MySQL client...' &&
        npm install mysql2 &&
        echo '🔄 Running migration...' &&
        node scripts/migrate-to-external-db.js
    "

if [ $? -eq 0 ]; then
    echo ""
    echo "🎉 Migration completed successfully!"
    echo "✅ External MySQL database optimized for N10L admin interface"
    echo ""
    echo "Next steps:"
    echo "1. Restart your N10L application: docker-compose -f docker-compose.dev.yml restart"
    echo "2. Access admin interface: https://educationservice.net/N10L/admin"
    echo "3. Login with admin credentials to manage semesters and cohorts"
else
    echo ""
    echo "❌ Migration failed. Please check the error messages above."
    echo "💡 Ensure external MySQL server is running and accessible."
fi
