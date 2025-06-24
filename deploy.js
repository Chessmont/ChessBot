const { REST, Routes } = require("discord.js");
const fs = require("node:fs");
const path = require("node:path");
require("dotenv").config();

global.data = require('./config.json');

const commands = [];
const commandsInfo = [];
const foldersPath = path.join(__dirname, "src", "commands");
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

(async () => {
  try {
    console.log(`Started refreshing ${commands.length} application (/) commands.`);

    // Déployer les commandes pour chaque guilde
    for (const guildId of global.data.guildIds) {
      const data = await rest.put(
        Routes.applicationGuildCommands(global.data.clientId, guildId),
        { body: commands }
      );
      console.log(`Successfully reloaded ${data.length} application (/) commands for guild ${guildId}.`);
    }

    console.log(`Commands deployed to ${global.data.guildIds.length} guilds.`);
  }
  catch (error) {
    console.error(error);
  }
})();
