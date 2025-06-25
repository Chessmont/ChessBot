// Require the necessary discord.js classes
const fs = require("node:fs");
const path = require("node:path");
const {
  Client,
  Collection,
  GatewayIntentBits,
} = require("discord.js");

require("dotenv").config();

global.data = require('./config.json');

// Charger les ouvertures d'échecs au démarrage
const loadOpenings = () => {
  try {
    const fs = require('fs');
    const path = require('path');
    const openingsPath = path.join(__dirname, 'src', 'data', 'openings.tsv');
    const content = fs.readFileSync(openingsPath, 'utf-8');
    const lines = content.split('\n').slice(1); // Ignorer la ligne d'en-tête
    
    global.openings = lines
      .filter(line => line.trim()) // Ignorer les lignes vides
      .map(line => {
        const [eco, name, pgn, fen, ply] = line.split('\t');
        return { eco, name, pgn, fen, ply: parseInt(ply) };
      })
      .filter(opening => opening.name && opening.fen); // S'assurer que les données sont valides
    
    console.log(`✅ ${global.openings.length} ouvertures chargées en mémoire`);
  } catch (error) {
    console.error('❌ Erreur lors du chargement des ouvertures:', error);
    global.openings = [];
  }
};

// Charger les ouvertures
loadOpenings();

const client = new Client({
  shards: 0,
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.MessageContent
  ]
});

client.commands = new Collection();
const commandFoldersPath = path.join(__dirname, "src", "commands");
const commandFolders = fs.readdirSync(commandFoldersPath);

for (const folder of commandFolders) {
  const commandsPath = path.join(commandFoldersPath, folder);
  const commandFiles = fs
    .readdirSync(commandsPath)
    .filter((file) => file.endsWith(".js"));
  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    if ("data" in command && "execute" in command && "info" in command) {
      client.commands.set(command.data.name, command);
    } else {
      console.log(`Attention, des informations sont manquantes dans la commande : ${filePath}`);
    }
  }
}

const eventFoldersPath = path.join(__dirname, "src", "events");
const eventFolders = fs.readdirSync(eventFoldersPath);

for (const folder of eventFolders) {
  const eventsPath = path.join(eventFoldersPath, folder);
  const eventFiles = fs
    .readdirSync(eventsPath)
    .filter((file) => file.endsWith(".js"));
    for (const file of eventFiles) {
      const filePath = path.join(eventsPath, file);
      const event = require(filePath);
      if (event.once) {
        client.once(event.name, (...args) => event.execute(client, ...args));
      } else {
        client.on(event.name, (...args) => event.execute(client, ...args));
      }
    }
}

// Login
client.login(process.env.TOKEN);

["SIGINT", "SIGTERM", "SIGUSR1", "SIGUSR2", "unhandledRejection", "uncaughtException"].forEach((event) => {
  process.on(event, async (error) => {
    console.log("Shutting down...");
    try {
      await client.destroy();
      if (error instanceof Error) {
        console.error(error);
      }
      await client.destroy();
      process.exit(0);
    } catch (error) {
      console.error(error);
      process.exit(1);
    }
  });
});
