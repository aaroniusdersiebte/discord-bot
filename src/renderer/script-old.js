const { ipcRenderer } = require('electron');

class StreamBingoUI {
    constructor() {
        this.currentTab = 'decks';
        this.currentDeckId = null;
        this.decks = [];
        this.settings = {};
        
        this.init();
    }

    async init() {
        this.setupEventListeners();
        await this.loadSettings();
        await this.loadDecks();
        this.updateBotStatus();
        this.updateOBSURL();
        
        // Auto-refresh data every 5 seconds
        setInterval(() => {
            this.refreshCurrentTab();
        }, 5000);
    }

    setupEventListeners() {
        // Tab Navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                this.switchTab(e.target.dataset.tab);
            });
        });

        // Deck Management
        document.getElementById('create-deck-btn').addEventListener('click', () => {
            this.openDeckModal();
        });

        document.querySelector('.modal-close').addEventListener('click', () => {
            this.closeDeckModal();
        });

        document.getElementById('cancel-deck').addEventListener('click', () => {
            this.closeDeckModal();
        });

        document.getElementById('save-deck').addEventListener('click', () => {
            this.saveDeck();
        });

        // Settings
        document.getElementById('start-bot').addEventListener('click', () => {
            this.startDiscordBot();
        });

        document.getElementById('stop-bot').addEventListener('click', () => {
            this.stopDiscordBot();
        });

        document.getElementById('save-settings').addEventListener('click', () => {
            this.saveSettings();
        });

        document.getElementById('reset-settings').addEventListener('click', () => {
            this.resetSettings();
        });

        document.getElementById('copy-obs-url').addEventListener('click', () => {
            this.copyOBSURL();
        });

        // Modal backdrop click
        document.getElementById('deck-modal').addEventListener('click', (e) => {
            if (e.target === e.currentTarget) {
                this.closeDeckModal();
            }
        });
    }

    switchTab(tabName) {
        // Update navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

        // Update content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(`${tabName}-tab`).classList.add('active');

        this.currentTab = tabName;
        this.refreshCurrentTab();
    }

    async refreshCurrentTab() {
        switch (this.currentTab) {
            case 'decks':
                await this.loadDecks();
                break;
            case 'events':
                await this.loadPendingEvents();
                break;
            case 'wins':
                await this.loadUserBingos();
                break;
        }
    }

    // Deck Management
    async loadDecks() {
        try {
            this.showLoading();
            const response = await ipcRenderer.invoke('load-bingo-decks');
            
            if (response.success) {
                this.decks = response.decks || [];
                this.renderDecks();
            } else {
                this.showError('Fehler beim Laden der Decks: ' + response.error);
            }
        } catch (error) {
            this.showError('Fehler beim Laden der Decks: ' + error.message);
        } finally {
            this.hideLoading();
        }
    }

    renderDecks() {
        const deckList = document.getElementById('deck-list');
        
        if (this.decks.length === 0) {
            deckList.innerHTML = `
                <div class="empty-state">
                    <h3>Keine Bingo Decks vorhanden</h3>
                    <p>Erstelle dein erstes Bingo Deck, um zu beginnen.</p>
                    <button class="btn btn-primary" onclick="ui.openDeckModal()">Erstes Deck erstellen</button>
                </div>
            `;
            return;
        }

        deckList.innerHTML = this.decks.map(deck => `
            <div class="deck-card ${deck.isActive ? 'active' : ''}" data-deck-id="${deck.id}">
                <div class="deck-header">
                    <div>
                        <div class="deck-title">
                            <span class="deck-indicator" style="background-color: ${deck.color || '#6366f1'}"></span>
                            ${deck.name}
                            ${deck.isActive ? '<span style="color: #22c55e; font-size: 0.75rem;">(AKTIV)</span>' : ''}
                        </div>
                    </div>
                    <div class="deck-actions">
                        <button class="deck-btn" onclick="ui.editDeck('${deck.id}')" title="Bearbeiten">✏️</button>
                        <button class="deck-btn" onclick="ui.toggleActiveDeck('${deck.id}')" title="${deck.isActive ? 'Deaktivieren' : 'Aktivieren'}">
                            ${deck.isActive ? '⏸️' : '▶️'}
                        </button>
                        <button class="deck-btn" onclick="ui.deleteDeck('${deck.id}')" title="Löschen">🗑️</button>
                    </div>
                </div>
                <div class="deck-description">${deck.description || 'Keine Beschreibung'}</div>
                <div class="deck-stats">
                    <span>${deck.events ? deck.events.length : 0} Events</span>
                    <span>Erstellt: ${new Date(deck.createdAt || Date.now()).toLocaleDateString('de-DE')}</span>
                </div>
            </div>
        `).join('');
    }

    openDeckModal(deckId = null) {
        this.currentDeckId = deckId;
        const modal = document.getElementById('deck-modal');
        const title = document.getElementById('deck-modal-title');
        
        if (deckId) {
            const deck = this.decks.find(d => d.id === deckId);
            title.textContent = 'Deck bearbeiten';
            document.getElementById('deck-name').value = deck.name;
            document.getElementById('deck-description').value = deck.description || '';
            document.getElementById('deck-events').value = deck.events ? deck.events.join(',\\n') : '';
            document.getElementById('deck-color').value = deck.color || '#6366f1';
        } else {
            title.textContent = 'Neues Bingo Deck';
            document.getElementById('deck-name').value = '';
            document.getElementById('deck-description').value = '';
            document.getElementById('deck-events').value = '';
            document.getElementById('deck-color').value = '#6366f1';
        }
        
        modal.classList.add('show');
    }

    closeDeckModal() {
        document.getElementById('deck-modal').classList.remove('show');
        this.currentDeckId = null;
    }

    async saveDeck() {
        const name = document.getElementById('deck-name').value.trim();
        const description = document.getElementById('deck-description').value.trim();
        const eventsText = document.getElementById('deck-events').value.trim();
        const color = document.getElementById('deck-color').value;

        if (!name) {
            this.showError('Bitte gib einen Namen für das Deck ein.');
            return;
        }

        if (!eventsText) {
            this.showError('Bitte gib mindestens ein Event ein.');
            return;
        }

        // Parse events (split by comma or newline, remove empty entries)
        const events = eventsText
            .split(/[,\\n]/)
            .map(event => event.trim())
            .filter(event => event.length > 0);

        if (events.length < 3) {
            this.showError('Bitte gib mindestens 3 Events ein.');
            return;
        }

        const deckData = {
            id: this.currentDeckId || Date.now().toString(),
            name,
            description,
            events,
            color,
            createdAt: this.currentDeckId ? this.decks.find(d => d.id === this.currentDeckId)?.createdAt : Date.now(),
            updatedAt: Date.now()
        };

        try {
            this.showLoading();
            const response = await ipcRenderer.invoke('save-bingo-deck', deckData);
            
            if (response.success) {
                this.closeDeckModal();
                await this.loadDecks();
                this.showSuccess(this.currentDeckId ? 'Deck erfolgreich aktualisiert!' : 'Deck erfolgreich erstellt!');
            } else {
                this.showError('Fehler beim Speichern: ' + response.error);
            }
        } catch (error) {
            this.showError('Fehler beim Speichern: ' + error.message);
        } finally {
            this.hideLoading();
        }
    }

    async deleteDeck(deckId) {
        if (!confirm('Möchtest du dieses Deck wirklich löschen?')) {
            return;
        }

        try {
            this.showLoading();
            const response = await ipcRenderer.invoke('delete-bingo-deck', deckId);
            
            if (response.success) {
                await this.loadDecks();
                this.showSuccess('Deck erfolgreich gelöscht!');
            } else {
                this.showError('Fehler beim Löschen: ' + response.error);
            }
        } catch (error) {
            this.showError('Fehler beim Löschen: ' + error.message);
        } finally {
            this.hideLoading();
        }
    }

    editDeck(deckId) {
        this.openDeckModal(deckId);
    }

    async toggleActiveDeck(deckId) {
        try {
            this.showLoading();
            const deck = this.decks.find(d => d.id === deckId);
            const newActiveState = !deck.isActive;
            
            const response = await ipcRenderer.invoke('set-active-deck', newActiveState ? deckId : null);
            
            if (response.success) {
                await this.loadDecks();
                this.showSuccess(newActiveState ? 'Deck aktiviert!' : 'Deck deaktiviert!');
            } else {
                this.showError('Fehler beim Aktivieren/Deaktivieren: ' + response.error);
            }
        } catch (error) {
            this.showError('Fehler: ' + error.message);
        } finally {
            this.hideLoading();
        }
    }

    // Events Management
    async loadPendingEvents() {
        try {
            const response = await ipcRenderer.invoke('get-pending-events');
            
            if (response.success) {
                this.renderPendingEvents(response.events || []);
            } else {
                this.showError('Fehler beim Laden der Events: ' + response.error);
            }
        } catch (error) {
            this.showError('Fehler beim Laden der Events: ' + error.message);
        }
    }

    renderPendingEvents(events) {
        const container = document.getElementById('events-container');
        
        if (events.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <h3>Keine ausstehenden Events</h3>
                    <p>Hier erscheinen Events, die von Zuschauern als eingetreten markiert wurden.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = events.map(event => `
            <div class="event-item">
                <div class="event-header">
                    <div class="event-title">${event.text}</div>
                    <div class="event-count">${event.reportedBy.length} Meldung(en)</div>
                </div>
                <div class="event-details">
                    Gemeldet von: ${event.reportedBy.map(user => user.username).join(', ')}
                    <br>
                    Erste Meldung: ${new Date(event.firstReported).toLocaleString('de-DE')}
                </div>
                <div class="event-actions">
                    <button class="btn btn-success" onclick="ui.confirmEvent('${event.id}', true)">Bestätigen</button>
                    <button class="btn btn-danger" onclick="ui.confirmEvent('${event.id}', false)">Ablehnen</button>
                </div>
            </div>
        `).join('');
    }

    async confirmEvent(eventId, confirmed) {
        try {
            this.showLoading();
            const response = await ipcRenderer.invoke('confirm-event', { eventId, confirmed });
            
            if (response.success) {
                await this.loadPendingEvents();
                this.showSuccess(confirmed ? 'Event bestätigt!' : 'Event abgelehnt!');
            } else {
                this.showError('Fehler: ' + response.error);
            }
        } catch (error) {
            this.showError('Fehler: ' + error.message);
        } finally {
            this.hideLoading();
        }
    }

    // Bingo Wins Management
    async loadUserBingos() {
        try {
            const response = await ipcRenderer.invoke('get-user-bingos');
            
            if (response.success) {
                this.renderUserBingos(response.bingos || []);
            } else {
                this.showError('Fehler beim Laden der Bingos: ' + response.error);
            }
        } catch (error) {
            this.showError('Fehler beim Laden der Bingos: ' + error.message);
        }
    }

    renderUserBingos(bingos) {
        const container = document.getElementById('wins-container');
        
        if (bingos.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <h3>Keine Bingo Gewinne</h3>
                    <p>Hier erscheinen Zuschauer, die ein Bingo erreicht haben.</p>
                </div>
            `;
            return;
        }

        // Sort by completion time (earliest first for higher placement)
        bingos.sort((a, b) => new Date(a.completedAt) - new Date(b.completedAt));

        container.innerHTML = bingos.map((bingo, index) => {
            const placement = index + 1;
            const points = this.getPointsForPlacement(placement);
            
            return `
                <div class="win-item">
                    <div class="win-header">
                        <div class="win-title">
                            ${bingo.username} (${bingo.platform})
                            <span style="color: ${this.getPlacementColor(placement)}; font-weight: bold;">
                                ${placement}. Platz
                            </span>
                        </div>
                        <div class="event-count">${points} Punkte</div>
                    </div>
                    <div class="win-details">
                        Bingo erreicht: ${new Date(bingo.completedAt).toLocaleString('de-DE')}
                        <br>
                        Bingo Art: ${bingo.bingoType}
                        <br>
                        Platform Username: ${bingo.platformUsername}
                    </div>
                    <div class="win-actions">
                        <button class="btn btn-success" onclick="ui.confirmBingoWin('${bingo.id}', true)">Punkte vergeben</button>
                        <button class="btn btn-danger" onclick="ui.confirmBingoWin('${bingo.id}', false)">Ablehnen</button>
                    </div>
                </div>
            `;
        }).join('');
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

    getPlacementColor(placement) {
        const colors = {
            1: '#ffd700', // Gold
            2: '#c0c0c0', // Silver
            3: '#cd7f32', // Bronze
            4: '#6366f1', // Purple
            5: '#8b5cf6'  // Light Purple
        };
        return colors[placement] || '#a0a0a0';
    }

    async confirmBingoWin(bingoId, confirmed) {
        try {
            this.showLoading();
            const response = await ipcRenderer.invoke('confirm-bingo-win', { bingoId, confirmed });
            
            if (response.success) {
                await this.loadUserBingos();
                this.showSuccess(confirmed ? 'Punkte vergeben!' : 'Bingo abgelehnt!');
            } else {
                this.showError('Fehler: ' + response.error);
            }
        } catch (error) {
            this.showError('Fehler: ' + error.message);
        } finally {
            this.hideLoading();
        }
    }

    // Settings Management
    async loadSettings() {
        try {
            const response = await ipcRenderer.invoke('load-settings');
            
            if (response.success) {
                this.settings = response.settings || {};
                this.populateSettingsForm();
            }
        } catch (error) {
            console.error('Fehler beim Laden der Einstellungen:', error);
        }
    }

    populateSettingsForm() {
        // Discord Bot Settings
        document.getElementById('bot-token').value = this.settings.botToken || '';
        document.getElementById('guild-id').value = this.settings.guildId || '';
        document.getElementById('bingo-channel').value = this.settings.bingoChannelId || '';

        // Bingo Settings
        document.getElementById('bingo-size').value = this.settings.bingoSize || 5;
        document.getElementById('points-first').value = this.settings.pointsFirst || 100;
        document.getElementById('points-second').value = this.settings.pointsSecond || 75;
        document.getElementById('points-third').value = this.settings.pointsThird || 50;
        document.getElementById('points-fourth').value = this.settings.pointsFourth || 25;
        document.getElementById('points-fifth').value = this.settings.pointsFifth || 10;

        // OBS Settings
        document.getElementById('obs-port').value = this.settings.obsPort || 3000;
    }

    async saveSettings() {
        const settings = {
            botToken: document.getElementById('bot-token').value.trim(),
            guildId: document.getElementById('guild-id').value.trim(),
            bingoChannelId: document.getElementById('bingo-channel').value.trim(),
            bingoSize: parseInt(document.getElementById('bingo-size').value),
            pointsFirst: parseInt(document.getElementById('points-first').value),
            pointsSecond: parseInt(document.getElementById('points-second').value),
            pointsThird: parseInt(document.getElementById('points-third').value),
            pointsFourth: parseInt(document.getElementById('points-fourth').value),
            pointsFifth: parseInt(document.getElementById('points-fifth').value),
            obsPort: parseInt(document.getElementById('obs-port').value)
        };

        try {
            this.showLoading();
            const response = await ipcRenderer.invoke('save-settings', settings);
            
            if (response.success) {
                this.settings = settings;
                this.showSuccess('Einstellungen erfolgreich gespeichert!');
                this.updateOBSURL();
            } else {
                this.showError('Fehler beim Speichern: ' + response.error);
            }
        } catch (error) {
            this.showError('Fehler beim Speichern: ' + error.message);
        } finally {
            this.hideLoading();
        }
    }

    resetSettings() {
        if (confirm('Möchtest du alle Einstellungen zurücksetzen?')) {
            this.settings = {};
            this.populateSettingsForm();
        }
    }

    // Discord Bot Management
    async startDiscordBot() {
        const botToken = document.getElementById('bot-token').value.trim();
        const guildId = document.getElementById('guild-id').value.trim();
        const bingoChannelId = document.getElementById('bingo-channel').value.trim();

        if (!botToken) {
            this.showError('Bitte gib ein Bot Token ein.');
            return;
        }

        try {
            this.showLoading();
            const response = await ipcRenderer.invoke('start-discord-bot', {
                token: botToken,
                guildId,
                bingoChannelId,
                bingoSize: this.settings.bingoSize || 5
            });
            
            if (response.success) {
                this.showSuccess('Discord Bot erfolgreich gestartet!');
                this.updateBotStatus();
            } else {
                this.showError('Fehler beim Starten des Bots: ' + response.error);
            }
        } catch (error) {
            this.showError('Fehler beim Starten des Bots: ' + error.message);
        } finally {
            this.hideLoading();
        }
    }

    async stopDiscordBot() {
        try {
            this.showLoading();
            const response = await ipcRenderer.invoke('stop-discord-bot');
            
            if (response.success) {
                this.showSuccess('Discord Bot gestoppt!');
                this.updateBotStatus();
            } else {
                this.showError('Fehler beim Stoppen des Bots: ' + response.error);
            }
        } catch (error) {
            this.showError('Fehler beim Stoppen des Bots: ' + error.message);
        } finally {
            this.hideLoading();
        }
    }

    async updateBotStatus() {
        try {
            const status = await ipcRenderer.invoke('get-bot-status');
            const statusElement = document.getElementById('bot-status');
            
            if (status.isRunning) {
                statusElement.textContent = 'Online';
                statusElement.className = 'status-indicator online';
            } else {
                statusElement.textContent = 'Offline';
                statusElement.className = 'status-indicator offline';
            }
        } catch (error) {
            console.error('Fehler beim Aktualisieren des Bot Status:', error);
        }
    }

    // OBS Integration
    async updateOBSURL() {
        try {
            const url = await ipcRenderer.invoke('get-obs-url');
            document.getElementById('obs-url').value = url;
        } catch (error) {
            console.error('Fehler beim Abrufen der OBS URL:', error);
        }
    }

    copyOBSURL() {
        const urlInput = document.getElementById('obs-url');
        urlInput.select();
        document.execCommand('copy');
        this.showSuccess('OBS URL in die Zwischenablage kopiert!');
    }

    // UI Helpers
    showLoading() {
        document.getElementById('loading-overlay').classList.add('show');
    }

    hideLoading() {
        document.getElementById('loading-overlay').classList.remove('show');
    }

    showSuccess(message) {
        this.showNotification(message, 'success');
    }

    showError(message) {
        this.showNotification(message, 'error');
    }

    showNotification(message, type = 'info') {
        // Create notification element if it doesn't exist
        let notification = document.getElementById('notification');
        if (!notification) {
            notification = document.createElement('div');
            notification.id = 'notification';
            notification.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                padding: 1rem 1.5rem;
                border-radius: 0.5rem;
                color: white;
                font-weight: 500;
                z-index: 3000;
                opacity: 0;
                transform: translateX(100%);
                transition: all 0.3s ease;
                max-width: 400px;
            `;
            document.body.appendChild(notification);
        }

        // Set message and style based on type
        notification.textContent = message;
        if (type === 'success') {
            notification.style.background = 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)';
        } else if (type === 'error') {
            notification.style.background = 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)';
        } else {
            notification.style.background = 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)';
        }

        // Show notification
        setTimeout(() => {
            notification.style.opacity = '1';
            notification.style.transform = 'translateX(0)';
        }, 100);

        // Hide notification after 3 seconds
        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transform = 'translateX(100%)';
        }, 3000);
    }
}

// Initialize the UI when the page loads
let ui;
document.addEventListener('DOMContentLoaded', () => {
    ui = new StreamBingoUI();
});

// Make ui globally available for onclick handlers
window.ui = ui;
