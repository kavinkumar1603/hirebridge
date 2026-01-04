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
    const { role, interviewId, skipWelcome, forceNew } = req.body;

    // If forceNew is true, ignore existing session and create new one
    if (!forceNew && interviewId && interviewSessions[interviewId]) {
      const session = interviewSessions[interviewId];
      console.log(`📌 Resuming interview session: ${interviewId}`);
      
      // If resuming and welcome not shown yet, show welcome
      if (!session.welcomeShown && !skipWelcome) {
        session.welcomeShown = true;
        const welcomeMessage = `Welcome back to HireBridge! I'm glad you're here for the ${session.role} interview. Let me start by asking you a few questions to understand your background and expertise better. Are you ready to begin?`;
        
        return res.json({
          interviewId,
          isWelcome: true,
          question: welcomeMessage,
          message: welcomeMessage,
          questionNumber: 0
        });
      }
      
      // Return the current unanswered question if available
      const currentQuestion = session.history[session.currentQuestionIndex];
      
      if (currentQuestion && !currentQuestion.answer) {
        return res.json({
          interviewId,
          question: currentQuestion.question,
          question_type: currentQuestion.question_type,
          code_snippet: currentQuestion.code_snippet,
          questionNumber: session.currentQuestionIndex + 1,
        });
      }
    }

    // Create new interview session
    const newInterviewId = `interview_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    
    // If skipWelcome is true, generate first question immediately
    if (skipWelcome) {
      const firstQ = generateNextQuestion({ role: role || "Software Developer" });
      
      interviewSessions[newInterviewId] = {
        role: role || "Software Developer",
        welcomeShown: true,
        history: [{
          question: firstQ.question,
          topic: firstQ.topic_tag,
          difficulty: firstQ.next_question_difficulty,
          question_type: firstQ.question_type,
          code_snippet: firstQ.code_snippet,
          timestamp: Date.now(),
        }],
        currentQuestionIndex: 0,
        askedTopics: [firstQ.topic_tag],
        askedQuestions: [firstQ.question], // Track actual question text
        startTime: Date.now(),
      };

      console.log(`✅ New interview started: ${newInterviewId} for role: ${role} (skipped welcome)`);
      console.log(`📝 First question (${firstQ.next_question_difficulty}): ${firstQ.topic_tag} [${firstQ.question_type}]`);

      const response = {
        interviewId: newInterviewId,
        question: firstQ.question,
        questionNumber: 1,
        question_type: firstQ.question_type,
        topic_tag: firstQ.topic_tag,
        difficulty: firstQ.next_question_difficulty,
      };

      if (firstQ.code_snippet) {
        response.code_snippet = firstQ.code_snippet;
      }

      return res.json(response);
    }

    // Show welcome message for new sessions
    interviewSessions[newInterviewId] = {
      role: role || "Software Developer",
      welcomeShown: false,
      history: [],
      currentQuestionIndex: 0,
      askedTopics: [],
      askedQuestions: [], // Track actual question texts to prevent repetition
      startTime: Date.now(),
      createdAt: Date.now(),
    };

    const welcomeMessage = `Hello and welcome to HireBridge! I'm excited to interview you for the ${role || "Software Developer"} position. This will be a conversational interview where I'll ask you questions to assess your technical skills, problem-solving abilities, and experience. Each interview session is unique, so you'll receive fresh questions tailored to your performance. Feel free to take your time with each answer, and don't hesitate to ask for clarification if needed. Are you ready to begin?`;

    console.log(`✅ New interview created with welcome: ${newInterviewId} for role: ${role}`);

    res.json({
      interviewId: newInterviewId,
      isWelcome: true,
      question: welcomeMessage,
      message: welcomeMessage,
      questionNumber: 0
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
    const { interviewId, role, lastAnswer, isFirstQuestion } = req.body;

    if (!interviewId || !interviewSessions[interviewId]) {
      return res.status(400).json({ error: "Invalid interview session" });
    }

    const session = interviewSessions[interviewId];
    
    // If this is the first question after welcome, generate it
    if (isFirstQuestion && session.history.length === 0) {
      console.log(`🎬 Generating first question after welcome for: ${interviewId}`);
      
      // Ensure tracking arrays are initialized
      session.askedTopics = session.askedTopics || [];
      session.askedQuestions = session.askedQuestions || [];
      
      const firstQ = generateNextQuestion({ 
        role: session.role,
        askedTopics: session.askedTopics,
        askedQuestions: session.askedQuestions
      });
      
      session.history.push({
        question: firstQ.question,
        topic: firstQ.topic_tag,
        difficulty: firstQ.next_question_difficulty,
        question_type: firstQ.question_type,
        code_snippet: firstQ.code_snippet,
        timestamp: Date.now(),
      });
      
      // Track both topic and question text to avoid repetition
      session.askedTopics.push(firstQ.topic_tag);
      session.askedQuestions.push(firstQ.question);
      session.welcomeShown = true;
      
      console.log(`📝 First question generated: ${firstQ.topic_tag} [${firstQ.question_type}]`);
      
      const response = {
        question: firstQ.question,
        questionNumber: 1,
        question_type: firstQ.question_type,
        topic_tag: firstQ.topic_tag,
        difficulty: firstQ.next_question_difficulty,
      };
      
      if (firstQ.code_snippet) {
        response.code_snippet = firstQ.code_snippet;
      }
      
      return res.json(response);
    }
    
    const currentQuestion = session.history[session.currentQuestionIndex];
    
    // If there's no answer provided, return the current question
    if (!lastAnswer || !lastAnswer.trim()) {
      console.log(`⚠️ No answer provided, returning current question`);
      return res.json({
        question: currentQuestion.question,
        question_type: currentQuestion.question_type,
        code_snippet: currentQuestion.code_snippet,
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
          question_type: nextExisting.question_type,
          code_snippet: nextExisting.code_snippet,
          questionNumber: session.currentQuestionIndex + 1,
        });
      }
    }
    
    // Score the last answer using AI - this evaluates EVERY answer
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

      console.log(`🤖 Evaluating answer for topic: ${currentQuestion.topic}...`);
      const result = await model.generateContent(scorePrompt);
      const scoreText = result.response.text().trim();
      score = parseInt(scoreText.match(/\d+/)?.[0] || "5");
      score = Math.max(1, Math.min(10, score)); // Clamp between 1-10
      
      console.log(`📊 Answer evaluated: ${score}/10 for topic: ${currentQuestion.topic}`);
    } catch (scoreError) {
      console.error("⚠️ Failed to score answer:", scoreError.message);
      console.log(`📊 Using default score: ${score}/10`);
    }

    // Store the answer with score
    currentQuestion.answer = lastAnswer;
    currentQuestion.score = score;
    currentQuestion.answeredAt = Date.now();

    // Ensure tracking arrays are always initialized and maintained
    session.askedTopics = session.askedTopics || [];
    session.askedQuestions = session.askedQuestions || [];
    
    const nextQ = generateNextQuestion({
      role: session.role,
      lastScore: score,
      lastTopic: currentQuestion.topic,
      askedTopics: session.askedTopics,
      askedQuestions: session.askedQuestions
    });

    // Track both topic and question text to prevent repetition
    if (!session.askedTopics.includes(nextQ.topic_tag)) {
      session.askedTopics.push(nextQ.topic_tag);
    }
    if (!session.askedQuestions.includes(nextQ.question)) {
      session.askedQuestions.push(nextQ.question);
    }
    console.log(`🔖 Questions asked so far: ${session.askedQuestions.length} unique questions`);

    // Move to next question index
    session.currentQuestionIndex++;

    // Add to history
    session.history.push({
      question: nextQ.question,
      topic: nextQ.topic_tag,
      difficulty: nextQ.next_question_difficulty,
      question_type: nextQ.question_type,
      code_snippet: nextQ.code_snippet,
      timestamp: Date.now(),
    });

    console.log(`✅ Question ${session.currentQuestionIndex + 1} generated (${nextQ.next_question_difficulty}): ${nextQ.topic_tag} [${nextQ.question_type}]`);

    // Build response with all fields (backwards compatible)
    const response = {
      question: nextQ.question,
      questionNumber: session.currentQuestionIndex + 1,
      question_type: nextQ.question_type,
      topic_tag: nextQ.topic_tag,
      difficulty: nextQ.next_question_difficulty,
    };

    // Add code_snippet only if present (optional field)
    if (nextQ.code_snippet) {
      response.code_snippet = nextQ.code_snippet;
    }

    res.json(response);
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
  // 🔒 PRODUCTION-SAFE EVALUATION ENDPOINT
  // Always returns 200 with JSON, never throws unhandled errors
  
  try {
    const { sessionId, interviewId } = req.body;
    const id = sessionId || interviewId;
    
    console.log("📊 Evaluation request received for session:", id);

    // Validate input
    if (!id) {
      console.log("⚠️ No session ID provided, returning default evaluation");
      return res.status(200).json({
        fallback: true,
        score: 0,
        rating: "Incomplete",
        strengths: ["Interview session created"],
        improvements: ["Complete the interview to receive feedback"],
        recommendation: "Interview data not available. Please complete the interview process.",
        message: "Interview completed successfully"
      });
    }

    // Check both session stores
    const interviewSession = interviewSessions[id];
    const chatSession = sessions[id];

    // No session found - return safe fallback
    if (!interviewSession && !chatSession) {
      console.log("⚠️ No session found, returning completion message");
      return res.status(200).json({
        fallback: true,
        score: 0,
        rating: "Completed",
        strengths: ["Interview process completed"],
        improvements: ["Session data not preserved"],
        recommendation: "Thank you for completing the interview. Your responses have been recorded.",
        message: "Interview completed successfully"
      });
    }

    // ========== INTERVIEW SESSION (NEW FORMAT) ==========
    if (interviewSession) {
      console.log(`✅ Interview session found with ${interviewSession.history?.length || 0} questions`);

      // Validate history exists
      if (!interviewSession.history || !Array.isArray(interviewSession.history)) {
        console.log("⚠️ Invalid history structure, returning basic evaluation");
        return res.status(200).json({
          fallback: true,
          score: 50,
          rating: "Average",
          strengths: ["Completed interview session"],
          improvements: ["Data structure incomplete"],
          recommendation: "Thank you for participating in the interview.",
          message: "Interview completed"
        });
      }

      // Filter answered questions
      const answeredQuestions = interviewSession.history.filter(q => q && q.answer);
      
      // No answers - return completion message
      if (answeredQuestions.length === 0) {
        console.log("⚠️ No answered questions, returning completion message");
        return res.status(200).json({
          fallback: true,
          score: 0,
          rating: "Incomplete",
          strengths: ["Interview initialized successfully"],
          improvements: ["Answer questions to receive comprehensive feedback"],
          recommendation: "Complete the interview questions to receive evaluation.",
          totalQuestions: interviewSession.history.length,
          answeredQuestions: 0,
          message: "Interview session created but no answers recorded"
        });
      }

      // Build transcript safely
      let transcript = "";
      try {
        transcript = answeredQuestions.map((q, index) => {
          const score = q.score !== undefined && q.score !== null ? q.score : 0;
          const difficulty = q.difficulty || 'medium';
          const topic = q.topic || 'general';
          const question = q.question || 'Question not recorded';
          const answer = q.answer || 'Answer not recorded';
          
          return `Question ${index + 1} [${difficulty} - ${topic}]:\n${question}\n\nCandidate Answer:\n${answer}\n\nScore: ${score}/10`;
        }).join('\n\n---\n\n');
      } catch (transcriptError) {
        console.error("❌ Error building transcript:", transcriptError);
        transcript = answeredQuestions.map((q, i) => `Q${i + 1}: ${q.answer || 'No answer'}`).join('\n');
      }

      // Calculate fallback scores
      const avgScore = answeredQuestions.reduce((sum, q) => sum + (q.score || 0), 0) / answeredQuestions.length;
      const normalizedScore = Math.round((avgScore / 10) * 100);

      // Prepare fallback evaluation
      const fallbackEvaluation = {
        score: normalizedScore,
        rating: normalizedScore >= 80 ? "Excellent" : normalizedScore >= 70 ? "Very Good" : normalizedScore >= 60 ? "Good" : normalizedScore >= 50 ? "Average" : "Below Average",
        strengths: [
          "Completed the interview process successfully",
          `Answered ${answeredQuestions.length} questions with engagement`,
          "Demonstrated commitment to the interview"
        ],
        improvements: [
          "Consider providing more detailed technical explanations",
          "Practice articulating thought processes clearly",
          "Expand on practical examples from experience"
        ],
        recommendation: `Candidate completed ${answeredQuestions.length} questions with an average score of ${avgScore.toFixed(1)}/10. ${normalizedScore >= 70 ? "Shows good potential and understanding." : "Would benefit from additional preparation and practice."}`,
        totalQuestions: interviewSession.history.length,
        answeredQuestions: answeredQuestions.length,
        technicalScore: Math.round(avgScore),
        communicationScore: Math.round(avgScore * 0.9),
        problemSolvingScore: Math.round(avgScore * 0.95),
        interviewDuration: Math.round((Date.now() - (interviewSession.startTime || Date.now())) / 1000 / 60)
      };

      // Try Gemini evaluation
      try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        const prompt = `You are an expert technical interviewer evaluating a candidate for a ${interviewSession.role || 'Software Developer'} position.

Analyze the following interview transcript and provide a comprehensive evaluation:

INTERVIEW TRANSCRIPT:
${transcript}

EVALUATION CRITERIA:
1. Technical Knowledge & Accuracy
2. Problem-Solving Approach
3. Communication Clarity
4. Depth of Understanding
5. Practical Experience

Provide your evaluation in the following JSON format:
{
  "score": <0-100>,
  "rating": "Poor | Below Average | Average | Good | Very Good | Excellent",
  "strengths": ["strength 1", "strength 2", "strength 3"],
  "improvements": ["improvement 1", "improvement 2", "improvement 3"],
  "recommendation": "Detailed recommendation for hiring decision",
  "technicalScore": <0-10>,
  "communicationScore": <0-10>,
  "problemSolvingScore": <0-10>
}

Base the overall score on the average of individual question scores (${avgScore.toFixed(1)}/10) and the quality of answers.`;

        console.log("🤖 Sending evaluation request to Gemini...");
        console.log(`📋 Transcript length: ${transcript.length} characters`);
        console.log(`📊 Answered questions: ${answeredQuestions.length}`);
        
        const result = await model.generateContent(prompt);
        const responseText = result.response.text();
        console.log("📝 Gemini response received");

        // Parse JSON response
        const jsonStr = responseText.replace(/```json/g, "").replace(/```/g, "").trim();
        const evaluation = JSON.parse(jsonStr);
        
        // Add metadata
        evaluation.totalQuestions = interviewSession.history.length;
        evaluation.answeredQuestions = answeredQuestions.length;
        evaluation.interviewDuration = fallbackEvaluation.interviewDuration;
        
        console.log("✅ Evaluation completed successfully");
        console.log(`📊 Final Score: ${evaluation.score}/100 (${evaluation.rating})`);
        
        return res.status(200).json(evaluation);
        
      } catch (geminiError) {
        console.error("⚠️ Gemini evaluation failed, using fallback:", geminiError.message);
        // Return fallback evaluation - interview still completes successfully
        return res.status(200).json(fallbackEvaluation);
      }
    }

    // ========== CHAT SESSION (OLD FORMAT) ==========
    const session = chatSession;

    // Validate session structure
    if (!session || !session.history || !Array.isArray(session.history)) {
      console.log("⚠️ Invalid session structure");
      return res.status(200).json({
        fallback: true,
        score: 50,
        rating: "Completed",
        strengths: ["Interview session completed"],
        improvements: ["Session data structure incomplete"],
        recommendation: "Thank you for completing the interview.",
        message: "Interview completed successfully"
      });
    }

    // No chat history
    if (session.history.length === 0) {
      console.log("⚠️ No chat history");
      return res.status(200).json({
        fallback: true,
        score: 0,
        rating: "Incomplete",
        strengths: ["Session initialized"],
        improvements: ["Engage with the interviewer for feedback"],
        recommendation: "Complete the interview to receive evaluation.",
        message: "No conversation data available"
      });
    }

    console.log(`✅ Chat session found with ${session.history.length} messages`);

    // Prepare fallback
    const chatFallback = {
      score: 75,
      rating: "Good",
      strengths: [
        "Engaged in conversation successfully",
        "Completed interview session",
        "Demonstrated communication skills"
      ],
      improvements: [
        "Provide more technical depth in answers",
        "Elaborate on specific experiences",
        "Structure responses more clearly"
      ],
      recommendation: "Candidate shows potential and would benefit from continued development."
    };

    // Try Gemini evaluation
    try {
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

      const prompt = `Analyze the following interview transcript for a ${session.role || 'position'} and provide:
      1. A score out of 100.
      2. Key strengths (at least 3).
      3. Areas for improvement (at least 3).
      4. Final recommendation.
      
      Transcript:
      ${session.history.map(h => `${h.role}: ${h.parts[0].text}`).join("\n")}
      
      Please format the response as JSON with keys: score, strengths (array), improvements (array), recommendation (string), rating (string).`;

      console.log("🤖 Sending chat evaluation to Gemini...");
      const result = await model.generateContent(prompt);
      const responseText = result.response.text();
      console.log("📝 Gemini response received");

      const jsonStr = responseText.replace(/```json/g, "").replace(/```/g, "").trim();
      const evaluation = JSON.parse(jsonStr);
      
      console.log("✅ Chat evaluation completed");
      return res.status(200).json(evaluation);
      
    } catch (geminiError) {
      console.error("⚠️ Chat evaluation failed, using fallback:", geminiError.message);
      return res.status(200).json(chatFallback);
    }

  } catch (globalError) {
    // Final safety net - NEVER throw unhandled errors
    console.error("❌ CRITICAL: Unhandled evaluation error:", globalError);
    return res.status(200).json({
      fallback: true,
      score: 50,
      rating: "Completed",
      strengths: ["Interview session completed"],
      improvements: ["System encountered an unexpected issue"],
      recommendation: "Thank you for participating. Your interview has been recorded.",
      message: "Interview completed successfully"
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port http://localhost:${PORT}`);
});
