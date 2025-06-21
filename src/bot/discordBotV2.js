const { Client, GatewayIntentBits, Collection, REST, Routes, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const BingoPNGGenerator = require('../utils/bingoPNGGenerator');

class DiscordBotV2 {
    constructor(config, dataManager, bingoGenerator) {
        this.config = config;
        this.dataManager = dataManager;
        this.bingoGenerator = bingoGenerator;
        this.pngGenerator = new BingoPNGGenerator();
        this.client = null;
        this.isReady = false;
        this.userBingos = new Map(); // userId -> bingoData
        this.eventMessages = new Map(); // userId -> array of event message IDs
        this.cardMessages = new Map(); // userId -> bingo card message ID
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
            
            // Ensure client is ready and user is available
            if (!this.client.user) {
                throw new Error('Client is not ready yet. Cannot register slash commands.');
            }
            
            const guildId = this.config.get('DISCORD_GUILD_ID');
            if (guildId) {
                // Register guild-specific commands (faster for development)
                await rest.put(
                    Routes.applicationGuildCommands(this.client.user.id, guildId),
                    { body: commands }
                );
                console.log(`✅ ${commands.length} Guild Slash Commands registriert.`);
            } else {
                // Register global commands
                await rest.put(
                    Routes.applicationCommands(this.client.user.id),
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
            await interaction.deferReply({ ephemeral: true });

            // Get all active decks (main + addon decks)
            const activeDecksResponse = await this.dataManager.getAllActiveDecks();
            if (!activeDecksResponse.success || activeDecksResponse.decks.length === 0) {
                const errorMsg = this.config.getBotMessage('errors.noDeck') || 
                               '❌ Keine aktiven Bingo Decks! Der Streamer muss erst Decks aktivieren.';
                await interaction.editReply(errorMsg);
                return;
            }

            // Combine all events from active decks
            const allEvents = [];
            const activeDecks = activeDecksResponse.decks;
            activeDecks.forEach(deck => {
                if (deck.events && deck.events.length > 0) {
                    allEvents.push(...deck.events);
                }
            });

            if (allEvents.length === 0) {
                await interaction.editReply('❌ Keine Events in den aktiven Decks gefunden!');
                return;
            }

            const userId = interaction.user.id;
            const user = interaction.user;

            // Check if user already has a bingo card
            if (this.userBingos.has(userId)) {
                const errorMsg = this.config.getBotMessage('errors.alreadyHasCard') || 
                               '🎯 Du hast bereits eine aktive Bingo Karte! Verwende `/status` um sie anzuzeigen.';
                await interaction.editReply(errorMsg);
                return;
            }

            // Generate bingo card
            const bingoSize = this.config.get('BOT_SETTINGS.bingoSize') || 5;
            const bingoCard = this.pngGenerator.generateCard(allEvents, bingoSize);
            
            // Store user's bingo card
            const userBingoData = {
                userId,
                username: user.username,
                card: bingoCard,
                activeDecks: activeDecks.map(deck => ({ id: deck.id, name: deck.name })),
                createdAt: new Date(),
                checkedItems: new Set(),
                confirmedItems: new Set(),
                bingoAchieved: false,
                winClaimed: false
            };
            
            this.userBingos.set(userId, userBingoData);

            // Send DM with bingo card and events
            try {
                await this.sendBingoCardDM(user, userBingoData, bingoCard);
                await interaction.editReply('✅ Deine Bingo Karte wurde per DM gesendet! 🎯');
            } catch (dmError) {
                console.error('❌ Konnte DM nicht senden:', dmError);
                await interaction.editReply('❌ Ich konnte dir keine DM senden. Bitte überprüfe deine Privatsphäre-Einstellungen und versuche es erneut.');
                this.userBingos.delete(userId); // Clean up if DM failed
            }

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

    async sendBingoCardDM(user, userBingoData, bingoCard) {
        try {
            const { card, activeDecks } = userBingoData;
            
            // Generate PNG image
            const pngBuffer = await this.pngGenerator.generateCardPNG(card, {
                title: 'Stream Bingo',
                username: user.username,
                color: '#6366f1',
                checkedItems: userBingoData.checkedItems,
                confirmedEvents: Array.from(userBingoData.confirmedItems)
            });

            // Create main embed
            const messageConfig = this.config.getBotMessage('bingoCardGenerated') || {};
            const embed = new EmbedBuilder()
                .setTitle(messageConfig.title || '🎯 Deine Bingo Karte ist bereit!')
                .setDescription(
                    `**Aktive Decks:** ${activeDecks.map(d => d.name).join(', ')}\n\n` +
                    (messageConfig.description || 'Reagiere mit ✅ auf Events wenn sie passieren!')
                )
                .setColor(messageConfig.color || '#6366f1')
                .setTimestamp()
                .setFooter({ text: `Bingo Karte #${Date.now().toString().slice(-6)}` });

            // Send the bingo card image or text fallback
            const fileExtension = this.pngGenerator.canvasAvailable ? 'png' : 'txt';
            const fileName = `bingo-card.${fileExtension}`;
            const attachment = new AttachmentBuilder(pngBuffer, { name: fileName });
            
            const cardMessage = await user.send({ 
                embeds: [embed], 
                files: [attachment] 
            });
            
            // Store card message ID for later updates
            this.cardMessages.set(user.id, cardMessage.id);

            // Send separator
            await user.send('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            await user.send('**📋 Deine Bingo Events** - Reagiere mit ✅ wenn ein Event passiert:');

            // Send each event as individual message
            const eventMessageIds = [];
            const flatEvents = [];
            
            for (let row = 0; row < card.length; row++) {
                for (let col = 0; col < card[row].length; col++) {
                    const event = card[row][col];
                    if (event === 'FREE') continue; // Skip FREE space
                    
                    const position = `${row + 1}.${col + 1}`;
                    flatEvents.push({ event, position, row, col });
                }
            }

            // Send events in groups of 5 to avoid spam
            for (let i = 0; i < flatEvents.length; i += 5) {
                const eventGroup = flatEvents.slice(i, i + 5);
                
                for (const { event, position } of eventGroup) {
                    const eventMessage = await user.send(`**${position}** ${event}`);
                    await eventMessage.react('✅');
                    eventMessageIds.push(eventMessage.id);
                    
                    // Small delay to avoid rate limits
                    await new Promise(resolve => setTimeout(resolve, 200));
                }
                
                // Longer delay between groups
                if (i + 5 < flatEvents.length) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }
            
            // Store event message IDs
            this.eventMessages.set(user.id, eventMessageIds);

            // Send instructions
            await user.send('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            const instructionsEmbed = new EmbedBuilder()
                .setTitle('🎮 Anleitung')
                .setDescription(
                    '1️⃣ **Event passiert?** → Reagiere mit ✅ auf die entsprechende Nachricht\n' +
                    '2️⃣ **Bingo erreicht?** → Verwende `/win <platform> <username>`\n' +
                    '3️⃣ **Status prüfen?** → Verwende `/status`\n\n' +
                    '🎯 **Ziel:** Erreiche eine vollständige Reihe, Spalte oder Diagonale!'
                )
                .setColor('#22c55e')
                .setFooter({ text: 'Viel Erfolg beim Bingo! 🍀' });
            
            await user.send({ embeds: [instructionsEmbed] });

        } catch (error) {
            console.error('❌ Fehler beim Senden der Bingo Karte DM:', error);
            throw error;
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

            // Only handle green checkmark reactions
            if (reaction.emoji.name !== '✅') {
                return;
            }

            // Check if this is from a user's event messages
            const userId = user.id;
            const userBingo = this.userBingos.get(userId);
            if (!userBingo) {
                return;
            }

            const eventMessageIds = this.eventMessages.get(userId);
            if (!eventMessageIds || !eventMessageIds.includes(reaction.message.id)) {
                return;
            }

            // Find which event this reaction corresponds to
            const messageText = reaction.message.content;
            const positionMatch = messageText.match(/\*\*(\d+\.\d+)\*\*/);
            if (!positionMatch) {
                return;
            }

            const [, positionStr] = positionMatch;
            const [rowStr, colStr] = positionStr.split('.');
            const row = parseInt(rowStr) - 1;
            const col = parseInt(colStr) - 1;
            const positionKey = `${row}-${col}`;
            const eventText = messageText.replace(/\*\*\d+\.\d+\*\*\s/, '').trim();

            if (added) {
                // User marked an event as happened
                userBingo.checkedItems.add(positionKey);
                
                // Report event to data manager for streamer confirmation
                await this.dataManager.reportEvent({
                    eventText: eventText,
                    reportedBy: {
                        userId: user.id,
                        username: user.username
                    },
                    timestamp: new Date()
                });

                // Send confirmation DM
                await user.send(`⏳ Event **"${eventText}"** gemeldet und wartet auf Bestätigung durch den Streamer.`);

            } else {
                // User unmarked an event
                userBingo.checkedItems.delete(positionKey);
                await user.send(`❌ Event **"${eventText}"** wurde abgewählt.`);
            }

            // Update the bingo card PNG
            await this.updateBingoCardPNG(user, userBingo);

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

    async updateBingoCardPNG(user, userBingo) {
        try {
            // Generate updated PNG
            const pngBuffer = await this.pngGenerator.generateQuickUpdatePNG(userBingo.card, {
                title: 'Stream Bingo',
                username: user.username,
                color: '#6366f1',
                checkedItems: userBingo.checkedItems,
                confirmedEvents: Array.from(userBingo.confirmedItems)
            });

            // Get the original card message
            const cardMessageId = this.cardMessages.get(user.id);
            if (!cardMessageId) {
                return; // No original message to update
            }

            try {
                // Try to get the message from DM channel
                const dmChannel = await user.createDM();
                const cardMessage = await dmChannel.messages.fetch(cardMessageId);
                
                // Create updated embed
                const originalEmbed = cardMessage.embeds[0];
                const updatedEmbed = new EmbedBuilder()
                    .setTitle(originalEmbed.title)
                    .setDescription(originalEmbed.description + `\n\n🔄 *Aktualisiert: ${new Date().toLocaleTimeString('de-DE')}*`)
                    .setColor(originalEmbed.color)
                    .setFooter(originalEmbed.footer)
                    .setTimestamp();

                // Update with new PNG or text
                const fileExtension = this.pngGenerator.canvasAvailable ? 'png' : 'txt';
                const fileName = `bingo-card-updated.${fileExtension}`;
                const attachment = new AttachmentBuilder(pngBuffer, { name: fileName });
                await cardMessage.edit({ 
                    embeds: [updatedEmbed], 
                    files: [attachment] 
                });

            } catch (editError) {
                console.log('⚠️ Konnte Bingo Karte nicht bearbeiten, sende neue:', editError.message);
                
                // If editing fails, send a new updated card
                const attachment = new AttachmentBuilder(pngBuffer, { name: 'bingo-card-updated.png' });
                const newMessage = await user.send({ 
                    content: '🔄 **Aktualisierte Bingo Karte:**',
                    files: [attachment] 
                });
                
                // Update stored message ID
                this.cardMessages.set(user.id, newMessage.id);
            }

        } catch (error) {
            console.error('❌ Fehler beim Aktualisieren der Bingo Karte:', error);
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
        // Update all users who have this event in their cards
        try {
            const messageConfig = this.config.getBotMessage('eventConfirmed') || {};
            
            for (const [userId, userBingo] of this.userBingos.entries()) {
                // Check if this event is in their card
                const { card } = userBingo;
                let eventFound = false;
                
                for (let row = 0; row < card.length; row++) {
                    for (let col = 0; col < card[row].length; col++) {
                        if (card[row][col] === eventData.eventText || card[row][col] === eventData.text) {
                            userBingo.confirmedItems.add(card[row][col]);
                            eventFound = true;
                        }
                    }
                }
                
                if (eventFound) {
                    try {
                        const user = await this.client.users.fetch(userId);
                        
                        // Update the bingo card PNG
                        await this.updateBingoCardPNG(user, userBingo);
                        
                        // Send confirmation message
                        const embed = new EmbedBuilder()
                            .setTitle(messageConfig.title || '✅ Event bestätigt')
                            .setDescription(`Event wurde vom Streamer bestätigt: **${eventData.eventText || eventData.text}**`)
                            .setColor(messageConfig.color || '#22c55e')
                            .setTimestamp();

                        await user.send({ embeds: [embed] });
                        
                        // Check for new bingo after confirmation
                        const hasBingo = this.checkForBingo(userBingo);
                        if (hasBingo && !userBingo.bingoAchieved) {
                            userBingo.bingoAchieved = true;
                            userBingo.bingoAchievedAt = new Date();
                            await this.notifyBingoAchieved(user, userBingo);
                        }
                        
                    } catch (userError) {
                        console.error(`❌ Konnte User ${userId} nicht benachrichtigen:`, userError);
                    }
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
