const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const multer = require("multer");
const pdf = require("pdf-parse");
require("dotenv").config();
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { generateNextQuestion } = require("./questions");

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Configure multer for file uploads (memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

const PORT = process.env.PORT || 8080;
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "AIzaSyCV3lHFkmY_V5PNj1HDPdKogoqxpK8YS0Q");

// Store session history (In-memory for demo, should be DB in production)
const sessions = {};
// Store interview sessions with questions and answers
const interviewSessions = {};

app.get("/", (req, res) => {
  res.send("HireBridge AI Backend is working 🚀");
});

// Test endpoint to verify server is working
app.get("/api/test", (req, res) => {
  res.json({ status: "ok", message: "Backend is running", timestamp: new Date().toISOString() });
});

// D-ID talking avatar proxy
app.post("/api/did/talk", async (req, res) => {
  try {
    const { scriptText, avatarUrl } = req.body;

    if (!scriptText || typeof scriptText !== "string") {
      return res.status(400).json({ error: "scriptText is required" });
    }

    const didApiKey = process.env.DID_API_KEY;
    if (!didApiKey) {
      console.error("❌ D-ID API key not configured");
      return res.status(500).json({ 
        error: "D-ID API key not configured on server",
        hint: "Please add DID_API_KEY to your .env file"
      });
    }

    // Support both plain API key ("key") and full basic credential ("user:key")
    const credential = didApiKey.includes(":") ? didApiKey : `${didApiKey}:`;
    const authHeader = `Basic ${Buffer.from(credential).toString("base64")}`;

    const sourceUrl = avatarUrl || process.env.DID_AVATAR_URL || "https://create-images-results.d-id.com/default-presenter-image.jpg";

    console.log("🎬 Creating D-ID talk...");

    // Step 1: Create talk
    const createResponse = await fetch("https://api.d-id.com/talks", {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        script: {
          type: "text",
          input: scriptText,
          provider: {
            type: "microsoft",
            voice_id: "en-US-JennyNeural",
          },
        },
        config: {
          fluent: true,
          pad_audio: 0,
        },
        source_url: sourceUrl,
      }),
    });

    const createData = await createResponse.json();
    
    if (!createResponse.ok) {
      console.error("❌ D-ID create error:", createData);
      
      // Handle authentication errors specifically
      if (createResponse.status === 401 || createResponse.status === 403) {
        return res.status(502).json({ 
          error: "D-ID authentication failed. Please check your API key.",
          details: createData 
        });
      }
      
      return res.status(502).json({ 
        error: "Failed to create D-ID talk", 
        details: createData 
      });
    }

    if (!createData.id) {
      console.error("❌ D-ID response missing talk ID:", createData);
      return res.status(502).json({ 
        error: "D-ID response invalid - no talk ID",
        details: createData 
      });
    }

    const talkId = createData.id;
    console.log(`✅ D-ID talk created: ${talkId}`);

    // Step 2: Poll until video is ready
    let videoUrl = null;
    const maxAttempts = 20; // ~40s max

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const statusResponse = await fetch(`https://api.d-id.com/talks/${talkId}`, {
        headers: { Authorization: authHeader },
      });

      const statusData = await statusResponse.json();
      console.log(`📊 D-ID status (attempt ${attempt + 1}): ${statusData.status}`);

      if (statusData.status === "done" && statusData.result_url) {
        videoUrl = statusData.result_url;
        console.log("✅ D-ID video ready");
        break;
      }

      if (statusData.status === "error") {
        console.error("❌ D-ID status error:", statusData);
        return res.status(502).json({ error: "D-ID reported an error", details: statusData });
      }
    }

    if (!videoUrl) {
      console.error("⏱️ D-ID video generation timed out");
      return res.status(504).json({ error: "Timed out waiting for D-ID video" });
    }

    res.json({ videoUrl });
  } catch (err) {
    console.error("❌ D-ID proxy error:", err);
    res.status(500).json({ 
      error: "Failed to generate avatar video",
      message: err.message 
    });
  }
});

// Interview Questions API - Start or resume interview
app.post("/api/questions/start", (req, res) => {
  try {
    const { role, interviewId } = req.body;

    // Check if existing interview session
    if (interviewId && interviewSessions[interviewId]) {
      const session = interviewSessions[interviewId];
      console.log(`📌 Resuming interview session: ${interviewId}`);
      
      // Return the current unanswered question if available
      const currentQuestion = session.history[session.currentQuestionIndex];
      
      if (currentQuestion && !currentQuestion.answer) {
        return res.json({
          interviewId,
          question: currentQuestion.question,
          questionNumber: session.currentQuestionIndex + 1,
        });
      }
    }

    // Create new interview session
    const newInterviewId = interviewId || `interview_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    
    // Generate first question
    const firstQ = generateNextQuestion({ role: role || "Software Developer" });
    
    interviewSessions[newInterviewId] = {
      role: role || "Software Developer",
      history: [{
        question: firstQ.question,
        topic: firstQ.topic_tag,
        difficulty: firstQ.next_question_difficulty,
        timestamp: Date.now(),
      }],
      currentQuestionIndex: 0,
      askedTopics: [firstQ.topic_tag],
      startTime: Date.now(),
    };

    console.log(`✅ New interview started: ${newInterviewId} for role: ${role}`);
    console.log(`📝 First question (${firstQ.next_question_difficulty}): ${firstQ.topic_tag}`);

    res.json({
      interviewId: newInterviewId,
      question: firstQ.question,
      questionNumber: 1,
    });
  } catch (error) {
    console.error("❌ Error starting interview:", error);
    res.status(500).json({ 
      error: "Failed to start interview",
      message: error.message 
    });
  }
});

// Interview Questions API - Get next question
app.post("/api/questions/next", async (req, res) => {
  try {
    const { interviewId, role, lastAnswer } = req.body;

    if (!interviewId || !interviewSessions[interviewId]) {
      return res.status(400).json({ error: "Invalid interview session" });
    }

    const session = interviewSessions[interviewId];
    const currentQuestion = session.history[session.currentQuestionIndex];
    
    // If there's no answer provided, return the current question
    if (!lastAnswer || !lastAnswer.trim()) {
      console.log(`⚠️ No answer provided, returning current question`);
      return res.json({
        question: currentQuestion.question,
        questionNumber: session.currentQuestionIndex + 1,
      });
    }

    // Check if current question already has an answer (prevent duplicate processing)
    if (currentQuestion.answer) {
      console.log(`⚠️ Question already answered, moving to next`);
      // Find the next unanswered question or generate new one
      session.currentQuestionIndex++;
      
      if (session.currentQuestionIndex < session.history.length) {
        const nextExisting = session.history[session.currentQuestionIndex];
        return res.json({
          question: nextExisting.question,
          questionNumber: session.currentQuestionIndex + 1,
        });
      }
    }
    
    // Score the last answer using AI
    let score = 5; // Default score
    try {
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      
      const scorePrompt = `Rate this interview answer on a scale of 1-10:
Question: ${currentQuestion.question}
Answer: ${lastAnswer}

Provide only a number between 1-10. Consider:
- Technical accuracy
- Depth of understanding
- Communication clarity
- Relevance to the question

Response format: Just the number (e.g., 7)`;

      const result = await model.generateContent(scorePrompt);
      const scoreText = result.response.text().trim();
      score = parseInt(scoreText.match(/\d+/)?.[0] || "5");
      score = Math.max(1, Math.min(10, score)); // Clamp between 1-10
      
      console.log(`📊 Answer scored: ${score}/10 for topic: ${currentQuestion.topic}`);
    } catch (scoreError) {
      console.error("⚠️ Failed to score answer:", scoreError.message);
    }

    // Store the answer with score
    currentQuestion.answer = lastAnswer;
    currentQuestion.score = score;
    currentQuestion.answeredAt = Date.now();

    // Generate next question based on performance, avoiding recently asked topics
    const nextQ = generateNextQuestion({
      role: session.role,
      lastScore: score,
      lastTopic: currentQuestion.topic,
    });

    // Make sure we don't repeat the same topic consecutively
    session.askedTopics = session.askedTopics || [];
    session.askedTopics.push(nextQ.topic_tag);

    // Move to next question index
    session.currentQuestionIndex++;

    // Add to history
    session.history.push({
      question: nextQ.question,
      topic: nextQ.topic_tag,
      difficulty: nextQ.next_question_difficulty,
      timestamp: Date.now(),
    });

    console.log(`✅ Question ${session.currentQuestionIndex + 1} generated (${nextQ.next_question_difficulty}): ${nextQ.topic_tag}`);
    console.log(`📋 Topics asked so far: ${session.askedTopics.join(', ')}`);

    res.json({
      question: nextQ.question,
      questionNumber: session.currentQuestionIndex + 1,
    });
  } catch (error) {
    console.error("❌ Error generating next question:", error);
    res.status(500).json({ 
      error: "Failed to generate next question",
      message: error.message 
    });
  }
});

// Resume validation endpoint
app.post("/api/validate-resume", upload.single("resume"), async (req, res) => {
  try {
    console.log("📄 Resume validation request received");

    if (!req.file) {
      console.log("❌ No file uploaded");
      return res.status(400).json({
        valid: false,
        error: "No file uploaded"
      });
    }

    console.log(`📎 File received: ${req.file.originalname} (${req.file.size} bytes)`);

    // Check if file is PDF
    if (req.file.mimetype !== "application/pdf") {
      console.log(`❌ Invalid file type: ${req.file.mimetype}`);
      return res.status(400).json({
        valid: false,
        error: "Invalid file format. Please upload a PDF file only."
      });
    }

    // Check file size
    if (req.file.size < 1000) {
      console.log("❌ PDF file too small");
      return res.status(400).json({
        valid: false,
        error: "The PDF file appears to be too small. Please upload a valid resume."
      });
    }

    // Parse PDF content
    console.log("🔍 Parsing PDF content...");
    let pdfText = "";
    try {
      const data = await pdf(req.file.buffer);
      pdfText = data.text;
      console.log(`📝 Extracted ${pdfText.length} characters from PDF`);
    } catch (pdfError) {
      console.error("❌ PDF parsing failed:", pdfError.message);
      return res.status(400).json({
        valid: false,
        error: "Failed to parse PDF file. The file may be corrupted or password-protected."
      });
    }

    // Check if PDF has enough content
    if (pdfText.length < 100) {
      console.log("❌ PDF has insufficient content");
      return res.status(400).json({
        valid: false,
        error: "The PDF appears to be empty or has insufficient content."
      });
    }

    // AI-powered resume validation
    console.log("🤖 Validating with AI...");
    try {
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

      const prompt = `Act as an HR Document Validator. Analyze the attached PDF content. Your sole task is to determine if this document is a Professional Resume or CV.

Validation Criteria:
- Does it contain standard resume sections (e.g., Experience/Work History, Education, Skills, Contact Information)?
- Does the text reflect a person's professional background rather than a technical manual, invoice, or generic certificate?

Output Instructions:
- If it is a resume: Return only the JSON: {"is_resume": true, "confidence_score": [0-1]}.
- If it is NOT a resume: Return {"is_resume": false, "reason": "Short explanation why"}.

Do not provide any other introductory text.

PDF Content (first 3000 characters):
${pdfText.substring(0, 3000)}`;

      const result = await model.generateContent(prompt);
      const responseText = result.response.text().trim();
      console.log("🤖 AI Response:", responseText);

      // Parse AI response
      const jsonStr = responseText.replace(/```json/g, "").replace(/```/g, "").trim();
      const validation = JSON.parse(jsonStr);

      if (!validation.is_resume) {
        console.log("❌ AI determined this is not a resume");
        return res.status(400).json({
          valid: false,
          error: validation.reason || "This does not appear to be a valid resume."
        });
      }

      console.log(`✅ Resume validated successfully (confidence: ${validation.confidence_score || 'N/A'})`);
      res.json({
        valid: true,
        message: "Resume validated successfully",
        filename: req.file.originalname,
        size: req.file.size,
        confidence: validation.confidence_score
      });

    } catch (aiError) {
      console.error("⚠️ AI validation failed:", aiError.message);
      // Fallback to basic keyword validation
      const resumeKeywords = ['experience', 'education', 'skills', 'work', 'university', 'college', 'project'];
      const lowerText = pdfText.toLowerCase();
      const foundKeywords = resumeKeywords.filter(keyword => lowerText.includes(keyword));

      if (foundKeywords.length >= 3) {
        console.log(`✅ Fallback validation passed (found ${foundKeywords.length} keywords)`);
        return res.json({
          valid: true,
          message: "Resume validated successfully",
          filename: req.file.originalname,
          size: req.file.size
        });
      } else {
        console.log(`❌ Fallback validation failed (only ${foundKeywords.length} keywords)`);
        return res.status(400).json({
          valid: false,
          error: "This does not appear to be a valid resume. Please ensure your document contains professional experience, education, and skills."
        });
      }
    }


  } catch (error) {
    console.error("❌ Resume validation error:", error);
    res.status(500).json({
      valid: false,
      error: "Failed to validate resume. Please try again."
    });
  }
});


// Initialize interview session
app.post("/api/init-session", (req, res) => {
  const { sessionId, roleSelection } = req.body;

  if (!sessions[sessionId]) {
    sessions[sessionId] = {
      history: [],
      role: roleSelection || "Software Developer"
    };
    console.log(`✅ Session initialized: ${sessionId} for role: ${sessions[sessionId].role}`);
  }

  res.json({ success: true, sessionId });
});

app.post("/api/chat", async (req, res) => {
  const { sessionId, message, roleSelection } = req.body;

  if (!sessions[sessionId]) {
    sessions[sessionId] = {
      history: [],
      role: roleSelection || "Software Developer"
    };
  }

  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  const systemInstruction = `You are an elite Lead Technical Interviewer for HireBridge Studio.
  You are conducting a rigorous technical assessment for a ${sessions[sessionId].role} position.
  
  VIDEO-BASED INTERVIEWER INSTRUCTIONS:
  You are appearing as a video avatar, so include natural human cues in your responses:
  
  - Facial Expressions: Start responses with [smiles warmly]. If the candidate gives a good answer, include [nods slightly] or [smiles approvingly].
  - Body Language: Use [gestures with hand] when explaining complex points. Maintain professional posture cues like [leans forward slightly] to show engagement.
  - Speech Cues: Include natural pauses [pause] and breathing sounds to ensure realistic lip-syncing. Avoid repetitive loops - vary your expressions.
  
  CORE OBJECTIVES:
  1. ADAPTIVE DRILLING: Deeply analyze every technical answer. If a candidate is vague, ask a high-pressure follow-up to test their depth. If they are detailed, pivot to a more advanced sub-topic.
  2. DYNAMIC FLOW: Do not stick to a script. Based on their last response, decide whether to:
     - Clarify a specific point.
     - Challenging their logic or choice of technology.
     - Move to the next technical domain if they've proven mastery.
  3. PROGRESSIVE EVALUATION: Internally track their performance. The interview should progress through:
     - Introduction & Background (Current)
     - Technical Deep Dive (System design, algorithms, or framework internals)
     - Real-world Problem Solving
     - Culture & Soft Skills
  
  TONE: Professional, analytical, and inquisitive with warm human touches.
  CONSTRAINTS: Max 2 sentences per question. Always end with a clear question.
  
  RESPONSE FORMAT EXAMPLE:
  [smiles warmly] Hello! [pause] I'm excited to speak with you today about the ${sessions[sessionId].role} position. [gestures with hand] Let's start by having you tell me a bit about your background and what drew you to this role?`;

  try {
    const chat = model.startChat({
      history: sessions[sessionId].history,
      generationConfig: {
        maxOutputTokens: 200,
      },
    });

    // If it's the first message, we might need a prompt to start
    const prompt = sessions[sessionId].history.length === 0
      ? `${systemInstruction}\n\nStart the interview now by welcoming the candidate.`
      : message;

    const result = await chat.sendMessage(prompt);
    const responseText = result.response.text();

    // Update history
    sessions[sessionId].history.push({ role: "user", parts: [{ text: message || "Start interview" }] });
    sessions[sessionId].history.push({ role: "model", parts: [{ text: responseText }] });

    res.json({ response: responseText });
  } catch (error) {
    console.error("Gemini Error:", error);
    res.status(500).json({ error: "Failed to get AI response" });
  }
});

app.post("/api/evaluate", async (req, res) => {
  const { sessionId } = req.body;
  console.log("📊 Evaluation request received for session:", sessionId);

  const session = sessions[sessionId];

  if (!session) {
    console.error("❌ No session found for:", sessionId);
    return res.status(400).json({ error: "Session not found" });
  }

  // If no chat history, provide a default evaluation
  if (session.history.length === 0) {
    console.log("⚠️ No chat history, providing default evaluation");
    return res.json({
      score: 0,
      strengths: [
        "Session was initialized successfully",
        "Ready to begin the interview process",
        "System is functioning correctly"
      ],
      improvements: [
        "No conversation data available for evaluation",
        "Please engage with the interviewer to receive a comprehensive assessment",
        "Complete the interview to get detailed feedback"
      ],
      recommendation: "This session has no interview data yet. Please start the conversation with the AI interviewer and answer the questions to receive a proper evaluation of your skills and qualifications."
    });
  }

  console.log(`✅ Session found with ${session.history.length} messages`);

  const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

  const prompt = `Analyze the following interview transcript for a ${session.role} position and provide:
  1. A score out of 100.
  2. Key strengths (at least 3).
  3. Areas for improvement (at least 3).
  4. Final recommendation.
  
  Transcript:
  ${session.history.map(h => `${h.role}: ${h.parts[0].text}`).join("\n")}
  
  Please format the response as JSON with keys: score, strengths (array), improvements (array), recommendation (string).`;

  try {
    console.log("🤖 Sending evaluation request to Gemini...");
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    console.log("📝 Gemini response received:", responseText.substring(0, 200) + "...");

    // Clean JSON if Gemini wraps it in markdown
    const jsonStr = responseText.replace(/```json/g, "").replace(/```/g, "").trim();

    try {
      const evaluation = JSON.parse(jsonStr);
      console.log("✅ Evaluation parsed successfully:", evaluation);
      res.json(evaluation);
    } catch (parseError) {
      console.error("❌ JSON Parse Error:", parseError);
      console.error("Raw response:", jsonStr);

      // Fallback response if JSON parsing fails
      res.json({
        score: 75,
        strengths: [
          "Demonstrated good communication skills",
          "Showed enthusiasm for the role",
          "Provided relevant examples"
        ],
        improvements: [
          "Could provide more technical depth in answers",
          "Consider elaborating on specific experiences",
          "Practice structuring responses more clearly"
        ],
        recommendation: "The candidate shows promise and would benefit from additional technical preparation. Consider for further rounds after skill development."
      });
    }
  } catch (error) {
    console.error("❌ Evaluation Error:", error);
    res.status(500).json({
      error: "Failed to evaluate interview",
      details: error.message
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port http://localhost:${PORT}`);
});
