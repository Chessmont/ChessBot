const { Events } = require('discord.js');

module.exports = {
	name: Events.InteractionCreate,
	async execute(client, interaction) {
		// Gestion des slash commands
		if (interaction.isChatInputCommand()) {
			const command = interaction.client.commands.get(interaction.commandName);

			if (!command) {
				console.error(`No command matching ${interaction.commandName} was found.`);
				return;
			}

			try {
				await command.execute(interaction);
			} catch (error) {
				console.error(`Error executing ${interaction.commandName}`);
				console.error(error);
			}
		}

		// Gestion des boutons et modals pour la commande puzzle
		if (interaction.isButton() || interaction.isModalSubmit()) {
			const puzzleCommand = interaction.client.commands.get('puzzle');
			if (puzzleCommand && (
				interaction.customId === 'play_move' ||
				interaction.customId === 'show_solution' ||
				interaction.customId === 'move_modal' ||
				interaction.customId === 'hint_button'
			)) {
				try {
					await puzzleCommand.execute(interaction);
				} catch (error) {
					console.error('Error executing puzzle button/modal interaction');
					console.error(error);
				}
			}
		}
	},
};
