const { Client, GatewayIntentBits } = require("discord.js");
require("dotenv").config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

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
    } catch (err) {
      message.reply("❌ I couldn't DM you. Open your DMs and try again.");
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
