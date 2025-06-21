const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('Zeigt die aktuelle Punktetabelle an')
        .addIntegerOption(option =>
            option.setName('top')
                .setDescription('Anzahl der Top-Spieler anzeigen (Standard: 10)')
                .setRequired(false)
                .setMinValue(5)
                .setMaxValue(25)),
    
    async execute(interaction, bot) {
        try {
            const topCount = interaction.options.getInteger('top') || 10;
            
            // Get leaderboard data from data manager
            const leaderboardResponse = await bot.dataManager.getLeaderboard(topCount);
            
            if (!leaderboardResponse.success) {
                const embed = new EmbedBuilder()
                    .setTitle('📊 Punktetabelle')
                    .setDescription('Noch keine Gewinner vorhanden!')
                    .setColor('#fbbf24')
                    .setTimestamp();

                await interaction.reply({ embeds: [embed] });
                return;
            }

            const leaderboard = leaderboardResponse.leaderboard || [];
            
            if (leaderboard.length === 0) {
                const embed = new EmbedBuilder()
                    .setTitle('📊 Punktetabelle')
                    .setDescription('Noch keine Gewinner vorhanden!\\n\\nSei der Erste und spiele mit `/bingo`!')
                    .setColor('#fbbf24')
                    .setTimestamp();

                await interaction.reply({ embeds: [embed] });
                return;
            }

            const embed = new EmbedBuilder()
                .setTitle('🏆 Stream Bingo Punktetabelle')
                .setDescription(`Top ${Math.min(topCount, leaderboard.length)} Spieler:`)
                .setColor('#FFD700')
                .setTimestamp();

            // Add leaderboard entries
            const leaderboardText = leaderboard.map((entry, index) => {
                const position = index + 1;
                const medal = position === 1 ? '🥇' : position === 2 ? '🥈' : position === 3 ? '🥉' : `${position}.`;
                const platform = entry.platform ? `(${entry.platform})` : '';
                return `${medal} **${entry.username}** ${platform} - ${entry.totalPoints} Punkte`;
            }).join('\\n');

            embed.addFields({
                name: '🎯 Rangliste',
                value: leaderboardText,
                inline: false
            });

            // Add statistics if available
            if (leaderboardResponse.stats) {
                const stats = leaderboardResponse.stats;
                embed.addFields({
                    name: '📈 Statistiken',
                    value: `Gesamte Spiele: ${stats.totalGames || 0}\\n` +
                          `Aktive Spieler: ${stats.activePlayers || 0}\\n` +
                          `Heute gespielt: ${stats.todayGames || 0}`,
                    inline: true
                });
            }

            await interaction.reply({ embeds: [embed] });

        } catch (error) {
            console.error('Leaderboard command error:', error);
            const embed = new EmbedBuilder()
                .setTitle('❌ Fehler')
                .setDescription('Konnte die Punktetabelle nicht laden.')
                .setColor('#ef4444')
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
        }
    }
};
