const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { getUserChessAccounts } = require("../../api/db/chess");
const { userExists } = require("../../api/db/users");
const axios = require("axios");

const commandName = "profile";
const commandInfo = "Afficher le profil d'échecs";
const commandDescription = "Affiche les comptes d'échecs liés (le vôtre ou celui d'un autre utilisateur)";

module.exports = {
    info: { commandName, commandInfo, commandDescription },
    data: new SlashCommandBuilder()
        .setName(commandName)
        .setDescription(commandInfo)
        .addUserOption(option =>
            option
                .setName('utilisateur')
                .setDescription('L\'utilisateur dont vous voulez voir le profil (optionnel)')
                .setRequired(false)
        ),

    async execute(interaction) {
        try {
            await interaction.deferReply();

            const targetUser = interaction.options.getUser('utilisateur') || interaction.user;
            const targetUserId = targetUser.id;
            const targetUserName = targetUser.displayName || targetUser.username;

            // Vérifier si l'utilisateur cible existe dans la base
            if (!(await userExists(targetUserId))) {
                const errorEmbed = new EmbedBuilder()
                    .setColor('#FF6B00')
                    .setTitle('👤 Utilisateur non trouvé')
                    .setDescription(`${targetUserName} n'a pas encore utilisé le bot d'échecs.`)
                    .addFields(
                        { name: '💡 Suggestion', value: 'Il peut utiliser `/linkaccount` pour lier ses comptes d\'échecs.', inline: false }
                    )
                    .setTimestamp();

                return await interaction.editReply({ embeds: [errorEmbed] });
            }

            // Récupérer les comptes d'échecs de l'utilisateur
            const chessAccounts = await getUserChessAccounts(targetUserId);

            if (chessAccounts.length === 0) {
                const noAccountsEmbed = new EmbedBuilder()
                    .setColor('#FF6B00')
                    .setTitle('🎮 Aucun compte lié')
                    .setDescription(`${targetUserName} n'a pas encore lié de comptes d'échecs.`)
                    .addFields(
                        { name: '🔗 Pour lier un compte', value: 'Utilisez la commande `/linkaccount`', inline: false }
                    )
                    .setThumbnail(targetUser.displayAvatarURL())
                    .setTimestamp();

                return await interaction.editReply({ embeds: [noAccountsEmbed] });
            }

            // Récupérer les statistiques pour chaque compte
            const accountsData = await Promise.all(
                chessAccounts.map(account => getAccountStats(account))
            );

            // Créer l'embed du profil
            const profileEmbed = new EmbedBuilder()
                .setColor('#0099FF')
                .setTitle(`🏆 Profil d'échecs de ${targetUserName}`)
                .setThumbnail(targetUser.displayAvatarURL())
                .setTimestamp();

            // Ajouter les informations pour chaque compte
            for (const accountData of accountsData) {
                const account = accountData.account;
                const stats = accountData.stats;

                const platformEmoji = account.provider === 'chess.com' ? '♟️' : '🏰';
                const platformName = account.provider === 'chess.com' ? 'Chess.com' : 'Lichess.org';

                if (stats.error) {
                    profileEmbed.addFields({
                        name: `${platformEmoji} ${platformName}`,
                        value: `**[${account.accountId}](${account.accountUrl})**\n❌ ${stats.error}`,
                        inline: true
                    });
                } else {
                    let fieldValue = `**[${account.accountId}](${account.accountUrl})**\n`;

                    if (stats.ratings) {
                        const ratings = Object.entries(stats.ratings)
                            .filter(([_, rating]) => rating && rating > 0)
                            .map(([type, rating]) => `${getRatingEmoji(rating)} ${formatGameType(type)}: **${rating}**`)
                            .slice(0, 3); // Limiter à 3 pour éviter les embeds trop longs

                        if (ratings.length > 0) {
                            fieldValue += ratings.join('\n');
                        } else {
                            fieldValue += '📊 Aucune partie classée';
                        }
                    } else {
                        fieldValue += '📊 Statistiques non disponibles';
                    }

                    profileEmbed.addFields({
                        name: `${platformEmoji} ${platformName}`,
                        value: fieldValue,
                        inline: true
                    });
                }
            }

            // Ajouter un champ vide pour l'alignement si nombre impair de comptes
            if (accountsData.length % 2 === 1) {
                profileEmbed.addFields({ name: '\u200B', value: '\u200B', inline: true });
            }

            profileEmbed.setFooter({
                text: `Profil demandé par ${interaction.user.displayName || interaction.user.username}`
            });

            await interaction.editReply({ embeds: [profileEmbed] });

        } catch (error) {
            console.error("Erreur dans la commande profile:", error);

            const errorEmbed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Erreur')
                .setDescription('Une erreur s\'est produite lors de la récupération du profil.')
                .setTimestamp();

            await interaction.editReply({ embeds: [errorEmbed] });
        }
    }
};

async function getAccountStats(account) {
    try {
        if (account.provider === 'chess.com') {
            return await getChessComStats(account);
        } else if (account.provider === 'lichess') {
            return await getLichessStats(account);
        }
    } catch (error) {
        console.error(`Erreur récupération stats ${account.provider}:`, error);
        return {
            account,
            stats: { error: 'Erreur lors de la récupération des statistiques' }
        };
    }
}

async function getChessComStats(account) {
    try {
        const response = await axios.get(`https://api.chess.com/pub/player/${account.accountId}/stats`, {
            timeout: 10000,
            validateStatus: () => true
        });

        if (response.status !== 200) {
            return {
                account,
                stats: { error: 'Profil non accessible ou privé' }
            };
        }

        const stats = response.data;
        const ratings = {};

        // Extraire les ratings des différents modes de jeu
        if (stats.chess_rapid?.last?.rating) {
            ratings.rapid = stats.chess_rapid.last.rating;
        }
        if (stats.chess_blitz?.last?.rating) {
            ratings.blitz = stats.chess_blitz.last.rating;
        }
        if (stats.chess_bullet?.last?.rating) {
            ratings.bullet = stats.chess_bullet.last.rating;
        }
        if (stats.chess_daily?.last?.rating) {
            ratings.daily = stats.chess_daily.last.rating;
        }

        return {
            account,
            stats: { ratings }
        };

    } catch (error) {
        console.error('Erreur API Chess.com:', error);
        return {
            account,
            stats: { error: 'Impossible de récupérer les statistiques' }
        };
    }
}

async function getLichessStats(account) {
    try {
        const response = await axios.get(`https://lichess.org/api/user/${account.accountId}`, {
            timeout: 10000,
            validateStatus: () => true
        });

        if (response.status !== 200) {
            return {
                account,
                stats: { error: 'Profil non accessible' }
            };
        }

        const userData = response.data;
        const ratings = {};

        // Extraire les ratings des différents modes de jeu
        if (userData.perfs) {
            if (userData.perfs.rapid?.rating) {
                ratings.rapid = userData.perfs.rapid.rating;
            }
            if (userData.perfs.blitz?.rating) {
                ratings.blitz = userData.perfs.blitz.rating;
            }
            if (userData.perfs.bullet?.rating) {
                ratings.bullet = userData.perfs.bullet.rating;
            }
            if (userData.perfs.classical?.rating) {
                ratings.classical = userData.perfs.classical.rating;
            }
            if (userData.perfs.correspondence?.rating) {
                ratings.correspondence = userData.perfs.correspondence.rating;
            }
        }

        return {
            account,
            stats: { ratings }
        };

    } catch (error) {
        console.error('Erreur API Lichess:', error);
        return {
            account,
            stats: { error: 'Impossible de récupérer les statistiques' }
        };
    }
}

function getRatingEmoji(rating) {
    if (rating >= 2400) return '👑'; // Maître international / Grand maître
    if (rating >= 2200) return '💎'; // Maître
    if (rating >= 2000) return '🥇'; // Expert
    if (rating >= 1800) return '🥈'; // Avancé
    if (rating >= 1600) return '🥉'; // Intermédiaire
    if (rating >= 1400) return '📈'; // Débutant avancé
    if (rating >= 1200) return '📊'; // Débutant
    return '🔰'; // Nouveau joueur
}

function formatGameType(type) {
    const typeMap = {
        'rapid': 'Rapide',
        'blitz': 'Blitz',
        'bullet': 'Bullet',
        'daily': 'Quotidien',
        'classical': 'Classique',
        'correspondence': 'Correspondance'
    };

    return typeMap[type] || type.charAt(0).toUpperCase() + type.slice(1);
}
