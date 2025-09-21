# N10L Project Context & Development Plan

## 📋 **Project Overview**

### **Primary Goal**
Real-time nursing evaluation system for NURS 10L students using digital checklists with live instructor monitoring capabilities.

### **Application Purpose**
- **Clinical Skills Assessment**: Digital evaluation of nursing procedures (personal care, medication admin, vital signs, etc.)
- **Real-time Monitoring**: Instructors can watch student progress live via admin dashboard
- **Multi-week Course Support**: 5 different nursing scenarios (Week 1-5)
- **Mobile-friendly Interface**: Students use tablets/phones during clinical practice

---

## 🏗️ **Infrastructure & Environment**

### **Development Environment**
- **Platform**: Linux VPS (Ubuntu/Debian)
- **Server**: vps3071119 (209.159.156.82)
- **User**: touthao
- **Development Mode**: Docker with live reload (nodemon)
- **Code Editor**: Visual Studio Code with GitHub Copilot
- **Remote Access**: VS Code Remote Tunnels

### **Production Deployment**
- **Public URL**: https://educationservice.net/N10L/
- **Reverse Proxy**: Traefik with SSL termination
- **SSL Certificate**: Let's Encrypt (myresolver)
- **Path Prefix**: `/N10L` (stripped by Traefik middleware)
- **Container Network**: `touthao_va-education`

### **Database Infrastructure**
- **Database Server**: mysql-va-units (existing MySQL container)
- **Database Name**: N10L
- **Service User**: va_service
- **Service Password**: service_pass_2024
- **Connection**: Internal Docker network communication
- **Schema**: Multi-week evaluation structure with real-time tracking

---

## 🐳 **Docker Architecture**

### **Development Container**
```yaml
Container Name: n10l-eval-app
Base Image: node:20-alpine
Working Directory: /app/server
Port Mapping: 3001:3000
Network: touthao_va-education
```

### **Volume Mappings (Live Reload)**
```yaml
- ../src/server:/app/server:rw    # Server code (hot reload)
- ../src/client:/app/client:rw    # Client files (hot reload)  
- ../logs:/app/logs:rw            # Log persistence
- /app/server/node_modules        # Isolated dependencies
```

### **Environment Variables**
```bash
NODE_ENV=development
PORT=3000
DB_HOST=mysql-va-units
DB_PORT=3306
DB_USER=va_service
DB_PASSWORD=service_pass_2024
DB_NAME=N10L
JWT_SECRET=n10l-evaluation-secret-2024
```

---

## 🌐 **Technology Stack**

### **Backend (Node.js)**
- **Framework**: Express.js 4.19.2
- **Real-time**: Socket.IO 4.7.5 (WebSocket communication)
- **Database**: MySQL2 3.11.3 (connection pooling)
- **Authentication**: JWT + bcryptjs (secure tokens & password hashing)
- **Logging**: Winston 3.14.2 (structured logging with daily rotation)
- **HTTP Logging**: Morgan 1.10.0 (request/response tracking)
- **Development**: Nodemon 3.1.4 (live reload)

### **Frontend (Vanilla JavaScript)**
- **Interface**: Pure HTML5/CSS3/JavaScript (no frameworks)
- **Real-time**: Socket.IO client (live progress updates)
- **Design**: Mobile-first responsive design
- **Authentication**: JWT tokens with role-based access
- **PWA Features**: Mobile web app capabilities

### **Database Schema**
```sql
Tables:
- n10l_courses           # Week definitions (1-5)
- n10l_evaluation_sessions # Individual evaluation sessions  
- n10l_evaluation_items    # Detailed checklist items
- n10l_live_sessions      # Real-time tracking
- users                   # Authentication & user management
```

---

## 🎯 **Development Plan & Goals**

### **Phase 1: Infrastructure Stability ✅**
- [x] Clean file structure organization
- [x] Docker development environment
- [x] Database connection verification
- [x] Socket.IO real-time communication
- [x] Traefik reverse proxy configuration

### **Phase 2: Core Functionality Enhancement**
- [ ] **Database Migration Scripts**: Automated schema setup
- [ ] **Authentication Improvements**: Enhanced login/session management
- [ ] **Socket.IO Optimization**: Connection pooling & error handling
- [ ] **Logging Enhancement**: Structured logging with proper log levels
- [ ] **Error Handling**: Comprehensive error management

### **Phase 3: Clinical Features**
- [ ] **Multi-week Content**: Complete all 5 nursing scenarios
- [ ] **Evaluation Logic**: Advanced scoring algorithms
- [ ] **Progress Analytics**: Detailed student performance metrics
- [ ] **Export Functionality**: PDF reports for instructors
- [ ] **Mobile Optimization**: Enhanced tablet/phone experience

### **Phase 4: Production Readiness**
- [ ] **Performance Optimization**: Caching & load optimization
- [ ] **Security Hardening**: Enhanced authentication & validation
- [ ] **Monitoring**: Health checks & metrics collection
- [ ] **Backup Strategy**: Database backup & recovery procedures
- [ ] **Documentation**: Complete API & user documentation

---

## 🔌 **Network & Access Configuration**

### **Traefik Routing Rules**
```yaml
Host Rule: educationservice.net
Path Prefix: /N10L
Entry Point: websecure (HTTPS)
TLS: Let's Encrypt certificate
Middleware: Strip /N10L prefix
Load Balancer: Port 3000
```

### **Development Access**
- **Local Development**: http://localhost:3001
- **Docker Development**: http://localhost:3001 (port forwarded)
- **Production URL**: https://educationservice.net/N10L/
- **Admin Dashboard**: https://educationservice.net/N10L/admin
- **Student Interface**: https://educationservice.net/N10L/personal-care

### **Remote Development**
- **VS Code Remote**: Connected via SSH/tunnels
- **GitHub Integration**: Code sync with GitHub Copilot assistance
- **Live Reload**: Nodemon watches for file changes
- **Hot Reload**: Docker volumes enable real-time code updates

---

## 🚀 **Quick Start Commands**

### **Development Startup**
```bash
# From project root
./scripts/dev-start.sh docker

# Manual Docker startup
cd config
docker-compose up --build
```

### **Direct Development**
```bash
# Local development (bypass Docker)
cd src/server
cp .env.example .env  # Edit with credentials
npm install
npm run dev
```

### **Logs & Monitoring**
```bash
# View application logs
docker-compose logs -f n10l-app

# View live logs
tail -f logs/n10l-app-$(date +%Y-%m-%d).log

# Container health check
curl -s http://localhost:3001/api/health
```

---

## 📊 **Current System Status**

### **Operational Status**
- ✅ **Docker Environment**: Configured and functional
- ✅ **Database Connection**: Connected to mysql-va-units
- ✅ **Socket.IO**: Real-time communication active
- ✅ **Traefik Integration**: SSL reverse proxy working
- ✅ **File Structure**: Clean organization completed
- ✅ **Development Workflow**: VS Code + Copilot + live reload

### **Key Endpoints**
- **Health Check**: `/api/health`
- **Authentication**: `/api/auth/login`, `/api/auth/register`
- **Courses**: `/api/courses`, `/api/courses/:weekNumber`
- **Evaluations**: `/api/evaluations/*`
- **Admin**: `/api/admin/*`
- **Socket.IO**: Real-time WebSocket on same port

### **Database Tables Status**
- **Active Tables**: 5 core tables for evaluation system
- **Existing Data**: Default admin user (admin/admin123)
- **Week Data**: 5 nursing scenarios pre-loaded
- **Connection Pool**: MySQL2 with connection pooling

---

## 🔧 **Development Workflow**

### **Code Development**
1. **Edit Code**: VS Code with GitHub Copilot assistance
2. **Auto Reload**: Nodemon detects changes and restarts server
3. **Live Update**: Docker volumes sync changes immediately
4. **Test Changes**: Access via localhost:3001 or production URL
5. **Debug**: Winston logs provide detailed debugging information

### **Testing & Validation**
- **Local Testing**: http://localhost:3001
- **Production Testing**: https://educationservice.net/N10L/
- **Real-time Testing**: Multiple browser windows (student + admin)
- **Mobile Testing**: Responsive design on various devices
- **Socket.IO Testing**: Live connection monitoring

### **Deployment Process**
- **Development**: Docker compose with live reload
- **Staging**: Same environment, different network
- **Production**: Traefik routing to production container
- **Rollback**: Previous container versions maintained

---

## 📝 **Next Actions & Priorities**

### **Immediate Tasks**
1. **Database Validation**: Verify all tables and data integrity
2. **Socket.IO Testing**: Test real-time functionality across multiple users
3. **Authentication Flow**: Test login/logout for students and admins
4. **Mobile Compatibility**: Ensure proper responsive behavior
5. **Error Handling**: Implement comprehensive error management

### **Short-term Goals**
1. **Content Management**: Add remaining nursing scenarios (Week 2-5)
2. **Performance Optimization**: Database query optimization
3. **Security Enhancement**: Input validation and sanitization
4. **Monitoring Setup**: Application performance monitoring
5. **Documentation**: Complete API documentation

### **Long-term Vision**
1. **Multi-institution Support**: Scalable for multiple nursing schools
2. **Advanced Analytics**: Student performance analytics dashboard
3. **Integration Capabilities**: LMS integration (Canvas, Blackboard)
4. **Mobile App**: Native mobile application development
5. **AI-powered Features**: Automated evaluation assistance

---

**Last Updated**: September 6, 2025  
**Environment**: Development (Docker + Traefik + MySQL)  
**Status**: Active Development Phase
