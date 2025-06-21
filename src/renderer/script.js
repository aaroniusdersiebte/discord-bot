// Stream Bingo Bot V2 - Client-side JavaScript
const { ipcRenderer } = require('electron');

class StreamBingoUI {
    constructor() {
        this.currentSection = 'dashboard';
        this.botStatus = false;
        this.config = {};
        this.workflows = {};
        this.currentWorkflow = 'bingo-card';
        
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

    // Placeholder methods for future implementation
    async loadDecks() {
        // Implementation for loading decks
    }

    async loadEvents() {
        // Implementation for loading events
    }

    openDeckModal() {
        this.openModal('deckModal');
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
