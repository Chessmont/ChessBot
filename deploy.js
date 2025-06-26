const { REST, Routes, Client, GatewayIntentBits } = require("discord.js");
const fs = require("node:fs");
const path = require("node:path");
require("dotenv").config();

const db = require("./api");
global.data = require('./config.json');

const commands = [];
const commandsInfo = [];
const foldersPath = path.join(__dirname, "commands");
const commandFolders = fs.readdirSync(foldersPath);

for (const folder of commandFolders) {
  const commandsPath = path.join(foldersPath, folder);
  const commandFiles = fs
    .readdirSync(commandsPath)
    .filter((file) => file.endsWith(".js"));
  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    if ("data" in command && "execute" in command && "info" in command) {
      commands.push(command.data.toJSON());
      commandsInfo.push([command.info, folder]);
    } else {
      console.log(
        `[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`
      );
    }
  }
}

const rest = new REST().setToken(process.env.TOKEN);

// Fonction pour récupérer dynamiquement les guildes
const getGuildIds = async () => {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds]
  });

  await client.login(process.env.TOKEN);

  // Attendre que le client soit prêt
  await new Promise(resolve => {
    if (client.isReady()) {
      resolve();
    } else {
      client.once('ready', resolve);
    }
  });

  const guildIds = client.guilds.cache.map(guild => guild.id);
  const guildsInfo = client.guilds.cache.map(guild => ({
    id: guild.id,
    name: guild.name,
    memberCount: guild.memberCount
  }));

  console.log(`Bot trouvé sur ${guildIds.length} guildes:`);
  guildsInfo.forEach(guild => {
    console.log(`  - ${guild.name} (${guild.id}) - ${guild.memberCount} membres`);
  });

  await client.destroy();
  return guildIds;
};

(async () => {
  try {
    await db.initDB();
    console.log(`Successfully setup database.`);

    console.log(`Started refreshing ${commands.length} application (/) commands.`);

    // Récupérer dynamiquement les guildes
    const guildIds = await getGuildIds();

    for (const guildId of guildIds) {
      const data = await rest.put(
        Routes.applicationGuildCommands(global.data.clientId, guildId),
        { body: commands }
      );
      console.log(`Successfully reloaded ${data.length} application (/) commands for guild ${guildId}.`);
    }
    console.log(`Commands deployed to ${guildIds.length} guilds.`);

    for (const commandInfo of commandsInfo) {
      await db.addCommand(commandInfo[0]);
    }
    console.log(`Successfully reloaded ${commandsInfo.length} application (/) commands info on database.`);
  }
  catch (error) {
    console.error(error);
  }

  db.end()
})();
