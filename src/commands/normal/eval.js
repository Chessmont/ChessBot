const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { Chess } = require("chess.js");
const { spawn } = require("child_process");
const path = require("path");

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
        .setName('profondeur')
        .setDescription('Profondeur d\'analyse (1-20, défaut: 15)')
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(20)
    ),

  async execute(interaction) {
    try {
      await interaction.deferReply();

      const fen = interaction.options.getString('fen');
      const depth = interaction.options.getInteger('profondeur') || 15;

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
      const evaluation = await analyzePosition(fen, depth);

      const embed = new EmbedBuilder()
        .setColor('#0099FF')
        .setTitle('🔍 Analyse Stockfish')
        .addFields(
          { name: '📍 Position', value: `\`${fen}\``, inline: false },
          { name: '⚖️ Évaluation', value: formatEvaluation(evaluation.score), inline: true },
          { name: '🎯 Profondeur', value: `${depth}`, inline: true },
          { name: '👤 Trait aux', value: chess.turn() === 'w' ? 'Blancs' : 'Noirs', inline: true },
          { name: '🎯 Meilleur coup', value: evaluation.bestMove || 'Aucun', inline: true },
          { name: '📊 Nœuds analysés', value: evaluation.nodes?.toLocaleString() || 'N/A', inline: true },
          { name: '⏱️ Temps', value: `${evaluation.time || 'N/A'}ms`, inline: true }
        )
        .setDescription(getEvaluationDescription(evaluation.score, chess.turn()))
        .setTimestamp()
        .setFooter({ text: 'Analyse fournie par Stockfish' });

      await interaction.editReply({ embeds: [embed] });

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

async function analyzePosition(fen, depth) {
  return new Promise((resolve, reject) => {
    // Essayer différents noms/chemins pour Stockfish
    const stockfishCommands = [
      'stockfish',
      'stockfish.exe',
      'C:\\Program Files\\Stockfish\\stockfish.exe',
      'C:\\Program Files (x86)\\Stockfish\\stockfish.exe',
      'C:\\Users\\Clayton\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Stockfish.Stockfish_Microsoft.Winget.Source_8wekyb3d8bbwe\\stockfish.exe',
      'C:\\Users\\Clayton\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Stockfish.Stockfish_Microsoft.Winget.Source_8wekyb3d8bbwe\\stockfish\\stockfish.exe',
      path.join(process.env.USERPROFILE || 'C:\\Users\\Clayton', 'AppData', 'Local', 'Microsoft', 'WinGet', 'Packages', 'Stockfish.Stockfish_Microsoft.Winget.Source_8wekyb3d8bbwe', 'stockfish.exe'),
      path.join(__dirname, '..', '..', '..', 'stockfish', 'stockfish.exe'),
      path.join(__dirname, '..', '..', '..', 'bin', 'stockfish.exe')
    ];

    let stockfishProcess = null;
    let commandIndex = 0;

    function tryNextCommand() {
      if (commandIndex >= stockfishCommands.length) {
        return reject(new Error('Stockfish introuvable. Vérifiez que Stockfish est installé.'));
      }

      const command = stockfishCommands[commandIndex++];
      console.log(`Tentative avec: ${command}`);

      stockfishProcess = spawn(command, [], {
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: true
      });

      stockfishProcess.on('error', (error) => {
        console.log(`Erreur avec ${command}:`, error.message);
        tryNextCommand();
      });

      stockfishProcess.on('spawn', () => {
        console.log(`Stockfish démarré avec: ${command}`);
        setupStockfish();
      });
    }

    function setupStockfish() {
      let output = '';
      let bestMove = null;
      let score = null;
      let nodes = null;
      const startTime = Date.now();
      let analysisComplete = false;

      stockfishProcess.stdout.on('data', (data) => {
        output += data.toString();
        const lines = output.split('\n');
        
        lines.forEach(line => {
          line = line.trim();
          if (!line) return;
          
          console.log('Stockfish:', line);
          
          if (line.startsWith('bestmove')) {
            bestMove = line.split(' ')[1];
            if (!analysisComplete) {
              analysisComplete = true;
              const time = Date.now() - startTime;
              stockfishProcess.kill();
              resolve({
                bestMove,
                score,
                nodes,
                time
              });
            }
          } else if (line.startsWith('info depth')) {
            const parts = line.split(' ');
            const depthIndex = parts.indexOf('depth');
            const scoreIndex = parts.indexOf('score');
            const nodesIndex = parts.indexOf('nodes');
            
            if (depthIndex !== -1 && parts[depthIndex + 1] == depth.toString()) {
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
      stockfishProcess.stdin.write('ucinewgame\n');
      stockfishProcess.stdin.write(`position fen ${fen}\n`);
      stockfishProcess.stdin.write(`go depth ${depth}\n`);

      // Timeout de sécurité
      setTimeout(() => {
        if (!analysisComplete) {
          analysisComplete = true;
          stockfishProcess.kill();
          reject(new Error('Timeout de l\'analyse'));
        }
      }, 30000);
    }

    tryNextCommand();
  });
}

function formatEvaluation(score) {
  if (!score) return 'N/A';
  
  if (score.type === 'mate') {
    if (score.value > 0) {
      return `Mat en ${score.value} coup${score.value > 1 ? 's' : ''} (Blancs)`;
    } else {
      return `Mat en ${Math.abs(score.value)} coup${Math.abs(score.value) > 1 ? 's' : ''} (Noirs)`;
    }
  } else if (score.type === 'cp') {
    const eval_score = score.value / 100;
    if (eval_score > 0) {
      return `+${eval_score.toFixed(2)} (Avantage Blancs)`;
    } else if (eval_score < 0) {
      return `${eval_score.toFixed(2)} (Avantage Noirs)`;
    } else {
      return `0.00 (Égalité)`;
    }
  }
  
  return 'N/A';
}

function getEvaluationDescription(score, turn) {
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
