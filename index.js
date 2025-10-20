const { Client, GatewayIntentBits } = require("discord.js");
require("dotenv").config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// When the bot logs in
client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

// Example command listener
client.on("messageCreate", (message) => {
  if (message.author.bot) return;

  if (message.content === "!ping") {
    message.reply("Pong! 🏓");
  }
});

// Log in using token from environment variable
client.login(process.env.DISCORD_TOKEN);
