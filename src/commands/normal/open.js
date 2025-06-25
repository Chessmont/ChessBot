const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder, ActionRowBuilder, StringSelectMenuBuilder, ComponentType, MessageFlags } = require("discord.js");
const axios = require("axios");

const commandName = "opening";
const commandInfo = "Jeu de reconnaissance d'ouvertures d'échecs";
const commandDescription = "Devinez le nom de l'ouverture à partir de sa position finale";

module.exports = {
  info: { commandName, commandInfo, commandDescription },
  data: new SlashCommandBuilder()
    .setName(commandName)
    .setDescription(commandInfo),

  async execute(interaction) {
    try {
      await interaction.deferReply();

      // Vérifier que les ouvertures sont chargées
      if (!global.openings || global.openings.length === 0) {
        const errorEmbed = new EmbedBuilder()
          .setColor('#FF0000')
          .setTitle('❌ Erreur')
          .setDescription('Les ouvertures ne sont pas chargées. Redémarrez le bot.')
          .setTimestamp();

        return await interaction.editReply({ embeds: [errorEmbed] });
      }

      // Sélectionner 4 ouvertures aléatoirement (avec au moins 3 coups pour avoir une position intéressante)
      const eligibleOpenings = global.openings.filter(opening => opening.ply >= 6);

      if (eligibleOpenings.length < 4) {
        const errorEmbed = new EmbedBuilder()
          .setColor('#FF0000')
          .setTitle('❌ Erreur')
          .setDescription('Pas assez d\'ouvertures valides dans la base de données.')
          .setTimestamp();

        return await interaction.editReply({ embeds: [errorEmbed] });
      }

      // Mélanger et prendre 4 ouvertures DIFFÉRENTES
      const shuffledOpenings = eligibleOpenings.sort(() => 0.5 - Math.random());
      const selectedOpenings = [];
      const usedNames = new Set();

      // S'assurer que les 4 ouvertures ont des noms différents
      for (const opening of shuffledOpenings) {
        if (!usedNames.has(opening.name) && selectedOpenings.length < 4) {
          selectedOpenings.push(opening);
          usedNames.add(opening.name);
        }
        if (selectedOpenings.length === 4) break;
      }

      // Vérification de sécurité au cas où on n'aurait pas trouvé 4 ouvertures différentes
      if (selectedOpenings.length < 4) {
        const errorEmbed = new EmbedBuilder()
          .setColor('#FF0000')
          .setTitle('❌ Erreur')
          .setDescription('Pas assez d\'ouvertures uniques dans la base de données.')
          .setTimestamp();

        return await interaction.editReply({ embeds: [errorEmbed] });
      }

      // Choisir la bonne réponse
      const correctAnswer = selectedOpenings[Math.floor(Math.random() * 4)];

      // Générer l'image de l'échiquier pour la bonne réponse
      const fen = correctAnswer.fen;
      const fenParts = fen.split(' ');
      const activeColor = fenParts[1];

      let imageUrl = `https://fen2image.chessvision.ai/${encodeURIComponent(fen)}`;
      if (activeColor === 'b') {
        imageUrl += '?turn=black&pov=black';
      } else {
        imageUrl += '?turn=white&pov=white';
      }

      let attachment = null;
      try {
        const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
        const imageBuffer = Buffer.from(imageResponse.data, 'binary');
        attachment = new AttachmentBuilder(imageBuffer, { name: 'chess_position.png' });
      } catch (imageError) {
        console.error("Erreur lors de la génération de l'image:", imageError);
      }

      // Créer l'embed du jeu
      const gameEmbed = new EmbedBuilder()
        .setColor('#0099FF')
        .setTitle('🎯 Jeu d\'Ouvertures')
        .addFields(
          { name: '🎮 Comment jouer', value: 'Regardez la position et devinez quelle ouverture a mené à cette position !', inline: false },
          { name: '📋 Instructions', value: 'Utilisez le menu déroulant ci-dessous pour sélectionner votre réponse', inline: false },
          { name: '🎯 Coups joués', value: correctAnswer.pgn, inline: false },
          { name: '👤 Trait aux', value: activeColor === 'w' ? 'Blancs' : 'Noirs', inline: true }
        )
        .setDescription('**Quelle ouverture a mené à cette position ?**')
        .setTimestamp()
        .setFooter({ text: 'Sélectionnez votre réponse dans le menu ci-dessous' });

      // Ajouter l'image si disponible
      if (attachment) {
        gameEmbed.setImage('attachment://chess_position.png');
      }

      // Générer un ID unique pour ce jeu
      const gameId = Math.floor(Math.random() * 100000) + 1;

      // Créer le menu déroulant avec les 4 options
      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('opening_selector_' + gameId)
        .setPlaceholder('Choisissez une ouverture...')
        .addOptions(
          selectedOpenings.map(opening => ({
            label: opening.eco,
            description: `${opening.name}`,
            value: opening.name
          }))
        );

      const actionRow = new ActionRowBuilder().addComponents(selectMenu);

      // Envoyer le message
      const replyOptions = { embeds: [gameEmbed], components: [actionRow] };
      if (attachment) {
        replyOptions.files = [attachment];
      }

      const embedMessage = await interaction.editReply(replyOptions);

      // Créer le collector pour le menu déroulant
      const collector = embedMessage.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        time: 300000 // 5 minutes
      });

      collector.on('collect', async i => {
        if (i.customId !== 'opening_selector_' + gameId) return;

        const selectedOpeningName = i.values[0];
        const isCorrect = selectedOpeningName === correctAnswer.name;

        if (isCorrect) {
          // Bonne réponse !
          const winnerEmbed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle('🎉 Bonne réponse !')
            .addFields(
              { name: '🏆 Gagnant', value: `<@${i.user.id}>`, inline: true },
              { name: '📖 Ouverture', value: correctAnswer.name, inline: true },
              { name: '🔢 Code ECO', value: correctAnswer.eco, inline: true },
              { name: '🎯 Coups', value: correctAnswer.pgn, inline: false }
            )
            .setDescription('✅ **Félicitations !** Vous avez trouvé la bonne ouverture !')
            .setTimestamp()
            .setFooter({ text: 'Utilisez /open pour une nouvelle partie' });

          // Si il y a une image, la conserver
          if (attachment) {
            winnerEmbed.setImage('attachment://chess_position.png');
          }

          // Arrêter le collector
          collector.stop('answered');

          // Réponse avec update du message
          await i.update({
            embeds: [winnerEmbed],
            components: [],
            files: attachment ? [attachment] : []
          });

          // Message de félicitations séparé
          await i.followUp({
            content: `🎉 <@${i.user.id}> a trouvé la bonne ouverture !`,
          });

        } else {
          // Mauvaise réponse
          await i.reply({
            content: `❌ **Mauvaise réponse !** Ce n'était pas "${selectedOpeningName}"`,
            flags: MessageFlags.Ephemeral
          });
        }
      });

      collector.on('end', async (collected, reason) => {
        if (reason === 'time') {
          // Temps écoulé
          const timeoutEmbed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('⏰ Temps écoulé !')
            .addFields(
              { name: '📖 La bonne réponse était', value: correctAnswer.name, inline: true },
              { name: '🔢 Code ECO', value: correctAnswer.eco, inline: true },
              { name: '🎯 Coups', value: correctAnswer.pgn, inline: false }
            )
            .setDescription('Le temps est écoulé ! La bonne réponse était...')
            .setTimestamp()
            .setFooter({ text: 'Utilisez /open pour une nouvelle partie' });

          if (attachment) {
            timeoutEmbed.setImage('attachment://chess_position.png');
          }

          try {
            await embedMessage.edit({
              embeds: [timeoutEmbed],
              components: [],
              files: attachment ? [attachment] : []
            });
          } catch (error) {
            console.error('Erreur lors de la modification du message après timeout:', error);
          }
        }
      });

    } catch (error) {
      console.error("Erreur dans la commande open:", error);

      const errorEmbed = new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle('❌ Erreur')
        .setDescription('Une erreur s\'est produite lors de l\'exécution de la commande.')
        .setTimestamp();

      try {
        if (interaction.replied || interaction.deferred) {
          await interaction.editReply({ embeds: [errorEmbed] });
        } else {
          await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
        }
      } catch (replyError) {
        console.error("Erreur lors de la réponse d'erreur:", replyError);
      }
    }
  }
};
