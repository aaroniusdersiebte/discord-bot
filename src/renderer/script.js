// Stream Bingo Bot V2 - Client-side JavaScript
const { ipcRenderer } = require('electron');

class StreamBingoUI {
    constructor() {
        this.currentSection = 'dashboard';
        this.botStatus = false;
        this.config = {};
        this.workflows = {};
        this.currentWorkflow = 'bingo-card';
        this.currentEvents = [];
        this.currentEditingDeck = null;
        
        this.init();
    }

    async init() {
        this.setupEventListeners();
        this.setupNavigation();
        this.setupModals();
        await this.loadConfiguration();
        await this.loadData();
        this.startPolling();
    }

    setupEventListeners() {
        // Bot control
        document.getElementById('toggleBot').addEventListener('click', () => this.toggleBot());
        
        // Settings
        document.getElementById('saveSettings').addEventListener('click', () => this.saveSettings());
        document.getElementById('exportSettings').addEventListener('click', () => this.exportData('config'));
        document.getElementById('importSettings').addEventListener('click', () => this.importSettings());

        // Workflow management
        document.getElementById('saveWorkflow').addEventListener('click', () => this.saveCurrentWorkflow());
        document.getElementById('addWorkflow').addEventListener('click', () => this.addNewWorkflow());

        // Deck management
        document.getElementById('addDeck').addEventListener('click', () => this.openDeckModal());

        // Tab switching
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.switchTab(e.target.dataset.tab));
        });

        // Workflow item selection
        document.addEventListener('click', (e) => {
            if (e.target.closest('.workflow-item')) {
                this.selectWorkflow(e.target.closest('.workflow-item').dataset.workflow);
            }
        });

        // IPC Event listeners
        ipcRenderer.on('config-saved', () => this.showNotification('Konfiguration gespeichert!', 'success'));
        ipcRenderer.on('config-incomplete', (event, missingFields) => {
            this.showNotification(`Konfiguration unvollständig: ${missingFields.join(', ')}`, 'warning');
        });
        ipcRenderer.on('bot-status-changed', (event, status) => {
            this.updateBotStatus(status);
        });
        ipcRenderer.on('event-confirmed', () => this.refreshPendingEvents());
        ipcRenderer.on('bingo-win-confirmed', () => this.refreshWinsList());
    }

    setupNavigation() {
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const section = e.target.dataset.section;
                this.showSection(section);
            });
        });
    }

    setupModals() {
        // Close modals when clicking outside or on close button
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal || e.target.classList.contains('modal-close')) {
                    this.closeModal(modal.id);
                }
            });
        });
    }

    showSection(section) {
        // Update navigation
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.section === section);
        });

        // Update sections
        document.querySelectorAll('.section').forEach(sec => {
            sec.classList.toggle('active', sec.id === section);
        });

        this.currentSection = section;

        // Load section-specific data
        switch (section) {
            case 'dashboard':
                this.loadDashboard();
                break;
            case 'workflow':
                this.loadWorkflows();
                break;
            case 'decks':
                this.loadDecks();
                break;
            case 'events':
                this.loadEvents();
                break;
            case 'settings':
                this.loadSettings();
                break;
        }
    }

    async loadConfiguration() {
        try {
            this.config = await ipcRenderer.invoke('get-config');
            this.updateConfigurationDisplay();
        } catch (error) {
            console.error('Error loading configuration:', error);
        }
    }

    updateConfigurationDisplay() {
        // Update bot status
        const tokenStatus = document.getElementById('tokenStatus');
        const guildStatus = document.getElementById('guildStatus');
        
        if (tokenStatus) {
            tokenStatus.textContent = this.config.discord.token ? 'Konfiguriert' : 'Nicht konfiguriert';
            tokenStatus.className = `info-value ${this.config.discord.token ? 'text-success' : 'text-warning'}`;
        }
        
        if (guildStatus) {
            guildStatus.textContent = this.config.discord.guildId ? 'Konfiguriert' : 'Nicht konfiguriert';
            guildStatus.className = `info-value ${this.config.discord.guildId ? 'text-success' : 'text-warning'}`;
        }

        // Update slash commands status
        const slashCommandsStatus = document.getElementById('slashCommandsStatus');
        if (slashCommandsStatus) {
            slashCommandsStatus.textContent = this.config.discord.enableSlashCommands ? 'Aktiviert' : 'Deaktiviert';
        }
    }

    async toggleBot() {
        const toggleBtn = document.getElementById('toggleBot');
        const originalText = toggleBtn.innerHTML;
        
        toggleBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Lädt...';
        toggleBtn.disabled = true;

        try {
            let result;
            if (this.botStatus) {
                result = await ipcRenderer.invoke('stop-discord-bot-v2');
            } else {
                result = await ipcRenderer.invoke('start-discord-bot-v2');
            }

            if (result.success) {
                this.botStatus = !this.botStatus;
                this.updateBotStatus(this.botStatus);
                this.showNotification(
                    this.botStatus ? 'Bot erfolgreich gestartet!' : 'Bot gestoppt!',
                    'success'
                );
            } else {
                this.showNotification(`Fehler: ${result.error}`, 'error');
            }
        } catch (error) {
            this.showNotification(`Fehler: ${error.message}`, 'error');
        } finally {
            toggleBtn.innerHTML = originalText;
            toggleBtn.disabled = false;
        }
    }

    updateBotStatus(isRunning) {
        this.botStatus = isRunning;
        
        const statusDot = document.querySelector('.status-dot');
        const statusText = document.querySelector('.status-text');
        const toggleBtn = document.getElementById('toggleBot');

        if (statusDot) {
            statusDot.className = `status-dot ${isRunning ? 'online' : 'offline'}`;
        }
        
        if (statusText) {
            statusText.textContent = isRunning ? 'Online' : 'Offline';
        }
        
        if (toggleBtn) {
            toggleBtn.innerHTML = isRunning ? 
                '<i class="fas fa-stop"></i> Bot stoppen' : 
                '<i class="fas fa-play"></i> Bot starten';
            toggleBtn.className = `btn ${isRunning ? 'btn-outline' : 'btn-primary'}`;
        }
    }

    async loadDashboard() {
        try {
            // Load bot status
            const botStatus = await ipcRenderer.invoke('get-bot-status-v2');
            this.updateBotStatus(botStatus.isRunning);

            // Load statistics
            const stats = await ipcRenderer.invoke('get-statistics');
            if (stats.success) {
                this.updateDashboardStats(stats.data);
            }

            // Load active deck
            const activeDeck = await ipcRenderer.invoke('get-active-deck');
            const activeDeckName = document.getElementById('activeDeckName');
            if (activeDeckName) {
                activeDeckName.textContent = activeDeck.success && activeDeck.deck ? 
                    activeDeck.deck.name : 'Keins ausgewählt';
            }

            // Load OBS status
            const obsStatus = await ipcRenderer.invoke('get-obs-status');
            const obsUrl = document.getElementById('obsUrl');
            if (obsUrl) {
                obsUrl.value = obsStatus.url;
            }

        } catch (error) {
            console.error('Error loading dashboard:', error);
        }
    }

    updateDashboardStats(stats) {
        const updates = {
            'totalPlayers': stats.totalPlayers || 0,
            'totalGames': stats.totalGames || 0,
            'activeDecks': stats.activeDecks || 0,
            'pendingEvents': stats.pendingEvents || 0
        };

        Object.entries(updates).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) {
                this.animateNumber(element, parseInt(element.textContent) || 0, value);
            }
        });
    }

    animateNumber(element, start, end) {
        const duration = 1000;
        const startTime = performance.now();
        
        const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            const current = Math.floor(start + (end - start) * progress);
            element.textContent = current;
            
            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };
        
        requestAnimationFrame(animate);
    }

    async loadWorkflows() {
        try {
            this.workflows = await ipcRenderer.invoke('get-workflows');
            this.renderWorkflowList();
            this.loadWorkflow(this.currentWorkflow);
        } catch (error) {
            console.error('Error loading workflows:', error);
        }
    }

    renderWorkflowList() {
        const workflowList = document.querySelector('.workflow-list');
        if (!workflowList) return;

        workflowList.innerHTML = this.workflows.map(workflow => `
            <div class="workflow-item ${workflow.id === this.currentWorkflow ? 'active' : ''}" 
                 data-workflow="${workflow.id}">
                <i class="fas fa-${this.getWorkflowIcon(workflow.id)}"></i>
                <span>${workflow.name}</span>
            </div>
        `).join('');
    }

    getWorkflowIcon(workflowId) {
        const icons = {
            'bingo-card': 'dice',
            'bingo-win': 'trophy',
            'event-confirm': 'check',
            'help-command': 'question-circle'
        };
        return icons[workflowId] || 'cog';
    }

    selectWorkflow(workflowId) {
        this.currentWorkflow = workflowId;
        document.querySelectorAll('.workflow-item').forEach(item => {
            item.classList.toggle('active', item.dataset.workflow === workflowId);
        });
        this.loadWorkflow(workflowId);
    }

    loadWorkflow(workflowId) {
        const workflow = this.workflows.find(w => w.id === workflowId);
        if (!workflow) return;

        const workflowTitle = document.getElementById('workflowTitle');
        const workflowSteps = document.getElementById('workflowSteps');

        if (workflowTitle) {
            workflowTitle.textContent = workflow.name;
        }

        if (workflowSteps) {
            workflowSteps.innerHTML = this.renderWorkflowSteps(workflow);
        }
    }

    renderWorkflowSteps(workflow) {
        const stepsHTML = workflow.steps.map((step, index) => `
            <div class="workflow-step">
                <div class="step-header">
                    <div class="step-number">${index + 1}</div>
                    <h4>${step.description}</h4>
                    <span class="step-type">${step.type}</span>
                </div>
                <div class="step-content">
                    <p>Aktion: <code>${step.action}</code></p>
                </div>
            </div>
        `).join('');

        const messagesHTML = workflow.messages ? Object.entries(workflow.messages).map(([key, value]) => `
            <div class="message-config">
                <label>${key}:</label>
                <input type="text" data-message-key="${key}" value="${value}" 
                       class="form-control message-input">
            </div>
        `).join('') : '';

        return `
            <div class="workflow-steps-container">
                <h4>Workflow Schritte:</h4>
                ${stepsHTML}
                
                ${messagesHTML ? `
                    <h4>Bot Nachrichten:</h4>
                    <div class="messages-config">
                        ${messagesHTML}
                    </div>
                ` : ''}
            </div>
        `;
    }

    async saveCurrentWorkflow() {
        try {
            const workflow = this.workflows.find(w => w.id === this.currentWorkflow);
            if (!workflow) return;

            // Collect message updates
            const messageInputs = document.querySelectorAll('.message-input');
            const messages = {};
            
            messageInputs.forEach(input => {
                const key = input.dataset.messageKey;
                messages[key] = input.value;
            });

            const workflowData = {
                id: workflow.id,
                name: workflow.name,
                steps: workflow.steps,
                messages: messages
            };

            const result = await ipcRenderer.invoke('save-workflow', workflowData);
            
            if (result.success) {
                this.showNotification('Workflow gespeichert!', 'success');
                // Update local workflow data
                workflow.messages = messages;
            } else {
                this.showNotification(`Fehler: ${result.error}`, 'error');
            }
        } catch (error) {
            this.showNotification(`Fehler: ${error.message}`, 'error');
        }
    }

    async saveSettings() {
        try {
            const settings = this.collectSettingsData();
            const result = await ipcRenderer.invoke('save-config', settings);
            
            if (result.success) {
                this.showNotification('Einstellungen gespeichert!', 'success');
                await this.loadConfiguration();
            } else {
                this.showNotification(`Fehler: ${result.error}`, 'error');
            }
        } catch (error) {
            this.showNotification(`Fehler: ${error.message}`, 'error');
        }
    }

    collectSettingsData() {
        return {
            'DISCORD_BOT_TOKEN': document.getElementById('discordToken')?.value || '',
            'DISCORD_GUILD_ID': document.getElementById('guildId')?.value || '',
            'DISCORD_BINGO_CHANNEL_ID': document.getElementById('bingoChannelId')?.value || '',
            'BOT_SETTINGS': {
                bingoSize: parseInt(document.getElementById('bingoSize')?.value) || 5,
                maxPlayersPerGame: parseInt(document.getElementById('maxPlayers')?.value) || 100,
                enableEventReactions: document.getElementById('enableReactions')?.checked || false,
                enableDMNotifications: document.getElementById('enableDMs')?.checked || false
            },
            'ENABLE_SLASH_COMMANDS': document.getElementById('enableSlashCommands')?.checked || false,
            'POINTS_SYSTEM': {
                positions: {
                    1: parseInt(document.getElementById('points1st')?.value) || 100,
                    2: parseInt(document.getElementById('points2nd')?.value) || 75,
                    3: parseInt(document.getElementById('points3rd')?.value) || 50,
                    4: parseInt(document.getElementById('points4th')?.value) || 25,
                    5: parseInt(document.getElementById('points5th')?.value) || 10
                },
                participation: parseInt(document.getElementById('pointsParticipation')?.value) || 5
            }
        };
    }

    loadSettings() {
        if (!this.config) return;

        // Discord settings
        const discordToken = document.getElementById('discordToken');
        const guildId = document.getElementById('guildId');
        const bingoChannelId = document.getElementById('bingoChannelId');

        if (discordToken) discordToken.value = this.config.discord.token || '';
        if (guildId) guildId.value = this.config.discord.guildId || '';
        if (bingoChannelId) bingoChannelId.value = this.config.discord.bingoChannelId || '';

        // Bot settings
        if (this.config.botSettings) {
            const bingoSize = document.getElementById('bingoSize');
            const maxPlayers = document.getElementById('maxPlayers');
            const enableReactions = document.getElementById('enableReactions');
            const enableDMs = document.getElementById('enableDMs');
            const enableSlashCommands = document.getElementById('enableSlashCommands');

            if (bingoSize) bingoSize.value = this.config.botSettings.bingoSize || 5;
            if (maxPlayers) maxPlayers.value = this.config.botSettings.maxPlayersPerGame || 100;
            if (enableReactions) enableReactions.checked = this.config.botSettings.enableEventReactions !== false;
            if (enableDMs) enableDMs.checked = this.config.botSettings.enableDMNotifications !== false;
            if (enableSlashCommands) enableSlashCommands.checked = this.config.discord.enableSlashCommands !== false;
        }

        // Points system
        if (this.config.pointsSystem) {
            const points = this.config.pointsSystem.positions || {};
            const participation = this.config.pointsSystem.participation || 5;

            document.getElementById('points1st').value = points[1] || 100;
            document.getElementById('points2nd').value = points[2] || 75;
            document.getElementById('points3rd').value = points[3] || 50;
            document.getElementById('points4th').value = points[4] || 25;
            document.getElementById('points5th').value = points[5] || 10;
            document.getElementById('pointsParticipation').value = participation;
        }
    }

    async loadData() {
        // Load initial data for all sections
        await this.loadConfiguration();
    }

    switchTab(tabName) {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });

        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.toggle('active', content.id === tabName);
        });

        // Load tab-specific data
        switch (tabName) {
            case 'pending':
                this.refreshPendingEvents();
                break;
            case 'wins':
                this.refreshWinsList();
                break;
            case 'leaderboard':
                this.refreshLeaderboard();
                break;
        }
    }

    async refreshPendingEvents() {
        // Implementation for loading pending events
        try {
            const events = await ipcRenderer.invoke('get-pending-events');
            // Update pending events display
            const badge = document.getElementById('pendingCount');
            if (badge) {
                badge.textContent = events.success ? events.events.length : 0;
            }
        } catch (error) {
            console.error('Error refreshing pending events:', error);
        }
    }

    async refreshWinsList() {
        // Implementation for loading wins
        try {
            const wins = await ipcRenderer.invoke('get-user-bingos');
            // Update wins display
            const badge = document.getElementById('winsCount');
            if (badge) {
                badge.textContent = wins.success ? wins.bingos.length : 0;
            }
        } catch (error) {
            console.error('Error refreshing wins:', error);
        }
    }

    async refreshLeaderboard() {
        // Implementation for loading leaderboard
        try {
            const leaderboard = await ipcRenderer.invoke('get-leaderboard', 10);
            // Update leaderboard display
        } catch (error) {
            console.error('Error refreshing leaderboard:', error);
        }
    }

    startPolling() {
        // Poll for updates every 30 seconds
        setInterval(async () => {
            if (this.currentSection === 'dashboard') {
                await this.loadDashboard();
            }
        }, 30000);
    }

    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <i class="fas fa-${this.getNotificationIcon(type)}"></i>
            <span>${message}</span>
            <button class="notification-close">&times;</button>
        `;

        // Add to page
        document.body.appendChild(notification);

        // Remove after 5 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 5000);

        // Close button handler
        notification.querySelector('.notification-close').addEventListener('click', () => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        });
    }

    getNotificationIcon(type) {
        const icons = {
            'success': 'check-circle',
            'error': 'exclamation-circle',
            'warning': 'exclamation-triangle',
            'info': 'info-circle'
        };
        return icons[type] || 'info-circle';
    }

    openModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.add('active');
        }
    }

    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('active');
        }
    }

    // Utility functions
    async exportData(type) {
        try {
            const result = await ipcRenderer.invoke('export-data', type);
            if (result.success) {
                this.showNotification(`Daten exportiert: ${result.path}`, 'success');
            } else {
                this.showNotification(`Export fehlgeschlagen: ${result.error}`, 'error');
            }
        } catch (error) {
            this.showNotification(`Export fehlgeschlagen: ${error.message}`, 'error');
        }
    }

    // Deck Management Implementation
    async loadDecks() {
        try {
            const response = await ipcRenderer.invoke('load-bingo-decks');
            if (response.success) {
                this.renderDecks(response.decks);
            } else {
                this.showNotification('Fehler beim Laden der Decks', 'error');
            }
        } catch (error) {
            console.error('Error loading decks:', error);
            this.showNotification('Fehler beim Laden der Decks', 'error');
        }
    }

    renderDecks(decks) {
        const decksGrid = document.getElementById('decksGrid');
        if (!decksGrid) return;

        if (decks.length === 0) {
            decksGrid.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-layer-group"></i>
                    <h3>Keine Decks vorhanden</h3>
                    <p>Erstelle dein erstes Bingo Deck um anzufangen!</p>
                    <button class="btn btn-primary" onclick="streamBingoUI.openDeckModal()">
                        <i class="fas fa-plus"></i> Erstes Deck erstellen
                    </button>
                </div>
            `;
            return;
        }

        decksGrid.innerHTML = decks.map(deck => `
            <div class="deck-card ${deck.isActive ? 'active' : ''}" data-deck-id="${deck.id}">
                <div class="deck-header">
                    <h3>${deck.name}</h3>
                    <div class="deck-type">
                        <span class="deck-type-badge ${deck.type || 'normal'}">
                            ${deck.type === 'addon' ? 'Zusatz-Deck' : 'Haupt-Deck'}
                        </span>
                    </div>
                </div>
                <div class="deck-stats">
                    <div class="stat">
                        <i class="fas fa-list"></i>
                        <span>${deck.events?.length || 0} Events</span>
                    </div>
                    <div class="stat">
                        <i class="fas fa-calendar"></i>
                        <span>${new Date(deck.lastModified || deck.created).toLocaleDateString()}</span>
                    </div>
                </div>
                <div class="deck-description">
                    <p>${deck.description || 'Keine Beschreibung'}</p>
                </div>
                <div class="deck-actions">
                    <button class="btn btn-small btn-outline" onclick="streamBingoUI.editDeck('${deck.id}')">
                        <i class="fas fa-edit"></i> Bearbeiten
                    </button>
                    <button class="btn btn-small ${deck.isActive ? 'btn-success' : 'btn-primary'}" 
                            onclick="streamBingoUI.toggleDeckActive('${deck.id}')">
                        <i class="fas fa-${deck.isActive ? 'check' : 'play'}"></i> 
                        ${deck.isActive ? 'Aktiv' : 'Aktivieren'}
                    </button>
                    <button class="btn btn-small btn-danger" onclick="streamBingoUI.deleteDeck('${deck.id}')">
                        <i class="fas fa-trash"></i> Löschen
                    </button>
                </div>
            </div>
        `).join('');
    }

    async loadEvents() {
        // Implementation for loading events
        await this.refreshPendingEvents();
        await this.refreshWinsList();
        await this.refreshLeaderboard();
    }

    openDeckModal(deckId = null) {
        this.currentEditingDeck = deckId;
        this.renderDeckModal(deckId);
        this.openModal('deckModal');
    }

    async renderDeckModal(deckId = null) {
        const modal = document.getElementById('deckModal');
        const modalBody = modal.querySelector('.modal-body');
        const modalTitle = modal.querySelector('#deckModalTitle');
        
        let deck = null;
        if (deckId) {
            const response = await ipcRenderer.invoke('get-deck', deckId);
            if (response.success) {
                deck = response.deck;
            }
        }

        modalTitle.textContent = deck ? 'Deck bearbeiten' : 'Neues Deck erstellen';
        
        modalBody.innerHTML = `
            <form id="deckForm">
                <div class="form-group">
                    <label for="deckName">Deck Name *</label>
                    <input type="text" id="deckName" class="form-control" 
                           value="${deck?.name || ''}" placeholder="z.B. Minecraft Events" required>
                </div>
                
                <div class="form-group">
                    <label for="deckDescription">Beschreibung</label>
                    <textarea id="deckDescription" class="form-control" rows="3" 
                              placeholder="Beschreibe worum es in diesem Deck geht...">${deck?.description || ''}</textarea>
                </div>
                
                <div class="form-group">
                    <label for="deckType">Deck Typ</label>
                    <select id="deckType" class="form-control">
                        <option value="normal" ${(deck?.type || 'normal') === 'normal' ? 'selected' : ''}>
                            Haupt-Deck (nur eins kann aktiv sein)
                        </option>
                        <option value="addon" ${deck?.type === 'addon' ? 'selected' : ''}>
                            Zusatz-Deck (mehrere können aktiv sein)
                        </option>
                    </select>
                    <small>Zusatz-Decks enthalten Events, die stream-übergreifend passieren können</small>
                </div>
                
                <div class="form-group">
                    <label>Events verwalten</label>
                    <div class="events-section">
                        <div class="events-input-area">
                            <div class="input-with-button">
                                <input type="text" id="eventInput" class="form-control" 
                                       placeholder="Neues Bingo Event eingeben...">
                                <button type="button" class="btn btn-primary" onclick="streamBingoUI.addEvent()">
                                    <i class="fas fa-plus"></i>
                                </button>
                            </div>
                        </div>
                        
                        <div class="events-view-toggle">
                            <button type="button" class="btn btn-small btn-outline view-toggle active" 
                                    data-view="list" onclick="streamBingoUI.toggleEventsView('list')">
                                <i class="fas fa-list"></i> Listen-Ansicht
                            </button>
                            <button type="button" class="btn btn-small btn-outline view-toggle" 
                                    data-view="text" onclick="streamBingoUI.toggleEventsView('text')">
                                <i class="fas fa-align-left"></i> Text-Ansicht
                            </button>
                        </div>
                        
                        <div id="eventsListView" class="events-display">
                            <ul id="eventsList" class="events-list">
                                <!-- Events will be populated here -->
                            </ul>
                        </div>
                        
                        <div id="eventsTextView" class="events-display" style="display: none;">
                            <textarea id="eventsTextArea" class="form-control" rows="10" 
                                      placeholder="Events mit Komma getrennt..." 
                                      onchange="streamBingoUI.syncEventsFromText()"></textarea>
                            <small>Events sind mit Kommas getrennt. Du kannst hier Text-Blöcke einfügen.</small>
                        </div>
                    </div>
                </div>
                
                <div class="modal-actions">
                    <button type="button" class="btn btn-outline" onclick="streamBingoUI.closeModal('deckModal')">
                        Abbrechen
                    </button>
                    <button type="submit" class="btn btn-primary">
                        <i class="fas fa-save"></i> ${deck ? 'Speichern' : 'Erstellen'}
                    </button>
                </div>
            </form>
        `;
        
        // Populate events if editing
        if (deck && deck.events) {
            this.currentEvents = [...deck.events];
            this.renderEventsList();
            this.syncEventsToText();
        } else {
            this.currentEvents = [];
        }
        
        // Setup form submission
        document.getElementById('deckForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveDeck();
        });
        
        // Setup enter key for event input
        document.getElementById('eventInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.addEvent();
            }
        });
    }

    addEvent() {
        const input = document.getElementById('eventInput');
        const eventText = input.value.trim();
        
        if (eventText && !this.currentEvents.includes(eventText)) {
            this.currentEvents.push(eventText);
            this.renderEventsList();
            this.syncEventsToText();
            input.value = '';
            input.focus(); // Keep focus for quick adding
        }
    }
    
    removeEvent(index) {
        this.currentEvents.splice(index, 1);
        this.renderEventsList();
        this.syncEventsToText();
    }
    
    renderEventsList() {
        const eventsList = document.getElementById('eventsList');
        if (!eventsList) return;
        
        eventsList.innerHTML = this.currentEvents.map((event, index) => `
            <li class="event-item">
                <span class="event-text">${event}</span>
                <button type="button" class="btn btn-small btn-danger" 
                        onclick="streamBingoUI.removeEvent(${index})">
                    <i class="fas fa-trash"></i>
                </button>
            </li>
        `).join('');
    }
    
    toggleEventsView(view) {
        const listView = document.getElementById('eventsListView');
        const textView = document.getElementById('eventsTextView');
        const toggleButtons = document.querySelectorAll('.view-toggle');
        
        toggleButtons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.view === view);
        });
        
        if (view === 'list') {
            listView.style.display = 'block';
            textView.style.display = 'none';
        } else {
            listView.style.display = 'none';
            textView.style.display = 'block';
            this.syncEventsToText();
        }
    }
    
    syncEventsToText() {
        const textArea = document.getElementById('eventsTextArea');
        if (textArea) {
            textArea.value = this.currentEvents.join(', ');
        }
    }
    
    syncEventsFromText() {
        const textArea = document.getElementById('eventsTextArea');
        if (textArea) {
            const events = textArea.value
                .split(',')
                .map(event => event.trim())
                .filter(event => event.length > 0);
            
            this.currentEvents = [...new Set(events)]; // Remove duplicates
            this.renderEventsList();
        }
    }
    
    async saveDeck() {
        const form = document.getElementById('deckForm');
        const formData = new FormData(form);
        
        const deckData = {
            id: this.currentEditingDeck || this.generateDeckId(),
            name: document.getElementById('deckName').value.trim(),
            description: document.getElementById('deckDescription').value.trim(),
            type: document.getElementById('deckType').value,
            events: [...this.currentEvents],
            created: this.currentEditingDeck ? undefined : new Date().toISOString(),
            lastModified: new Date().toISOString()
        };
        
        if (!deckData.name) {
            this.showNotification('Deck Name ist erforderlich', 'error');
            return;
        }
        
        if (deckData.events.length === 0) {
            this.showNotification('Mindestens ein Event ist erforderlich', 'error');
            return;
        }
        
        try {
            const result = await ipcRenderer.invoke('save-bingo-deck', deckData);
            if (result.success) {
                this.showNotification(`Deck ${this.currentEditingDeck ? 'aktualisiert' : 'erstellt'}!`, 'success');
                this.closeModal('deckModal');
                await this.loadDecks();
            } else {
                this.showNotification(`Fehler: ${result.error}`, 'error');
            }
        } catch (error) {
            this.showNotification(`Fehler: ${error.message}`, 'error');
        }
    }
    
    generateDeckId() {
        return `deck_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    async editDeck(deckId) {
        this.openDeckModal(deckId);
    }
    
    async toggleDeckActive(deckId) {
        try {
            const result = await ipcRenderer.invoke('set-active-deck', deckId);
            if (result.success) {
                this.showNotification('Deck-Status aktualisiert!', 'success');
                await this.loadDecks();
                await this.loadDashboard(); // Refresh dashboard stats
            } else {
                this.showNotification(`Fehler: ${result.error}`, 'error');
            }
        } catch (error) {
            this.showNotification(`Fehler: ${error.message}`, 'error');
        }
    }
    
    async deleteDeck(deckId) {
        if (confirm('Bist du sicher, dass du dieses Deck löschen möchtest?')) {
            try {
                const result = await ipcRenderer.invoke('delete-bingo-deck', deckId);
                if (result.success) {
                    this.showNotification('Deck gelöscht!', 'success');
                    await this.loadDecks();
                    await this.loadDashboard();
                } else {
                    this.showNotification(`Fehler: ${result.error}`, 'error');
                }
            } catch (error) {
                this.showNotification(`Fehler: ${error.message}`, 'error');
            }
        }
    }

    addNewWorkflow() {
        this.openModal('workflowModal');
    }

    importSettings() {
        this.showNotification('Import-Funktion wird implementiert...', 'info');
    }
}

// Utility functions
function copyToClipboard(elementId) {
    const element = document.getElementById(elementId);
    if (element) {
        element.select();
        document.execCommand('copy');
        
        // Show feedback
        const ui = window.streamBingoUI;
        if (ui) {
            ui.showNotification('In Zwischenablage kopiert!', 'success');
        }
    }
}

function togglePassword(elementId) {
    const element = document.getElementById(elementId);
    const button = element.nextElementSibling;
    
    if (element.type === 'password') {
        element.type = 'text';
        button.innerHTML = '<i class="fas fa-eye-slash"></i>';
    } else {
        element.type = 'password';
        button.innerHTML = '<i class="fas fa-eye"></i>';
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.streamBingoUI = new StreamBingoUI();
});

// Export for use in HTML
window.copyToClipboard = copyToClipboard;
window.togglePassword = togglePassword;
