// server.js — Discord Roles → Google Groups (strict sync)
// Requirements: express, body-parser, node-fetch, googleapis, dotenv

const express = require("express");
const bodyParser = require("body-parser");
const nodeFetch = require("node-fetch");
const { google } = require("googleapis");
const { Client, GatewayIntentBits } = require("discord.js");
require("dotenv").config();

const app = express();
app.use(bodyParser.json());

// ---------------------
// ENV Variables
// ---------------------
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

// ---------------------
// Discord Bot
// ---------------------
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

client.once("ready", () =>
  console.log(`🤖 Bot Ready: ${client.user.tag}`)
);

client.login(DISCORD_TOKEN);

// ---------------------
// Role → Google Group map (strict sync)
// Fill with your actual mappings — already in your ENV file or bot logic
// Example: "DiscordRoleID": "group@domain.com"
const ROLE_TO_GROUP = {
  // Example:
  "1409109293130715227": "sovcommand@arcticclawofficial.com",
  "1409109530331316254": "sovcommand@arcticclawofficial.com",
  "1409109293130715227": "sovoverseer@arcticclawofficial.com"
};

// ---------------------
// Simple link tracking
// ---------------------
const activeLinks = Object.create(null);

// ---------------------
// Health route
// ---------------------
app.get("/", (_req, res) => res.send("✅ Server & bot are running!"));

// ---------------------
// Step 1 — User clicks link → Google OAuth
// ---------------------
app.get("/auth/link", (req, res) => {
  const discordId = req.query.discordId;
  if (!discordId) return res.status(400).send("Missing Discord ID");

  activeLinks[discordId] = true;

  const scope = "openid email profile";
  const authURL =
    `https://accounts.google.com/o/oauth2/v2/auth?client_id=${CLIENT_ID}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&response_type=code&scope=${encodeURIComponent(scope)}` +
    `&access_type=offline&state=${encodeURIComponent(discordId)}`;

  res.redirect(authURL);
});

// ---------------------
// Step 2 — OAuth callback → Discord role check → Google Group sync
// ---------------------
app.get("/auth/google/callback", async (req, res) => {
  try {
    const code = req.query.code;
    const discordId = req.query.state;

    // Exchange code for tokens
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

    // Get Google email
    const userInfoRes = await nodeFetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const { email: googleEmail } = await userInfoRes.json();

    // Get Discord roles
    const guild = await client.guilds.fetch(GUILD_ID);
    const member = await guild.members.fetch(discordId);
    const roleIds = new Set(member.roles.cache.map((r) => r.id));

    // Build desired group list
    const desiredGroups = new Set(
      Object.entries(ROLE_TO_GROUP)
        .filter(([roleId]) => roleIds.has(roleId))
        .map(([, groupEmail]) => groupEmail)
    );

    // Admin SDK auth
    const jwt = new google.auth.JWT({
      email: SA_EMAIL,
      key: SA_PRIVATE_KEY,
      scopes: [
        "https://www.googleapis.com/auth/admin.directory.group.member",
        "https://www.googleapis.com/auth/admin.directory.group.readonly",
      ],
      subject: WORKSPACE_ADMIN,
    });
    const admin = google.admin({ version: "directory_v1", auth: jwt });

    async function isMember(groupEmail, memberEmail) {
      try {
        await admin.members.get({ groupKey: groupEmail, memberKey: memberEmail });
        return true;
      } catch (err) {
        return err.code !== 404 ? Promise.reject(err) : false;
      }
    }

    const mappedGroups = new Set(Object.values(ROLE_TO_GROUP));
    const additions = [];
    const removals = [];

    // ADD missing memberships
    for (const groupEmail of desiredGroups) {
      if (!(await isMember(groupEmail, googleEmail))) {
        await admin.members.insert({
          groupKey: groupEmail,
          requestBody: { email: googleEmail, role: "MEMBER" },
        });
        additions.push(groupEmail);
      }
    }

    // REMOVE memberships that no longer match Discord roles
    for (const groupEmail of mappedGroups) {
      if (!desiredGroups.has(groupEmail) && (await isMember(groupEmail, googleEmail))) {
        await admin.members.delete({
          groupKey: groupEmail,
          memberKey: googleEmail,
        });
        removals.push(groupEmail);
      }
    }

    res.send(`
      <h2>✅ Google Linked & Synced</h2>
      <p><b>Google:</b> ${googleEmail}</p>
      <p><b>Discord:</b> ${member.user.tag}</p>
      <p><b>Added to:</b> ${additions.join(", ") || "None"}</p>
      <p><b>Removed from:</b> ${removals.join(", ") || "None"}</p>
      <p>You can close this tab.</p>
    `);
  } catch (err) {
    console.error("Callback error:", err);
    res.status(500).send("Internal error. Check logs.");
  }
});

// ---------------------
// Start HTTP server + Bot
// ---------------------
app.listen(PORT, () => console.log(`🚀 Server running on ${BASE_URL}`));
require("./bot.js");
