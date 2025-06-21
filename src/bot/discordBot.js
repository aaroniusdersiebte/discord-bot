const { Client, GatewayIntentBits, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const fs = require('fs').promises;
const path = require('path');

class DiscordBot {
    constructor(config, dataManager, bingoGenerator) {
        this.config = config;
        this.dataManager = dataManager;
        this.bingoGenerator = bingoGenerator;
        this.client = null;
        this.isReady = false;
        this.userBingos = new Map(); // userId -> bingoData
        this.eventReactions = new Map(); // messageId -> eventData
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
            
            await this.client.login(this.config.token);
            console.log('Discord Bot erfolgreich gestartet!');
            
        } catch (error) {
            console.error('Fehler beim Starten des Discord Bots:', error);
            throw error;
        }
    }

    async stop() {
        if (this.client) {
            await this.client.destroy();
            this.client = null;
            this.isReady = false;
            console.log('Discord Bot gestoppt.');
        }
    }

    setupEventHandlers() {
        this.client.on('ready', () => {
            console.log(`Bot ist als ${this.client.user.tag} eingeloggt!`);
            this.isReady = true;
        });

        this.client.on('messageCreate', async (message) => {
            if (message.author.bot) return;
            await this.handleMessage(message);
        });

        this.client.on('messageReactionAdd', async (reaction, user) => {
            if (user.bot) return;
            await this.handleReaction(reaction, user, true);
        });

        this.client.on('messageReactionRemove', async (reaction, user) => {
            if (user.bot) return;
            await this.handleReaction(reaction, user, false);
        });

        this.client.on('error', (error) => {
            console.error('Discord Bot Fehler:', error);
        });
    }

    async handleMessage(message) {
        // Check if message is in the bingo channel (if specified)
        if (this.config.bingoChannelId && message.channel.id !== this.config.bingoChannelId) {
            return;
        }

        const content = message.content.toLowerCase().trim();

        // Bingo command
        if (content === '!bingo' || content === '/bingo') {
            await this.sendBingoCard(message);
        }

        // Bingo win claim
        if (content.startsWith('!win') || content.startsWith('/win')) {
            await this.handleBingoWin(message);
        }

        // Help command
        if (content === '!help' || content === '/help') {
            await this.sendHelp(message);
        }
    }

    async sendBingoCard(message) {
        try {
            // Get active deck
            const activeDeckResponse = await this.dataManager.getActiveDeck();
            if (!activeDeckResponse.success || !activeDeckResponse.deck) {
                await message.reply('❌ Kein aktives Bingo Deck! Der Streamer muss erst ein Deck aktivieren.');
                return;
            }

            const deck = activeDeckResponse.deck;
            const userId = message.author.id;

            // Check if user already has a bingo card
            if (this.userBingos.has(userId)) {
                await message.reply('🎯 Du hast bereits eine aktive Bingo Karte! Verwende `!win <platform> <username>` wenn du ein Bingo hast.');
                return;
            }

            // Generate bingo card
            const bingoCard = this.bingoGenerator.generateCard(deck.events, this.config.bingoSize || 5);
            
            // Store user's bingo card
            this.userBingos.set(userId, {
                userId,
                username: message.author.username,
                card: bingoCard,
                deckId: deck.id,
                deckName: deck.name,
                createdAt: new Date(),
                checkedItems: new Set()
            });

            // Send individual event messages with positions
            const eventMessages = [];
            for (let row = 0; row < bingoCard.length; row++) {
                for (let col = 0; col < bingoCard[row].length; col++) {
                    const event = bingoCard[row][col];
                    const position = `${row + 1}.${col + 1}`;
                    
                    const eventMessage = await message.channel.send(`**${position}** ${event}`);
                    await eventMessage.react('✅');
                    
                    // Store reaction mapping
                    this.eventReactions.set(eventMessage.id, {
                        userId,
                        position: { row, col },
                        event,
                        messageId: eventMessage.id
                    });

                    eventMessages.push(eventMessage);
                }
            }

            // Generate bingo card text representation
            let cardText = `\\n**${deck.name} - Bingo Karte**\\n\\n`;
            cardText += '```\\n';
            for (let row = 0; row < bingoCard.length; row++) {
                for (let col = 0; col < bingoCard[row].length; col++) {
                    const event = bingoCard[row][col];
                    cardText += `${row + 1}.${col + 1}: ${event}\\n`;
                }
            }
            cardText += '```';

            // Try to generate SVG attachment (as HTML file)
            let attachment = null;
            try {
                if (this.bingoGenerator.generateImageSVG) {
                    const svgContent = await this.bingoGenerator.generateImageSVG(bingoCard, {
                        title: deck.name,
                        username: message.author.username,
                        color: deck.color || '#6366f1'
                    });
                    const htmlContent = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Bingo Card</title><style>body{background:#1a1a1a;margin:20px;}</style></head><body>${svgContent}</body></html>`;
                    attachment = new AttachmentBuilder(Buffer.from(htmlContent), { name: 'bingo-card.html' });
                }
            } catch (error) {
                console.log('SVG generation failed, using text only:', error.message);
            }
            
            const embed = new EmbedBuilder()
                .setTitle(`🎯 Bingo Karte - ${deck.name}`)
                .setDescription(`Deine persönliche Bingo Karte, ${message.author.username}!` +
                              cardText + '\\n\\n' +
                              `📝 Reagiere mit ✅ auf die Events wenn sie passieren\\n` +
                              `🏆 Verwende \`!win <platform> <username>\` bei einem Bingo\\n` +
                              `Platform: youtube oder twitch`)
                .setColor(deck.color || '#6366f1')
                .setTimestamp();

            if (attachment) {
                await message.reply({ embeds: [embed], files: [attachment] });
            } else {
                await message.reply({ embeds: [embed] });
            }

        } catch (error) {
            console.error('Fehler beim Erstellen der Bingo Karte:', error);
            await message.reply('❌ Fehler beim Erstellen der Bingo Karte. Versuche es später nochmal.');
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
            console.error('Fehler beim Verarbeiten der Reaktion:', error);
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
            const embed = new EmbedBuilder()
                .setTitle('🎉 BINGO! 🎉')
                .setDescription(`Herzlichen Glückwunsch ${user.username}!\\n\\n` +
                              `Du hast ein Bingo erreicht: **${userBingo.bingoType}**\\n\\n` +
                              `Um deine Punkte zu erhalten, schreibe:\\n` +
                              `\`!win <platform> <username>\`\\n\\n` +
                              `Beispiele:\\n` +
                              `\`!win youtube MeinYouTubeName\`\\n` +
                              `\`!win twitch MeinTwitchName\``)
                .setColor('#FFD700')
                .setThumbnail(user.displayAvatarURL())
                .setTimestamp();

            const channel = await this.client.channels.fetch(this.config.bingoChannelId || user.dmChannel?.id);
            if (channel) {
                await channel.send({ content: `<@${user.id}>`, embeds: [embed] });
            }

        } catch (error) {
            console.error('Fehler beim Senden der Bingo Nachricht:', error);
        }
    }

    async handleBingoWin(message) {
        try {
            const args = message.content.split(' ');
            if (args.length < 3) {
                await message.reply('❌ Verwendung: `!win <platform> <username>`\\n' +
                                  'Beispiel: `!win youtube MeinName` oder `!win twitch MeinName`');
                return;
            }

            const platform = args[1].toLowerCase();
            const platformUsername = args.slice(2).join(' ');

            if (!['youtube', 'twitch'].includes(platform)) {
                await message.reply('❌ Platform muss "youtube" oder "twitch" sein.');
                return;
            }

            const userId = message.author.id;
            const userBingo = this.userBingos.get(userId);

            if (!userBingo) {
                await message.reply('❌ Du hast keine aktive Bingo Karte! Verwende `!bingo` um eine zu erhalten.');
                return;
            }

            if (!userBingo.bingoAchieved) {
                await message.reply('❌ Du hast noch kein Bingo erreicht! Markiere zuerst Events mit ✅.');
                return;
            }

            if (userBingo.winClaimed) {
                await message.reply('❌ Du hast bereits einen Gewinn für diese Karte eingefordert.');
                return;
            }

            // Mark win as claimed
            userBingo.winClaimed = true;
            userBingo.platform = platform;
            userBingo.platformUsername = platformUsername;

            // Submit win to data manager
            await this.dataManager.submitBingoWin({
                userId,
                username: message.author.username,
                platform,
                platformUsername,
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
                              `Username: ${platformUsername}\\n` +
                              `Bingo Art: ${userBingo.bingoType}`)
                .setColor('#22c55e')
                .setTimestamp();

            await message.reply({ embeds: [embed] });

        } catch (error) {
            console.error('Fehler beim Verarbeiten des Bingo Gewinns:', error);
            await message.reply('❌ Fehler beim Einreichen des Gewinns. Versuche es später nochmal.');
        }
    }

    async sendHelp(message) {
        const embed = new EmbedBuilder()
            .setTitle('🎯 Stream Bingo Bot - Hilfe')
            .setDescription('Befehle für das Stream Bingo System:')
            .addFields(
                { name: '!bingo', value: 'Erhalte eine neue Bingo Karte', inline: true },
                { name: '!win <platform> <username>', value: 'Fordere Punkte für dein Bingo ein', inline: true },
                { name: '!help', value: 'Zeige diese Hilfe an', inline: true },
                { name: 'Wie spiele ich?', value: '1. Verwende `!bingo` um eine Karte zu erhalten\\n2. Reagiere mit ✅ auf Events wenn sie passieren\\n3. Bei einem Bingo verwende `!win <platform> <username>`', inline: false },
                { name: 'Beispiele:', value: '`!win youtube MeinYouTubeName`\\n`!win twitch MeinTwitchName`', inline: false }
            )
            .setColor('#6366f1')
            .setTimestamp();

        await message.reply({ embeds: [embed] });
    }

    async processEventConfirmation(eventData) {
        // Update all users who have this event checked
        try {
            // Find all users who have this event marked
            for (const [userId, userBingo] of this.userBingos.entries()) {
                // Find the event in their card and update the user
                await this.updateUserBingoCard(userId, eventData);
            }
        } catch (error) {
            console.error('Fehler beim Verarbeiten der Event Bestätigung:', error);
        }
    }

    async updateUserBingoCard(userId, confirmedEvent) {
        try {
            const userBingo = this.userBingos.get(userId);
            if (!userBingo) return;

            // Send text update to user about confirmed event
            const user = await this.client.users.fetch(userId);
            if (user) {
                const embed = new EmbedBuilder()
                    .setTitle('🔄 Event bestätigt!')
                    .setDescription(`Event wurde vom Streamer bestätigt: **${confirmedEvent.eventText || confirmedEvent.text}**`)
                    .setColor('#22c55e')
                    .setTimestamp();

                await user.send({ embeds: [embed] });
            }

        } catch (error) {
            console.error('Fehler beim Aktualisieren der Bingo Karte:', error);
        }
    }

    async processBingoWin(bingoData) {
        try {
            const user = await this.client.users.fetch(bingoData.userId);
            if (user) {
                const embed = new EmbedBuilder()
                    .setTitle('🎉 Bingo Gewinn bestätigt!')
                    .setDescription(`Dein Bingo Gewinn wurde bestätigt und die Punkte wurden vergeben!\\n\\n` +
                                  `**Platzierung:** ${bingoData.placement}\\n` +
                                  `**Punkte:** ${bingoData.points}`)
                    .setColor('#FFD700')
                    .setTimestamp();

                await user.send({ embeds: [embed] });
            }

            // Also announce in the bingo channel
            if (this.config.bingoChannelId) {
                const channel = await this.client.channels.fetch(this.config.bingoChannelId);
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
            console.error('Fehler beim Verarbeiten des Bingo Gewinns:', error);
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

module.exports = DiscordBot;
