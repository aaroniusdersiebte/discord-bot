const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('status')
        .setDescription('Zeigt deinen aktuellen Bingo Status an'),
    
    async execute(interaction, bot) {
        const userId = interaction.user.id;
        const userBingo = bot.userBingos.get(userId);

        if (!userBingo) {
            const embed = new EmbedBuilder()
                .setTitle('📊 Dein Bingo Status')
                .setDescription('Du hast derzeit keine aktive Bingo Karte.\\n\\nVerwende `/bingo` um eine neue Karte zu erhalten!')
                .setColor('#fbbf24')
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
            return;
        }

        const checkedCount = userBingo.checkedItems.size;
        const totalItems = userBingo.card.length * userBingo.card[0].length - 1; // -1 for FREE space
        const progressPercent = Math.round((checkedCount / totalItems) * 100);

        const embed = new EmbedBuilder()
            .setTitle('📊 Dein Bingo Status')
            .setDescription(`**Deck:** ${userBingo.deckName}\\n` +
                          `**Erstellt:** ${userBingo.createdAt.toLocaleString('de-DE')}`)
            .addFields(
                { 
                    name: '📈 Fortschritt', 
                    value: `${checkedCount}/${totalItems} Events markiert (${progressPercent}%)`, 
                    inline: true 
                },
                { 
                    name: '🎯 Bingo Status', 
                    value: userBingo.bingoAchieved ? `✅ Erreicht: ${userBingo.bingoType}` : '❌ Noch nicht erreicht', 
                    inline: true 
                },
                { 
                    name: '🏆 Gewinn Status', 
                    value: userBingo.winClaimed ? `✅ Eingereicht (${userBingo.platform})` : '❌ Noch nicht eingereicht', 
                    inline: true 
                }
            )
            .setColor(userBingo.bingoAchieved ? '#22c55e' : '#6366f1')
            .setTimestamp();

        if (userBingo.bingoAchieved && !userBingo.winClaimed) {
            embed.addFields({
                name: '💡 Tipp',
                value: 'Du hast ein Bingo erreicht! Verwende `/win <platform> <username>` um deine Punkte zu erhalten.',
                inline: false
            });
        }

        await interaction.reply({ embeds: [embed] });
    }
};
