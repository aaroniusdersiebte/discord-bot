const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Zeigt alle verfügbaren Befehle an'),
    
    async execute(interaction, bot) {
        const embed = new EmbedBuilder()
            .setTitle('🎯 Stream Bingo Bot - Befehle')
            .setDescription('Alle verfügbaren Slash Commands:')
            .addFields(
                { 
                    name: '/bingo [deck]', 
                    value: 'Erstelle eine neue Bingo Karte\\nOptional: Wähle ein spezifisches Deck', 
                    inline: false 
                },
                { 
                    name: '/win <platform> <username>', 
                    value: 'Melde deinen Bingo Gewinn\\nPlatform: YouTube, Twitch, TikTok, Instagram', 
                    inline: false 
                },
                { 
                    name: '/status', 
                    value: 'Zeige deinen aktuellen Bingo Status', 
                    inline: false 
                },
                { 
                    name: '/leaderboard', 
                    value: 'Zeige die aktuelle Punktetabelle', 
                    inline: false 
                },
                { 
                    name: '/help', 
                    value: 'Zeige diese Hilfe an', 
                    inline: false 
                }
            )
            .addFields(
                { 
                    name: '🎮 Wie spiele ich?', 
                    value: '1. Verwende `/bingo` um eine Karte zu erhalten\\n' +
                          '2. Reagiere mit ✅ auf Events wenn sie passieren\\n' +
                          '3. Bei einem Bingo verwende `/win <platform> <username>`', 
                    inline: false 
                }
            )
            .setColor(bot.config.get('BOT_SETTINGS.messages.bingoCardGenerated.color') || '#6366f1')
            .setThumbnail(bot.client.user.displayAvatarURL())
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    }
};
