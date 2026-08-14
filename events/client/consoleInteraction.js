const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'interactionCreate',
    async execute(interaction, client) {

        // Vérifier si on est dans le salon console
        const consoleChannelId = client.CONSOLE_CHANNEL_ID;
        if (!consoleChannelId || interaction.channelId !== consoleChannelId) return;

        const userId = interaction.user.id;

        // Vérifier permissions
        if (!client.isConsoleOwner(userId)) {
            if (interaction.isButton() || interaction.isModalSubmit()) {
                return interaction.reply({ content: '❌ Vous n\'êtes pas autorisé à utiliser la console.', ephemeral: true });
            }
            return;
        }

        const session = client.consoleSessions.get(userId);

        // === BOUTON : Entrer commande ===
        if (interaction.isButton() && interaction.customId === 'console_input') {
            if (!session) {
                return interaction.reply({ content: '❌ Aucune session active. Envoyez `open` dans ce salon.', ephemeral: true });
            }

            const modal = new ModalBuilder()
                .setCustomId('console_modal')
                .setTitle('🖥️ Console - Commande');

            const input = new TextInputBuilder()
                .setCustomId('console_cmd')
                .setLabel('Commande')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('help, status, eval...')
                .setRequired(true)
                .setMaxLength(500);

            modal.addComponents(new ActionRowBuilder().addComponents(input));
            return interaction.showModal(modal);
        }

        // === BOUTON : Aide ===
        if (interaction.isButton() && interaction.customId === 'console_help') {
            if (!session) return interaction.deferUpdate();
            const result = client.executeConsoleCmd('help', userId);
            session.history.push({ type: 'input', content: 'help' });
            session.history.push({ type: 'output', content: result });
            try {
                await interaction.message.edit({
                    embeds: [client.buildConsoleEmbed(session.history)],
                    components: [client.buildConsoleButtons()]
                });
            } catch (e) {}
            return interaction.deferUpdate();
        }

        // === BOUTON : Effacer ===
        if (interaction.isButton() && interaction.customId === 'console_clear') {
            if (!session) return interaction.deferUpdate();
            session.history = [];
            try {
                await interaction.message.edit({
                    embeds: [client.buildConsoleEmbed([])],
                    components: [client.buildConsoleButtons()]
                });
            } catch (e) {}
            return interaction.deferUpdate();
        }

        // === BOUTON : Fermer ===
        if (interaction.isButton() && interaction.customId === 'console_close') {
            if (!session) return interaction.deferUpdate();
            client.consoleSessions.delete(userId);
            try {
                await interaction.message.edit({
                    embeds: [new EmbedBuilder().setTitle('🖥️ Console').setDescription('```diff\n- Console fermée. Envoyez "open" pour rouvrir.\n```').setColor(0x2f3136).setTimestamp()],
                    components: []
                });
            } catch (e) {}
            return interaction.deferUpdate();
        }

        // === MODAL : Commande soumise ===
        if (interaction.isModalSubmit() && interaction.customId === 'console_modal') {
            if (!session) return interaction.reply({ content: '❌ Session expirée.', ephemeral: true });

            const input = interaction.fields.getTextInputValue('console_cmd');
            await interaction.deferUpdate();

            session.history.push({ type: 'input', content: input });

            const result = await client.executeConsoleCmd(input, userId);

            if (result === '__CLEAR__') {
                session.history = [];
                try {
                    await interaction.message.edit({
                        embeds: [client.buildConsoleEmbed([])],
                        components: [client.buildConsoleButtons()]
                    });
                } catch (e) {}
                return;
            }

            if (result === '__CLOSE__') {
                client.consoleSessions.delete(userId);
                try {
                    await interaction.message.edit({
                        embeds: [new EmbedBuilder().setTitle('🖥️ Console').setDescription('```diff\n- Console fermée.\n```').setColor(0x2f3136).setTimestamp()],
                        components: []
                    });
                } catch (e) {}
                return;
            }

            if (result) {
                session.history.push({ type: 'output', content: result });
            }

            try {
                await interaction.message.edit({
                    embeds: [client.buildConsoleEmbed(session.history)],
                    components: [client.buildConsoleButtons()]
                });
            } catch (e) {}
        }
    }
};