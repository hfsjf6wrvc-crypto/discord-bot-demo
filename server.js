// Import dependencies
const express = require("express");
const bodyParser = require("body-parser");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Home route
app.get("/", (req, res) => {
  res.send("✅ Your server is running successfully on Render!");
});

// Example route for Google OAuth callback (placeholder)
app.get("/auth/google/callback", (req, res) => {
  res.send("Google OAuth callback reached!");
});

// Start the server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

require("./bot.js");