const express = require("express");
const app = express();
const PORT = process.env.PORT || 10000;

// --- Keepalive route ---
app.get("/", (req, res) => {
  res.send("Bot is running!");
});

// --- Start server ---
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

// --- Run your Discord bot ---
require("./index.js");
