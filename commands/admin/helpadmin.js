const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const Database = require('../../managers/Database');

module.exports = {
    data: new SlashCommandBuilder().setName('help-admin').setDescription('Aide des commandes admin'),
    async execute(interaction) {
        if (!interaction.member.permissions.has('Administrator')) return interaction.reply({ content: '❌ Permissions insuffisantes.', ephemeral: true });
        const s = (id) => id ? '✅' : '❌';
        const ar = Database.get('autoRole');
        let arName = 'Non configuré';
        if (ar) { const r = interaction.guild.roles.cache.get(ar); arName = r ? r.name : 'Introuvable'; }

        const embed = new EmbedBuilder()
            .setTitle('🛠️ Aide Administration')
            .setColor(0x3498db)
            .addFields(
                { name: '⚙️ Config', value: '`/setchannel` `/settranscript` `/setstaff` `/setwelcome` `/setlogs` `/setstatus` `/setlevelup` `/setxp` `/setautorole` `/setup` `/getroles` `/panel`' },
                { name: '🏆 Niveaux', value: '`/addlevelrole` `/removelevelrole` `/resetrank`' },
                { name: '🔨 Modération', value: '`/ban` `/kick` `/warn` `/clear` `/transfert` `/warnings`' },
                { name: '📊 État', value: `Tickets: ${s(Database.get('ticketCategory'))} | Transcripts: ${s(Database.get('transcriptChannel'))} | Staff: ${s(Database.get('staffRole'))}\nWelcome: ${s(Database.get('welcomeChannel'))} | Logs: ${s(Database.get('logsChannel'))} | Status: ${s(Database.get('statusChannel'))}\nAuto-Rôle: ${arName}` }
            ).setTimestamp();
        await interaction.reply({ embeds: [embed], ephemeral: true });
    }
};