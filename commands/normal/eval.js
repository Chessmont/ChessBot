const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require("discord.js");
const { Chess } = require("chess.js");
const { spawn } = require("child_process");
const axios = require("axios");
const commandName = "eval";
const commandInfo = "Évaluer une position d'échecs avec Stockfish";
const commandDescription = "Analyse une position FEN avec le moteur Stockfish et retourne l'évaluation";

module.exports = {
  info: { commandName, commandInfo, commandDescription },
  data: new SlashCommandBuilder()
    .setName(commandName)
    .setDescription(commandInfo)
    .addStringOption(option =>
      option
        .setName('fen')
        .setDescription('Position FEN à analyser')
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName('temps')
        .setDescription('Temps d\'analyse en secondes (1-10, défaut: 3)')
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(10)
    ),

  async execute(interaction) {
    try {
      await interaction.deferReply();

      const fen = interaction.options.getString('fen');
      const timeSeconds = interaction.options.getInteger('temps') || 3;

      // Valider le FEN avec chess.js
      const chess = new Chess();
      try {
        chess.load(fen);
      } catch (error) {
        const errorEmbed = new EmbedBuilder()
          .setColor('#FF0000')
          .setTitle('❌ FEN Invalide')
          .setDescription('La notation FEN fournie n\'est pas valide.')
          .addFields(
            { name: 'FEN fourni', value: `\`${fen}\``, inline: false }
          )
          .setTimestamp();

        return await interaction.editReply({ embeds: [errorEmbed] });
      }

      // Analyser avec Stockfish
      const evaluation = await analyzePosition(fen, timeSeconds);

      // Ajuster l'évaluation selon le trait (Stockfish retourne du point de vue du joueur au trait)
      if (evaluation.score && chess.turn() === 'b') {
        if (evaluation.score.type === 'cp') {
          evaluation.score.value = -evaluation.score.value;
        } else if (evaluation.score.type === 'mate') {
          evaluation.score.value = -evaluation.score.value;
        }
      }

      // Convertir le meilleur coup UCI en SAN français
      let bestMoveSAN = 'Aucun';
      if (evaluation.bestMove && evaluation.bestMove !== '(none)') {
        try {
          const tempChess = new Chess(fen);
          const move = tempChess.move({
            from: evaluation.bestMove.slice(0, 2),
            to: evaluation.bestMove.slice(2, 4),
            promotion: evaluation.bestMove.length > 4 ? evaluation.bestMove[4] : undefined
          });
          if (move) {
            bestMoveSAN = convertToFrench(move.san);
          }
        } catch (error) {
          console.error("Erreur lors de la conversion UCI vers SAN:", error);
          bestMoveSAN = evaluation.bestMove; // Fallback vers UCI
        }
      }

      // Générer l'image de l'échiquier
      let imageUrl = `https://fen2image.chessvision.ai/${encodeURIComponent(fen)}`;
      if (chess.turn() === 'b') {
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
        // Continue sans l'image si elle ne peut pas être générée
      }

      const embed = new EmbedBuilder()
        .setColor('#0099FF')
        .setTitle('🔍 Analyse Stockfish')
        .addFields(
          { name: '📍 Position', value: `\`${fen}\``, inline: false },
          { name: '⚖️ Évaluation', value: formatEvaluation(evaluation.score), inline: true },
          { name: '🎯 Profondeur', value: `${evaluation.depth || 'N/A'}`, inline: true },
          { name: '👤 Trait aux', value: chess.turn() === 'w' ? 'Blancs' : 'Noirs', inline: true },
          { name: '🎯 Meilleur coup', value: bestMoveSAN, inline: true },
          { name: '📊 Nœuds analysés', value: evaluation.nodes?.toLocaleString() || 'N/A', inline: true },
          { name: '⏱️ Temps', value: `${timeSeconds}s`, inline: true }
        )
        .setDescription(getEvaluationDescription(evaluation.score, chess.turn()))
        .setTimestamp()
        .setFooter({ text: 'Analyse fournie par Stockfish' });

      // Ajouter l'image à l'embed si disponible
      if (attachment) {
        embed.setImage('attachment://chess_position.png');
      }

      const replyOptions = { embeds: [embed] };
      if (attachment) {
        replyOptions.files = [attachment];
      }

      await interaction.editReply(replyOptions);

    } catch (error) {
      console.error("Erreur dans la commande eval:", error);

      const errorEmbed = new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle('❌ Erreur')
        .setDescription('Une erreur s\'est produite lors de l\'analyse.')
        .setTimestamp();

      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }
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

const analyzePosition = async (fen, timeSeconds) => {
  return new Promise((resolve, reject) => {
    const stockfishProcess = spawn("stockfish", [], {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true
    });

    stockfishProcess.on('error', (error) => {
      console.log(`Erreur avec stockfish": ${error.message}`);
    });

    stockfishProcess.on('spawn', () => {
      setupStockfish();
    });

    const setupStockfish = () => {
      let output = '';
      let bestMove = null;
      let score = null;
      let nodes = null;
      let depth = null;
      const startTime = Date.now();
      let analysisComplete = false;
      let analysisTimeout;

      stockfishProcess.stdout.on('data', (data) => {
        output += data.toString();
        const lines = output.split('\n');

        lines.forEach(line => {
          line = line.trim();
          if (!line) return;

          if (line.startsWith('bestmove')) {
            bestMove = line.split(' ')[1];
            if (!analysisComplete) {
              analysisComplete = true;
              clearTimeout(analysisTimeout);
              const time = Date.now() - startTime;
              stockfishProcess.kill();
              resolve({
                bestMove,
                score,
                nodes,
                depth,
                time
              });
            }
          } else if (line.startsWith('info depth')) {
            const parts = line.split(' ');
            const depthIndex = parts.indexOf('depth');
            const scoreIndex = parts.indexOf('score');
            const nodesIndex = parts.indexOf('nodes');

            // Garder la dernière information de profondeur
            if (depthIndex !== -1) {
              depth = parseInt(parts[depthIndex + 1]);
            }

            if (scoreIndex !== -1) {
              const scoreType = parts[scoreIndex + 1];
              const scoreValue = parseInt(parts[scoreIndex + 2]);

              if (scoreType === 'cp') {
                score = { type: 'cp', value: scoreValue };
              } else if (scoreType === 'mate') {
                score = { type: 'mate', value: scoreValue };
              }
            }

            if (nodesIndex !== -1) {
              nodes = parseInt(parts[nodesIndex + 1]);
            }
          }
        });
      });

      stockfishProcess.stderr.on('data', (data) => {
        console.error('Stockfish stderr:', data.toString());
      });

      stockfishProcess.on('close', (code) => {
        if (!analysisComplete) {
          reject(new Error(`Stockfish s'est fermé avec le code ${code}`));
        }
      });

      // Envoyer les commandes UCI
      stockfishProcess.stdin.write('uci\n');
      stockfishProcess.stdin.write('setoption name Threads value 3\n'); // Utiliser 3 threads
      stockfishProcess.stdin.write('setoption name Hash value 128\n');   // 128 MB de hash
      stockfishProcess.stdin.write('ucinewgame\n');
      stockfishProcess.stdin.write(`position fen ${fen}\n`);
      stockfishProcess.stdin.write('go infinite\n');

      // Arrêter l'analyse après le temps demandé
      analysisTimeout = setTimeout(() => {
        if (!analysisComplete) {
          stockfishProcess.stdin.write('stop\n');
          // Laisser un peu de temps à Stockfish pour retourner bestmove
          setTimeout(() => {
            if (!analysisComplete) {
              analysisComplete = true;
              stockfishProcess.kill();
              const time = Date.now() - startTime;
              resolve({
                bestMove,
                score,
                nodes,
                depth,
                time
              });
            }
          }, 500);
        }
      }, timeSeconds * 1000);

      // Timeout de sécurité (temps demandé + 5 secondes)
      setTimeout(() => {
        if (!analysisComplete) {
          analysisComplete = true;
          clearTimeout(analysisTimeout);
          stockfishProcess.kill();
          reject(new Error('Timeout de l\'analyse'));
        }
      }, (timeSeconds + 5) * 1000);
    }
  });
}

const formatEvaluation = (score) => {
  if (!score) return 'N/A';

  if (score.type === 'mate') {
    if (score.value > 0) {
      return `Mat en ${score.value} coup${score.value > 1 ? 's' : ''} (Blancs)`;
    } else {
      return `Mat en ${Math.abs(score.value)} coup${Math.abs(score.value) > 1 ? 's' : ''} (Noirs)`;
    }
  } else if (score.type === 'cp') {
    const eval_score = score.value / 100;
    if (eval_score > 0.3) {
      return `+${eval_score.toFixed(2)} (Avantage Blancs)`;
    } else if (eval_score < -0.3) {
      return `${eval_score.toFixed(2)} (Avantage Noirs)`;
    } else {
      return `${eval_score.toFixed(2)} (Égalité)`;
    }
  }

  return 'N/A';
}

const getEvaluationDescription = (score, turn) => {
  if (!score) return '🤖 Analyse en cours...';

  if (score.type === 'mate') {
    if (score.value > 0) {
      return '👑 **Mat forcé pour les Blancs !**';
    } else {
      return '👑 **Mat forcé pour les Noirs !**';
    }
  } else if (score.type === 'cp') {
    const eval_score = score.value / 100;

    if (Math.abs(eval_score) < 0.5) {
      return '⚖️ **Position équilibrée** - Égalité approximative';
    } else if (Math.abs(eval_score) < 1.5) {
      return eval_score > 0 ?
        '📈 **Léger avantage aux Blancs**' :
        '📉 **Léger avantage aux Noirs**';
    } else if (Math.abs(eval_score) < 3.0) {
      return eval_score > 0 ?
        '🔥 **Net avantage aux Blancs**' :
        '🔥 **Net avantage aux Noirs**';
    } else {
      return eval_score > 0 ?
        '💥 **Avantage décisif pour les Blancs**' :
        '💥 **Avantage décisif pour les Noirs**';
    }
  }

  return '🤖 Analyse terminée';
}
