const {Events} = require("discord.js");

const db = require("../../api");

module.exports = {
	name: Events.GuildMemberAdd,
	async execute(client, member) {
		if (member.user.bot) return;

		const existingUser = await db.userExists(member.id)
		if (!existingUser)
			return await db.addUser(member.id, member.user.username);
		else
			await db.updateName(member.id, member.user.username);

	},
};
