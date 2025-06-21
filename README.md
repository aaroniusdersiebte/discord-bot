# Stream Bingo System - CANVAS-PROBLEM BEHOBEN! 🎯

Ein umfangreiches Stream-Bingo-System mit Discord Bot Integration und OBS Browser Source für Live-Streams.

## ⚠️ WICHTIGER HINWEIS - Canvas Problem Lösung

Das ursprüngliche Canvas-Problem wurde **vollständig behoben**! Das System verwendet jetzt **SVG-basierte Bingo-Karten** ohne native Dependencies.

## 🚀 Schnell-Installation (EMPFOHLEN)

```bash
cd C:\Streaming\Code\streambingo
fix-canvas.bat
```

Dieses Script behebt automatisch alle Canvas-Probleme und installiert das System korrekt.

## 🎯 Features

- **Moderne Electron-App** mit Dark Mode UI
- **Discord Bot Integration** für automatisches Bingo-Spiel
- **OBS Browser Source** für Live-Overlay
- **SVG-basierte Bingo-Karten** (kein Canvas mehr!)
- **Flexible Bingo Decks** - Erstelle eigene Event-Listen
- **Echtzeit-Updates** via WebSockets
- **Punkte-System** mit Platzierungen (1.-5. Platz)
- **Event-Bestätigung** durch Streamer
- **Automatische Bingo-Erkennung**
- **Lokale Datenspeicherung** im Windows Benutzerordner

## 📋 Voraussetzungen

- **Node.js** (Version 16 oder höher)
- **Discord Bot Token** (erstelle einen Bot auf https://discord.com/developers/applications)
- **OBS Studio** (für Browser Source Integration)

## 🔧 Installation bei Canvas-Problemen

### Option 1: Automatische Behebung (EMPFOHLEN)
```bash
fix-canvas.bat
```

### Option 2: Manuelle Behebung
```bash
# 1. Alte Installation löschen
rmdir /s /q node_modules
del package-lock.json

# 2. Neu installieren (ohne Canvas)
npm install

# 3. App starten
npm start
```

### Option 3: Clean Install
```bash
npm run clean
npm start
```

## ⚙️ Erste Einrichtung

### 1. Discord Bot erstellen

1. Gehe zu https://discord.com/developers/applications
2. Klicke "New Application" und gib einen Namen ein
3. Gehe zu "Bot" → "Add Bot"
4. Kopiere das **Bot Token** (wird später benötigt)
5. Aktiviere folgende Permissions:
   - Read Messages
   - Send Messages
   - Use Slash Commands
   - Add Reactions
   - Read Message History

### 2. Bot zum Discord Server hinzufügen

1. Gehe zu "OAuth2" → "URL Generator"
2. Wähle "bot" und "applications.commands"
3. Wähle die Permissions (siehe oben)
4. Kopiere die URL und öffne sie im Browser
5. Füge den Bot zu deinem Server hinzu

### 3. Stream Bingo App konfigurieren

1. Starte die App mit `npm start`
2. Gehe zu "Einstellungen"
3. Gib folgende Daten ein:
   - **Bot Token**: Von Discord Developer Portal
   - **Server ID**: Rechtsklick auf deinen Discord Server → "ID kopieren"
   - **Bingo Channel ID**: Rechtsklick auf den gewünschten Channel → "ID kopieren"
4. Klicke "Bot starten"

## 🎮 Verwendung

### Bingo Decks erstellen

1. Gehe zu "Bingo Decks"
2. Klicke "Neues Deck erstellen"
3. Gib einen Namen und Beschreibung ein
4. Füge Events hinzu (durch Komma getrennt):
   ```
   Streamer stirbt, Jump Scare, Rage Quit, Chat spammt Emotes, 
   Streamer flucht, Game crasht, Lag Spike, Epic Fail, 
   Streamer lacht, Donation Alert, Viewer fragt dumme Frage
   ```
5. Wähle eine Farbe
6. Speichere das Deck
7. **Aktiviere das Deck** (▶️ Button)

### Discord Bot Commands

**Für Zuschauer:**
- `!bingo` - Neue Bingo-Karte erhalten
- `!win youtube MeinUsername` - Bingo-Gewinn melden (YouTube)
- `!win twitch MeinUsername` - Bingo-Gewinn melden (Twitch)
- `!help` - Hilfe anzeigen

**Spielablauf:**
1. Zuschauer verwendet `!bingo` um eine Karte zu bekommen
2. Bot sendet alle Events als einzelne Nachrichten mit Positionen (1.1, 1.2, etc.)
3. Bot sendet eine HTML-Datei mit der visuellen Bingo-Karte
4. Bei Events reagieren Zuschauer mit ✅ auf die entsprechenden Nachrichten
5. Bei Bingo verwendet der Zuschauer `!win <platform> <username>`

### Streamer Workflow

1. **Events bestätigen**: Gehe zu "Events" Tab um gemeldete Events zu bestätigen/ablehnen
2. **Bingo-Gewinne verwalten**: Gehe zu "Bingo Wins" um Punkte zu vergeben
3. **OBS Integration**: Kopiere die Browser Source URL aus den Einstellungen

## 🎥 OBS Integration

### Browser Source einrichten

1. Öffne OBS Studio
2. Füge neue Quelle hinzu → "Browser"
3. Gib folgende URL ein: `http://localhost:3000`
4. Setze Breite: 1920, Höhe: 1080
5. Aktiviere "Seite beim Anzeigen der Quelle aktualisieren"

### Overlay Features

- **Event-Benachrichtigungen**: Werden 5 Sekunden lang angezeigt
- **Bingo-Gewinn-Anzeigen**: Werden 10 Sekunden lang angezeigt  
- **Event-Historie**: Zeigt die letzten 5 bestätigten Events
- **Bingo-Historie**: Zeigt die letzten 3 Gewinner mit Platzierung

## 🏆 Punkte-System

Standardmäßige Punkteverteilung:
- **1. Platz**: 100 Punkte
- **2. Platz**: 75 Punkte  
- **3. Platz**: 50 Punkte
- **4. Platz**: 25 Punkte
- **5. Platz**: 10 Punkte

Die Punkte können in den Einstellungen angepasst werden.

## 📁 Datenspeicherung

**WICHTIGE ÄNDERUNG**: Einstellungen und Daten werden jetzt im **Windows Benutzerordner** gespeichert:
- Windows: `%APPDATA%\stream-bingo\`
- Beispiel: `C:\Users\DeinName\AppData\Roaming\stream-bingo\`

Dies ermöglicht:
- ✅ Persistente Speicherung zwischen Updates
- ✅ Automatische Backups
- ✅ Sichere Datenhaltung

## 🔧 Entwicklung

### Development Mode starten
```bash
npm run dev
```

### Build für Distribution
```bash
npm run build
```

### System Check
```bash
check.bat
```

## 🐛 Troubleshooting

### Canvas-Fehler (BEHOBEN!)
```
Error: NODE_MODULE_VERSION 115 vs 118
```
**Lösung**: Führe `fix-canvas.bat` aus oder verwende `npm run clean`

### Discord Bot startet nicht
- Überprüfe das Bot Token
- Stelle sicher, dass der Bot die nötigen Permissions hat
- Überprüfe Server ID und Channel ID

### OBS Overlay zeigt nichts
- Stelle sicher, dass die App läuft
- Überprüfe die Browser Source URL: `http://localhost:3000`
- Aktualisiere die Browser Source in OBS

### Bingo-Karten werden nicht generiert
- Stelle sicher, dass ein Deck aktiviert ist
- Überprüfe, dass genügend Events im Deck sind (min. 24 für 5x5)

### WebSocket Verbindungsprobleme
- Überprüfe Firewall-Einstellungen
- Stelle sicher, dass Port 3000 verfügbar ist
- Starte die App neu

## 🔄 Updates und Backups

Das System erstellt automatisch Backups im Benutzerordner. Bei Problemen können diese zur Wiederherstellung verwendet werden.

**Backup-Pfad**: `%APPDATA%\stream-bingo\backup-*.json`

## ✨ Was ist neu? (Canvas-freie Version)

### ✅ Behoben:
- **Canvas-Kompilierungsfehler** komplett eliminiert
- **Node.js Version-Konflikte** gelöst
- **Native Dependencies Probleme** entfernt

### 🔄 Geändert:
- **Bingo-Karten**: Jetzt SVG-basiert (sauberer und schneller)
- **Discord Attachments**: HTML-Dateien statt PNG (funktioniert besser)
- **Datenspeicherung**: Windows Benutzerordner (persistenter)
- **Installation**: Viel einfacher und zuverlässiger

### 🚀 Verbessert:
- **Performance**: Schnellere Kartengenerierung
- **Kompatibilität**: Funktioniert auf allen Systemen
- **Wartung**: Einfachere Updates und Bugfixes

## 📝 Geplante Features

- [ ] Verschiedene Bingo-Modi (L-Form, T-Form, etc.)
- [ ] Automatische Punktevergabe an externe Systeme
- [ ] Mehrsprachige Unterstützung
- [ ] Theme-Anpassungen für OBS Overlay
- [ ] Discord Slash Commands
- [ ] Statistiken und Analytics
- [ ] Export/Import von Bingo Decks
- [ ] PNG-Export Option (optional mit externem Tool)

## 🆘 Support

Bei Problemen oder Fragen:
1. **Canvas-Probleme**: Verwende `fix-canvas.bat`
2. Überprüfe die Console/Logs der App
3. Stelle sicher, dass alle Dependencies installiert sind
4. Überprüfe die Discord Bot Permissions
5. Teste die OBS Browser Source URL im Browser

**Häufige Befehle:**
```bash
# Canvas-Problem beheben
fix-canvas.bat

# System-Check
check.bat

# Clean Install
npm run clean

# App starten
npm start
```

## 📄 Lizenz

MIT License - Freie Verwendung für private und kommerzielle Zwecke.

---

**Viel Spaß beim Streamen! 🎮🎯**

**Das Canvas-Problem ist jetzt Geschichte! ✨**
