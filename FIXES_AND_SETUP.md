# HireBridge - AI Interview Platform

## 🚀 Recent Fixes

### Issues Resolved:
1. ✅ **404 Error on `/api/questions/start`** - Added missing interview initialization endpoint
2. ✅ **404 Error on `/api/questions/next`** - Added dynamic question generation endpoint  
3. ✅ **502 Error on `/api/did/talk`** - Enhanced D-ID API error handling and authentication
4. ✅ **Interview State Management** - Implemented session tracking with question history and scoring

### New Features Added:
- 🎯 Dynamic question difficulty adjustment based on answer quality
- 📊 AI-powered answer scoring (1-10 scale)
- 💾 Interview session persistence
- 🔄 Question topic tracking to avoid repetition
- 📝 Comprehensive error logging and debugging

---

## 📋 Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Google Gemini API Key
- D-ID API Key (for avatar features)
- Firebase Account (for authentication)

---

## 🛠️ Setup Instructions

### 1. Backend Setup

```bash
cd backend

# Install dependencies
npm install

# Create environment file
cp .env.example .env

# Edit .env and add your API keys:
# - GEMINI_API_KEY (from https://makersuite.google.com/app/apikey)
# - DID_API_KEY (from https://studio.d-id.com/account-settings)

# Start the backend server
npm start
```

The backend will run on `http://localhost:8080`

### 2. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Create environment file
cp .env.example .env

# Edit .env and add your Firebase configuration

# Start the development server
npm run dev
```

The frontend will run on `http://localhost:5173` or `http://localhost:5174`

---

## 🔧 API Endpoints

### Interview Endpoints (NEW)

#### `POST /api/questions/start`
Initialize a new interview session or resume an existing one.

**Request Body:**
```json
{
  "role": "Software Developer",
  "interviewId": "optional_existing_id"
}
```

**Response:**
```json
{
  "interviewId": "interview_1234567890_abc123",
  "question": "First interview question...",
  "questionNumber": 1
}
```

#### `POST /api/questions/next`
Get the next question based on the previous answer.

**Request Body:**
```json
{
  "interviewId": "interview_1234567890_abc123",
  "role": "Software Developer",
  "lastAnswer": "User's answer to previous question"
}
```

**Response:**
```json
{
  "question": "Next interview question...",
  "questionNumber": 2
}
```

### Avatar Endpoints

#### `POST /api/did/talk`
Generate a talking avatar video using D-ID API.

**Request Body:**
```json
{
  "scriptText": "Text for the avatar to speak",
  "avatarUrl": "optional_custom_avatar_url"
}
```

**Response:**
```json
{
  "videoUrl": "https://d-id-video-url.mp4"
}
```

### Other Endpoints

- `GET /api/test` - Health check endpoint
- `POST /api/validate-resume` - Upload and validate resume PDF
- `POST /api/chat` - AI chat interaction
- `POST /api/evaluate` - Evaluate interview performance

---

## 🐛 Troubleshooting

### 404 Errors on API Calls

**Problem:** Frontend shows "Failed to load resource: 404 (Not Found)"

**Solutions:**
1. Ensure backend is running on port 8080
2. Check that Vite proxy is configured (already set in `vite.config.js`)
3. Verify the backend routes are registered (now fixed)

### 502 Bad Gateway on D-ID Avatar

**Problem:** D-ID API returns 502 errors

**Solutions:**
1. Add valid D-ID API key to backend `.env` file
2. Check API key format (should be just the key or `username:key`)
3. Verify D-ID account has credits remaining
4. Check console logs for detailed error messages (now added)

**Note:** If you don't need avatar features, you can:
- Comment out D-ID calls in `Interview.jsx`
- Use text-only interview mode

### Webcam Permission Error

**Problem:** "NotAllowedError: Permission dismissed"

**This is NOT a code error** - it means:
- User denied camera access, or
- Browser blocked camera access, or
- No camera available on the device

**Solutions:**
- Click "Allow" when browser asks for camera permission
- Check browser settings to enable camera for this site
- Use Firefox/Chrome with camera support

### Interview Not Starting

**Problem:** Interview component doesn't load questions

**Solutions:**
1. Clear localStorage: `localStorage.clear()`
2. Check browser console for specific error messages
3. Verify backend API keys are set correctly
4. Restart both frontend and backend servers

---

## 📦 Dependencies

### Backend
- `express` - Web server framework
- `cors` - Cross-origin resource sharing
- `axios` / `node-fetch` - HTTP requests
- `@google/generative-ai` - Google Gemini AI
- `pdf-parse` - PDF parsing for resume validation
- `multer` - File upload handling

### Frontend
- `react` - UI framework
- `react-router-dom` - Routing
- `axios` - HTTP client
- `firebase` - Authentication and database
- `tailwindcss` - Styling

---

## 🔐 Security Notes

- Never commit `.env` files to version control
- Keep API keys secure and rotate them regularly
- Use environment variables for all sensitive data
- The `.env.example` files are provided as templates

---

## 📊 How It Works

1. **User starts interview** → Frontend calls `/api/questions/start`
2. **Backend generates first question** → Uses `questions.js` role-based question bank
3. **User answers** → Frontend sends answer to `/api/questions/next`
4. **AI scores answer** → Gemini AI rates answer 1-10
5. **Next question generated** → Difficulty adjusts based on score
6. **Process repeats** → Questions continue until interview complete
7. **Final evaluation** → User can view feedback and score

---

## 🎯 Supported Roles

- Software Developer
- Data Analyst  
- AI / ML Engineer
- HR / Management

Each role has custom questions across difficulty levels (easy, medium, hard).

---

## 🚧 Future Improvements

- [ ] Database persistence for interview sessions
- [ ] Video recording and playback
- [ ] Multi-language support
- [ ] Custom question banks
- [ ] Resume parsing integration with questions
- [ ] Real-time interview metrics dashboard

---

## 📞 Support

If you encounter any issues:
1. Check the console logs (both frontend and backend)
2. Verify all environment variables are set
3. Ensure all dependencies are installed
4. Restart servers after configuration changes

---

## 📄 License

MIT License - Feel free to use and modify as needed.
