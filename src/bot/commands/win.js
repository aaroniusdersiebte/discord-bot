const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('win')
        .setDescription('Melde deinen Bingo Gewinn')
        .addStringOption(option =>
            option.setName('platform')
                .setDescription('Deine Streaming Platform')
                .setRequired(true)
                .addChoices(
                    { name: 'YouTube', value: 'youtube' },
                    { name: 'Twitch', value: 'twitch' },
                    { name: 'TikTok', value: 'tiktok' },
                    { name: 'Instagram', value: 'instagram' }
                ))
        .addStringOption(option =>
            option.setName('username')
                .setDescription('Dein Username auf der Platform')
                .setRequired(true)),
    
    async execute(interaction, bot) {
        const platform = interaction.options.getString('platform');
        const username = interaction.options.getString('username');
        
        await bot.handleWinCommand(interaction, platform, username);
    }
};
