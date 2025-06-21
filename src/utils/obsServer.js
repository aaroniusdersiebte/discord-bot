const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

class OBSServer {
    constructor() {
        this.app = express();
        this.server = null;
        this.wss = null;
        this.port = 3000;
        this.isRunning = false;
        this.clients = new Set();
        
        // Current display state
        this.currentEvent = null;
        this.currentBingo = null;
        this.eventHistory = [];
        this.bingoHistory = [];
        
        this.setupExpress();
    }

    setupExpress() {
        // Serve static files
        this.app.use('/static', express.static(path.join(__dirname, '../../obs')));
        
        // Enable CORS for OBS Browser Source
        this.app.use((req, res, next) => {
            res.header('Access-Control-Allow-Origin', '*');
            res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
            next();
        });

        // Main OBS overlay route
        this.app.get('/', (req, res) => {
            res.sendFile(path.join(__dirname, '../../obs/overlay.html'));
        });

        // API endpoints for current state
        this.app.get('/api/status', (req, res) => {
            res.json({
                currentEvent: this.currentEvent,
                currentBingo: this.currentBingo,
                eventHistory: this.eventHistory.slice(-10), // Last 10 events
                bingoHistory: this.bingoHistory.slice(-5), // Last 5 bingos
                connectedClients: this.clients.size
            });
        });

        // Health check
        this.app.get('/health', (req, res) => {
            res.json({ status: 'OK', uptime: process.uptime() });
        });
    }

    start(port = 3000) {
        this.port = port;
        
        return new Promise((resolve, reject) => {
            try {
                this.server = http.createServer(this.app);
                
                // Setup WebSocket server
                this.wss = new WebSocket.Server({ server: this.server });
                this.setupWebSocket();
                
                this.server.listen(this.port, () => {
                    this.isRunning = true;
                    console.log(`OBS Server läuft auf Port ${this.port}`);
                    console.log(`Browser Source URL: http://localhost:${this.port}`);
                    resolve();
                });

                this.server.on('error', (error) => {
                    console.error('OBS Server Fehler:', error);
                    reject(error);
                });

            } catch (error) {
                reject(error);
            }
        });
    }

    stop() {
        return new Promise((resolve) => {
            if (this.server) {
                // Close all WebSocket connections
                this.clients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.close();
                    }
                });
                this.clients.clear();

                this.server.close(() => {
                    this.isRunning = false;
                    console.log('OBS Server gestoppt');
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }

    setupWebSocket() {
        this.wss.on('connection', (ws, req) => {
            console.log('Neue OBS Browser Source verbunden');
            this.clients.add(ws);

            // Send current state to new client
            this.sendToClient(ws, {
                type: 'initial_state',
                data: {
                    currentEvent: this.currentEvent,
                    currentBingo: this.currentBingo,
                    eventHistory: this.eventHistory.slice(-10),
                    bingoHistory: this.bingoHistory.slice(-5)
                }
            });

            ws.on('close', () => {
                console.log('OBS Browser Source getrennt');
                this.clients.delete(ws);
            });

            ws.on('error', (error) => {
                console.error('WebSocket Fehler:', error);
                this.clients.delete(ws);
            });

            // Handle ping/pong for connection health
            ws.on('pong', () => {
                ws.isAlive = true;
            });
        });

        // Ping clients every 30 seconds to check connection health
        setInterval(() => {
            this.clients.forEach(client => {
                if (client.isAlive === false) {
                    this.clients.delete(client);
                    return client.terminate();
                }
                
                client.isAlive = false;
                client.ping();
            });
        }, 30000);
    }

    sendToClient(client, message) {
        if (client.readyState === WebSocket.OPEN) {
            try {
                client.send(JSON.stringify(message));
            } catch (error) {
                console.error('Fehler beim Senden an Client:', error);
                this.clients.delete(client);
            }
        }
    }

    broadcast(message) {
        this.clients.forEach(client => {
            this.sendToClient(client, message);
        });
    }

    // Event notification methods
    notifyEventConfirmed(eventData) {
        this.currentEvent = {
            text: eventData.eventText || eventData.text,
            confirmedAt: new Date(),
            reportedBy: eventData.reportedBy ? eventData.reportedBy.length : 1
        };

        this.eventHistory.push(this.currentEvent);
        
        // Keep only last 50 events in memory
        if (this.eventHistory.length > 50) {
            this.eventHistory = this.eventHistory.slice(-50);
        }

        this.broadcast({
            type: 'event_confirmed',
            data: this.currentEvent
        });

        // Clear current event after 5 seconds
        setTimeout(() => {
            this.currentEvent = null;
            this.broadcast({
                type: 'event_cleared',
                data: null
            });
        }, 5000);

        console.log('Event bestätigt für OBS:', this.currentEvent.text);
    }

    notifyBingoWin(bingoData) {
        this.currentBingo = {
            username: bingoData.username,
            platform: bingoData.platform,
            platformUsername: bingoData.platformUsername,
            placement: bingoData.placement,
            points: bingoData.points,
            bingoType: bingoData.bingoType,
            confirmedAt: new Date()
        };

        this.bingoHistory.push(this.currentBingo);
        
        // Keep only last 20 bingos in memory
        if (this.bingoHistory.length > 20) {
            this.bingoHistory = this.bingoHistory.slice(-20);
        }

        this.broadcast({
            type: 'bingo_win',
            data: this.currentBingo
        });

        // Clear current bingo after 10 seconds (longer for bingo wins)
        setTimeout(() => {
            this.currentBingo = null;
            this.broadcast({
                type: 'bingo_cleared',
                data: null
            });
        }, 10000);

        console.log('Bingo Gewinn für OBS:', this.currentBingo.username, this.currentBingo.placement);
    }

    // Utility methods
    getURL() {
        return `http://localhost:${this.port}`;
    }

    getStats() {
        return {
            isRunning: this.isRunning,
            port: this.port,
            connectedClients: this.clients.size,
            eventHistory: this.eventHistory.length,
            bingoHistory: this.bingoHistory.length,
            currentEvent: this.currentEvent,
            currentBingo: this.currentBingo
        };
    }

    // Test methods for development
    testEventNotification(eventText = 'Test Event') {
        this.notifyEventConfirmed({
            eventText,
            reportedBy: [{ username: 'TestUser' }]
        });
    }

    testBingoNotification() {
        this.notifyBingoWin({
            username: 'TestUser',
            platform: 'twitch',
            platformUsername: 'testuser123',
            placement: 1,
            points: 100,
            bingoType: 'Reihe 1'
        });
    }

    // Clear history methods
    clearEventHistory() {
        this.eventHistory = [];
        this.broadcast({
            type: 'history_cleared',
            data: { type: 'events' }
        });
    }

    clearBingoHistory() {
        this.bingoHistory = [];
        this.broadcast({
            type: 'history_cleared',
            data: { type: 'bingos' }
        });
    }

    clearAllHistory() {
        this.eventHistory = [];
        this.bingoHistory = [];
        this.currentEvent = null;
        this.currentBingo = null;
        
        this.broadcast({
            type: 'history_cleared',
            data: { type: 'all' }
        });
    }
}

module.exports = OBSServer;
