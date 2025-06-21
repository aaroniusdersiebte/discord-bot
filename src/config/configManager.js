const fs = require('fs');
const path = require('path');

class ConfigManager {
    constructor() {
        this.config = {};
        this.envPath = path.join(process.cwd(), '.env');
        this.configPath = path.join(process.cwd(), 'config.json');
        this.loadConfig();
    }

    loadConfig() {
        try {
            // Load .env file if it exists
            if (fs.existsSync(this.envPath)) {
                this.loadEnvFile();
            }

            // Load config.json for additional settings
            if (fs.existsSync(this.configPath)) {
                const configData = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
                this.config = { ...this.config, ...configData };
            }

            // Apply defaults
            this.applyDefaults();
            
        } catch (error) {
            console.error('Error loading configuration:', error);
            this.applyDefaults();
        }
    }

    loadEnvFile() {
        const envContent = fs.readFileSync(this.envPath, 'utf8');
        const lines = envContent.split('\n');
        
        lines.forEach(line => {
            line = line.trim();
            if (line && !line.startsWith('#')) {
                const [key, ...valueParts] = line.split('=');
                if (key && valueParts.length > 0) {
                    const value = valueParts.join('=').trim();
                    // Remove quotes if present
                    const cleanValue = value.replace(/^["']|["']$/g, '');
                    this.config[key] = cleanValue;
                }
            }
        });
    }

    applyDefaults() {
        const defaults = {
            DISCORD_BOT_TOKEN: '',
            DISCORD_GUILD_ID: '',
            DISCORD_BINGO_CHANNEL_ID: '',
            APP_NAME: 'Stream Bingo Bot',
            APP_VERSION: '2.0.0',
            NODE_ENV: 'production',
            OBS_SERVER_PORT: 3000,
            DATA_PATH: './data',
            BACKUP_PATH: './backups',
            LOG_LEVEL: 'info',
            ENABLE_AUTOCOMPLETE: true,
            ENABLE_SLASH_COMMANDS: true,
            ENABLE_WORKFLOW_EDITOR: true,
            ENABLE_AUTO_BACKUP: true,
            
            // Bot behavior settings
            BOT_SETTINGS: {
                bingoSize: 5,
                maxPlayersPerGame: 100,
                autoConfirmDelay: 0,
                enableEventReactions: true,
                enableDMNotifications: true,
                commandPrefix: '/',
                
                // Customizable messages
                messages: {
                    bingoCardGenerated: {
                        title: '🎯 Deine Bingo Karte ist bereit!',
                        description: 'Reagiere mit ✅ auf Events wenn sie passieren',
                        color: '#6366f1'
                    },
                    bingoAchieved: {
                        title: '🎉 BINGO! 🎉',
                        description: 'Herzlichen Glückwunsch! Du hast ein Bingo erreicht!',
                        color: '#FFD700'
                    },
                    eventConfirmed: {
                        title: '✅ Event bestätigt',
                        description: 'Das Event wurde vom Streamer bestätigt',
                        color: '#22c55e'
                    },
                    winConfirmed: {
                        title: '🏆 Gewinn bestätigt!',
                        description: 'Deine Punkte wurden vergeben',
                        color: '#FFD700'
                    },
                    errors: {
                        noDeck: '❌ Kein aktives Bingo Deck verfügbar',
                        alreadyHasCard: '🎯 Du hast bereits eine aktive Bingo Karte',
                        invalidCommand: '❌ Unbekannter Befehl. Verwende /help für Hilfe',
                        bingoGenerationFailed: '❌ Fehler beim Erstellen der Bingo Karte'
                    }
                }
            },
            
            // Points system
            POINTS_SYSTEM: {
                positions: {
                    1: 100,
                    2: 75,
                    3: 50,
                    4: 25,
                    5: 10
                },
                participation: 5,
                bonusMultiplier: 1.5
            }
        };

        // Merge defaults with existing config
        Object.keys(defaults).forEach(key => {
            if (!(key in this.config)) {
                this.config[key] = defaults[key];
            }
        });
    }

    get(key, defaultValue = null) {
        return this.config[key] !== undefined ? this.config[key] : defaultValue;
    }

    set(key, value) {
        this.config[key] = value;
    }

    save() {
        try {
            // Save non-sensitive config to config.json
            const configToSave = { ...this.config };
            // Remove sensitive data
            delete configToSave.DISCORD_BOT_TOKEN;
            delete configToSave.DISCORD_GUILD_ID;
            delete configToSave.DISCORD_BINGO_CHANNEL_ID;
            
            fs.writeFileSync(this.configPath, JSON.stringify(configToSave, null, 2));
            return true;
        } catch (error) {
            console.error('Error saving configuration:', error);
            return false;
        }
    }

    // Get Discord configuration
    getDiscordConfig() {
        return {
            token: this.get('DISCORD_BOT_TOKEN'),
            guildId: this.get('DISCORD_GUILD_ID'),
            bingoChannelId: this.get('DISCORD_BINGO_CHANNEL_ID'),
            enableSlashCommands: this.get('ENABLE_SLASH_COMMANDS'),
            enableAutocomplete: this.get('ENABLE_AUTOCOMPLETE'),
            settings: this.get('BOT_SETTINGS')
        };
    }

    // Get OBS configuration
    getOBSConfig() {
        return {
            port: parseInt(this.get('OBS_SERVER_PORT')),
            enableWebSocket: true
        };
    }

    // Update bot message
    updateBotMessage(messageKey, newMessage) {
        const botSettings = this.get('BOT_SETTINGS');
        if (botSettings && botSettings.messages) {
            const keys = messageKey.split('.');
            let target = botSettings.messages;
            
            for (let i = 0; i < keys.length - 1; i++) {
                if (!target[keys[i]]) {
                    target[keys[i]] = {};
                }
                target = target[keys[i]];
            }
            
            target[keys[keys.length - 1]] = newMessage;
            this.save();
            return true;
        }
        return false;
    }

    // Get bot message
    getBotMessage(messageKey) {
        const botSettings = this.get('BOT_SETTINGS');
        if (botSettings && botSettings.messages) {
            const keys = messageKey.split('.');
            let target = botSettings.messages;
            
            for (const key of keys) {
                if (target[key] === undefined) {
                    return null;
                }
                target = target[key];
            }
            
            return target;
        }
        return null;
    }

    // Validate configuration
    isValid() {
        const required = ['DISCORD_BOT_TOKEN'];
        return required.every(key => this.get(key));
    }

    // Get missing required fields
    getMissingFields() {
        const required = ['DISCORD_BOT_TOKEN'];
        return required.filter(key => !this.get(key));
    }
}

module.exports = ConfigManager;
