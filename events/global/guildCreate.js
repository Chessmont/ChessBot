const { Events } = require("discord.js");
const db = require("../../api");

module.exports = {
  name: Events.GuildCreate,
  once: false,
  async execute(guild) {
    console.log(`🎉 Bot ajouté à une nouvelle guilde: ${guild.name} (${guild.id})`);
    console.log(`   Nombre de membres: ${guild.memberCount}`);

    try {
      const existingUsers = await db.existingUsers();
      const existingUserMap = new Map(existingUsers.map(user => [user.id, user.name]));

      console.log(`📥 Synchronisation des membres de ${guild.name}...`);

      const members = await guild.members.fetch();

      const newUsers = [];
      const updatedUsers = [];

      members.forEach(member => {
        if (member.user.bot) return;

        if (!existingUserMap.has(member.id)) {
          newUsers.push([member.id, member.user.username]);
        } else if (existingUserMap.get(member.id) !== member.user.username) {
          updatedUsers.push([member.user.username, member.id]);
        }
      });

      if (newUsers.length > 0) {
        for (const [id, username] of newUsers) {
          await db.addUser(id, username);
        }
        console.log(`✅ ${newUsers.length} nouveaux membres ajoutés depuis ${guild.name}`);
      }

      if (updatedUsers.length > 0) {
        for (const [username, id] of updatedUsers) {
          await db.updateName(id, username);
        }
        console.log(`✅ ${updatedUsers.length} membres mis à jour depuis ${guild.name}`);
      }

      if (newUsers.length === 0 && updatedUsers.length === 0) {
        console.log(`ℹ️  Aucun nouveau membre à ajouter depuis ${guild.name}`);
      }

      console.log(`🎯 Synchronisation terminée pour ${guild.name}`);

    } catch (error) {
      console.error(`❌ Erreur lors de la synchronisation de ${guild.name}:`, error);
    }
  },
};
