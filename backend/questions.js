// Dynamic question bank and generator for HireBridge
// Supports role-specific questions with difficulty and topic tags.

const ALLOWED_ROLES = [
  "Software Developer",
  "Data Analyst",
  "AI / ML Engineer",
  "HR / Management",
];

const QUESTION_BANK = {
  "Software Developer": [
    { difficulty: "easy", topic: "fundamentals", text: "In your own words, what is the difference between a function and a class in a language you use often?" },
    { difficulty: "easy", topic: "frontend", text: "Describe how the browser handles an HTTP GET request from typing a URL to rendering the page." },
    { difficulty: "easy", topic: "basics", text: "Can you explain what version control is and why it's important in software development?" },
    { difficulty: "easy", topic: "debugging", text: "Walk me through your typical debugging process when you encounter a bug in your code." },
    { difficulty: "medium", topic: "backend", text: "How would you design a simple authentication flow for a web app using an API and a database?" },
    { difficulty: "medium", topic: "dsa", text: "Explain when you would use a hash map versus an array, and why." },
    { difficulty: "medium", topic: "performance", text: "What strategies would you use to optimize the performance of a slow-loading web page?" },
    { difficulty: "medium", topic: "api", text: "Describe how you would design a RESTful API for a blog platform. What endpoints would you create?" },
    { difficulty: "hard", topic: "system_design", text: "How would you design a scalable API for a code-submission platform that must handle concurrent requests and background processing?" },
    { difficulty: "hard", topic: "architecture", text: "Explain the trade-offs between microservices and monolithic architecture. When would you choose one over the other?" },
    { difficulty: "hard", topic: "security", text: "How would you implement a secure authentication system that protects against common vulnerabilities like SQL injection and XSS?" },
  ],

  "Data Analyst": [
    { difficulty: "easy", topic: "sql", text: "How would you write a SQL query to count the number of users who signed up in the last 7 days?" },
    { difficulty: "easy", topic: "cleaning", text: "Describe your approach when you find many missing values in a numeric column." },
    { difficulty: "easy", topic: "basics", text: "What is the difference between mean, median, and mode? When would you use each?" },
    { difficulty: "easy", topic: "tools", text: "What data analysis tools or software are you most comfortable with, and why?" },
    { difficulty: "medium", topic: "pandas", text: "In Python (Pandas), how would you group sales data by region and compute total revenue per region?" },
    { difficulty: "medium", topic: "viz", text: "Which visualization would you use to compare the distribution of two numeric variables, and why?" },
    { difficulty: "medium", topic: "analysis", text: "How would you approach analyzing customer churn data to identify key patterns?" },
    { difficulty: "medium", topic: "joins", text: "Explain the difference between INNER JOIN, LEFT JOIN, and RIGHT JOIN with a practical example." },
    { difficulty: "hard", topic: "insights", text: "You see a sudden spike in churn rate in your dashboard. Walk me through how you would investigate and validate the cause." },
    { difficulty: "hard", topic: "prediction", text: "How would you build a predictive model to forecast next quarter's sales based on historical data?" },
    { difficulty: "hard", topic: "statistics", text: "Explain A/B testing methodology and how you would determine if a test result is statistically significant." },
  ],

  "AI / ML Engineer": [
    { difficulty: "easy", topic: "basics", text: "What is the difference between supervised and unsupervised learning? Give one example of each." },
    { difficulty: "easy", topic: "overfitting", text: "How would you explain overfitting to a non-technical stakeholder?" },
    { difficulty: "easy", topic: "algorithms", text: "Can you explain the difference between classification and regression problems?" },
    { difficulty: "easy", topic: "preprocessing", text: "Why is data normalization important in machine learning?" },
    { difficulty: "medium", topic: "evaluation", text: "For an imbalanced binary classification problem, which metrics would you focus on and why?" },
    { difficulty: "medium", topic: "training", text: "Describe the steps you follow to take a raw dataset to a trained model ready for evaluation." },
    { difficulty: "medium", topic: "features", text: "What is feature engineering and why is it important? Give an example from your experience." },
    { difficulty: "medium", topic: "tuning", text: "How do you approach hyperparameter tuning for a machine learning model?" },
    { difficulty: "hard", topic: "deployment", text: "How would you design a pipeline to deploy, monitor, and periodically retrain a production ML model?" },
    { difficulty: "hard", topic: "optimization", text: "Explain how you would optimize a deep learning model that's too slow for production use." },
    { difficulty: "hard", topic: "ethics", text: "How would you detect and mitigate bias in a machine learning model used for loan approvals?" },
  ],

  "HR / Management": [
    { difficulty: "easy", topic: "communication", text: "Tell me about a time you had to explain a difficult message to a team member. How did you approach it?" },
    { difficulty: "easy", topic: "teamwork", text: "How do you build trust with a new team you are leading?" },
    { difficulty: "easy", topic: "motivation", text: "What strategies do you use to keep your team motivated during challenging projects?" },
    { difficulty: "easy", topic: "feedback", text: "How do you approach giving constructive feedback to underperforming team members?" },
    { difficulty: "medium", topic: "conflict", text: "Describe a situation where two key team members disagreed strongly. How would you handle it as their manager?" },
    { difficulty: "medium", topic: "leadership", text: "How do you balance delivering results with supporting your team's well-being?" },
    { difficulty: "medium", topic: "delegation", text: "How do you decide which tasks to delegate and which to handle yourself?" },
    { difficulty: "medium", topic: "performance", text: "What's your approach to setting clear performance expectations for your team?" },
    { difficulty: "hard", topic: "strategy", text: "You have to lead a major change initiative with tight deadlines and some resistance. How would you plan and execute it?" },
    { difficulty: "hard", topic: "culture", text: "How would you transform a team with low morale and poor collaboration into a high-performing unit?" },
    { difficulty: "hard", topic: "crisis", text: "Describe how you would handle a situation where a critical project is failing and stakeholders are losing confidence." },
  ],
};

function pickNextDifficulty(lastScore) {
  if (lastScore == null || Number.isNaN(lastScore)) return "easy";
  if (lastScore <= 4) return "easy";
  if (lastScore <= 7) return "medium";
  return "hard";
}

function generateNextQuestion({ role, lastScore = null, lastTopic = null }) {
  if (!ALLOWED_ROLES.includes(role)) {
    throw new Error(`Unsupported role: ${role}`);
  }

  const questions = QUESTION_BANK[role] || [];
  if (!questions.length) {
    throw new Error(`No questions configured for role: ${role}`);
  }

  const targetDifficulty = pickNextDifficulty(lastScore);

  // Filter by difficulty first
  let candidates = questions.filter((q) => q.difficulty === targetDifficulty);
  
  // Try to avoid repeating the same topic
  if (lastTopic) {
    const nonRepeats = candidates.filter((q) => q.topic !== lastTopic);
    if (nonRepeats.length > 0) {
      candidates = nonRepeats;
    }
  }

  // If we still have no candidates, expand to all questions with target difficulty
  if (candidates.length === 0) {
    candidates = questions.filter((q) => q.difficulty === targetDifficulty);
  }
  
  // If still no candidates (shouldn't happen), use all questions
  if (candidates.length === 0) {
    candidates = questions;
  }

  // Pick a random question from candidates
  const next = candidates[Math.floor(Math.random() * candidates.length)];

  return {
    question: next.text,
    topic_tag: next.topic,
    next_question_difficulty: next.difficulty,
  };
}

module.exports = {
  ALLOWED_ROLES,
  generateNextQuestion,
};
