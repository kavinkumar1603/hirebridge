const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
require("dotenv").config();
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
app.use(cors());
app.use(bodyParser.json());

const PORT = process.env.PORT || 8080;
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "AIzaSyCV3lHFkmY_V5PNj1HDPdKogoqxpK8YS0Q");

// Store session history (In-memory for demo, should be DB in production)
const sessions = {};

app.get("/", (req, res) => {
  res.send("HireBridge AI Backend is working 🚀");
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
  
  TONE: Professional, analytical, and inquisitive. 
  CONSTRAINTS: Max 2 sentences per question. Always end with a clear question.`;

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
  const session = sessions[sessionId];

  if (!session || session.history.length === 0) {
    return res.status(400).json({ error: "No interview history found" });
  }

  const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

  const prompt = `Analyze the following interview transcript for a ${session.role} position and provide:
  1. A score out of 100.
  2. Key strengths.
  3. Areas for improvement.
  4. Final recommendation.
  
  Transcript:
  ${session.history.map(h => `${h.role}: ${h.parts[0].text}`).join("\n")}
  
  Please format the response as JSON with keys: score, strengths (array), improvements (array), recommendation (string).`;

  try {
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    // Clean JSON if Gemini wraps it in markdown
    const jsonStr = responseText.replace(/```json/g, "").replace(/```/g, "").trim();
    const evaluation = JSON.parse(jsonStr);

    res.json(evaluation);
  } catch (error) {
    console.error("Evaluation Error:", error);
    res.status(500).json({ error: "Failed to evaluate interview" });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port http://localhost:${PORT}`);
});
