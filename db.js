const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database("./users.db");

// Create table if not exists
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      discordId TEXT PRIMARY KEY,
      googleEmail TEXT NOT NULL
    )
  `);
});

// Save user mapping
function saveUser(discordId, googleEmail) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT OR REPLACE INTO users (discordId, googleEmail) VALUES (?, ?)`,
      [discordId, googleEmail],
      (err) => (err ? reject(err) : resolve())
    );
  });
}

// Get user mapping
function getUser(discordId) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT googleEmail FROM users WHERE discordId = ?`,
      [discordId],
      (err, row) => (err ? reject(err) : resolve(row ? row.googleEmail : null))
    );
  });
}

module.exports = { saveUser, getUser };
