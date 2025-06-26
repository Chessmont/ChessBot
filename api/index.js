const mysql = require('mysql2/promise');
let db;

const createPool = () => {
  db = mysql.createPool({
    host: process.env.DBHOST,
    user: process.env.DBUSER,
    port: process.env.DBPORT,
    password: process.env.DBPASSWORD,
    database: process.env.DBDATABASE,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  });
  console.log('Database pool created');
};

const connect = async () => {
  if (!db) {
    createPool();
  }
};

const end = async () => {
  if (db) {
    await db.end();
    db = null;
    console.log('Database pool closed');
  }
};

const users = require('./db/users');
const commands = require('./db/commands');
const chess = require('./db/chess');

const initDB = async (client = null) => {
  await connect();
  await users.initDBusers(db);
  await commands.initDBcommands(db, client);
  await chess.initDBchess(db);

  if (client !== null) {
    console.log(`Bot présent sur ${client.guilds.cache.size} guildes`);

    const existingUsers = await users.existingUsers();
    const existingUserMap = new Map(existingUsers.map(user => [user.id, user.name]));

    const allNewUsers = [];
    const allUpdatedUsers = [];

    for (const [guildId, guild] of client.guilds.cache) {
      try {
        console.log(`Synchronisation des membres de la guilde: ${guild.name} (${guildId})`);
        const members = await guild.members.fetch();

        members.forEach(member => {
          // Ignorer les bots
          if (member.user.bot) return;

          if (!existingUserMap.has(member.id)) {
            // Nouvel utilisateur
            allNewUsers.push([member.id, member.user.username]);
            existingUserMap.set(member.id, member.user.username); // Éviter les doublons
          } else if (existingUserMap.get(member.id) !== member.user.username) {
            // Utilisateur avec nom modifié
            if (!allUpdatedUsers.some(([, id]) => id === member.id)) {
              allUpdatedUsers.push([member.user.username, member.id]);
              existingUserMap.set(member.id, member.user.username); // Mettre à jour la map
            }
          }
        });
      } catch (error) {
        console.error(`Erreur lors de la synchronisation de la guilde ${guild.name}:`, error);
      }
    }

    // Insertion des nouveaux utilisateurs
    if (allNewUsers.length > 0) {
      for (const [id, username] of allNewUsers) {
        await users.addUser(id, username);
      }
      console.log(`${allNewUsers.length} nouveaux membres ajoutés au total.`);
    }

    // Mise à jour des utilisateurs modifiés
    if (allUpdatedUsers.length > 0) {
      for (const [username, id] of allUpdatedUsers) {
        await users.updateName(id, username);
      }
      console.log(`${allUpdatedUsers.length} membres mis à jour au total.`);
    }

    console.log('Synchronisation de tous les membres terminée.');
  }
};

const getGuildsInfo = (client) => {
  if (!client) return [];

  return client.guilds.cache.map(guild => ({
    id: guild.id,
    name: guild.name,
    memberCount: guild.memberCount,
    owner: guild.ownerId
  }));
};

// Export des modules et de la connexion à la DB
module.exports = {
  initDB, connect, end, getGuildsInfo,
  ...users,
  ...chess,
  ...commands
};
