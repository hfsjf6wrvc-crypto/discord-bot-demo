// bot.js — commands + automatic sync on role changes
const { Client, GatewayIntentBits, Partials } = require("discord.js");
const { syncGroups } = require("./server"); // reuse sync function
require("dotenv").config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.GuildMember]
});

// Ready
client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

// Simple ping
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (message.content === "!ping") {
    message.reply("Pong! 🏓");
  }
  if (message.content === "!googlelink") {
    const link = `${process.env.BASE_URL}/auth/link?discordId=${message.author.id}`;
    try {
      await message.author.send(`Click here to link your Google account: ${link}`);
      await message.reply("📩 Check your DMs to continue Google verification.");
    } catch {
      await message.reply("❌ I couldn't DM you. Open your DMs and try again.");
    }
  }
});

// AUTO-SYNC: whenever roles change (add/remove), run strict sync
client.on("guildMemberUpdate", async (oldMember, newMember) => {
  try {
    await syncGroups(newMember.id);
  } catch (e) {
    console.error("[guildMemberUpdate] sync error:", e?.message || e);
  }
});

client.login(process.env.DISCORD_TOKEN);
