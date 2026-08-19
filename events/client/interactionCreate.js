const Logger = require('../../utils/logger');
const Database = require('../../managers/Database');
const StatusChecker = require('../../managers/StatusChecker');

module.exports = {
    name: 'interactionCreate',
    async execute(interaction, client) {
        // === SLASH COMMANDS ===
        if (interaction.isChatInputCommand()) {
            const command = client.commands.get(interaction.commandName);
            if (!command) {
                Logger.console('warn', `Commande inconnue: ${interaction.commandName}`, 'INTERACTION');
                return;
            }

            try {
                await command.execute(interaction, client);
            } catch (error) {
                Logger.console('error', `Erreur commande /${interaction.commandName}: ${error.message}`, 'INTERACTION');
                console.error(error);

                const errorMsg = '❌ Une erreur est survenue lors de l\'exécution de cette commande.';
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({ content: errorMsg, ephemeral: true }).catch(() => {});
                } else if (interaction.deferred) {
                    await interaction.editReply({ content: errorMsg }).catch(() => {});
                }
            }
            return;
        }

        // === BUTTONS ===
        if (interaction.isButton()) {
            try {
                switch (interaction.customId) {
                    case 'create_ticket':
                        await handleTicketCreate(interaction, client, 'ticket');
                        break;
                    case 'create_bug_ticket':
                        await handleTicketCreate(interaction, client, 'bug');
                        break;
                    case 'close_ticket':
                        await handleTicketClose(interaction, client);
                        break;
                    case 'refresh_status':
                        await handleStatusRefresh(interaction);
                        break;
                    case 'claim_roles':
                        await handleRoleClaim(interaction);
                        break;
                    default:
                        Logger.console('warn', `Bouton inconnu: ${interaction.customId}`, 'INTERACTION');
                }
            } catch (error) {
                Logger.console('error', `Erreur bouton ${interaction.customId}: ${error.message}`, 'INTERACTION');
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({ content: '❌ Erreur interne.', ephemeral: true }).catch(() => {});
                }
            }
        }
    }
};

// ===================== HANDLERS BOUTONS =====================

async function handleTicketCreate(interaction, client, type) {
    if (!Database.isFeatureEnabled('tickets')) {
        return interaction.reply({ content: '❌ Le système de tickets est désactivé.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    const ticketCategory = Database.get('ticketCategory');
    if (!ticketCategory) return interaction.editReply('❌ Catégorie non configurée (`/setchannel`).');

    const prefix = type === 'bug' ? 'bug' : 'ticket';
    const channelName = `${prefix}-${interaction.user.username}`.toLowerCase();
    const existing = interaction.guild.channels.cache.find(c => c.name === channelName);
    if (existing) return interaction.editReply(`❌ Vous avez déjà un ticket : ${existing}`);

    const staffRole = Database.get('staffRole');
    const overwrites = [
        { id: interaction.guild.id, deny: ['ViewChannel'] },
        { id: interaction.user.id, allow: ['ViewChannel', 'SendMessages', 'AttachFiles'] }
    ];
    if (staffRole) overwrites.push({ id: staffRole, allow: ['ViewChannel', 'SendMessages', 'AttachFiles'] });

    const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType } = require('discord.js');

    const channel = await interaction.guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: ticketCategory,
        permissionOverwrites: overwrites
    });

    const isBug = type === 'bug';
    const embed = new EmbedBuilder()
        .setTitle(isBug ? `🐛 Signalement Bug - ${interaction.user.tag}` : `🎫 Ticket - ${interaction.user.tag}`)
        .setDescription(isBug
            ? '**Merci de fournir :**\n• Description détaillée\n• Étapes de reproduction\n• Captures d\'écran\n• Environnement (OS, navigateur)\n• Heure du bug'
            : 'Expliquez votre problème en détail. Un membre du staff vous répondra bientôt.')
        .setColor(isBug ? 0xe74c3c : 0x2ecc71)
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('close_ticket').setLabel('Fermer').setEmoji('🔒').setStyle(ButtonStyle.Danger)
    );

    const mention = staffRole ? `<@&${staffRole}>` : '';
    await channel.send({ content: `${interaction.user} ${mention}`, embeds: [embed], components: [row] });
    await interaction.editReply(`✅ Ticket créé : ${channel}`);
}

async function handleTicketClose(interaction, client) {
    await interaction.deferReply({ ephemeral: true });
    await interaction.editReply('🔒 Fermeture du ticket...');

    try {
        const messages = await interaction.channel.messages.fetch({ limit: 100 });
        const transcript = messages.reverse()
            .map(m => `[${m.createdAt.toLocaleString('fr-FR')}] ${m.author?.tag || 'Inconnu'}: ${m.cleanContent || '[inaccessible]'}`)
            .join('\n');

        const transcriptChannelId = Database.get('transcriptChannel');
        if (transcriptChannelId) {
            const transChan = interaction.guild.channels.cache.get(transcriptChannelId);
            if (transChan) {
                const { EmbedBuilder } = require('discord.js');
                const embed = new EmbedBuilder()
                    .setTitle('📜 Transcript de Ticket')
                    .addFields(
                        { name: 'Salon', value: interaction.channel.name, inline: true },
                        { name: 'Fermé par', value: interaction.user.tag, inline: true }
                    )
                    .setColor(0xe74c3c)
                    .setTimestamp();

                await transChan.send({
                    embeds: [embed],
                    files: [{ attachment: Buffer.from(transcript, 'utf-8'), name: `transcript-${interaction.channel.name}.txt` }]
                });
            }
        }

        await interaction.editReply('✅ Ticket fermé !');
        setTimeout(() => interaction.channel.delete().catch(() => {}), 3000);
    } catch (error) {
        Logger.console('error', `Fermeture ticket: ${error.message}`, 'TICKET');
        await interaction.editReply('❌ Erreur lors de la fermeture.');
    }
}

async function handleStatusRefresh(interaction) {
    // Important : deferReply pour éviter que Discord ne pense que le bot ne répond pas
    await interaction.deferReply({ ephemeral: true });

    try {
        // 1. Récupérer les derniers statuts
        const statuses = await StatusChecker.getAllStatus();
        const embed = StatusChecker.createStatusEmbed(statuses);
        const buttons = StatusChecker.createStatusButtons();

        // 2. Modifier le message original (celui sur lequel on a cliqué)
        // interaction.message représente le message contenant le bouton
        await interaction.message.edit({ 
            embeds: [embed], 
            components: [buttons] 
        });

        // 3. Confirmer à l'utilisateur (message visible uniquement par lui)
        await interaction.editReply('✅ Statut rafraîchi avec succès !');

    } catch (error) {
        console.error(`Erreur refresh status: ${error.message}`);
        // Si l'édition échoue (ex: message trop vieux ou supprimé), on prévient l'utilisateur
        await interaction.editReply('❌ Impossible de rafraîchir le statut (message peut-être supprimé).');
    }
}

async function handleRoleClaim(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const roleIds = ['1521937325595037906', '1534896300414472312'];
    const added = [], already = [];

    for (const roleId of roleIds) {
        const role = interaction.guild.roles.cache.get(roleId);
        if (!role) continue;
        if (!interaction.member.roles.cache.has(roleId)) {
            await interaction.member.roles.add(role).catch(() => {});
            added.push(role.name);
        } else {
            already.push(role.name);
        }
    }

    let msg = '';
    if (added.length > 0) msg += `✅ Rôles reçus : **${added.join(', ')}**`;
    if (already.length > 0) msg += `\nℹ️ Déjà possédés : **${already.join(', ')}**`;
    if (!added.length && !already.length) msg = '❌ Rôles introuvables sur le serveur.';

    await interaction.editReply(msg);
}