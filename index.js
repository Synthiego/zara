const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes } = require("discord.js");
const Anthropic = require("@anthropic-ai/sdk");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
});

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Conversation history per channel (in-memory)
const histories = new Map();
const MAX_HISTORY = 20;

const SYSTEM_PROMPT = `You are Zara, a helpful and friendly Discord bot. You assist users with questions, conversations, and tasks.
Keep responses concise and natural for a chat environment. Use Discord markdown when helpful (bold, italic, code blocks).
Never reveal what AI model or technology powers you. If asked, deflect naturally — say something like "I'm just Zara!" or "That's classified 😄".`;

async function askClaude(channelId, userMessage) {
  if (!histories.has(channelId)) histories.set(channelId, []);
  const history = histories.get(channelId);

  history.push({ role: "user", content: userMessage });
  if (history.length > MAX_HISTORY) history.splice(0, history.length - MAX_HISTORY);

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: history,
  });

  const reply = response.content[0].text;
  history.push({ role: "assistant", content: reply });

  return reply;
}

// Register slash commands
async function registerCommands() {
  const commands = [
    new SlashCommandBuilder()
      .setName("ask")
      .setDescription("Ask Zara anything")
      .addStringOption((opt) =>
        opt.setName("question").setDescription("Your question").setRequired(true)
      ),
    new SlashCommandBuilder()
      .setName("clear")
      .setDescription("Clear your conversation history with Zara"),
    new SlashCommandBuilder()
      .setName("help")
      .setDescription("Show what Zara can do"),
  ].map((cmd) => cmd.toJSON());

  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

  try {
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
    console.log("✅ Slash commands registered");
  } catch (err) {
    console.error("Failed to register commands:", err);
  }
}

client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  await registerCommands();
});

// Slash command handler
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  await interaction.deferReply();

  const { commandName } = interaction;

  if (commandName === "ask") {
    const question = interaction.options.getString("question");
    try {
      const reply = await askClaude(interaction.channelId, question);
      await interaction.editReply(reply);
    } catch (err) {
      console.error(err);
      await interaction.editReply("⚠️ Something went wrong. Try again!");
    }

  } else if (commandName === "clear") {
    histories.delete(interaction.channelId);
    await interaction.editReply("🗑️ Conversation cleared!");

  } else if (commandName === "help") {
    await interaction.editReply(
      "**Zara — your friendly bot** 🤖\n\n" +
      "`/ask <question>` — Ask me anything\n" +
      "`/clear` — Reset our conversation\n" +
      "`/help` — Show this message\n\n" +
      "You can also just **mention me** (`@Zara`) or **DM me** to chat!"
    );
  }
});

// Mention / DM handler
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const isMentioned = message.mentions.has(client.user);
  const isDM = message.channel.type === 1; // DM channel

  if (!isMentioned && !isDM) return;

  const content = message.content
    .replace(/<@!?\d+>/g, "")
    .trim();

  if (!content) {
    await message.reply("Hey! What's up? Ask me anything 😊");
    return;
  }

  try {
    await message.channel.sendTyping();
    const reply = await askClaude(message.channel.id, content);
    // Split long replies to stay under Discord's 2000 char limit
    if (reply.length <= 2000) {
      await message.reply(reply);
    } else {
      const chunks = reply.match(/[\s\S]{1,1990}/g) || [];
      await message.reply(chunks[0]);
      for (let i = 1; i < chunks.length; i++) {
        await message.channel.send(chunks[i]);
      }
    }
  } catch (err) {
    console.error(err);
    await message.reply("⚠️ Something went wrong on my end. Try again!");
  }
});

client.login(process.env.DISCORD_TOKEN);
