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
		// Gestion des select menus
		else if (interaction.isStringSelectMenu()) {
			// Gérer les select menus de la commande linkaccount
			if (interaction.customId === 'platform_select') {
				const linkaccountCommand = interaction.client.commands.get('linkaccount');
				if (linkaccountCommand && linkaccountCommand.handleSelectMenu) {
					try {
						await linkaccountCommand.handleSelectMenu(interaction);
					} catch (error) {
						console.error('Error handling select menu:', error);
					}
				}
			}
		}
		// Gestion des boutons
		else if (interaction.isButton()) {
			// Gérer les boutons de la commande linkaccount
			if (interaction.customId.startsWith('verify_') || interaction.customId === 'cancel_link') {
				const linkaccountCommand = interaction.client.commands.get('linkaccount');
				if (linkaccountCommand && linkaccountCommand.handleButton) {
					try {
						await linkaccountCommand.handleButton(interaction);
					} catch (error) {
						console.error('Error handling button:', error);
					}
				}
			}
		}
	},
};
