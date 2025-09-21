# N10LVoice Nursing Evaluation System

A real-time Socket.IO-based evaluation system for nursing students with live admin monitoring, multi-week course support, and integrated Web Speech API for voice transcription during evaluations.

## 📁 Project Structure

```
N10LVoice/
├── src/                          # Source code
│   ├── client/                   # Client-side files (HTML, CSS, JS)
│   │   ├── index.html           # Course/week selection page
│   │   ├── PersonalCare.html    # Student evaluation interface with speech
│   │   ├── admin.html           # Real-time admin dashboard with speech review
│   │   ├── js/                  # JavaScript modules
│   │   │   └── speech-to-text.js # Web Speech API module
│   │   └── README.md            # Client documentation
│   └── server/                   # Server-side code
│       ├── index.js             # Main server with Socket.IO + Speech API
│       ├── utils/               # Utility modules
│       │   └── logger.js        # Winston logging configuration
│       ├── package.json         # Node.js dependencies
│       ├── nodemon.json         # Nodemon configuration
│       ├── .env                 # Environment variables (create from .env.example)
│       └── .env.example         # Environment template
├── config/                       # Configuration files
│   ├── docker-compose.yml       # Docker Compose for development
│   ├── Dockerfile               # Docker image configuration
│   └── Dockerfile.production    # Production Docker configuration
├── database/                     # Database related files
│   ├── migrations/              # Database migration scripts
│   └── seeds/                   # Database seed data
├── docs/                        # Documentation
│   ├── README.md               # Project documentation
│   ├── DEV-COMMANDS.md         # Development commands
│   └── *.md, *.txt, *.doc      # Other documentation files
├── scripts/                     # Utility scripts
│   ├── build-latest.sh         # Build script
│   ├── dev-start.sh            # Development startup script
│   └── *.py                    # Python utility scripts
└── logs/                        # Application logs
    ├── n10l-app.log            # Application logs
    ├── n10l-error.log          # Error logs
    └── n10l-access.log         # Access logs
```

## 🚀 Quick Start

### Development Mode

1. **Navigate to server directory:**
   ```bash
   cd src/server
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Create environment file:**
   ```bash
   cp .env.example .env
   # Edit .env with your database credentials
   ```

4. **Start development server:**
   ```bash
   npm run dev
   ```

5. **Access the application:**
   - Main page: http://localhost:3001
   - Personal Care Evaluation: http://localhost:3001/personal-care
   - Admin Dashboard: http://localhost:3001/admin

> **Note**: For speech functionality, use HTTPS in production or enable microphone access in browser settings for HTTP localhost.

### Docker Development

1. **From project root:**
   ```bash
   cd config
   docker-compose up --build
   ```

2. **Access via Docker:**
   - Application: http://localhost:3001

## 🎤 Speech-to-Text Usage

### For Students
1. **Open PersonalCare evaluation page**
2. **Grant microphone permission** when prompted by browser
3. **Click "🎤 Start Recording"** in the toolbar to begin speech capture
4. **Speak naturally** during your evaluation - transcription appears in real-time
5. **Speech auto-saves** every 10 seconds, with final save when you click "⏹️ Stop Recording"

### For Instructors/Admins
1. **Navigate to Admin Dashboard** and login
2. **Click "Speech Transcriptions" tab** to view all student speech data
3. **Filter transcriptions** by student name, course, or type (final/interim)
4. **Click "View" button** to read full transcription text
5. **Delete transcriptions** if needed for privacy or cleanup

### Browser Compatibility
- **✅ Fully Supported**: Chrome, Edge, Opera, Chrome Mobile
- **⚠️ Limited Support**: Firefox (basic functionality)
- **❌ Not Supported**: Safari (limited Web Speech API support)
- **📱 Mobile**: Works with phone microphones and Bluetooth headsets

### Privacy & Security
- **Local Processing**: Speech recognition happens in the browser
- **Text Only**: Only transcribed text is sent to server (no audio files)
- **Session Linked**: Transcriptions tied to evaluation sessions
- **Admin Control**: Complete management of speech data

## 🔧 Features

### 🎤 Web Speech API Integration (NEW)
- **Real-time Speech-to-Text**: Continuous speech recognition during evaluations
- **Auto-save Transcriptions**: Automatic saving every 10 seconds with final save on stop
- **Admin Speech Review**: Complete speech transcription management in admin dashboard
- **Session Tracking**: Speech data linked to evaluation sessions for comprehensive review
- **Browser Compatibility**: Works with Chrome, Edge, and other WebKit-based browsers
- **Mobile Support**: Speech recognition works with phone microphones and headsets

### Real-time Socket.IO Integration
- **Student Interface**: Live progress tracking and evaluation submission
- **Admin Dashboard**: Real-time monitoring of all connected students
- **WebSocket Communication**: Instant updates between students and instructors

### Multi-Week Course Support
- **Week-based Organization**: Support for Week 1-5 nursing scenarios
- **Structured Database**: Organized schema for courses, sessions, and evaluations
- **Progress Tracking**: Individual week completion and scoring

### Authentication & Security
- **JWT Authentication**: Secure token-based authentication
- **Role-based Access**: Admin and student role separation
- **Bcrypt Password Hashing**: Secure password storage

### Comprehensive Logging
- **Winston Logger**: Structured logging with multiple levels
- **Morgan HTTP Logging**: Request/response logging
- **Separate Log Files**: Error, application, and access logs

## 🗄️ Database Schema

### Core Tables
- `n10l_courses`: Week definitions and scenarios
- `n10l_evaluation_sessions`: Individual evaluation sessions
- `n10l_evaluation_items`: Detailed evaluation checklist items
- `n10l_live_sessions`: Real-time session tracking
- `speech_transcriptions`: Speech-to-text data with session linking (NEW)
- `users`: Authentication and user management

### Week Structure
- Week 1: Personal Care Evaluation
- Week 2: Medication Administration
- Week 3: Vital Signs Assessment
- Week 4: Wound Care Management
- Week 5: Emergency Response

## 🔌 API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/register` - User registration

### Course Management
- `GET /api/courses` - Get all available weeks
- `GET /api/courses/:weekNumber` - Get specific week details

### Evaluation System
- `POST /api/evaluations/start` - Start new evaluation session
- `POST /api/evaluations/:sessionId/progress` - Save progress
- `POST /api/evaluations/:sessionId/complete` - Complete evaluation
- `GET /api/evaluations/history` - Get student evaluation history

### Admin Dashboard
- `GET /api/admin/active-sessions` - Get all active sessions
- `GET /api/admin/statistics` - Get evaluation statistics
- `GET /api/students/active` - Get connected students

### Speech-to-Text API (NEW)
- `POST /api/speech/save` - Save speech transcription with metadata
- `GET /api/speech/session/:sessionId` - Get transcriptions for evaluation session
- `GET /api/admin/speech/all` - Admin view of all speech transcriptions (with filters)
- `DELETE /api/admin/speech/:id` - Delete speech transcription

## 🎯 Socket.IO Events

### Student Events
- `student_connect` - Student connection with week info
- `start_evaluation` - Begin evaluation session
- `progress_update` - Send progress updates
- `complete_evaluation` - Submit final evaluation

### Admin Events
- `admin_connect` - Admin dashboard connection
- `student_connected` - New student connection notification
- `student_progress` - Live progress updates
- `evaluation_completed` - Evaluation completion notification

## 🔨 Development Commands

```bash
# Server commands (from src/server/)
npm run start          # Production start
npm run dev           # Development with nodemon
npm run watch         # Watch mode with extended file monitoring

# Docker commands (from config/)
docker-compose up              # Start development containers
docker-compose up --build     # Rebuild and start
docker-compose down           # Stop containers
docker-compose logs n10l-app  # View application logs

# Utility scripts (from scripts/)
./dev-start.sh        # Quick development startup
./build-latest.sh     # Build production image
```

## 📱 Client Interfaces

### Student Interface (`PersonalCare.html`)
- **Authentication Modal**: Secure login with student name and week selection
- **Evaluation Checklist**: Interactive evaluation items with real-time progress
- **🎤 Speech Recording**: Integrated speech-to-text with start/stop controls
- **Real-time Transcription**: Live display of speech with final and interim results
- **Socket.IO Integration**: Live connection status and progress updates
- **Responsive Design**: Mobile-friendly evaluation interface with microphone support

### Admin Dashboard (`admin.html`)
- **Real-time Monitoring**: Live view of all connected students
- **Progress Tracking**: Individual student progress cards
- **🎤 Speech Transcriptions Tab**: Complete speech review interface (NEW)
- **Speech Management**: View, filter, and delete student speech transcriptions
- **Statistics Panel**: Comprehensive evaluation statistics
- **Connection Management**: Student connection/disconnection notifications

### Course Selection (`index.html`)
- **Week Selection**: Choose from available course weeks
- **Role Selection**: Admin or student access modes
- **Course Information**: Week descriptions and scenario details

## 🔐 Environment Configuration

```bash
# Server Configuration
NODE_ENV=development
PORT=3001

# Database Configuration
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=n10l

# JWT Authentication
JWT_SECRET=your-secure-secret-key

# Logging
LOG_LEVEL=info

# Speech API Configuration (Optional)
SPEECH_AUTO_SAVE_INTERVAL=10000  # Auto-save interval in milliseconds
```

## 🚀 Production Deployment

### Standard Deployment
1. **Build production image:**
   ```bash
   docker build -f config/Dockerfile.production -t n10lvoice-eval:latest .
   ```

2. **Deploy with production settings:**
   ```bash
   docker run -d \
     --name n10lvoice-production \
     -p 3000:3000 \
     -e NODE_ENV=production \
     -e DB_HOST=your_db_host \
     n10lvoice-eval:latest
   ```

### Traefik Deployment (Recommended)
For HTTPS and proper domain routing (required for speech functionality):

```yaml
# docker-compose.production.yml
version: '3.8'
services:
  n10lvoice:
    build:
      context: .
      dockerfile: config/Dockerfile.production
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.n10lvoice.rule=Host(`yourdomain.com`) && PathPrefix(`/N10LVoice`)"
      - "traefik.http.routers.n10lvoice.entrypoints=websecure"
      - "traefik.http.routers.n10lvoice.tls.certresolver=myresolver"
      - "traefik.http.middlewares.n10lvoice-stripprefix.stripprefix.prefixes=/N10LVoice"
```

> **Important**: HTTPS is required for Web Speech API to work in production browsers.

## 🤝 Contributing

1. Follow the organized file structure
2. Use proper logging with Winston
3. Maintain Socket.IO real-time functionality
4. Ensure Web Speech API browser compatibility
5. Test speech functionality across different browsers and devices
6. Update documentation for new features
7. Test in both development and Docker environments

## � Troubleshooting

### Speech API Issues
- **Microphone not working**: Check browser permissions and HTTPS requirement
- **No transcription**: Verify Web Speech API browser support
- **Auto-save failing**: Check API endpoints and network connectivity
- **Mobile issues**: Ensure proper microphone access on mobile browsers

### Development Issues
- **Docker container not starting**: Check port conflicts and environment variables
- **Database connection**: Verify MySQL credentials and network connectivity
- **Socket.IO issues**: Check WebSocket proxy settings in production

## �📄 License

MIT License - Educational use for nursing evaluation systems with speech transcription capabilities.

---

**Note**: This is a production-ready nursing evaluation system with comprehensive real-time Socket.IO functionality, multi-week support, and integrated Web Speech API for enhanced student assessment through voice transcription. The system prioritizes student privacy by processing speech locally and storing only text transcriptions.
