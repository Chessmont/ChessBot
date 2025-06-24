const { SlashCommandBuilder, } = require("discord.js");

  const commandName = "ping";
  const commandInfo = "Répond pong!";
  const commandDescription = "Doit répondre 'Pong !', sert à savoir si le bot fonctionne correctement";

  module.exports = {
      info: {commandName,commandInfo,commandDescription},
      data: new SlashCommandBuilder()
        .setName(commandName)
        .setDescription(commandInfo),
      async execute(interaction) {
        await interaction.reply("Pong !", { ephemeral: true });
      },
    };
