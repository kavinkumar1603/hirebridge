const functions = require("firebase-functions");

// Simple HTTP function for testing
exports.helloWorld = functions.https.onRequest((request, response) => {
  response.send("Hello from Firebase Cloud Functions!");
});

// Health check endpoint
exports.health = functions.https.onRequest((request, response) => {
  response.json({
    status: "ok",
    message: "Firebase Functions are running",
    timestamp: new Date().toISOString()
  });
});
