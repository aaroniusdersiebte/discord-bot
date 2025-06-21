const { Client, GatewayIntentBits, Collection, REST, Routes, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

class DiscordBotV2 {
    constructor(config, dataManager, bingoGenerator) {
        this.config = config;
        this.dataManager = dataManager;
        this.bingoGenerator = bingoGenerator;
        this.client = null;
        this.isReady = false;
        this.userBingos = new Map(); // userId -> bingoData
        this.eventReactions = new Map(); // messageId -> eventData
        this.commands = new Collection();
        
        this.loadCommands();
    }

    loadCommands() {
        const commandsPath = path.join(__dirname, 'commands');
        const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

        for (const file of commandFiles) {
            const filePath = path.join(commandsPath, file);
            const command = require(filePath);
            
            if ('data' in command && 'execute' in command) {
                this.commands.set(command.data.name, command);
                console.log(`✅ Loaded command: ${command.data.name}`);
            } else {
                console.log(`⚠️ Command at ${filePath} is missing required properties.`);
            }
        }
    }

    async start() {
        try {
            this.client = new Client({
                intents: [
                    GatewayIntentBits.Guilds,
                    GatewayIntentBits.GuildMessages,
                    GatewayIntentBits.MessageContent,
                    GatewayIntentBits.GuildMessageReactions
                ]
            });

            this.setupEventHandlers();
            
            // Register slash commands if enabled
            if (this.config.getDiscordConfig().enableSlashCommands) {
                await this.registerSlashCommands();
            }
            
            await this.client.login(this.config.get('DISCORD_BOT_TOKEN'));
            console.log('✅ Discord Bot V2 erfolgreich gestartet!');
            
        } catch (error) {
            console.error('❌ Fehler beim Starten des Discord Bots:', error);
            throw error;
        }
    }

    async registerSlashCommands() {
        try {
            const commands = Array.from(this.commands.values()).map(command => command.data.toJSON());
            
            const rest = new REST().setToken(this.config.get('DISCORD_BOT_TOKEN'));
            
            console.log('🔄 Registriere Slash Commands...');
            
            const guildId = this.config.get('DISCORD_GUILD_ID');
            if (guildId) {
                // Register guild-specific commands (faster for development)
                await rest.put(
                    Routes.applicationGuildCommands(this.client.user?.id || 'temp', guildId),
                    { body: commands }
                );
                console.log(`✅ ${commands.length} Guild Slash Commands registriert.`);
            } else {
                // Register global commands
                await rest.put(
                    Routes.applicationCommands(this.client.user?.id || 'temp'),
                    { body: commands }
                );
                console.log(`✅ ${commands.length} Globale Slash Commands registriert.`);
            }
            
        } catch (error) {
            console.error('❌ Fehler beim Registrieren der Slash Commands:', error);
        }
    }

    setupEventHandlers() {
        this.client.on('ready', async () => {
            console.log(`🤖 Bot ist als ${this.client.user.tag} eingeloggt!`);
            this.isReady = true;
            
            // Register commands after client is ready
            if (this.config.getDiscordConfig().enableSlashCommands && this.client.user) {
                await this.registerSlashCommands();
            }
        });

        // Handle slash commands
        this.client.on('interactionCreate', async (interaction) => {
            if (interaction.isChatInputCommand()) {
                await this.handleSlashCommand(interaction);
            } else if (interaction.isAutocomplete()) {
                await this.handleAutocomplete(interaction);
            }
        });

        // Handle message reactions (for legacy support)
        this.client.on('messageReactionAdd', async (reaction, user) => {
            if (user.bot) return;
            await this.handleReaction(reaction, user, true);
        });

        this.client.on('messageReactionRemove', async (reaction, user) => {
            if (user.bot) return;
            await this.handleReaction(reaction, user, false);
        });

        // Handle legacy text commands (optional)
        this.client.on('messageCreate', async (message) => {
            if (message.author.bot) return;
            await this.handleLegacyMessage(message);
        });

        this.client.on('error', (error) => {
            console.error('❌ Discord Bot Fehler:', error);
        });
    }

    async handleSlashCommand(interaction) {
        const command = this.commands.get(interaction.commandName);

        if (!command) {
            console.error(`❌ No command matching ${interaction.commandName} was found.`);
            return;
        }

        try {
            await command.execute(interaction, this);
        } catch (error) {
            console.error(`❌ Error executing ${interaction.commandName}:`, error);
            
            const errorMessage = this.config.getBotMessage('errors.general') || 
                                'Es ist ein Fehler aufgetreten beim Ausführen des Befehls.';
            
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: errorMessage, ephemeral: true });
            } else {
                await interaction.reply({ content: errorMessage, ephemeral: true });
            }
        }
    }

    async handleAutocomplete(interaction) {
        const command = this.commands.get(interaction.commandName);

        if (!command || !command.autocomplete) {
            return;
        }

        try {
            await command.autocomplete(interaction, this);
        } catch (error) {
            console.error(`❌ Error in autocomplete for ${interaction.commandName}:`, error);
        }
    }

    async handleBingoCommand(interaction, deckId = null) {
        try {
            await interaction.deferReply();

            // Get active deck or specified deck
            let deck;
            if (deckId) {
                const deckResponse = await this.dataManager.getDeck(deckId);
                if (!deckResponse.success) {
                    const errorMsg = this.config.getBotMessage('errors.deckNotFound') || 
                                   '❌ Das angegebene Deck wurde nicht gefunden.';
                    await interaction.editReply(errorMsg);
                    return;
                }
                deck = deckResponse.deck;
            } else {
                const activeDeckResponse = await this.dataManager.getActiveDeck();
                if (!activeDeckResponse.success || !activeDeckResponse.deck) {
                    const errorMsg = this.config.getBotMessage('errors.noDeck') || 
                                   '❌ Kein aktives Bingo Deck! Der Streamer muss erst ein Deck aktivieren.';
                    await interaction.editReply(errorMsg);
                    return;
                }
                deck = activeDeckResponse.deck;
            }

            const userId = interaction.user.id;

            // Check if user already has a bingo card
            if (this.userBingos.has(userId)) {
                const errorMsg = this.config.getBotMessage('errors.alreadyHasCard') || 
                               '🎯 Du hast bereits eine aktive Bingo Karte! Verwende `/status` um sie anzuzeigen.';
                await interaction.editReply(errorMsg);
                return;
            }

            // Generate bingo card
            const bingoSize = this.config.get('BOT_SETTINGS.bingoSize') || 5;
            const bingoCard = this.bingoGenerator.generateCard(deck.events, bingoSize);
            
            // Store user's bingo card
            const userBingoData = {
                userId,
                username: interaction.user.username,
                card: bingoCard,
                deckId: deck.id,
                deckName: deck.name,
                createdAt: new Date(),
                checkedItems: new Set(),
                bingoAchieved: false,
                winClaimed: false
            };
            
            this.userBingos.set(userId, userBingoData);

            // Create embed with customizable message
            const messageConfig = this.config.getBotMessage('bingoCardGenerated') || {};
            const embed = new EmbedBuilder()
                .setTitle(messageConfig.title || '🎯 Deine Bingo Karte ist bereit!')
                .setDescription(`**${deck.name}**\\n\\n` + 
                              (messageConfig.description || 'Reagiere mit ✅ auf Events wenn sie passieren'))
                .setColor(messageConfig.color || deck.color || '#6366f1')
                .setTimestamp()
                .setFooter({ text: `Bingo Karte #${Date.now().toString().slice(-6)}` });

            // Generate card text representation
            let cardText = '```\\n';
            for (let row = 0; row < bingoCard.length; row++) {
                for (let col = 0; col < bingoCard[row].length; col++) {
                    const event = bingoCard[row][col];
                    cardText += `${row + 1}.${col + 1}: ${event}\\n`;
                }
            }
            cardText += '```';

            embed.addFields({
                name: '📋 Deine Bingo Events',
                value: cardText,
                inline: false
            });

            // Generate SVG attachment if possible
            let attachment = null;
            try {
                if (this.bingoGenerator.generateImageSVG) {
                    const svgContent = await this.bingoGenerator.generateImageSVG(bingoCard, {
                        title: deck.name,
                        username: interaction.user.username,
                        color: deck.color || '#6366f1'
                    });
                    const htmlContent = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Bingo Card</title><style>body{background:#1a1a1a;margin:20px;display:flex;justify-content:center;align-items:center;min-height:90vh;}</style></head><body>${svgContent}</body></html>`;
                    attachment = new AttachmentBuilder(Buffer.from(htmlContent), { name: 'bingo-card.html' });
                }
            } catch (error) {
                console.log('⚠️ SVG generation failed, using text only:', error.message);
            }

            // Send events as separate messages for reactions
            if (this.config.get('BOT_SETTINGS.enableEventReactions')) {
                await this.sendEventMessages(interaction, bingoCard, userId);
            }

            // Send the main response
            const response = { embeds: [embed] };
            if (attachment) {
                response.files = [attachment];
            }
            
            await interaction.editReply(response);

        } catch (error) {
            console.error('❌ Fehler beim Erstellen der Bingo Karte:', error);
            const errorMsg = this.config.getBotMessage('errors.bingoGenerationFailed') || 
                           '❌ Fehler beim Erstellen der Bingo Karte. Versuche es später nochmal.';
            
            if (interaction.deferred) {
                await interaction.editReply(errorMsg);
            } else {
                await interaction.reply(errorMsg);
            }
        }
    }

    async sendEventMessages(interaction, bingoCard, userId) {
        try {
            const channel = interaction.channel;
            if (!channel) return;

            // Send individual event messages with positions
            for (let row = 0; row < bingoCard.length; row++) {
                for (let col = 0; col < bingoCard[row].length; col++) {
                    const event = bingoCard[row][col];
                    if (event === 'FREE') continue; // Skip FREE space
                    
                    const position = `${row + 1}.${col + 1}`;
                    
                    const eventMessage = await channel.send(`**${position}** ${event}`);
                    await eventMessage.react('✅');
                    
                    // Store reaction mapping
                    this.eventReactions.set(eventMessage.id, {
                        userId,
                        position: { row, col },
                        event,
                        messageId: eventMessage.id
                    });
                }
            }
        } catch (error) {
            console.error('⚠️ Error sending event messages:', error);
        }
    }

    async handleWinCommand(interaction, platform, username) {
        try {
            const userId = interaction.user.id;
            const userBingo = this.userBingos.get(userId);

            if (!userBingo) {
                await interaction.reply({
                    content: '❌ Du hast keine aktive Bingo Karte! Verwende `/bingo` um eine zu erhalten.',
                    ephemeral: true
                });
                return;
            }

            if (!userBingo.bingoAchieved) {
                await interaction.reply({
                    content: '❌ Du hast noch kein Bingo erreicht! Markiere zuerst Events mit ✅.',
                    ephemeral: true
                });
                return;
            }

            if (userBingo.winClaimed) {
                await interaction.reply({
                    content: '❌ Du hast bereits einen Gewinn für diese Karte eingereicht.',
                    ephemeral: true
                });
                return;
            }

            // Mark win as claimed
            userBingo.winClaimed = true;
            userBingo.platform = platform;
            userBingo.platformUsername = username;

            // Submit win to data manager
            await this.dataManager.submitBingoWin({
                userId,
                username: interaction.user.username,
                platform,
                platformUsername: username,
                bingoType: userBingo.bingoType,
                deckId: userBingo.deckId,
                deckName: userBingo.deckName,
                completedAt: userBingo.bingoAchievedAt,
                submittedAt: new Date()
            });

            const embed = new EmbedBuilder()
                .setTitle('✅ Bingo Gewinn eingereicht!')
                .setDescription(`Dein Bingo Gewinn wurde eingereicht und wartet auf Bestätigung durch den Streamer.\\n\\n` +
                              `**Details:**\\n` +
                              `Platform: ${platform}\\n` +
                              `Username: ${username}\\n` +
                              `Bingo Art: ${userBingo.bingoType}`)
                .setColor('#22c55e')
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });

        } catch (error) {
            console.error('❌ Fehler beim Verarbeiten des Bingo Gewinns:', error);
            await interaction.reply({
                content: '❌ Fehler beim Einreichen des Gewinns. Versuche es später nochmal.',
                ephemeral: true
            });
        }
    }

    async handleReaction(reaction, user, added) {
        try {
            // Ensure the message is fully fetched
            if (reaction.partial) {
                await reaction.fetch();
            }

            // Check if reaction is on a bingo event message
            const eventData = this.eventReactions.get(reaction.message.id);
            if (!eventData || eventData.userId !== user.id) {
                return;
            }

            // Only handle green checkmark reactions
            if (reaction.emoji.name !== '✅') {
                return;
            }

            const userBingo = this.userBingos.get(user.id);
            if (!userBingo) {
                return;
            }

            const positionKey = `${eventData.position.row}-${eventData.position.col}`;

            if (added) {
                // User marked an event as happened
                userBingo.checkedItems.add(positionKey);
                
                // Report event to data manager for streamer confirmation
                await this.dataManager.reportEvent({
                    eventText: eventData.event,
                    reportedBy: {
                        userId: user.id,
                        username: user.username
                    },
                    timestamp: new Date()
                });

            } else {
                // User unmarked an event
                userBingo.checkedItems.delete(positionKey);
            }

            // Check for bingo
            const hasBingo = this.checkForBingo(userBingo);
            if (hasBingo && !userBingo.bingoAchieved) {
                userBingo.bingoAchieved = true;
                userBingo.bingoAchievedAt = new Date();
                
                await this.notifyBingoAchieved(user, userBingo);
            }

        } catch (error) {
            console.error('❌ Fehler beim Verarbeiten der Reaktion:', error);
        }
    }

    checkForBingo(userBingo) {
        const { card, checkedItems } = userBingo;
        const size = card.length;

        // Check rows
        for (let row = 0; row < size; row++) {
            let hasRow = true;
            for (let col = 0; col < size; col++) {
                const position = `${row}-${col}`;
                if (card[row][col] !== 'FREE' && !checkedItems.has(position)) {
                    hasRow = false;
                    break;
                }
            }
            if (hasRow) {
                userBingo.bingoType = `Reihe ${row + 1}`;
                return true;
            }
        }

        // Check columns
        for (let col = 0; col < size; col++) {
            let hasCol = true;
            for (let row = 0; row < size; row++) {
                const position = `${row}-${col}`;
                if (card[row][col] !== 'FREE' && !checkedItems.has(position)) {
                    hasCol = false;
                    break;
                }
            }
            if (hasCol) {
                userBingo.bingoType = `Spalte ${col + 1}`;
                return true;
            }
        }

        // Check diagonals
        let hasMainDiagonal = true;
        let hasAntiDiagonal = true;
        
        for (let i = 0; i < size; i++) {
            const mainDiagPosition = `${i}-${i}`;
            const antiDiagPosition = `${i}-${size - 1 - i}`;
            
            if (card[i][i] !== 'FREE' && !checkedItems.has(mainDiagPosition)) {
                hasMainDiagonal = false;
            }
            if (card[i][size - 1 - i] !== 'FREE' && !checkedItems.has(antiDiagPosition)) {
                hasAntiDiagonal = false;
            }
        }

        if (hasMainDiagonal) {
            userBingo.bingoType = 'Diagonale (links-rechts)';
            return true;
        }
        
        if (hasAntiDiagonal) {
            userBingo.bingoType = 'Diagonale (rechts-links)';
            return true;
        }

        return false;
    }

    async notifyBingoAchieved(user, userBingo) {
        try {
            const messageConfig = this.config.getBotMessage('bingoAchieved') || {};
            
            const embed = new EmbedBuilder()
                .setTitle(messageConfig.title || '🎉 BINGO! 🎉')
                .setDescription(`Herzlichen Glückwunsch ${user.username}!\\n\\n` +
                              `Du hast ein Bingo erreicht: **${userBingo.bingoType}**\\n\\n` +
                              `Um deine Punkte zu erhalten, verwende:\\n` +
                              `\`/win <platform> <username>\`\\n\\n` +
                              `Verfügbare Platforms: YouTube, Twitch, TikTok, Instagram`)
                .setColor(messageConfig.color || '#FFD700')
                .setThumbnail(user.displayAvatarURL())
                .setTimestamp();

            const bingoChannelId = this.config.get('DISCORD_BINGO_CHANNEL_ID');
            const channel = bingoChannelId ? 
                await this.client.channels.fetch(bingoChannelId) : 
                null;
                
            if (channel) {
                await channel.send({ content: `<@${user.id}>`, embeds: [embed] });
            } else {
                // Send DM if no channel configured and DMs are enabled
                if (this.config.get('BOT_SETTINGS.enableDMNotifications')) {
                    await user.send({ embeds: [embed] });
                }
            }

        } catch (error) {
            console.error('❌ Fehler beim Senden der Bingo Nachricht:', error);
        }
    }

    async handleLegacyMessage(message) {
        // Support for old text commands (optional)
        const content = message.content.toLowerCase().trim();
        
        if (content === '!help') {
            await message.reply('Verwende `/help` für die neuen Slash Commands! 🎯');
        } else if (content === '!bingo') {
            await message.reply('Verwende `/bingo` für eine neue Bingo Karte! 🎯');
        }
    }

    async processEventConfirmation(eventData) {
        // Update all users who have this event checked
        try {
            const messageConfig = this.config.getBotMessage('eventConfirmed') || {};
            
            for (const [userId, userBingo] of this.userBingos.entries()) {
                // Find the event in their card and notify the user
                const user = await this.client.users.fetch(userId);
                if (user && this.config.get('BOT_SETTINGS.enableDMNotifications')) {
                    const embed = new EmbedBuilder()
                        .setTitle(messageConfig.title || '✅ Event bestätigt')
                        .setDescription(`Event wurde vom Streamer bestätigt: **${eventData.eventText || eventData.text}**`)
                        .setColor(messageConfig.color || '#22c55e')
                        .setTimestamp();

                    await user.send({ embeds: [embed] });
                }
            }
        } catch (error) {
            console.error('❌ Fehler beim Verarbeiten der Event Bestätigung:', error);
        }
    }

    async processBingoWin(bingoData) {
        try {
            const user = await this.client.users.fetch(bingoData.userId);
            if (user) {
                const messageConfig = this.config.getBotMessage('winConfirmed') || {};
                
                const embed = new EmbedBuilder()
                    .setTitle(messageConfig.title || '🏆 Gewinn bestätigt!')
                    .setDescription(`Dein Bingo Gewinn wurde bestätigt und die Punkte wurden vergeben!\\n\\n` +
                                  `**Platzierung:** ${bingoData.placement}\\n` +
                                  `**Punkte:** ${bingoData.points}`)
                    .setColor(messageConfig.color || '#FFD700')
                    .setTimestamp();

                await user.send({ embeds: [embed] });
            }

            // Also announce in the bingo channel
            const bingoChannelId = this.config.get('DISCORD_BINGO_CHANNEL_ID');
            if (bingoChannelId) {
                const channel = await this.client.channels.fetch(bingoChannelId);
                if (channel) {
                    const embed = new EmbedBuilder()
                        .setTitle('🏆 Bingo Gewinner!')
                        .setDescription(`${bingoData.username} hat Platz ${bingoData.placement} erreicht und ${bingoData.points} Punkte erhalten!`)
                        .setColor('#FFD700')
                        .setTimestamp();

                    await channel.send({ embeds: [embed] });
                }
            }

        } catch (error) {
            console.error('❌ Fehler beim Verarbeiten des Bingo Gewinns:', error);
        }
    }

    async stop() {
        if (this.client) {
            await this.client.destroy();
            this.client = null;
            this.isReady = false;
            console.log('🛑 Discord Bot V2 gestoppt.');
        }
    }

    getConnectedGuilds() {
        if (!this.client || !this.isReady) {
            return [];
        }
        
        return this.client.guilds.cache.map(guild => ({
            id: guild.id,
            name: guild.name,
            memberCount: guild.memberCount
        }));
    }
}

module.exports = DiscordBotV2;
