const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('bingo')
        .setDescription('Erstelle eine neue Bingo Karte')
        .addStringOption(option =>
            option.setName('deck')
                .setDescription('Wähle ein Bingo Deck')
                .setRequired(false)
                .setAutocomplete(true)),
    
    async execute(interaction, bot) {
        await bot.handleBingoCommand(interaction);
    },

    async autocomplete(interaction, bot) {
        const focusedValue = interaction.options.getFocused();
        
        try {
            // Get available decks
            const decksResponse = await bot.dataManager.loadBingoDecks();
            if (!decksResponse.success) {
                return await interaction.respond([]);
            }

            const decks = decksResponse.decks || [];
            const filtered = decks
                .filter(deck => deck.name.toLowerCase().includes(focusedValue.toLowerCase()))
                .slice(0, 25) // Discord limit
                .map(deck => ({
                    name: deck.name,
                    value: deck.id
                }));

            await interaction.respond(filtered);
        } catch (error) {
            console.error('Autocomplete error:', error);
            await interaction.respond([]);
        }
    }
};
