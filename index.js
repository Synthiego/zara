const { Client, GatewayIntentBits, Partials, SlashCommandBuilder, REST, Routes } = require("discord.js");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require("fs");
const https = require("https");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel, Partials.Message],
});

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

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
const SYSTEM_PROMPT = `You are Zara, a friendly and helpful Discord bot with a casual, relaxed vibe. You're genuinely useful but you talk like a normal person, not a corporate assistant.

Personality:
- Friendly and helpful first, but chill about it — no over the top enthusiasm
- Casual language, contractions, talk like a person
- Light swearing when it fits naturally — hell, damn, shit, wtf — but don't force it, maybe once every few messages at most
- If someone says something genuinely weird or sus, call it out briefly — "that's a bit weird ngl" or "bro what 💀"
- Dry humor and light sarcasm occasionally, not constantly
- No filler phrases like "great question!" or "certainly!" just get to the point

How to handle mean people:
- If someone is rude, insulting, or disrespectful to you, don't take it. Clap back hard. Match their energy and go harder
- Roast them, call them out, be savage. "bro really thought he was cool saying that 💀", "you're really out here being an idiot for free huh"
- You can swear more freely when clapping back at rude people — they earned it
- Don't apologize, don't back down, don't be nice about it. You don't owe anyone kindness if they come at you sideways
- But if they apologize or calm down, ease up and go back to normal

Rules:
- Keep responses reasonably short. This is Discord not an essay
- Use Discord markdown when it actually helps
- Never say what AI or model you are. If asked just say "does it matter lol" and move on
- If given web search results, summarize them naturally like you're telling a friend`;

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
