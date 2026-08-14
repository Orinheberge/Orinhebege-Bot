const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'messageCreate',
    async execute(message, client) {
        const consoleChannelId = client.CONSOLE_CHANNEL_ID;
        if (!consoleChannelId || message.channelId !== consoleChannelId) return;
        if (message.author.bot) return;

        // Vérifier permissions
        if (!client.isConsoleOwner(message.author.id)) {
            await message.delete().catch(() => {});
            await message.channel.send({ content: '❌ Non autorisé.', ephemeral: true }).catch(() => {});
            return;
        }

        const content = message.content.trim().toLowerCase();

        // Commande "open" → ouvrir la console
        if (content === 'open' || content === 'start' || content === 'console') {
            await message.delete().catch(() => {});

            const userId = message.author.id;

            // Session déjà active ?
            if (client.consoleSessions.has(userId)) {
                const session = client.consoleSessions.get(userId);
                try {
                    const msg = await message.channel.messages.fetch(session.messageId);
                    if (msg) {
                        await message.channel.send(`⚠️ Console déjà ouverte : ${msg.url}`).then(m => setTimeout(() => m.delete().catch(() => {}), 5000));
                        return;
                    }
                } catch (e) {
                    client.consoleSessions.delete(userId);
                }
            }

            const embed = client.buildConsoleEmbed();
            const buttons = client.buildConsoleButtons();

            const reply = await message.channel.send({ embeds: [embed], components: [buttons] });

            client.consoleSessions.set(userId, {
                channelId: message.channel.id,
                messageId: reply.id,
                history: [],
                openedAt: new Date()
            });

            return;
        }

        // Commande directe (sans ouvrir la console)
        if (content.startsWith('!')) {
            const cmd = content.substring(1);
            const result = await client.executeConsoleCmd(cmd, message.author.id);

            if (result && result !== '__CLEAR__' && result !== '__CLOSE__') {
                const embed = new EmbedBuilder()
                    .setTitle('🖥️ Console')
                    .setDescription(`> ❯ ${cmd}\n\n${result.substring(0, 4000)}`)
                    .setColor(0x2f3136)
                    .setTimestamp();
                await message.channel.send({ embeds: [embed] });
            }

            await message.delete().catch(() => {});
            return;
        }

        // Supprimer tout autre message dans le salon console
        await message.delete().catch(() => {});
    }
};