const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const DiscordBot = require('../bot/discordBot');
const DataManager = require('../data/dataManager');
// const BingoGenerator = require('../utils/bingoGenerator'); // Canvas version - problematic
const BingoGenerator = require('../utils/bingoGeneratorSVG'); // SVG version - no native dependencies
const OBSServer = require('../utils/obsServer');

class StreamBingoApp {
    constructor() {
        this.mainWindow = null;
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
            width: 1200,
            height: 800,
            minWidth: 800,
            minHeight: 600,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false,
                enableRemoteModule: true
            },
            icon: path.join(__dirname, '../../assets/icon.png'),
            titleBarStyle: 'default',
            backgroundColor: '#1a1a1a',
            show: false
        });

        // Load the main HTML file
        this.mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

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

    setupIPC() {
        // Discord Bot Controls
        ipcMain.handle('start-discord-bot', async (event, config) => {
            try {
                if (this.discordBot) {
                    await this.discordBot.stop();
                }
                this.discordBot = new DiscordBot(config, this.dataManager, this.bingoGenerator);
                await this.discordBot.start();
                return { success: true };
            } catch (error) {
                return { success: false, error: error.message };
            }
        });

        ipcMain.handle('stop-discord-bot', async () => {
            try {
                if (this.discordBot) {
                    await this.discordBot.stop();
                    this.discordBot = null;
                }
                return { success: true };
            } catch (error) {
                return { success: false, error: error.message };
            }
        });

        ipcMain.handle('get-bot-status', () => {
            return {
                isRunning: this.discordBot && this.discordBot.isReady,
                connectedGuilds: this.discordBot ? this.discordBot.getConnectedGuilds() : []
            };
        });

        // Data Management
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

        ipcMain.handle('save-settings', async (event, settings) => {
            return await this.dataManager.saveSettings(settings);
        });

        ipcMain.handle('load-settings', async () => {
            return await this.dataManager.loadSettings();
        });

        // Bingo Management
        ipcMain.handle('confirm-event', async (event, eventData) => {
            try {
                const result = await this.dataManager.confirmEvent(eventData);
                if (this.discordBot) {
                    await this.discordBot.processEventConfirmation(eventData);
                }
                this.obsServer.notifyEventConfirmed(eventData);
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
                return result;
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

        // OBS Integration
        ipcMain.handle('get-obs-url', () => {
            return this.obsServer.getURL();
        });
    }

    startOBSServer() {
        this.obsServer.start();
    }

    cleanup() {
        if (this.discordBot) {
            this.discordBot.stop();
        }
        if (this.obsServer) {
            this.obsServer.stop();
        }
    }
}

// Start the application
new StreamBingoApp();
