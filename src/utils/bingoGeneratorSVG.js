// Alternative Bingo Generator ohne Canvas - verwendet SVG
const fs = require('fs').promises;
const path = require('path');

class BingoGeneratorSVG {
    constructor() {
        this.cardSize = 5; // Default 5x5
    }

    /**
     * Generate a random bingo card from available events
     */
    generateCard(events, size = 5) {
        if (!events || events.length === 0) {
            throw new Error('Keine Events verfügbar für die Bingo-Karte');
        }

        const totalCells = size * size;
        const hasCenter = size % 2 === 1; // Odd-sized cards have a center
        const requiredEvents = hasCenter ? totalCells - 1 : totalCells; // -1 for "FREE" center

        if (events.length < requiredEvents) {
            throw new Error(`Nicht genügend Events (${events.length}) für ${size}x${size} Karte (benötigt: ${requiredEvents})`);
        }

        // Shuffle and select random events
        const shuffledEvents = this.shuffleArray([...events]);
        const selectedEvents = shuffledEvents.slice(0, requiredEvents);

        // Create 2D array
        const card = [];
        let eventIndex = 0;

        for (let row = 0; row < size; row++) {
            const cardRow = [];
            for (let col = 0; col < size; col++) {
                // Center cell for odd-sized cards
                if (hasCenter && row === Math.floor(size / 2) && col === Math.floor(size / 2)) {
                    cardRow.push('FREE');
                } else {
                    cardRow.push(selectedEvents[eventIndex++]);
                }
            }
            card.push(cardRow);
        }

        return card;
    }

    /**
     * Generate SVG image of the bingo card
     */
    async generateImageSVG(card, options = {}) {
        const {
            title = 'Stream Bingo',
            username = 'Player',
            color = '#6366f1',
            checkedItems = new Set(),
            confirmedEvents = [],
            width = 800,
            height = 900
        } = options;

        const size = card.length;
        const cellSize = Math.min((width - 80) / size, (height - 200) / size);
        const gridSize = cellSize * size;
        const gridStartX = (width - gridSize) / 2;
        const gridStartY = 120;

        let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bgGradient" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:#0f0f0f"/>
      <stop offset="100%" style="stop-color:#1a1a1a"/>
    </linearGradient>
    <linearGradient id="cardGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${color}"/>
      <stop offset="100%" style="stop-color:#8b5cf6"/>
    </linearGradient>
  </defs>
  
  <!-- Background -->
  <rect width="${width}" height="${height}" fill="url(#bgGradient)"/>
  
  <!-- Header -->
  <text x="${width/2}" y="40" text-anchor="middle" fill="${color}" font-family="Arial, sans-serif" font-size="32" font-weight="bold">${title}</text>
  <text x="${width/2}" y="70" text-anchor="middle" fill="#e0e0e0" font-family="Arial, sans-serif" font-size="20">Spieler: ${username}</text>
  <line x1="50" y1="90" x2="${width-50}" y2="90" stroke="${color}" stroke-width="2"/>
`;

        // Draw bingo grid
        for (let row = 0; row < size; row++) {
            for (let col = 0; col < size; col++) {
                const cellX = gridStartX + col * cellSize;
                const cellY = gridStartY + row * cellSize;
                const cellText = card[row][col];
                const positionKey = `${row}-${col}`;

                // Determine cell state
                const isChecked = checkedItems.has(positionKey);
                const isConfirmed = confirmedEvents.includes(cellText);
                const isFree = cellText === 'FREE';

                // Cell background
                let bgColor = '#2a2a2a';
                if (isFree) {
                    bgColor = color;
                } else if (isConfirmed) {
                    bgColor = '#22c55e'; // Green for confirmed
                } else if (isChecked) {
                    bgColor = '#fbbf24'; // Yellow for pending
                }

                svg += `
  <!-- Cell ${row}-${col} -->
  <rect x="${cellX}" y="${cellY}" width="${cellSize-2}" height="${cellSize-2}" fill="${bgColor}" stroke="#444" stroke-width="1" rx="4"/>`;

                // Position label
                svg += `
  <text x="${cellX + 8}" y="${cellY + 16}" fill="#888" font-family="Arial, sans-serif" font-size="10">${row + 1}.${col + 1}</text>`;

                // Cell text (word wrapped)
                const wrappedText = this.wrapTextSVG(cellText, cellSize - 20);
                const textColor = (isFree || isConfirmed || isChecked) ? '#000000' : '#ffffff';
                const fontSize = Math.max(10, cellSize / 8);
                const lineHeight = fontSize * 1.2;
                const startY = cellY + cellSize/2 - (wrappedText.length * lineHeight) / 2 + lineHeight;

                wrappedText.forEach((line, index) => {
                    svg += `
  <text x="${cellX + cellSize/2}" y="${startY + index * lineHeight}" text-anchor="middle" fill="${textColor}" font-family="Arial, sans-serif" font-size="${fontSize}">${this.escapeXML(line)}</text>`;
                });

                // Status indicator
                if (isConfirmed) {
                    svg += `
  <text x="${cellX + cellSize - 12}" y="${cellY + 18}" text-anchor="middle" fill="#ffffff" font-family="Arial, sans-serif" font-size="16" font-weight="bold">✓</text>`;
                } else if (isChecked) {
                    svg += `
  <text x="${cellX + cellSize - 12}" y="${cellY + 18}" text-anchor="middle" fill="#000000" font-family="Arial, sans-serif" font-size="14" font-weight="bold">?</text>`;
                }
            }
        }

        // Footer
        const footerY = height - 80;
        svg += `
  <!-- Footer -->
  <text x="${width/2}" y="${footerY}" text-anchor="middle" fill="#a0a0a0" font-family="Arial, sans-serif" font-size="14">✅ = Ereignis gemeldet (warte auf Bestätigung)</text>
  <text x="${width/2}" y="${footerY + 18}" text-anchor="middle" fill="#a0a0a0" font-family="Arial, sans-serif" font-size="14">✓ = Ereignis bestätigt</text>
  <text x="${width/2}" y="${footerY + 36}" text-anchor="middle" fill="#a0a0a0" font-family="Arial, sans-serif" font-size="14">FREE = Kostenloser Platz</text>
  <text x="${width/2}" y="${height - 10}" text-anchor="middle" fill="#666" font-family="Arial, sans-serif" font-size="12">Erstellt: ${new Date().toLocaleString('de-DE')}</text>
</svg>`;

        return svg;
    }

    /**
     * Convert SVG to PNG using simple HTML conversion (fallback)
     */
    async generateImage(card, options = {}) {
        try {
            // For now, return SVG as string - can be converted to PNG later if needed
            const svg = await this.generateImageSVG(card, options);
            
            // Simple fallback: return HTML that can be screenshot
            const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body { margin: 0; padding: 20px; background: #0f0f0f; font-family: Arial; }
        .bingo-card { background: #1a1a1a; border-radius: 10px; padding: 20px; }
    </style>
</head>
<body>
    ${svg}
</body>
</html>`;
            
            return Buffer.from(html, 'utf8');
        } catch (error) {
            console.error('Fehler bei SVG-Generierung:', error);
            return this.generateFallbackImage(card, options);
        }
    }

    /**
     * Generate a simple text-based fallback when image generation fails
     */
    generateFallbackImage(card, options = {}) {
        const { title = 'Stream Bingo', username = 'Player' } = options;
        
        let text = `${title} - ${username}\n`;
        text += '='.repeat(50) + '\n\n';
        
        for (let row = 0; row < card.length; row++) {
            for (let col = 0; col < card[row].length; col++) {
                text += `${row+1}.${col+1}: ${card[row][col]}\n`;
            }
        }
        
        text += '\n' + '='.repeat(50);
        text += '\n✅ = Event markieren, !win = Bingo melden';
        
        return Buffer.from(text, 'utf8');
    }

    wrapTextSVG(text, maxWidth) {
        if (text === 'FREE') return ['FREE'];
        
        const words = text.split(' ');
        const lines = [];
        let currentLine = '';
        const avgCharWidth = 6; // Approximate character width
        const maxCharsPerLine = Math.floor(maxWidth / avgCharWidth);

        for (const word of words) {
            const testLine = currentLine + (currentLine ? ' ' : '') + word;
            if (testLine.length > maxCharsPerLine && currentLine) {
                lines.push(currentLine);
                currentLine = word;
            } else {
                currentLine = testLine;
            }
        }
        
        if (currentLine) lines.push(currentLine);
        return lines.length > 0 ? lines.slice(0, 4) : [text]; // Max 4 lines
    }

    escapeXML(text) {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    shuffleArray(array) {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }

    checkBingo(card, checkedPositions) {
        const size = card.length;
        const results = [];

        // Check rows
        for (let row = 0; row < size; row++) {
            let hasRow = true;
            for (let col = 0; col < size; col++) {
                const position = `${row}-${col}`;
                if (card[row][col] !== 'FREE' && !checkedPositions.has(position)) {
                    hasRow = false;
                    break;
                }
            }
            if (hasRow) {
                results.push({
                    type: 'row',
                    number: row + 1,
                    description: `Reihe ${row + 1}`
                });
            }
        }

        // Check columns
        for (let col = 0; col < size; col++) {
            let hasCol = true;
            for (let row = 0; row < size; row++) {
                const position = `${row}-${col}`;
                if (card[row][col] !== 'FREE' && !checkedPositions.has(position)) {
                    hasCol = false;
                    break;
                }
            }
            if (hasCol) {
                results.push({
                    type: 'column',
                    number: col + 1,
                    description: `Spalte ${col + 1}`
                });
            }
        }

        // Check diagonals
        let hasMainDiagonal = true;
        let hasAntiDiagonal = true;
        
        for (let i = 0; i < size; i++) {
            if (card[i][i] !== 'FREE' && !checkedPositions.has(`${i}-${i}`)) {
                hasMainDiagonal = false;
            }
            if (card[i][size - 1 - i] !== 'FREE' && !checkedPositions.has(`${i}-${size - 1 - i}`)) {
                hasAntiDiagonal = false;
            }
        }

        if (hasMainDiagonal) {
            results.push({
                type: 'diagonal',
                number: 1,
                description: 'Diagonale (↘)'
            });
        }
        
        if (hasAntiDiagonal) {
            results.push({
                type: 'diagonal',
                number: 2,
                description: 'Diagonale (↙)'
            });
        }

        return {
            hasBingo: results.length > 0,
            bingoTypes: results,
            firstBingo: results[0] || null
        };
    }

    async generateDeckPreview(deck) {
        const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="400" height="300" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="deckGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${deck.color || '#6366f1'}"/>
      <stop offset="100%" style="stop-color:#1a1a1a"/>
    </linearGradient>
  </defs>
  
  <rect width="400" height="300" fill="url(#deckGradient)"/>
  
  <text x="200" y="50" text-anchor="middle" fill="#ffffff" font-family="Arial, sans-serif" font-size="28" font-weight="bold">${this.escapeXML(deck.name)}</text>
  
  ${deck.description ? `<text x="200" y="85" text-anchor="middle" fill="#e0e0e0" font-family="Arial, sans-serif" font-size="16">${this.escapeXML(deck.description.substring(0, 50))}${deck.description.length > 50 ? '...' : ''}</text>` : ''}
  
  <text x="200" y="140" text-anchor="middle" fill="#a0a0a0" font-family="Arial, sans-serif" font-size="14">${deck.events?.length || 0} Events verfügbar</text>
  <text x="200" y="160" text-anchor="middle" fill="#a0a0a0" font-family="Arial, sans-serif" font-size="14">Erstellt: ${new Date(deck.createdAt || Date.now()).toLocaleDateString('de-DE')}</text>
  
  ${deck.events && deck.events.length > 0 ? `
    <text x="200" y="190" text-anchor="middle" fill="#ffffff" font-family="Arial, sans-serif" font-size="12">Beispiel Events:</text>
    ${deck.events.slice(0, 3).map((event, index) => `
      <text x="200" y="${210 + index * 16}" text-anchor="middle" fill="#c0c0c0" font-family="Arial, sans-serif" font-size="12">• ${this.escapeXML(event.length > 40 ? event.substring(0, 37) + '...' : event)}</text>
    `).join('')}
  ` : ''}
</svg>`;
        
        return Buffer.from(svg, 'utf8');
    }

    async saveCardImage(card, options, filename) {
        const imageBuffer = await this.generateImage(card, options);
        const generatedDir = path.join(__dirname, '../../generated');
        
        try {
            await fs.access(generatedDir);
        } catch {
            await fs.mkdir(generatedDir, { recursive: true });
        }

        const filePath = path.join(generatedDir, filename);
        await fs.writeFile(filePath, imageBuffer);
        
        return filePath;
    }

    generateMultipleCards(deck, count = 5, size = 5) {
        const cards = [];
        
        for (let i = 0; i < count; i++) {
            try {
                const card = this.generateCard(deck.events, size);
                cards.push({
                    id: `card-${i + 1}`,
                    card,
                    deckId: deck.id,
                    deckName: deck.name,
                    generatedAt: new Date()
                });
            } catch (error) {
                console.error(`Fehler beim Generieren von Karte ${i + 1}:`, error);
                break;
            }
        }
        
        return cards;
    }
}

module.exports = BingoGeneratorSVG;
