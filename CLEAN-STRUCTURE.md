# N10L File Structure - Clean Version

## ✅ **THESE ARE THE CORRECT FILES TO USE:**

### **Client-Side (Frontend)**
- `src/client/admin.html` - Admin dashboard (19KB)
- `src/client/index.html` - Course selection page (15KB) 
- `src/client/PersonalCare.html` - Student evaluation interface (74KB)

### **Server-Side (Backend)**
- `src/server/index.js` - Main server file (27KB)
- `src/server/package.json` - Node.js dependencies (1.2KB)
- `src/server/nodemon.json` - Nodemon configuration (384B)
- `src/server/utils/logger.js` - Winston logging utility (2.3KB)

### **Configuration**
- `config/docker-compose.yml` - Docker development setup (1.5KB)
- `config/Dockerfile` - Docker image configuration (1.1KB)
- `config/Dockerfile.production` - Production Docker config (1.2KB)

### **Scripts**
- `scripts/dev-start.sh` - Development startup script
- `scripts/build-latest.sh` - Build script
- `scripts/update-packages.sh` - Package update script

### **Documentation**
- `README.md` - Main project documentation (8.4KB)
- `docs/` - Additional documentation files

## ❌ **REMOVED DUPLICATE/EMPTY FILES:**
- ~~`admin.html`~~ (root) - Empty duplicate
- ~~`index.html`~~ (root) - Empty duplicate  
- ~~`PersonalCare.html`~~ (root) - Empty duplicate
- ~~`server/`~~ (root directory) - Empty duplicate directory
- ~~`docker-compose.yml`~~ (root) - Empty duplicate
- ~~`Dockerfile`~~ (root) - Empty duplicate
- ~~`src/server/logger.js`~~ - Old ES modules version
- ~~`src/server/middleware/`~~ - Empty directory
- ~~`src/server/services/`~~ - Empty directory
- ~~`src/client/peer_evaluation_app.html`~~ - Empty file
- ~~`src/client/README.md`~~ - Empty file

## 🎯 **Development Commands:**

```bash
# Local development
cd src/server
npm install
npm run dev

# Docker development  
./scripts/dev-start.sh docker

# Or from config directory:
cd config
docker-compose up --build
```

## 📍 **Access URLs:**
- Main App: http://localhost:3001
- Student Interface: http://localhost:3001/personal-care
- Admin Dashboard: http://localhost:3001/admin

---
**Note**: All empty duplicate files have been removed to prevent confusion during development.
