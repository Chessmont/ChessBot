const { SlashCommandBuilder, AttachmentBuilder } = require("discord.js");
const axios = require("axios");

const commandName = "fen";
const commandInfo = "Afficher un échiquier à partir d'un FEN";
const commandDescription = "Génère une image d'échiquier à partir d'une notation FEN";

module.exports = {
  info: { commandName, commandInfo, commandDescription },
  data: new SlashCommandBuilder()
    .setName(commandName)
    .setDescription(commandInfo)
    .addStringOption(option =>
      option
        .setName('fen')
        .setDescription('La notation FEN de la position d\'échecs')
        .setRequired(true)
    ),

  async execute(interaction) {
    try {
      await interaction.deferReply();

      const fenString = interaction.options.getString('fen');

      // Valider basiquement le FEN (doit contenir au moins les pièces et le trait)
      const fenParts = fenString.split(' ');
      if (fenParts.length < 2) {
        return await interaction.editReply('❌ **Erreur** - Format FEN invalide. Le FEN doit contenir au moins la position des pièces et le trait.');
      }

      const activeColor = fenParts[1];

      // Générer l'image de l'échiquier
      let imageUrl = `https://fen2image.chessvision.ai/${encodeURIComponent(fenString)}`;
      if (activeColor === 'b') {
        imageUrl += '?turn=black&pov=black';
      } else {
        imageUrl += '?turn=white&pov=white';
      }

      const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
      const imageBuffer = Buffer.from(imageResponse.data, 'binary');
      const attachment = new AttachmentBuilder(imageBuffer, { name: 'chess_position.png' });

      await interaction.editReply({
        content: `🏁 **Position FEN :** \`${fenString}\`\n👤 **Trait aux :** ${activeColor === 'w' ? 'Blancs' : 'Noirs'}`,
        files: [attachment]
      });

    } catch (error) {
      console.error("Erreur dans la commande fen:", error);
      
      await interaction.editReply('❌ **Erreur** - Impossible de générer l\'image pour ce FEN. Vérifiez que la notation est correcte.');
    }
  }
};
