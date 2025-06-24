const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags } = require("discord.js");
const axios = require("axios");
const { Chess } = require("chess.js");

// Map pour stocker les puzzles en attente de solution (par guildId au lieu de userId)
const pendingPuzzles = new Map();

// Fonction pour traduire les difficultés
const translateDifficulty = (difficulty) => {
  const difficultyMap = {
    'easiest': 'Très facile',
    'easier': 'Facile',
    'normal': 'Normal',
    'harder': 'Difficile',
    'hardest': 'Très difficile'
  };
  return difficultyMap[difficulty] || difficulty;
};

// Fonction pour convertir la notation anglaise vers française
const convertToFrench = (move) => {
  return move
    .replace(/K/g, 'R')  // King -> Roi
    .replace(/Q/g, 'D')  // Queen -> Dame
    .replace(/R/g, 'T')  // Rook -> Tour
    .replace(/B/g, 'F')  // Bishop -> Fou
    .replace(/N/g, 'C'); // Knight -> Cavalier
};

// Fonction pour convertir la notation française vers anglaise
const convertToEnglish = (move) => {
  return move
    .replace(/R/g, 'K')  // Roi -> King
    .replace(/D/g, 'Q')  // Dame -> Queen
    .replace(/T/g, 'R')  // Tour -> Rook
    .replace(/F/g, 'B')  // Fou -> Bishop
    .replace(/C/g, 'N'); // Cavalier -> Knight
};

const commandName = "puzzle";
const commandInfo = "Jouer à un puzzle d'échecs depuis Lichess";
const commandDescription = "Récupère un puzzle d'échecs aléatoire depuis Lichess avec différents niveaux de difficulté";

module.exports = {
  info: { commandName, commandInfo, commandDescription },
  data: new SlashCommandBuilder()
    .setName(commandName)
    .setDescription(commandInfo)
    .addStringOption(option =>
      option
        .setName('difficulte')
        .setDescription('Niveau de difficulté du puzzle')
        .setRequired(false)
        .addChoices(
          { name: 'Très facile', value: 'easiest' },
          { name: 'Facile', value: 'easier' },
          { name: 'Normal', value: 'normal' },
          { name: 'Difficile', value: 'harder' },
          { name: 'Très difficile', value: 'hardest' }
        )
    ),

  async execute(interaction) {
    try {
      // Gestion des boutons
      if (interaction.isButton()) {
        const guildId = interaction.guild.id;

        if (interaction.customId === 'play_move') {
          await showMoveModal(interaction);
          return;
        } else if (interaction.customId === 'show_solution') {
          const userPuzzle = pendingPuzzles.get(guildId);

          if (!userPuzzle) {
            return await interaction.reply({
              content: '❌ Aucun puzzle en cours sur ce serveur',
              flags: MessageFlags.Ephemeral
            });
          }

          await showSolution(interaction, userPuzzle);
          return;
        } else if (interaction.customId === 'hint_button') {
          const userPuzzle = pendingPuzzles.get(guildId);

          if (!userPuzzle) {
            return await interaction.reply({
              content: '❌ Aucun puzzle en cours sur ce serveur',
              flags: MessageFlags.Ephemeral
            });
          }

          await showHint(interaction, userPuzzle);
          return;
        }
      }

      // Gestion des modals
      if (interaction.isModalSubmit()) {
        if (interaction.customId === 'move_modal') {
          const userMove = interaction.fields.getTextInputValue('move_input');
          const guildId = interaction.guild.id;

          const userPuzzle = pendingPuzzles.get(guildId);

          if (!userPuzzle) {
            return await interaction.reply({
              content: '❌ Aucun puzzle en cours sur ce serveur',
              flags: MessageFlags.Ephemeral
            });
          }

          await handleMove(interaction, userPuzzle, userMove);
          return;
        }
      }

      // Gestion des slash commands
      const difficulty = interaction.options.getString('difficulte') || 'normal';
      const guildId = interaction.guild.id;

      // Nettoyer l'ancien puzzle s'il existe
      if (pendingPuzzles.has(guildId)) {
        pendingPuzzles.delete(guildId);
      }

      await createNewPuzzle(interaction, difficulty, guildId);

    } catch (error) {
      console.error("Erreur dans la commande puzzle:", error);

      const errorEmbed = new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle('❌ Erreur')
        .setDescription('Une erreur s\'est produite lors de l\'exécution de la commande.')
        .setTimestamp();

      if (interaction.replied || interaction.deferred) {
        await interaction.editReply({ embeds: [errorEmbed] });
      } else {
        await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
      }
    }
  }
};

const createNewPuzzle = async (interaction, difficulty, guildId) => {
  await interaction.deferReply();

  try {
    const response = await axios.get(`https://lichess.org/api/puzzle/next?difficulty=${difficulty}`);
    const puzzleData = response.data;

    // Charger le PGN avec chess.js
    const chess = new Chess();
    chess.loadPgn(puzzleData.game.pgn);

    // Obtenir le FEN de la position
    const fen = chess.fen();

    // Déterminer qui doit jouer
    const fenParts = fen.split(' ');
    const activeColor = fenParts[1];

    // Générer l'image de l'échiquier
    let imageUrl = `https://fen2image.chessvision.ai/${encodeURIComponent(fen)}`;
    if (activeColor === 'b') {
      imageUrl += '?turn=black&pov=black';
    } else {
      imageUrl += '?turn=white&pov=white';
    }

    const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    const imageBuffer = Buffer.from(imageResponse.data, 'binary');
    const attachment = new AttachmentBuilder(imageBuffer, { name: 'chess_position.png' });

    // Créer l'embed (sans l'image qui sera séparée, sans thèmes ni coups attendus)
    const embed = new EmbedBuilder()
      .setColor('#0099FF')
      .setTitle('🧩 Nouveau Puzzle d\'Échecs')
      .addFields(
        { name: '⭐ Rating', value: `${puzzleData.puzzle.rating}`, inline: true },
        { name: '🎯 Difficulté', value: translateDifficulty(difficulty), inline: true },
        { name: '👤 Trait aux', value: activeColor === 'w' ? 'Blancs' : 'Noirs', inline: true },
        { name: '🎮 Parties jouées', value: `${puzzleData.puzzle.plays}`, inline: true }
      )
      .setDescription('**À vous de jouer !**\nCliquez sur les boutons ci-dessous pour interagir avec le puzzle')
      .setTimestamp()
      .setFooter({ text: 'Puzzle fourni par Lichess.org' });

    const reply = await interaction.editReply({
      files: [attachment], // Image séparée de l'embed
      embeds: [embed],
      components: [createPuzzleButtons(), createHintButton()]
    });

    // Stocker les données du puzzle avec guildId
    pendingPuzzles.set(guildId, {
      messageId: reply.id,
      solution: puzzleData.puzzle.solution,
      pgn: puzzleData.game.pgn,
      fen: fen,
      userMoves: [],
      solvers: [], // Tableau pour stocker qui a trouvé chaque coup
      difficulty: difficulty,
      rating: puzzleData.puzzle.rating,
      themes: puzzleData.puzzle.themes,
      plays: puzzleData.puzzle.plays,
      hintLevel: 0 // Niveau d'indice (0 = aucun, 1 = nb coups, 2 = thèmes, 3 = première lettre)
    });

  } catch (error) {
    console.error("Erreur lors de la création du puzzle:", error);

    const errorEmbed = new EmbedBuilder()
      .setColor('#FF0000')
      .setTitle('❌ Erreur')
      .setDescription('Impossible de récupérer un puzzle depuis Lichess. Veuillez réessayer.')
      .setTimestamp();

    await interaction.editReply({ embeds: [errorEmbed] });
  }
};

const handleMove = async (interaction, userPuzzle, userMove) => {
  await interaction.deferReply(); // Retour à la normale

  try {
    const guildId = interaction.guild.id; // Ajouter cette ligne manquante

    // Convertir le coup de l'utilisateur du français vers l'anglais pour la validation
    const englishUserMove = convertToEnglish(userMove);

    // Convertir la solution UCI en SAN
    const chess = new Chess();
    chess.loadPgn(userPuzzle.pgn);

    let correctSolutionSAN = [];
    let tempChess = new Chess(chess.fen());

    for (const uciMove of userPuzzle.solution) {
      const move = tempChess.move({
        from: uciMove.slice(0, 2),
        to: uciMove.slice(2, 4),
        promotion: uciMove.length > 4 ? uciMove[4] : undefined
      });
      if (move) {
        correctSolutionSAN.push(move.san);
      }
    }

    // Extraire seulement les coups du joueur (indices pairs)
    const playerMoves = [];
    for (let i = 0; i < correctSolutionSAN.length; i += 2) {
      playerMoves.push(correctSolutionSAN[i]);
    }

    const currentMoveIndex = userPuzzle.userMoves.length;
    const expectedMove = playerMoves[currentMoveIndex];

    // Normaliser les coups pour la comparaison (enlever échec, mat, et espaces)
    const normalizeMove = (move) => {
      return move.replace(/[+#\s]/g, '').toLowerCase();
    };

    // Fonction améliorée pour vérifier si les coups correspondent
    const movesMatch = (userMove, expectedMove) => {
      const normalizedUser = normalizeMove(userMove);
      const normalizedExpected = normalizeMove(expectedMove);

      // Comparaison directe
      if (normalizedUser === normalizedExpected) {
        return true;
      }

      // Comparaison après conversion français/anglais
      const convertedUser = normalizeMove(convertToEnglish(userMove));
      if (convertedUser === normalizedExpected) {
        return true;
      }

      return false;
    };

    const isCorrectMove = movesMatch(englishUserMove, expectedMove);

    if (isCorrectMove) {
      // Convertir le coup vers le français pour l'affichage
      const frenchMove = convertToFrench(expectedMove);
      userPuzzle.userMoves.push(frenchMove);
      userPuzzle.solvers.push(interaction.user.id);

      // Vérifier si le puzzle est terminé
      if (userPuzzle.userMoves.length >= playerMoves.length) {
        // Puzzle terminé !
        const frenchSolution = correctSolutionSAN.map(move => convertToFrench(move));
        const solversList = [...new Set(userPuzzle.solvers.filter(Boolean))].map(id => `<@${id}>`).join(', ') || 'Aucun';

        const embed = new EmbedBuilder()
          .setColor('#00FF00')
          .setTitle('✅ Puzzle Terminé !')
          .addFields(
            { name: '🎯 Solution complète', value: frenchSolution.join(" "), inline: false },
            { name: '👤 Coups joués', value: userPuzzle.userMoves.join(" "), inline: false },
            { name: '🏆 Contributeurs', value: solversList, inline: false },
            { name: '⭐ Rating', value: `${userPuzzle.rating}`, inline: true },
            { name: '🎯 Difficulté', value: translateDifficulty(userPuzzle.difficulty), inline: true }
          )
          .setDescription('🎉 Félicitations ! Le puzzle a été résolu !')
          .setTimestamp()
          .setFooter({ text: 'Utilisez /puzzle pour un autre puzzle' });

        // Récupérer le message original et le modifier
        const originalMessage = await interaction.channel.messages.fetch(userPuzzle.messageId);
        await originalMessage.edit({
          files: [], // Pas d'image pour le puzzle terminé
          embeds: [embed],
          components: []
        });

        pendingPuzzles.delete(guildId);
        await interaction.editReply(`🎉 <@${interaction.user.id}> a trouvé le dernier coup et terminé le puzzle ! (${frenchMove})`);

      } else {
        // Coup correct mais puzzle pas fini - générer nouvelle position
        await updatePuzzlePosition(interaction, userPuzzle, correctSolutionSAN);
        await interaction.editReply(`✅ <@${interaction.user.id}> a trouvé un coup correct ! (${frenchMove})`);
      }

    } else {
      // Coup incorrect (message éphémère)
      await interaction.editReply('🔄 Traitement...');
      await interaction.followUp({
        content: `❌ **Coup incorrect !** (${userMove})`,
        flags: MessageFlags.Ephemeral
      });
    }

  } catch (error) {
    console.error("Erreur lors du traitement du coup:", error);
    await interaction.editReply('🔄 Traitement...');
    await interaction.followUp({
      content: '❌ **Erreur** - Vérifiez la notation de votre coup.',
      flags: MessageFlags.Ephemeral
    });
  }
};

const updatePuzzlePosition = async (interaction, userPuzzle, correctSolutionSAN) => {
  try {
    // Simuler la position après les coups
    const gameChess = new Chess();
    gameChess.loadPgn(userPuzzle.pgn);

    // Jouer tous les coups jusqu'à la position actuelle
    const movesToPlay = userPuzzle.userMoves.length * 2;
    let currentGameChess = new Chess(gameChess.fen());

    for (let i = 0; i < movesToPlay && i < correctSolutionSAN.length; i++) {
      currentGameChess.move(correctSolutionSAN[i]);
    }

    const newFen = currentGameChess.fen();
    const fenParts = newFen.split(' ');
    const activeColor = fenParts[1];

    // Générer la nouvelle image
    let imageUrl = `https://fen2image.chessvision.ai/${encodeURIComponent(newFen)}`;
    if (activeColor === 'b') {
      imageUrl += '?turn=black&pov=black';
    } else {
      imageUrl += '?turn=white&pov=white';
    }

    const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    const imageBuffer = Buffer.from(imageResponse.data, 'binary');
    const attachment = new AttachmentBuilder(imageBuffer, { name: 'chess_position.png' });

    // Coup de l'adversaire (converti en français)
    const opponentMoveIndex = (userPuzzle.userMoves.length - 1) * 2 + 1;
    const opponentMove = opponentMoveIndex < correctSolutionSAN.length ?
      convertToFrench(correctSolutionSAN[opponentMoveIndex]) : null;

    const embed = new EmbedBuilder()
      .setColor('#0099FF')
      .setTitle('🧩 Puzzle d\'Échecs')
      .addFields(
        { name: '👥 Progression', value: userPuzzle.userMoves.map((move, index) => {
          const solver = userPuzzle.solvers[index] ? `<@${userPuzzle.solvers[index]}>` : 'Inconnu';
          return `${index + 1}. ${move} (${solver})`;
        }).join('\n'), inline: false },
        { name: '👤 Trait aux', value: activeColor === 'w' ? 'Blancs' : 'Noirs', inline: true },
        { name: '⭐ Rating', value: `${userPuzzle.rating}`, inline: true },
        { name: '🎯 Difficulté', value: translateDifficulty(userPuzzle.difficulty), inline: true }
      )
      .setDescription(`${opponentMove ? `L'adversaire a joué: **${opponentMove}**\n\n` : ''}**Coup suivant ?**\nCliquez sur les boutons ci-dessous pour interagir avec le puzzle`)
      .setTimestamp()
      .setFooter({ text: 'Puzzle fourni par Lichess.org' });

    // Récupérer le message original et le modifier
    const originalMessage = await interaction.channel.messages.fetch(userPuzzle.messageId);
    await originalMessage.edit({
      embeds: [embed],
      files: [attachment],
      components: [createPuzzleButtons(), createHintButton()]
    });

    // Mettre à jour les données stockées
    userPuzzle.fen = newFen;

  } catch (error) {
    console.error("Erreur lors de la mise à jour de la position:", error);
    throw error;
  }
};

const showHint = async (interaction, userPuzzle) => {
  userPuzzle.hintLevel++;

  // Convertir la solution pour obtenir les infos
  const chess = new Chess();
  chess.loadPgn(userPuzzle.pgn);
  let correctSolutionSAN = [];
  let tempChess = new Chess(chess.fen());

  for (const uciMove of userPuzzle.solution) {
    const move = tempChess.move({
      from: uciMove.slice(0, 2),
      to: uciMove.slice(2, 4),
      promotion: uciMove.length > 4 ? uciMove[4] : undefined
    });
    if (move) {
      correctSolutionSAN.push(move.san);
    }
  }

  const playerMoves = [];
  for (let i = 0; i < correctSolutionSAN.length; i += 2) {
    playerMoves.push(correctSolutionSAN[i]);
  }

  let hintText = "";
  let publicShame = "";

  switch(userPuzzle.hintLevel) {
    case 1:
      hintText = `💡 **Indice 1/3**: Ce puzzle nécessite ${playerMoves.length} coup${playerMoves.length > 1 ? 's' : ''} de votre part.`;
      publicShame = `🔔 <@${interaction.user.id}> a utilisé un indice (nombre de coups)`;
      break;
    case 2:
      hintText = `💡 **Indice 2/3**: Thèmes du puzzle - ${userPuzzle.themes.join(", ")}`;
      publicShame = `🔔 <@${interaction.user.id}> a utilisé un autre indice (thèmes)`;
      break;
    case 3:
      const currentMoveIndex = userPuzzle.userMoves.length;
      const nextMove = playerMoves[currentMoveIndex];
      const frenchNextMove = convertToFrench(nextMove);
      const firstLetter = frenchNextMove.charAt(0);
      hintText = `💡 **Indice 3/3**: Le prochain coup commence par "${firstLetter}"`;
      publicShame = `🔔 <@${interaction.user.id}> a utilisé le dernier indice (première lettre)`;
      break;
    default:
      hintText = "❌ Aucun indice supplémentaire disponible.";
      return await interaction.reply({ content: hintText, flags: MessageFlags.Ephemeral });
  }

  // Message d'indice privé
  await interaction.reply({ content: hintText, flags: MessageFlags.Ephemeral });

  // Message de dénonciation publique
  await interaction.followUp({ content: publicShame });
};

const showSolution = async (interaction, userPuzzle) => {
  await interaction.deferReply({ ephemeral: true }); // Rendre la réponse éphémère dès le début

  try {
    // Convertir la solution UCI en SAN puis en français
    const chess = new Chess();
    chess.loadPgn(userPuzzle.pgn);

    let correctSolutionSAN = [];
    let tempChess = new Chess(chess.fen());

    for (const uciMove of userPuzzle.solution) {
      const move = tempChess.move({
        from: uciMove.slice(0, 2),
        to: uciMove.slice(2, 4),
        promotion: uciMove.length > 4 ? uciMove[4] : undefined
      });
      if (move) {
        correctSolutionSAN.push(move.san);
      }
    }

    const frenchSolution = correctSolutionSAN.map(move => convertToFrench(move));

    const solutionEmbed = new EmbedBuilder()
      .setColor('#FFD700')
      .setTitle('🔍 Solution Révélée')
      .addFields(
        { name: '✅ Solution complète', value: frenchSolution.join(" "), inline: false },
        { name: '⭐ Rating', value: `${userPuzzle.rating}`, inline: true },
        { name: '🎯 Difficulté', value: translateDifficulty(userPuzzle.difficulty), inline: true }
      )
      .setDescription('⚠️ **Vous avez regardé la solution !**')
      .setTimestamp()
      .setFooter({ text: 'Cette information n\'est visible que par vous' });

    if (userPuzzle.userMoves && userPuzzle.userMoves.length > 0) {
      solutionEmbed.addFields({
        name: '👤 Coups déjà trouvés',
        value: `${userPuzzle.userMoves.join(" ")} (${userPuzzle.userMoves.length}/${Math.ceil(correctSolutionSAN.length / 2)})`,
        inline: false
      });
    }

    // Réponse éphémère avec la solution (ne pas toucher au puzzle principal)
    await interaction.editReply({ embeds: [solutionEmbed] });

    // Message de dénonciation publique uniquement
    await interaction.followUp({
      content: `🔔 <@${interaction.user.id}> a consulté la solution du puzzle !`,
      ephemeral: false // S'assurer que c'est public
    });

  } catch (error) {
    console.error("Erreur lors de l'affichage de la solution:", error);

    await interaction.editReply('❌ **Erreur** - Impossible d\'afficher la solution.');
  }
};

const showMoveModal = async (interaction) => {
  const modal = new ModalBuilder()
    .setCustomId('move_modal')
    .setTitle('🎯 Jouer un coup');

  const moveInput = new TextInputBuilder()
    .setCustomId('move_input')
    .setLabel('Coup (notation algébrique)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Ex: Cf6, e4, O-O, Dxd5+')
    .setRequired(true)
    .setMaxLength(10);

  const actionRow = new ActionRowBuilder().addComponents(moveInput);
  modal.addComponents(actionRow);

  await interaction.showModal(modal);
};

const createPuzzleButtons = () => {
  const playButton = new ButtonBuilder()
    .setCustomId('play_move')
    .setLabel('🎯 Jouer un coup')
    .setStyle(ButtonStyle.Primary);

  const solutionButton = new ButtonBuilder()
    .setCustomId('show_solution')
    .setLabel('🔍 Voir la solution')
    .setStyle(ButtonStyle.Secondary);

  return new ActionRowBuilder().addComponents(playButton, solutionButton);
};

const createHintButton = () => {
  const hintButton = new ButtonBuilder()
    .setCustomId('hint_button')
    .setLabel('💡 Indice')
    .setStyle(ButtonStyle.Success);

  return new ActionRowBuilder().addComponents(hintButton);
};
