const { Events, ActivityType } = require("discord.js");
const db = require("../../api");

module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    console.log("Bot démarré !");

    // Vérifier toutes les guildes où le bot est présent
    console.log(`Connexion à ${client.guilds.cache.size} serveur(s):`);

    client.guilds.cache.forEach(guild => {
      console.log(`✅ Serveur trouvé : ${guild.name} (${guild.id}) - ${guild.memberCount} membres`);
    });

    console.log("ChessBot en ligne !");
    client.user.setActivity("les tutos de Julien Song", { type: ActivityType.Watching });

    db.initDB(client);
  },
};
