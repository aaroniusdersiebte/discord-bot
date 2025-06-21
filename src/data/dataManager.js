const fs = require('fs').promises;
const path = require('path');
const { app } = require('electron');

class DataManager {
    constructor() {
        // Use Electron's userData directory for persistent storage
        this.dataDir = app ? app.getPath('userData') : path.join(__dirname, '../../data');
        this.ensureDataDirectory();
        
        // Data stores
        this.decks = new Map();
        this.activeDeckId = null;
        this.activeAddonDecks = new Set(); // For addon decks (multiple can be active)
        this.settings = {};
        this.pendingEvents = new Map(); // eventId -> { text, reportedBy: [], firstReported, confirmed }
        this.userBingos = new Map(); // bingoId -> bingoData
        this.eventHistory = [];
        
        this.loadAllData();
    }

    async ensureDataDirectory() {
        try {
            await fs.access(this.dataDir);
        } catch {
            await fs.mkdir(this.dataDir, { recursive: true });
        }
    }

    async loadAllData() {
        try {
            await this.loadBingoDecks();
            await this.loadSettings();
            await this.loadPendingEvents();
            await this.loadUserBingos();
        } catch (error) {
            console.error('Fehler beim Laden der Daten:', error);
        }
    }

    // Bingo Decks Management
    async saveBingoDeck(deckData) {
        try {
            this.decks.set(deckData.id, deckData);
            await this.saveDecksToFile();
            return { success: true };
        } catch (error) {
            console.error('Fehler beim Speichern des Decks:', error);
            return { success: false, error: error.message };
        }
    }

    async loadBingoDecks() {
        try {
            const filePath = path.join(this.dataDir, 'decks.json');
            
            try {
                const data = await fs.readFile(filePath, 'utf8');
                const decksData = JSON.parse(data);
                
                this.decks.clear();
                if (decksData.decks) {
                    decksData.decks.forEach(deck => {
                        this.decks.set(deck.id, deck);
                    });
                }
                
                this.activeDeckId = decksData.activeDeckId || null;
                this.activeAddonDecks = new Set(decksData.activeAddonDecks || []);
                
                return { 
                    success: true, 
                    decks: Array.from(this.decks.values()).map(deck => ({
                        ...deck,
                        isActive: deck.type === 'addon' ? 
                            this.activeAddonDecks.has(deck.id) : 
                            deck.id === this.activeDeckId
                    }))
                };
            } catch (fileError) {
                // File doesn't exist, return empty
                return { success: true, decks: [] };
            }
        } catch (error) {
            console.error('Fehler beim Laden der Decks:', error);
            return { success: false, error: error.message, decks: [] };
        }
    }

    async saveDecksToFile() {
        const filePath = path.join(this.dataDir, 'decks.json');
        const data = {
            decks: Array.from(this.decks.values()),
            activeDeckId: this.activeDeckId,
            activeAddonDecks: Array.from(this.activeAddonDecks),
            lastUpdated: new Date().toISOString()
        };
        
        await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
    }

    async deleteBingoDeck(deckId) {
        try {
            if (!this.decks.has(deckId)) {
                return { success: false, error: 'Deck nicht gefunden' };
            }

            this.decks.delete(deckId);
            
            // If this was the active deck, deactivate it
            if (this.activeDeckId === deckId) {
                this.activeDeckId = null;
            }
            
            // Also remove from active addon decks if present
            this.activeAddonDecks.delete(deckId);
            
            await this.saveDecksToFile();
            return { success: true };
        } catch (error) {
            console.error('Fehler beim Löschen des Decks:', error);
            return { success: false, error: error.message };
        }
    }

    async setActiveDeck(deckId) {
        try {
            if (deckId && !this.decks.has(deckId)) {
                return { success: false, error: 'Deck nicht gefunden' };
            }

            const deck = this.decks.get(deckId);
            
            if (deck.type === 'addon') {
                // For addon decks, toggle their active state
                if (this.activeAddonDecks.has(deckId)) {
                    this.activeAddonDecks.delete(deckId);
                } else {
                    this.activeAddonDecks.add(deckId);
                }
            } else {
                // For normal decks, only one can be active
                this.activeDeckId = deckId === this.activeDeckId ? null : deckId;
            }

            await this.saveDecksToFile();
            return { success: true };
        } catch (error) {
            console.error('Fehler beim Setzen des aktiven Decks:', error);
            return { success: false, error: error.message };
        }
    }

    async getActiveDeck() {
        try {
            if (!this.activeDeckId || !this.decks.has(this.activeDeckId)) {
                return { success: false, deck: null };
            }

            return { 
                success: true, 
                deck: this.decks.get(this.activeDeckId) 
            };
        } catch (error) {
            console.error('Fehler beim Abrufen des aktiven Decks:', error);
            return { success: false, error: error.message, deck: null };
        }
    }

    async getAllActiveDecks() {
        try {
            const activeDecks = [];
            
            // Add main active deck
            if (this.activeDeckId && this.decks.has(this.activeDeckId)) {
                activeDecks.push(this.decks.get(this.activeDeckId));
            }
            
            // Add all active addon decks
            for (const addonDeckId of this.activeAddonDecks) {
                if (this.decks.has(addonDeckId)) {
                    activeDecks.push(this.decks.get(addonDeckId));
                }
            }
            
            return {
                success: true,
                decks: activeDecks,
                totalEvents: activeDecks.reduce((total, deck) => total + (deck.events?.length || 0), 0)
            };
        } catch (error) {
            console.error('Fehler beim Abrufen der aktiven Decks:', error);
            return { success: false, error: error.message, decks: [] };
        }
    }

    // Settings Management
    async saveSettings(settingsData) {
        try {
            this.settings = { ...settingsData };
            
            const filePath = path.join(this.dataDir, 'settings.json');
            await fs.writeFile(filePath, JSON.stringify(this.settings, null, 2), 'utf8');
            
            return { success: true };
        } catch (error) {
            console.error('Fehler beim Speichern der Einstellungen:', error);
            return { success: false, error: error.message };
        }
    }

    async loadSettings() {
        try {
            const filePath = path.join(this.dataDir, 'settings.json');
            
            try {
                const data = await fs.readFile(filePath, 'utf8');
                this.settings = JSON.parse(data);
            } catch (fileError) {
                // File doesn't exist, use defaults
                this.settings = {
                    bingoSize: 5,
                    pointsFirst: 100,
                    pointsSecond: 75,
                    pointsThird: 50,
                    pointsFourth: 25,
                    pointsFifth: 10,
                    obsPort: 3000
                };
            }
            
            return { success: true, settings: this.settings };
        } catch (error) {
            console.error('Fehler beim Laden der Einstellungen:', error);
            return { success: false, error: error.message, settings: {} };
        }
    }

    // Event Management
    async reportEvent(eventData) {
        try {
            const eventId = this.generateEventId(eventData.eventText);
            
            if (!this.pendingEvents.has(eventId)) {
                this.pendingEvents.set(eventId, {
                    id: eventId,
                    text: eventData.eventText,
                    reportedBy: [],
                    firstReported: eventData.timestamp,
                    confirmed: false
                });
            }

            const event = this.pendingEvents.get(eventId);
            
            // Add user to reporters if not already added
            const userAlreadyReported = event.reportedBy.some(
                reporter => reporter.userId === eventData.reportedBy.userId
            );
            
            if (!userAlreadyReported) {
                event.reportedBy.push(eventData.reportedBy);
            }

            await this.savePendingEventsToFile();
            return { success: true };
        } catch (error) {
            console.error('Fehler beim Melden des Events:', error);
            return { success: false, error: error.message };
        }
    }

    async confirmEvent(eventData) {
        try {
            const event = this.pendingEvents.get(eventData.eventId);
            if (!event) {
                return { success: false, error: 'Event nicht gefunden' };
            }

            if (eventData.confirmed) {
                // Add to event history
                this.eventHistory.push({
                    ...event,
                    confirmedAt: new Date(),
                    confirmedBy: 'streamer'
                });

                // Save to event history file
                await this.saveEventHistoryToFile();
            }

            // Remove from pending events
            this.pendingEvents.delete(eventData.eventId);
            await this.savePendingEventsToFile();

            return { success: true, event: event };
        } catch (error) {
            console.error('Fehler beim Bestätigen des Events:', error);
            return { success: false, error: error.message };
        }
    }

    async getPendingEvents() {
        try {
            const events = Array.from(this.pendingEvents.values());
            return { success: true, events };
        } catch (error) {
            console.error('Fehler beim Abrufen der ausstehenden Events:', error);
            return { success: false, error: error.message, events: [] };
        }
    }

    async loadPendingEvents() {
        try {
            const filePath = path.join(this.dataDir, 'pending-events.json');
            
            try {
                const data = await fs.readFile(filePath, 'utf8');
                const eventsData = JSON.parse(data);
                
                this.pendingEvents.clear();
                if (eventsData.events) {
                    eventsData.events.forEach(event => {
                        this.pendingEvents.set(event.id, event);
                    });
                }
            } catch (fileError) {
                // File doesn't exist, start with empty map
            }
        } catch (error) {
            console.error('Fehler beim Laden der ausstehenden Events:', error);
        }
    }

    async savePendingEventsToFile() {
        const filePath = path.join(this.dataDir, 'pending-events.json');
        const data = {
            events: Array.from(this.pendingEvents.values()),
            lastUpdated: new Date().toISOString()
        };
        
        await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
    }

    async saveEventHistoryToFile() {
        const filePath = path.join(this.dataDir, 'event-history.json');
        const data = {
            events: this.eventHistory,
            lastUpdated: new Date().toISOString()
        };
        
        await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
    }

    // Bingo Wins Management
    async submitBingoWin(bingoData) {
        try {
            const bingoId = this.generateBingoId(bingoData.userId, bingoData.submittedAt);
            
            this.userBingos.set(bingoId, {
                id: bingoId,
                ...bingoData,
                status: 'pending' // pending, confirmed, rejected
            });

            await this.saveUserBingosToFile();
            return { success: true, bingoId };
        } catch (error) {
            console.error('Fehler beim Einreichen des Bingo Gewinns:', error);
            return { success: false, error: error.message };
        }
    }

    async confirmBingoWin(bingoData) {
        try {
            const bingo = this.userBingos.get(bingoData.bingoId);
            if (!bingo) {
                return { success: false, error: 'Bingo nicht gefunden' };
            }

            if (bingoData.confirmed) {
                // Calculate placement and points
                const confirmedBingos = Array.from(this.userBingos.values())
                    .filter(b => b.status === 'confirmed')
                    .sort((a, b) => new Date(a.completedAt) - new Date(b.completedAt));

                const placement = confirmedBingos.length + 1;
                const points = this.getPointsForPlacement(placement);

                bingo.status = 'confirmed';
                bingo.placement = placement;
                bingo.points = points;
                bingo.confirmedAt = new Date();

                // TODO: Here you would integrate with your points system
                // await this.updatePointsSystem(bingo);

            } else {
                bingo.status = 'rejected';
                bingo.rejectedAt = new Date();
            }

            await this.saveUserBingosToFile();
            return { success: true, bingo };
        } catch (error) {
            console.error('Fehler beim Bestätigen des Bingo Gewinns:', error);
            return { success: false, error: error.message };
        }
    }

    async getUserBingos() {
        try {
            const bingos = Array.from(this.userBingos.values())
                .filter(bingo => bingo.status === 'pending')
                .sort((a, b) => new Date(a.completedAt) - new Date(b.completedAt));
                
            return { success: true, bingos };
        } catch (error) {
            console.error('Fehler beim Abrufen der Bingo Gewinne:', error);
            return { success: false, error: error.message, bingos: [] };
        }
    }

    async loadUserBingos() {
        try {
            const filePath = path.join(this.dataDir, 'user-bingos.json');
            
            try {
                const data = await fs.readFile(filePath, 'utf8');
                const bingosData = JSON.parse(data);
                
                this.userBingos.clear();
                if (bingosData.bingos) {
                    bingosData.bingos.forEach(bingo => {
                        this.userBingos.set(bingo.id, bingo);
                    });
                }
            } catch (fileError) {
                // File doesn't exist, start with empty map
            }
        } catch (error) {
            console.error('Fehler beim Laden der Bingo Gewinne:', error);
        }
    }

    async saveUserBingosToFile() {
        const filePath = path.join(this.dataDir, 'user-bingos.json');
        const data = {
            bingos: Array.from(this.userBingos.values()),
            lastUpdated: new Date().toISOString()
        };
        
        await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
    }

    // Helper Methods
    generateEventId(eventText) {
        return eventText.toLowerCase()
            .replace(/[^a-z0-9]/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '');
    }

    generateBingoId(userId, timestamp) {
        return `${userId}-${new Date(timestamp).getTime()}`;
    }

    getPointsForPlacement(placement) {
        const pointsMap = {
            1: this.settings.pointsFirst || 100,
            2: this.settings.pointsSecond || 75,
            3: this.settings.pointsThird || 50,
            4: this.settings.pointsFourth || 25,
            5: this.settings.pointsFifth || 10
        };
        return pointsMap[placement] || 0;
    }

    // Export/Import functionality for backups
    async exportData() {
        try {
            const exportData = {
                decks: Array.from(this.decks.values()),
                activeDeckId: this.activeDeckId,
                settings: this.settings,
                pendingEvents: Array.from(this.pendingEvents.values()),
                userBingos: Array.from(this.userBingos.values()),
                eventHistory: this.eventHistory,
                exportedAt: new Date().toISOString()
            };

            const filePath = path.join(this.dataDir, `backup-${Date.now()}.json`);
            await fs.writeFile(filePath, JSON.stringify(exportData, null, 2), 'utf8');
            
            return { success: true, filePath };
        } catch (error) {
            console.error('Fehler beim Exportieren der Daten:', error);
            return { success: false, error: error.message };
        }
    }

    async importData(filePath) {
        try {
            const data = await fs.readFile(filePath, 'utf8');
            const importData = JSON.parse(data);

            // Restore data
            this.decks.clear();
            if (importData.decks) {
                importData.decks.forEach(deck => {
                    this.decks.set(deck.id, deck);
                });
            }

            this.activeDeckId = importData.activeDeckId || null;
            this.settings = importData.settings || {};
            
            this.pendingEvents.clear();
            if (importData.pendingEvents) {
                importData.pendingEvents.forEach(event => {
                    this.pendingEvents.set(event.id, event);
                });
            }

            this.userBingos.clear();
            if (importData.userBingos) {
                importData.userBingos.forEach(bingo => {
                    this.userBingos.set(bingo.id, bingo);
                });
            }

            this.eventHistory = importData.eventHistory || [];

            // Save all data
            await this.saveDecksToFile();
            await this.savePendingEventsToFile();
            await this.saveUserBingosToFile();
            await this.saveEventHistoryToFile();

            return { success: true };
        } catch (error) {
            console.error('Fehler beim Importieren der Daten:', error);
            return { success: false, error: error.message };
        }
    }

    // V2 Additional Methods
    async getDeck(deckId) {
        try {
            if (!this.decks.has(deckId)) {
                return { success: false, error: 'Deck nicht gefunden' };
            }
            
            return { 
                success: true, 
                deck: this.decks.get(deckId) 
            };
        } catch (error) {
            console.error('Fehler beim Abrufen des Decks:', error);
            return { success: false, error: error.message };
        }
    }

    async getLeaderboard(limit = 10) {
        try {
            // Get all confirmed bingos and create leaderboard
            const confirmedBingos = Array.from(this.userBingos.values())
                .filter(bingo => bingo.status === 'confirmed')
                .sort((a, b) => new Date(a.completedAt) - new Date(b.completedAt));

            // Group by user and sum points
            const userPoints = new Map();
            confirmedBingos.forEach(bingo => {
                const key = `${bingo.username}-${bingo.platform || 'unknown'}`;
                if (!userPoints.has(key)) {
                    userPoints.set(key, {
                        username: bingo.username,
                        platform: bingo.platform,
                        totalPoints: 0,
                        wins: 0,
                        bestPlacement: Infinity,
                        lastWin: bingo.completedAt
                    });
                }
                
                const userData = userPoints.get(key);
                userData.totalPoints += bingo.points || 0;
                userData.wins += 1;
                userData.bestPlacement = Math.min(userData.bestPlacement, bingo.placement || Infinity);
                
                if (new Date(bingo.completedAt) > new Date(userData.lastWin)) {
                    userData.lastWin = bingo.completedAt;
                }
            });

            // Sort by total points (descending) and create leaderboard
            const leaderboard = Array.from(userPoints.values())
                .sort((a, b) => b.totalPoints - a.totalPoints)
                .slice(0, limit);

            // Statistics
            const stats = {
                totalGames: confirmedBingos.length,
                activePlayers: userPoints.size,
                todayGames: confirmedBingos.filter(bingo => {
                    const today = new Date();
                    const bingoDate = new Date(bingo.completedAt);
                    return bingoDate.toDateString() === today.toDateString();
                }).length
            };

            return { 
                success: true, 
                leaderboard, 
                stats 
            };
        } catch (error) {
            console.error('Fehler beim Abrufen der Bestenliste:', error);
            return { success: false, error: error.message, leaderboard: [] };
        }
    }

    async getStatistics() {
        try {
            const totalPlayers = new Set(
                Array.from(this.userBingos.values()).map(bingo => bingo.userId)
            ).size;
            
            const totalGames = Array.from(this.userBingos.values())
                .filter(bingo => bingo.status === 'confirmed').length;
                
            const activeDecks = this.decks.size;
            const pendingEvents = this.pendingEvents.size;
            
            // Recent activity stats
            const today = new Date();
            const todayGames = Array.from(this.userBingos.values())
                .filter(bingo => {
                    const bingoDate = new Date(bingo.completedAt);
                    return bingoDate.toDateString() === today.toDateString();
                }).length;

            const weekStart = new Date(today);
            weekStart.setDate(today.getDate() - 7);
            const weeklyGames = Array.from(this.userBingos.values())
                .filter(bingo => {
                    const bingoDate = new Date(bingo.completedAt);
                    return bingoDate >= weekStart;
                }).length;

            return {
                success: true,
                data: {
                    totalPlayers,
                    totalGames,
                    activeDecks,
                    pendingEvents,
                    todayGames,
                    weeklyGames,
                    averageEventsPerDeck: activeDecks > 0 ? 
                        Array.from(this.decks.values())
                            .reduce((sum, deck) => sum + (deck.events?.length || 0), 0) / activeDecks : 0
                }
            };
        } catch (error) {
            console.error('Fehler beim Abrufen der Statistiken:', error);
            return { success: false, error: error.message };
        }
    }
}

module.exports = DataManager;
