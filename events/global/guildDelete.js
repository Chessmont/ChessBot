const { Events } = require("discord.js");

module.exports = {
  name: Events.GuildDelete,
  once: false,
  async execute(guild) {
    console.log(`😢 Bot retiré de la guilde: ${guild.name} (${guild.id})`);
    console.log(`   Le bot est maintenant sur ${guild.client.guilds.cache.size} serveur(s)`);
  },
};
