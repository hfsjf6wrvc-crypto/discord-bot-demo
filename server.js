// server.js — Discord roles → Google Groups (strict), with SQLite mapping + reusable sync
// Requires: express, body-parser, node-fetch@2, googleapis, sqlite3, dotenv

const express = require("express");
const bodyParser = require("body-parser");
const nodeFetch = require("node-fetch");
const { google } = require("googleapis");
const { Client, GatewayIntentBits } = require("discord.js");
const { saveUser, getUser } = require("./db");
require("dotenv").config();

const app = express();
app.use(bodyParser.json());

// ---------- ENV ----------
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL;

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = `${BASE_URL}/auth/google/callback`;

const SA_EMAIL = process.env.GOOGLE_SA_EMAIL;
const SA_PRIVATE_KEY = (process.env.GOOGLE_SA_PRIVATE_KEY || "").replace(/\\n/g, "\n");
const WORKSPACE_ADMIN = process.env.GOOGLE_WORKSPACE_ADMIN;

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;

// ---------- Discord client (for role reads) ----------
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});
client.once("ready", () => console.log(`🤖 Bot helper ready: ${client.user.tag}`));
client.login(DISCORD_TOKEN);

// ---------- Your role → group map ----------
const ROLE_TO_GROUP = {
  "1418711138631290880": "sovcommand@arcticclawofficial.com",
  "1409109530331316254": "sovcommand@arcticclawofficial.com",
  "1409109293130715227": "sovoverseer@arcticclawofficial.com",
};

// Precompute set of all mapped groups (for strict removals)
const MAPPED_GROUPS = new Set(Object.values(ROLE_TO_GROUP));

// ---------- Admin SDK (Service Account with DWD) ----------
function getAdminClient() {
  const jwt = new google.auth.JWT({
    email: SA_EMAIL,
    key: SA_PRIVATE_KEY,
    scopes: [
      "https://www.googleapis.com/auth/admin.directory.group.member",
      "https://www.googleapis.com/auth/admin.directory.group.readonly",
    ],
    subject: WORKSPACE_ADMIN, // impersonate admin
  });
  return google.admin({ version: "directory_v1", auth: jwt });
}

async function isMember(admin, groupEmail, memberEmail) {
  try {
    await admin.members.get({ groupKey: groupEmail, memberKey: memberEmail });
    return true;
  } catch (err) {
    if (err && err.code === 404) return false;
    throw err;
  }
}

// ---------- Core sync (strict) ----------
async function syncGroups(discordId) {
  const admin = getAdminClient();

  // get email from DB
  const googleEmail = await getUser(discordId);
  if (!googleEmail) {
    console.log(`[syncGroups] No Google email stored for ${discordId}. Skipping.`);
    return { added: [], removed: [], skipped: true };
  }

  // fetch Discord roles
  const guild = await client.guilds.fetch(GUILD_ID);
  const member = await guild.members.fetch(discordId);
  const roleIds = new Set(member.roles.cache.map(r => r.id));

  // desired groups from current roles
  const desiredGroups = new Set(
    Object.entries(ROLE_TO_GROUP)
      .filter(([roleId]) => roleIds.has(roleId))
      .map(([, groupEmail]) => groupEmail)
  );

  const additions = [];
  const removals = [];

  // Strict ADD: ensure membership in all desired groups
  for (const groupEmail of desiredGroups) {
    const already = await isMember(admin, groupEmail, googleEmail);
    if (!already) {
      try {
        await admin.members.insert({
          groupKey: groupEmail,
          requestBody: { email: googleEmail, role: "MEMBER" },
        });
        additions.push(groupEmail);
      } catch (e) {
        if (!(e && e.code === 409)) {
          console.error("members.insert error", groupEmail, e?.message || e);
        }
      }
    }
  }

  // Strict REMOVE: user must be removed from any mapped group they no longer qualify for
  for (const groupEmail of MAPPED_GROUPS) {
    if (!desiredGroups.has(groupEmail)) {
      const present = await isMember(admin, groupEmail, googleEmail);
      if (present) {
        try {
          await admin.members.delete({ groupKey: groupEmail, memberKey: googleEmail });
          removals.push(groupEmail);
        } catch (e) {
          console.error("members.delete error", groupEmail, e?.message || e);
        }
      }
    }
  }

  console.log(`[syncGroups] ${googleEmail} added:[${additions}] removed:[${removals}]`);
  return { added: additions, removed: removals, skipped: false };
}

// ---------- Routes ----------
app.get("/", (_req, res) => res.send("✅ Server & bot are running!"));

// Start OAuth — DM link hits here
app.get("/auth/link", (req, res) => {
  const discordId = req.query.discordId;
  if (!discordId) return res.status(400).send("Missing Discord ID");

  const scope = "openid email profile";
  const authURL =
    `https://accounts.google.com/o/oauth2/v2/auth?client_id=${CLIENT_ID}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&response_type=code&scope=${encodeURIComponent(scope)}` +
    `&access_type=offline&state=${encodeURIComponent(discordId)}`;

  res.redirect(authURL);
});

// OAuth callback — store email → sync now (strict)
app.get("/auth/google/callback", async (req, res) => {
  try {
    const code = req.query.code;
    const discordId = req.query.state;
    if (!code || !discordId) return res.status(400).send("Missing code or state.");

    // exchange code
    const tokenRes = await nodeFetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: "authorization_code",
      }),
    });
    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;
    if (!accessToken) {
      console.error("Token exchange failed:", tokenData);
      return res.status(400).send("Failed to get access token.");
    }

    // get user email
    const userInfoRes = await nodeFetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const userInfo = await userInfoRes.json();
    const googleEmail = userInfo.email;
    if (!googleEmail) return res.status(400).send("Unable to read Google email.");

    // persist mapping
    await saveUser(discordId, googleEmail);

    // strict sync now
    const { added, removed } = await syncGroups(discordId);

    res.send(`
      <h2>✅ Google linked & groups synced</h2>
      <p><b>Google:</b> ${googleEmail}</p>
      <p><b>Added to:</b> ${added.length ? added.join(", ") : "None"}</p>
      <p><b>Removed from:</b> ${removed.length ? removed.join(", ") : "None"}</p>
      <p>You can close this tab.</p>
    `);
  } catch (err) {
    console.error("Callback error:", err);
    res.status(500).send("Internal error. Check logs.");
  }
});

// ---------- Start server ----------
app.listen(PORT, () => console.log(`🚀 Server running on ${BASE_URL}`));

// export for bot.js auto-sync
module.exports = { syncGroups };
