const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder, MessageFlags, ComponentType } = require("discord.js");
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
      // Gestion des slash commands uniquement
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

        return await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
      }

      // Vérifier si l'utilisateur a déjà lié cette plateforme
      if (await chessAccountExists(userId, platform)) {
        const errorEmbed = new EmbedBuilder()
          .setColor('#FF6B00')
          .setTitle('⚠️ Compte déjà lié')
          .setDescription(`Vous avez déjà lié un compte ${platformInfo[platform].name} à votre profil.`)
          .setTimestamp();

        return await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
      }

      // Continuer avec la validation et vérification
      await handleUrlValidation(interaction, platform, url, userId);

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
        await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
      }
    }
  }
};

const handleUrlValidation = async(interaction, platform, url, userId) => {
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
        flags: MessageFlags.Ephemeral
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

    // Créer l'attachment pour l'image d'explication
    const imageName = platform === 'chess.com' ? 'chesscom-explanation.png' : 'lichess-explanation.png';
    const imagePath = path.join(__dirname, '../../assets', imageName);
    let attachment = null;
    
    try {
      if (fs.existsSync(imagePath)) {
        attachment = new AttachmentBuilder(imagePath, { name: imageName });
      }
    } catch (error) {
      console.error('Erreur lors du chargement de l\'image:', error);
    }

    const embed = new EmbedBuilder()
      .setColor('#FFA500')
      .setTitle('🔐 Vérification de propriété')
      .setDescription(`Pour vérifier que vous possédez ce compte ${platformInfo[platform].name}, suivez ces étapes :`)
      .addFields(
        { name: '📋 Code de vérification', value: `\`\`\`${verificationCode}\`\`\``, inline: false },
        { name: '📝 Instructions', value: instructions, inline: false },
        { name: '🔗 Profil à modifier', value: `[${username}](${url})`, inline: false }
      )
      .setFooter({ text: 'Vous avez 30 minutes pour compléter la vérification' })
      .setTimestamp();

    // Ajouter l'image seulement si elle existe
    if (attachment) {
      embed.setImage(`attachment://${imageName}`);
    }

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

    const options = {
      embeds: [embed],
      components: [row],
      flags: MessageFlags.Ephemeral
    };

    if (attachment) {
      options.files = [attachment];
    }

    const message = await interaction.reply(options);

    // Créer le collector pour les boutons
    const collector = message.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 1800000 // 30 minutes
    });

    collector.on('collect', async (buttonInteraction) => {
      if (buttonInteraction.user.id !== userId) {
        await buttonInteraction.reply({
          content: 'Vous ne pouvez pas interagir avec cette vérification.',
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      if (buttonInteraction.customId.startsWith('verify_')) {
        await handleVerification(buttonInteraction, userId);
      } else if (buttonInteraction.customId === 'cancel_link') {
        await handleCancel(buttonInteraction, userId);
      }
    });

    collector.on('end', () => {
      // Nettoyer les données temporaires expirées
      if (pendingVerifications.has(userId)) {
        pendingVerifications.delete(userId);
      }
    });

  } catch (error) {
    console.error('Erreur dans handleUrlValidation:', error);
    const errorEmbed = new EmbedBuilder()
      .setColor('#FF0000')
      .setTitle('❌ Erreur')
      .setDescription('Une erreur s\'est produite lors de la préparation de la vérification.')
      .setTimestamp();

    if (interaction.replied || interaction.deferred) {
      await interaction.editReply({ embeds: [errorEmbed] });
    } else {
      await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
    }
  }
};


const handleVerification = async (interaction, userId) => {
  try {
    await interaction.deferUpdate();

    const pendingData = pendingVerifications.get(userId);
    if (!pendingData) {
      const errorEmbed = new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle('❌ Vérification expirée')
        .setDescription('La vérification a expiré. Veuillez recommencer la liaison.')
        .setTimestamp();

      return await interaction.editReply({
        embeds: [errorEmbed],
        components: []
      });
    }

    const { platform, username, url, code } = pendingData;

    // Fonction de vérification selon la plateforme
    let verificationResult;
    if (platform === 'chess.com') {
      verificationResult = await verifyChessComAccount(url, code);
    } else if (platform === 'lichess') {
      verificationResult = await verifyLichessAccount(username, code);
    }

    if (!verificationResult.success) {
      const errorEmbed = new EmbedBuilder()
        .setColor('#FF6B00')
        .setTitle('❌ Code non trouvé')
        .setDescription(verificationResult.error || `Le code de vérification n'a pas été trouvé dans votre profil ${platformInfo[platform].name}.`)
        .addFields(
          { name: '🔍 Vérifiez que :', value: '• Le code est correctement copié\n• Vous avez sauvegardé les modifications\n• Vous attendez quelques secondes entre la modification et la vérification', inline: false },
          { name: '🔗 Votre profil', value: `[${username}](${url})`, inline: false }
        )
        .setTimestamp();

      return await interaction.editReply({
        embeds: [errorEmbed],
        components: []
      });
    }

    // Succès ! Sauvegarder dans la base de données
    try {
      await addChessAccount(userId, platform, username, url);
      
      // Nettoyer les données temporaires
      pendingVerifications.delete(userId);

      const successEmbed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle('✅ Compte lié avec succès !')
        .setDescription(`Votre compte ${platformInfo[platform].name} a été lié à votre profil Discord.`)
        .addFields(
          { name: '�️ Plateforme', value: platformInfo[platform].name, inline: true },
          { name: '� Nom d\'utilisateur', value: username, inline: true },
          { name: '🔗 Profil', value: `[Voir le profil](${url})`, inline: true }
        )
        .setTimestamp();

      await interaction.editReply({
        embeds: [successEmbed],
        components: []
      });

    } catch (dbError) {
      console.error('Erreur lors de l\'ajout en base de données:', dbError);
      const errorEmbed = new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle('❌ Erreur de sauvegarde')
        .setDescription('Le compte a été vérifié mais n\'a pas pu être sauvegardé. Veuillez réessayer.')
        .setTimestamp();

      await interaction.editReply({
        embeds: [errorEmbed],
        components: []
      });
    }

  } catch (error) {
    console.error('Erreur dans handleVerification:', error);
    const errorEmbed = new EmbedBuilder()
      .setColor('#FF0000')
      .setTitle('❌ Erreur de vérification')
      .setDescription('Une erreur s\'est produite lors de la vérification.')
      .setTimestamp();

    if (interaction.replied || interaction.deferred) {
      await interaction.editReply({ embeds: [errorEmbed], components: [] });
    } else {
      await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
    }
  }
};

const handleCancel = async (interaction, userId) => {
  try {
    await interaction.deferUpdate();

    // Nettoyer les données temporaires
    pendingVerifications.delete(userId);

    const cancelEmbed = new EmbedBuilder()
      .setColor('#808080')
      .setTitle('❌ Liaison annulée')
      .setDescription('La liaison de compte a été annulée.')
      .setTimestamp();

    await interaction.editReply({
      embeds: [cancelEmbed],
      components: []
    });

  } catch (error) {
    console.error('Erreur dans handleCancel:', error);
  }
};

const verifyChessComAccount = async (url, code) => {
  console.log('=== VERIFICATION CHESS.COM ===');
  console.log('URL:', url);
  console.log('Code recherché:', code);
  
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

    console.log('Status de la réponse:', response.status);

    if (response.status === 404) {
      return { success: false, error: 'Profil Chess.com introuvable.' };
    }

    const html = Buffer.from(response.data).toString('utf-8');
    console.log('HTML récupéré, taille:', html.length);
    
    const statusMatch = html.match(/status:\s*"([^"]+)"/)?.[1]?.trim();
    console.log('Statut trouvé:', statusMatch);

    if (!statusMatch) {
      return { success: false, error: 'Impossible de lire le statut. Assurez-vous que votre profil est public.' };
    }

    const codeFound = statusMatch.includes(code);
    console.log('Code trouvé dans le statut?', codeFound);

    if (!codeFound) {
      return { success: false, error: 'Code de vérification non trouvé dans le statut.' };
    }

    return { success: true };
  } catch (error) {
    console.error('Erreur vérification Chess.com:', error);
    return { success: false, error: 'Erreur lors de la vérification du compte Chess.com.' };
  }
}

const verifyLichessAccount = async (username, code) => {
  console.log('=== VERIFICATION LICHESS ===');
  console.log('Username:', username);
  console.log('Code recherché:', code);
  
  try {
    const response = await axios.get(`https://lichess.org/api/user/${username}`, {
      responseType: 'json',
      validateStatus: () => true
    });

    console.log('Status de la réponse:', response.status);

    if (response.status === 404) {
      return { success: false, error: 'Profil Lichess introuvable.' };
    }

    const bio = response.data?.profile?.bio?.trim();
    console.log('Bio trouvée:', bio);

    if (!bio) {
      return { success: false, error: 'Bio Lichess vide ou introuvable. Assurez-vous d\'avoir une bio publique.' };
    }

    const codeFound = bio.includes(code);
    console.log('Code trouvé dans la bio?', codeFound);

    if (!codeFound) {
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
