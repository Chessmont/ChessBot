const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require("discord.js");
const { getUserChessAccounts, addChessAccount, chessAccountExists } = require("../../api/db/chess");
const { userExists, addUser } = require("../../api/db/users");
const axios = require("axios");
const { nanoid } = require("nanoid");
const fs = require("fs");
const path = require("path");

const commandName = "linkaccount";
const commandInfo = "Lier un compte Chess.com ou Lichess";
const commandDescription = "Permet de lier votre compte Chess.com ou Lichess à votre profil Discord";

// Stockage temporaire des codes de vérification
const pendingVerifications = new Map();

const platformInfo = {
  'chess.com': {
    name: 'Chess.com',
    urlPattern: /https?:\/\/(www\.)?chess\.com\/member\/([a-zA-Z0-9_]+)/,
    example: 'https://www.chess.com/member/votreusername'
  },
  'lichess': {
    name: 'Lichess.org',
    urlPattern: /https?:\/\/(www\.)?lichess\.org\/@\/([a-zA-Z0-9_]+)/,
    example: 'https://lichess.org/@/votreusername'
  }
};

module.exports = {
  info: { commandName, commandInfo, commandDescription },
  data: new SlashCommandBuilder()
    .setName(commandName)
    .setDescription(commandInfo)
    .addStringOption(option =>
      option
        .setName('url')
        .setDescription('URL de votre profil Chess.com ou Lichess')
        .setRequired(true)
    ),

  async execute(interaction) {
    try {
      // Gestion des boutons
      if (interaction.isButton()) {
        if (interaction.customId.startsWith('verify_')) {
          await handleVerification(interaction);
          return;
        } else if (interaction.customId === 'cancel_link') {
          await handleCancel(interaction);
          return;
        }
      }

      // Gestion des slash commands
      const userId = interaction.user.id;
      const userName = interaction.user.displayName || interaction.user.username;
      const url = interaction.options.getString('url').trim();

      // Vérifier si l'utilisateur existe, sinon le créer
      if (!(await userExists(userId))) {
        await addUser(userId, userName);
      }

      // Détecter la plateforme à partir de l'URL
      let platform = null;
      let match = null;

      for (const [key, info] of Object.entries(platformInfo)) {
        const urlMatch = url.match(info.urlPattern);
        if (urlMatch) {
          platform = key;
          match = urlMatch;
          break;
        }
      }

      // Si aucune plateforme détectée
      if (!platform || !match) {
        const errorEmbed = new EmbedBuilder()
          .setColor('#FF0000')
          .setTitle('❌ URL non reconnue')
          .setDescription('L\'URL fournie n\'est pas valide pour Chess.com ou Lichess.')
          .addFields(
            { name: 'URL fournie', value: `\`${url}\``, inline: false },
            { name: 'Formats acceptés', value: '• `https://www.chess.com/member/username`\n• `https://lichess.org/@/username`', inline: false }
          )
          .setTimestamp();

        return await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
      }

      // Vérifier si l'utilisateur a déjà lié cette plateforme
      if (await chessAccountExists(userId, platform)) {
        const errorEmbed = new EmbedBuilder()
          .setColor('#FF6B00')
          .setTitle('⚠️ Compte déjà lié')
          .setDescription(`Vous avez déjà lié un compte ${platformInfo[platform].name} à votre profil.`)
          .setTimestamp();

        return await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
      }

      // Continuer avec la validation et vérification
      await handleUrlValidation(interaction, platform, url);

    } catch (error) {
      console.error("Erreur dans la commande linkaccount:", error);
      const errorEmbed = new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle('❌ Erreur')
        .setDescription('Une erreur s\'est produite lors de l\'initialisation de la commande.')
        .setTimestamp();

      if (interaction.replied || interaction.deferred) {
        await interaction.editReply({ embeds: [errorEmbed] });
      } else {
        await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
      }
    }
  }
};

const handleUrlValidation = async(interaction, platform, url) => {
  const userId = interaction.user.id;

  try {
    // Valider l'URL (elle a déjà été validée dans execute, mais on peut garder cette vérification)
    const match = url.match(platformInfo[platform].urlPattern);
    if (!match) {
      const errorEmbed = new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle('❌ URL invalide')
        .setDescription(`L'URL fournie n'est pas valide pour ${platformInfo[platform].name}.`)
        .addFields(
          { name: 'URL fournie', value: `\`${url}\``, inline: false },
          { name: 'Format attendu', value: `\`${platformInfo[platform].example}\``, inline: false }
        )
        .setTimestamp();

      return await interaction.reply({
        embeds: [errorEmbed],
        ephemeral: true
      });
    }

    const username = match[2];
    const verificationCode = nanoid(12);

    // Stocker la vérification en attente
    pendingVerifications.set(userId, {
      platform,
      username,
      url,
      code: verificationCode,
      timestamp: Date.now()
    });

    // Nettoyer les anciennes vérifications (plus de 30 minutes)
    cleanupOldVerifications();

    const instructions = platform === 'chess.com'
      ? `1. Allez sur votre profil Chess.com\n2. Modifiez votre **statut** pour inclure le code\n3. Sauvegardez les modifications\n4. Cliquez sur "Vérifier" ci-dessous`
      : `1. Allez sur votre profil Lichess\n2. Modifiez votre **bio** pour inclure le code\n3. Sauvegardez les modifications\n4. Cliquez sur "Vérifier" ci-dessous`;

    const embed = new EmbedBuilder()
      .setColor('#FFA500')
      .setTitle('🔐 Vérification de propriété')
      .setDescription(`Pour vérifier que vous possédez ce compte ${platformInfo[platform].name}, suivez ces étapes :`)
      .addFields(
        { name: '📋 Code de vérification', value: `\`\`\`${verificationCode}\`\`\``, inline: false },
        { name: '📝 Instructions', value: instructions, inline: false },
        { name: '🔗 Profil à modifier', value: `[${username}](${url})`, inline: false }
      )
      .setImage(`attachment://${platform}-explanation.png`)
      .setFooter({ text: 'Vous avez 30 minutes pour compléter la vérification' })
      .setTimestamp();

    const verifyButton = new ButtonBuilder()
      .setCustomId(`verify_${platform}`)
      .setLabel('Vérifier')
      .setStyle(ButtonStyle.Success)
      .setEmoji('✅');

    const cancelButton = new ButtonBuilder()
      .setCustomId('cancel_link')
      .setLabel('Annuler')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('❌');

    const row = new ActionRowBuilder().addComponents(verifyButton, cancelButton);

    // Créer l'attachment pour l'image d'explication
    const imagePath = path.join(__dirname, '../../assets', `${platform}-explanation.png`);
    let attachment = null;

    try {
      if (fs.existsSync(imagePath)) {
        attachment = new AttachmentBuilder(imagePath, { name: `${platform}-explanation.png` });
      }
    } catch (error) {
      console.error('Erreur lors du chargement de l\'image:', error);
    }

    const replyOptions = {
      embeds: [embed],
      components: [row],
      ephemeral: true
    };

    if (attachment) {
      replyOptions.files = [attachment];
    }

    await interaction.reply(replyOptions);

  } catch (error) {
    console.error("Erreur lors de la validation de l'URL:", error);
    const errorEmbed = new EmbedBuilder()
      .setColor('#FF0000')
      .setTitle('❌ Erreur')
      .setDescription('Une erreur s\'est produite lors de la validation.')
      .setTimestamp();

    await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
  }
}

const handleVerification = async (interaction) => {
  const userId = interaction.user.id;
  const platform = interaction.customId.split('_')[1];

  try {
    await interaction.deferUpdate();

    const verification = pendingVerifications.get(userId);
    if (!verification || verification.platform !== platform) {
      const errorEmbed = new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle('❌ Vérification expirée')
        .setDescription('La session de vérification a expiré. Veuillez recommencer.')
        .setTimestamp();

      return await interaction.editReply({
        embeds: [errorEmbed],
        components: []
      });
    }

    // Vérifier le code selon la plateforme
    let isValid = false;
    if (platform === 'chess.com') {
      isValid = await verifyChessComAccount(verification.url, verification.code);
    } else if (platform === 'lichess') {
      isValid = await verifyLichessAccount(verification.username, verification.code);
    }

    if (!isValid.success) {
      const errorEmbed = new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle('❌ Vérification échouée')
        .setDescription(isValid.error || 'Le code de vérification n\'a pas été trouvé.')
        .addFields(
          { name: '🔍 Vérifiez que', value: `• Le code \`${verification.code}\` est bien présent\n• Vous avez sauvegardé les modifications\n• Le profil est public`, inline: false }
        )
        .setTimestamp();

      return await interaction.editReply({
        embeds: [errorEmbed],
        components: []
      });
    }

    // Ajouter le compte à la base de données
    await addChessAccount(userId, platform, verification.username, verification.url);

    // Nettoyer la vérification
    pendingVerifications.delete(userId);

    const successEmbed = new EmbedBuilder()
      .setColor('#00FF00')
      .setTitle('✅ Compte lié avec succès !')
      .setDescription(`Votre compte ${platformInfo[platform].name} a été lié à votre profil Discord.`)
      .addFields(
        { name: '🎮 Compte lié', value: `[${verification.username}](${verification.url})`, inline: false },
        { name: '📊 Utilisez maintenant', value: '`/profile` pour voir vos statistiques !', inline: false }
      )
      .setTimestamp();

    await interaction.editReply({
      embeds: [successEmbed],
      components: []
    });

  } catch (error) {
    console.error("Erreur lors de la vérification:", error);
    const errorEmbed = new EmbedBuilder()
      .setColor('#FF0000')
      .setTitle('❌ Erreur')
      .setDescription('Une erreur s\'est produite lors de la vérification.')
      .setTimestamp();

    await interaction.editReply({ embeds: [errorEmbed], components: [] });
  }
}

const handleCancel = async (interaction) => {
  const userId = interaction.user.id;
  pendingVerifications.delete(userId);

  const cancelEmbed = new EmbedBuilder()
    .setColor('#6C7B7F')
    .setTitle('❌ Liaison annulée')
    .setDescription('La liaison de compte a été annulée.')
    .setTimestamp();

  await interaction.update({
    embeds: [cancelEmbed],
    components: []
  });
}

const verifyChessComAccount = async (url, code) => {
  try {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      validateStatus: () => true,
    });

    if (response.status === 404) {
      return { success: false, error: 'Profil Chess.com introuvable.' };
    }

    const html = Buffer.from(response.data).toString('utf-8');
    const statusMatch = html.match(/status:\s*"([^"]+)"/)?.[1]?.trim();

    if (!statusMatch) {
      return { success: false, error: 'Impossible de lire le statut. Assurez-vous que votre profil est public.' };
    }

    if (!statusMatch.includes(code)) {
      return { success: false, error: 'Code de vérification non trouvé dans le statut.' };
    }

    return { success: true };
  } catch (error) {
    console.error('Erreur vérification Chess.com:', error);
    return { success: false, error: 'Erreur lors de la vérification du compte Chess.com.' };
  }
}

const verifyLichessAccount = async (username, code) => {
  try {
    const response = await axios.get(`https://lichess.org/api/user/${username}`, {
      responseType: 'json',
      validateStatus: () => true
    });

    if (response.status === 404) {
      return { success: false, error: 'Profil Lichess introuvable.' };
    }

    const bio = response.data?.profile?.bio?.trim();
    if (!bio) {
      return { success: false, error: 'Bio Lichess vide ou introuvable. Assurez-vous d\'avoir une bio publique.' };
    }

    if (!bio.includes(code)) {
      return { success: false, error: 'Code de vérification non trouvé dans la bio.' };
    }

    return { success: true };
  } catch (error) {
    console.error('Erreur vérification Lichess:', error);
    return { success: false, error: 'Erreur lors de la vérification du compte Lichess.' };
  }
}

const cleanupOldVerifications = () => {
  const now = Date.now();
  const maxAge = 30 * 60 * 1000; // 30 minutes

  for (const [userId, verification] of pendingVerifications.entries()) {
    if (now - verification.timestamp > maxAge) {
      pendingVerifications.delete(userId);
    }
  }
}
