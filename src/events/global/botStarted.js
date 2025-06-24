const { Events, ActivityType } = require("discord.js");

module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    console.log("Bot démarré !");

    // Vérifier toutes les guildes configurées
    console.log(`Connexion à ${global.data.guildIds.length} serveur(s):`);

    for (const guildId of global.data.guildIds) {
      const guild = client.guilds.cache.get(guildId);
      if (!guild) {
        console.log(`❌ Serveur non trouvé avec l'id : ${guildId}`);
      } else {
        console.log(`✅ Serveur trouvé : ${guild.name} (${guildId})`);
      }
    }

    console.log("ChessBot en ligne !");
    client.user.setActivity("Aux échecs", { type: ActivityType.Playing });
  },
};
