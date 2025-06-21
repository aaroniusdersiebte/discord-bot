const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

// Import new modular components
const ConfigManager = require('../config/configManager');
const DiscordBotV2 = require('../bot/discordBotV2');
const DataManager = require('../data/dataManager');
const BingoGenerator = require('../utils/bingoGeneratorSVG');
const OBSServer = require('../utils/obsServer');

class StreamBingoAppV2 {
    constructor() {
        this.mainWindow = null;
        this.configManager = new ConfigManager();
        this.discordBot = null;
        this.dataManager = new DataManager();
        this.bingoGenerator = new BingoGenerator();
        this.obsServer = new OBSServer();
        this.isDev = process.argv.includes('--dev');
        
        this.initializeApp();
    }

    initializeApp() {
        app.whenReady().then(() => {
            this.createWindow();
            this.setupIPC();
            this.startOBSServer();
            this.checkConfiguration();
        });

        app.on('window-all-closed', () => {
            if (process.platform !== 'darwin') {
                this.cleanup();
                app.quit();
            }
        });

        app.on('activate', () => {
            if (BrowserWindow.getAllWindows().length === 0) {
                this.createWindow();
            }
        });
    }

    createWindow() {
        this.mainWindow = new BrowserWindow({
            width: 1400,
            height: 900,
            minWidth: 1000,
            minHeight: 700,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false,
                enableRemoteModule: true
            },
            icon: path.join(__dirname, '../../assets/icon.png'),
            titleBarStyle: 'default',
            backgroundColor: '#111827',
            show: false,
            title: `Stream Bingo Bot v${this.configManager.get('APP_VERSION')}`
        });

        // Load the new optimized interface
        this.mainWindow.loadFile(path.join(__dirname, '../renderer/index-v2.html'));

        // Show window when ready
        this.mainWindow.once('ready-to-show', () => {
            this.mainWindow.show();
            if (this.isDev) {
                this.mainWindow.webContents.openDevTools();
            }
        });

        this.mainWindow.on('closed', () => {
            this.mainWindow = null;
        });
    }

    checkConfiguration() {
        if (!this.configManager.isValid()) {
            console.log('⚠️ Configuration incomplete. Missing fields:', this.configManager.getMissingFields());
            this.sendToRenderer('config-incomplete', this.configManager.getMissingFields());
        }
    }

    setupIPC() {
        // Configuration Management
        ipcMain.handle('get-config', () => {
            return {
                discord: this.configManager.getDiscordConfig(),
                obs: this.configManager.getOBSConfig(),
                botSettings: this.configManager.get('BOT_SETTINGS'),
                pointsSystem: this.configManager.get('POINTS_SYSTEM'),
                isValid: this.configManager.isValid(),
                missingFields: this.configManager.getMissingFields()
            };
        });

        ipcMain.handle('save-config', async (event, configData) => {
            try {
                // Update configuration
                Object.keys(configData).forEach(key => {
                    this.configManager.set(key, configData[key]);
                });

                // Save configuration
                const saved = this.configManager.save();
                
                if (saved) {
                    this.sendToRenderer('config-saved');
                    return { success: true };
                } else {
                    return { success: false, error: 'Failed to save configuration' };
                }
            } catch (error) {
                console.error('Error saving configuration:', error);
                return { success: false, error: error.message };
            }
        });

        ipcMain.handle('update-bot-message', async (event, messageKey, newMessage) => {
            const updated = this.configManager.updateBotMessage(messageKey, newMessage);
            return { success: updated };
        });

        ipcMain.handle('get-bot-message', (event, messageKey) => {
            return this.configManager.getBotMessage(messageKey);
        });

        // Discord Bot Controls V2
        ipcMain.handle('start-discord-bot-v2', async () => {
            try {
                if (!this.configManager.isValid()) {
                    return { 
                        success: false, 
                        error: 'Configuration incomplete. Please configure Discord settings first.' 
                    };
                }

                if (this.discordBot) {
                    await this.discordBot.stop();
                }

                this.discordBot = new DiscordBotV2(
                    this.configManager, 
                    this.dataManager, 
                    this.bingoGenerator
                );
                
                await this.discordBot.start();
                this.sendToRenderer('bot-status-changed', true);
                return { success: true };
            } catch (error) {
                console.error('Error starting Discord bot:', error);
                return { success: false, error: error.message };
            }
        });

        ipcMain.handle('stop-discord-bot-v2', async () => {
            try {
                if (this.discordBot) {
                    await this.discordBot.stop();
                    this.discordBot = null;
                }
                this.sendToRenderer('bot-status-changed', false);
                return { success: true };
            } catch (error) {
                console.error('Error stopping Discord bot:', error);
                return { success: false, error: error.message };
            }
        });

        ipcMain.handle('get-bot-status-v2', () => {
            return {
                isRunning: this.discordBot && this.discordBot.isReady,
                connectedGuilds: this.discordBot ? this.discordBot.getConnectedGuilds() : [],
                userCount: this.discordBot ? this.discordBot.userBingos.size : 0
            };
        });

        // Data Management (Enhanced)
        ipcMain.handle('save-bingo-deck', async (event, deck) => {
            return await this.dataManager.saveBingoDeck(deck);
        });

        ipcMain.handle('load-bingo-decks', async () => {
            return await this.dataManager.loadBingoDecks();
        });

        ipcMain.handle('delete-bingo-deck', async (event, deckId) => {
            return await this.dataManager.deleteBingoDeck(deckId);
        });

        ipcMain.handle('set-active-deck', async (event, deckId) => {
            return await this.dataManager.setActiveDeck(deckId);
        });

        ipcMain.handle('get-active-deck', async () => {
            return await this.dataManager.getActiveDeck();
        });

        ipcMain.handle('get-deck', async (event, deckId) => {
            return await this.dataManager.getDeck(deckId);
        });

        // Enhanced Event Management
        ipcMain.handle('confirm-event', async (event, eventData) => {
            try {
                const result = await this.dataManager.confirmEvent(eventData);
                if (this.discordBot) {
                    await this.discordBot.processEventConfirmation(eventData);
                }
                this.obsServer.notifyEventConfirmed(eventData);
                this.sendToRenderer('event-confirmed', eventData);
                return result;
            } catch (error) {
                return { success: false, error: error.message };
            }
        });

        ipcMain.handle('get-pending-events', async () => {
            return await this.dataManager.getPendingEvents();
        });

        ipcMain.handle('get-user-bingos', async () => {
            return await this.dataManager.getUserBingos();
        });

        ipcMain.handle('confirm-bingo-win', async (event, bingoData) => {
            try {
                const result = await this.dataManager.confirmBingoWin(bingoData);
                if (this.discordBot) {
                    await this.discordBot.processBingoWin(bingoData);
                }
                this.obsServer.notifyBingoWin(bingoData);
                this.sendToRenderer('bingo-win-confirmed', bingoData);
                return result;
            } catch (error) {
                return { success: false, error: error.message };
            }
        });

        ipcMain.handle('get-leaderboard', async (event, limit = 10) => {
            return await this.dataManager.getLeaderboard(limit);
        });

        ipcMain.handle('get-statistics', async () => {
            return await this.dataManager.getStatistics();
        });

        // Workflow Management
        ipcMain.handle('get-workflows', () => {
            return this.getDefaultWorkflows();
        });

        ipcMain.handle('save-workflow', async (event, workflowData) => {
            try {
                // Save workflow configuration
                const workflowConfig = {
                    id: workflowData.id,
                    name: workflowData.name,
                    steps: workflowData.steps,
                    messages: workflowData.messages
                };

                // Update bot messages if workflow contains message updates
                if (workflowData.messages) {
                    Object.keys(workflowData.messages).forEach(key => {
                        this.configManager.updateBotMessage(key, workflowData.messages[key]);
                    });
                }

                return { success: true };
            } catch (error) {
                return { success: false, error: error.message };
            }
        });

        // File Operations
        ipcMain.handle('select-folder', async () => {
            const result = await dialog.showOpenDialog(this.mainWindow, {
                properties: ['openDirectory']
            });
            return result.filePaths[0];
        });

        ipcMain.handle('export-data', async (event, exportType) => {
            try {
                const result = await dialog.showSaveDialog(this.mainWindow, {
                    defaultPath: `stream-bingo-${exportType}-${Date.now()}.json`,
                    filters: [{ name: 'JSON Files', extensions: ['json'] }]
                });

                if (!result.canceled) {
                    let dataToExport = {};
                    
                    switch (exportType) {
                        case 'config':
                            dataToExport = this.configManager.config;
                            break;
                        case 'decks':
                            const decksResponse = await this.dataManager.loadBingoDecks();
                            dataToExport = decksResponse.decks || [];
                            break;
                        case 'all':
                            const allDecksResponse = await this.dataManager.loadBingoDecks();
                            dataToExport = {
                                config: this.configManager.config,
                                decks: allDecksResponse.decks || [],
                                timestamp: new Date().toISOString()
                            };
                            break;
                    }

                    fs.writeFileSync(result.filePath, JSON.stringify(dataToExport, null, 2));
                    return { success: true, path: result.filePath };
                }
                return { success: false, error: 'Export cancelled' };
            } catch (error) {
                return { success: false, error: error.message };
            }
        });

        // OBS Integration
        ipcMain.handle('get-obs-url', () => {
            return this.obsServer.getURL();
        });

        ipcMain.handle('get-obs-status', () => {
            return {
                isRunning: this.obsServer.isRunning,
                port: this.configManager.get('OBS_SERVER_PORT'),
                url: this.obsServer.getURL()
            };
        });
    }

    getDefaultWorkflows() {
        return [
            {
                id: 'bingo-card',
                name: 'Bingo Karte erstellen',
                description: 'Was passiert wenn ein User /bingo verwendet',
                steps: [
                    {
                        type: 'check',
                        description: 'Prüfe ob User bereits eine Karte hat',
                        action: 'check-existing-card'
                    },
                    {
                        type: 'generate',
                        description: 'Generiere neue Bingo Karte',
                        action: 'generate-card'
                    },
                    {
                        type: 'send',
                        description: 'Sende Karte an User',
                        action: 'send-card-message'
                    },
                    {
                        type: 'create',
                        description: 'Erstelle Event-Nachrichten mit Reaktionen',
                        action: 'create-event-messages'
                    }
                ],
                messages: {
                    'bingoCardGenerated.title': '🎯 Deine Bingo Karte ist bereit!',
                    'bingoCardGenerated.description': 'Reagiere mit ✅ auf Events wenn sie passieren',
                    'bingoCardGenerated.color': '#6366f1'
                }
            },
            {
                id: 'bingo-win',
                name: 'Bingo Gewinn',
                description: 'Was passiert wenn ein User /win verwendet',
                steps: [
                    {
                        type: 'check',
                        description: 'Prüfe ob User ein Bingo hat',
                        action: 'check-bingo-status'
                    },
                    {
                        type: 'submit',
                        description: 'Reiche Gewinn zur Bestätigung ein',
                        action: 'submit-win'
                    },
                    {
                        type: 'notify',
                        description: 'Benachrichtige Streamer',
                        action: 'notify-streamer'
                    }
                ],
                messages: {
                    'bingoAchieved.title': '🎉 BINGO! 🎉',
                    'bingoAchieved.description': 'Herzlichen Glückwunsch! Du hast ein Bingo erreicht!',
                    'winConfirmed.title': '🏆 Gewinn bestätigt!',
                    'winConfirmed.description': 'Deine Punkte wurden vergeben'
                }
            },
            {
                id: 'event-confirm',
                name: 'Event bestätigen',
                description: 'Was passiert wenn du ein Event bestätigst',
                steps: [
                    {
                        type: 'update',
                        description: 'Aktualisiere alle User-Karten',
                        action: 'update-user-cards'
                    },
                    {
                        type: 'notify',
                        description: 'Benachrichtige betroffene User',
                        action: 'notify-users'
                    },
                    {
                        type: 'check',
                        description: 'Prüfe auf neue Bingos',
                        action: 'check-new-bingos'
                    }
                ],
                messages: {
                    'eventConfirmed.title': '✅ Event bestätigt',
                    'eventConfirmed.description': 'Das Event wurde vom Streamer bestätigt',
                    'eventConfirmed.color': '#22c55e'
                }
            }
        ];
    }

    startOBSServer() {
        try {
            const obsConfig = this.configManager.getOBSConfig();
            this.obsServer.start(obsConfig.port);
            console.log(`✅ OBS Server started on port ${obsConfig.port}`);
        } catch (error) {
            console.error('❌ Failed to start OBS server:', error);
        }
    }

    sendToRenderer(event, data = null) {
        if (this.mainWindow && this.mainWindow.webContents) {
            this.mainWindow.webContents.send(event, data);
        }
    }

    cleanup() {
        if (this.discordBot) {
            this.discordBot.stop();
        }
        if (this.obsServer) {
            this.obsServer.stop();
        }
        // Save configuration on exit
        this.configManager.save();
    }
}

// Create global reference to prevent garbage collection
let streamBingoApp;

// Start the application
app.on('ready', () => {
    streamBingoApp = new StreamBingoAppV2();
});

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        // Someone tried to run a second instance, focus our window instead
        if (streamBingoApp && streamBingoApp.mainWindow) {
            if (streamBingoApp.mainWindow.isMinimized()) {
                streamBingoApp.mainWindow.restore();
            }
            streamBingoApp.mainWindow.focus();
        }
    });
}

module.exports = StreamBingoAppV2;
