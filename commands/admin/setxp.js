const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const Database = require('../../managers/Database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setxp')
        .setDescription('Configure les gains d\'XP')
        .addIntegerOption(o => o.setName('message').setDescription('XP par message').setMinValue(1).setMaxValue(100))
        .addIntegerOption(o => o.setName('voice').setDescription('XP par minute vocal').setMinValue(1).setMaxValue(100))
        .addIntegerOption(o => o.setName('cooldown').setDescription('Cooldown secondes').setMinValue(10).setMaxValue(300)),
    async execute(interaction) {
        if (!interaction.member.permissions.has('Administrator')) return interaction.reply({ content: '❌ Permissions insuffisantes.', ephemeral: true });
        const m = interaction.options.getInteger('message');
        const v = interaction.options.getInteger('voice');
        const c = interaction.options.getInteger('cooldown');
        const changes = [];
        if (m) { Database.set('xpMessage', m); changes.push(`XP message: **${m}**`); }
        if (v) { Database.set('xpVoice', v); changes.push(`XP vocal: **${v}**/min`); }
        if (c) { Database.set('xpMessageCooldown', c); changes.push(`Cooldown: **${c}s**`); }
        if (!changes.length) return interaction.reply({ content: '⚠️ Aucune valeur spécifiée.', ephemeral: true });

        const embed = new EmbedBuilder()
            .setTitle('⚙️ Configuration XP Modifiée')
            .setDescription(changes.join('\n'))
            .setColor(0x3498db)
            .addFields({ name: '📊 Actuel', value: `Msg: **${Database.get('xpMessage')}** | Vocal: **${Database.get('xpVoice')}**/min | CD: **${Database.get('xpMessageCooldown')}s** | Max: **${Database.get('maxLevel')}**` })
            .setTimestamp();
        await interaction.reply({ embeds: [embed] });
    }
};