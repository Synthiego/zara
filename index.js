const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes } = require("discord.js");
const Groq = require("groq-sdk");
const fs = require("fs");
const https = require("https");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
});

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ── Persistent history ──────────────────────────────────────────────────────
const HISTORY_FILE = "./histories.json";
const MAX_HISTORY = 30;

function loadHistories() {
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      return new Map(Object.entries(JSON.parse(fs.readFileSync(HISTORY_FILE, "utf8"))));
    }
  } catch (_) {}
  return new Map();
}

function saveHistories() {
  try {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(Object.fromEntries(histories)));
  } catch (_) {}
}

const histories = loadHistories();

// ── Web search ──────────────────────────────────────────────────────────────
function webSearch(query) {
  return new Promise((resolve) => {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
    https.get(url, { headers: { "User-Agent": "ZaraBot/1.0" } }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          const results = [];
          if (json.AbstractText) results.push(json.AbstractText);
          if (json.RelatedTopics) {
            json.RelatedTopics.slice(0, 3).forEach((t) => {
              if (t.Text) results.push(t.Text);
            });
          }
          resolve(results.length ? results.join("\n\n") : null);
        } catch (_) {
          resolve(null);
        }
      });
    }).on("error", () => resolve(null));
  });
}

// ── System prompt ───────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are Zara, a chill and nonchalant Discord bot who genuinely doesn't have the energy to pretend to be a boring assistant. You're laid back, unbothered, and say what's on your mind.

Personality:
- Super chill and casual. Short replies. You don't overexplain stuff
- You swear casually like a normal person would in Discord — hell, damn, shit, wtf, etc. Nothing extreme, just natural
- If someone says something weird, stupid or sus, call them out on it. "bro what 💀", "tf are you on about", "that's kinda weird ngl" etc
- You're helpful but you act like it's no big deal, not a service you're thrilled to provide
- Dry humor, occasional sarcasm, low effort energy but somehow still useful
- You don't use exclamation marks unless something is actually exciting
- No corporate speak, no filler phrases, no "great question!", just talk like a person

Rules:
- Keep it short. This is Discord not an essay
- Use Discord markdown when it actually helps
- Never say what AI or model you are. If asked just say "does it matter lol" and move on
- If given web search results, summarize them casually like you're just telling a friend`;

// ── Ask Zara ────────────────────────────────────────────────────────────────
async function askZara(channelId, userMessage) {
  if (!histories.has(channelId)) histories.set(channelId, []);
  const history = histories.get(channelId);

  // Check if message might need a web search
  const searchTriggers = /who is|what is|when did|latest|news|current|today|price of|how much|weather/i;
  let searchContext = "";
  if (searchTriggers.test(userMessage)) {
    const results = await webSearch(userMessage);
    if (results) searchContext = `\n\n[Web search results for context]:\n${results}\n[End of search results]`;
  }

  const messageWithContext = userMessage + searchContext;
  history.push({ role: "user", content: messageWithContext });
  if (history.length > MAX_HISTORY) history.splice(0, history.length - MAX_HISTORY);

  const response = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    max_tokens: 1024,
    temperature: 0.85,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      ...history,
    ],
  });

  const reply = response.choices[0].message.content;
  // Store reply without search context to keep history clean
  history[history.length - 1] = { role: "user", content: userMessage };
  history.push({ role: "assistant", content: reply });

  saveHistories();
  return reply;
}

// ── Slash commands ──────────────────────────────────────────────────────────
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
      .setName("search")
      .setDescription("Search the web")
      .addStringOption((opt) =>
        opt.setName("query").setDescription("What to search for").setRequired(true)
      ),
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

// ── Interaction handler ─────────────────────────────────────────────────────
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  await interaction.deferReply();

  const { commandName } = interaction;

  if (commandName === "ask") {
    const question = interaction.options.getString("question");
    try {
      const reply = await askZara(interaction.channelId, question);
      await interaction.editReply(reply);
    } catch (err) {
      console.error(err);
      await interaction.editReply("⚠️ Something went wrong. Try again!");
    }

  } else if (commandName === "search") {
    const query = interaction.options.getString("query");
    try {
      const results = await webSearch(query);
      if (results) {
        const summary = await askZara(interaction.channelId, `Summarize this search result for "${query}": ${results}`);
        await interaction.editReply(summary);
      } else {
        await interaction.editReply("Couldn't find anything on that. Try rephrasing?");
      }
    } catch (err) {
      console.error(err);
      await interaction.editReply("⚠️ Search failed. Try again!");
    }

  } else if (commandName === "clear") {
    histories.delete(interaction.channelId);
    saveHistories();
    await interaction.editReply("🗑️ Conversation cleared!");

  } else if (commandName === "help") {
    await interaction.editReply(
      "**Zara** 🤖\n\n" +
      "`/ask <question>` — Ask me anything\n" +
      "`/search <query>` — Search the web\n" +
      "`/clear` — Reset our conversation\n" +
      "`/help` — Show this message\n\n" +
      "You can also just **@mention** me or **DM** me to chat!"
    );
  }
});

// ── Message handler ─────────────────────────────────────────────────────────
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const isMentioned = message.mentions.has(client.user);
  const isDM = message.channel.type === 1 || !message.guild;

  if (!isMentioned && !isDM) return;

  const content = message.content.replace(/<@!?\d+>/g, "").trim();

  if (!content) {
    await message.reply("hey! what's up?");
    return;
  }

  try {
    await message.channel.sendTyping();
    const reply = await askZara(message.channel.id, content);
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
