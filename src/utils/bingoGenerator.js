const { createCanvas, loadImage } = require('canvas');
const fs = require('fs').promises;
const path = require('path');

class BingoGenerator {
    constructor() {
        this.cardSize = 5; // Default 5x5
    }

    /**
     * Generate a random bingo card from available events
     * @param {string[]} events - Array of possible events
     * @param {number} size - Size of the bingo card (3, 4, or 5)
     * @returns {string[][]} 2D array representing the bingo card
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
     * Generate a PNG image of the bingo card
     * @param {string[][]} card - The bingo card data
     * @param {Object} options - Styling options
     * @returns {Buffer} PNG image buffer
     */
    async generateImage(card, options = {}) {
        const {
            title = 'Stream Bingo',
            username = 'Player',
            color = '#6366f1',
            checkedItems = new Set(),
            confirmedEvents = [],
            width = 800,
            height = 900
        } = options;

        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');

        // Background
        const gradient = ctx.createLinearGradient(0, 0, 0, height);
        gradient.addColorStop(0, '#0f0f0f');
        gradient.addColorStop(1, '#1a1a1a');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);

        // Header
        await this.drawHeader(ctx, title, username, color, width);

        // Bingo Grid
        const gridStartY = 120;
        const gridSize = Math.min(width - 40, height - 200);
        const gridStartX = (width - gridSize) / 2;
        
        await this.drawBingoGrid(ctx, card, {
            x: gridStartX,
            y: gridStartY,
            size: gridSize,
            color,
            checkedItems,
            confirmedEvents
        });

        // Footer
        await this.drawFooter(ctx, width, height);

        return canvas.toBuffer('image/png');
    }

    async drawHeader(ctx, title, username, color, width) {
        // Title
        ctx.fillStyle = color;
        ctx.font = 'bold 32px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(title, width / 2, 40);

        // Username
        ctx.fillStyle = '#e0e0e0';
        ctx.font = '20px Arial, sans-serif';
        ctx.fillText(`Spieler: ${username}`, width / 2, 70);

        // Separator line
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(50, 90);
        ctx.lineTo(width - 50, 90);
        ctx.stroke();
    }

    async drawBingoGrid(ctx, card, options) {
        const { x, y, size, color, checkedItems, confirmedEvents } = options;
        const cardSize = card.length;
        const cellSize = size / cardSize;
        const padding = 2;
        const innerCellSize = cellSize - padding * 2;

        for (let row = 0; row < cardSize; row++) {
            for (let col = 0; col < cardSize; col++) {
                const cellX = x + col * cellSize + padding;
                const cellY = y + row * cellSize + padding;
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

                // Draw cell background
                ctx.fillStyle = bgColor;
                ctx.fillRect(cellX, cellY, innerCellSize, innerCellSize);

                // Cell border
                ctx.strokeStyle = '#444';
                ctx.lineWidth = 1;
                ctx.strokeRect(cellX, cellY, innerCellSize, innerCellSize);

                // Cell text
                ctx.fillStyle = isFree || isConfirmed || isChecked ? '#000000' : '#ffffff';
                ctx.font = `${Math.max(12, innerCellSize / 8)}px Arial, sans-serif`;
                ctx.textAlign = 'center';

                // Word wrap for long text
                const wrappedText = this.wrapText(cellText, ctx, innerCellSize - 10);
                const lineHeight = Math.max(14, innerCellSize / 7);
                const totalTextHeight = wrappedText.length * lineHeight;
                const startY = cellY + (innerCellSize - totalTextHeight) / 2 + lineHeight;

                wrappedText.forEach((line, index) => {
                    ctx.fillText(
                        line,
                        cellX + innerCellSize / 2,
                        startY + index * lineHeight
                    );
                });

                // Position label (top-left corner)
                ctx.fillStyle = '#888';
                ctx.font = '10px Arial, sans-serif';
                ctx.textAlign = 'left';
                ctx.fillText(
                    `${row + 1}.${col + 1}`,
                    cellX + 4,
                    cellY + 14
                );

                // Status indicator
                if (isConfirmed) {
                    ctx.fillStyle = '#ffffff';
                    ctx.font = 'bold 16px Arial, sans-serif';
                    ctx.textAlign = 'center';
                    ctx.fillText('✓', cellX + innerCellSize - 12, cellY + 18);
                } else if (isChecked) {
                    ctx.fillStyle = '#000000';
                    ctx.font = 'bold 14px Arial, sans-serif';
                    ctx.textAlign = 'center';
                    ctx.fillText('?', cellX + innerCellSize - 12, cellY + 18);
                }
            }
        }
    }

    async drawFooter(ctx, width, height) {
        const footerY = height - 60;
        
        // Instructions
        ctx.fillStyle = '#a0a0a0';
        ctx.font = '14px Arial, sans-serif';
        ctx.textAlign = 'center';
        
        const instructions = [
            '✅ = Ereignis gemeldet (warte auf Bestätigung)',
            '✓ = Ereignis bestätigt',
            'FREE = Kostenloser Platz'
        ];

        instructions.forEach((instruction, index) => {
            ctx.fillText(
                instruction,
                width / 2,
                footerY + index * 18
            );
        });

        // Timestamp
        ctx.fillStyle = '#666';
        ctx.font = '12px Arial, sans-serif';
        ctx.fillText(
            `Erstellt: ${new Date().toLocaleString('de-DE')}`,
            width / 2,
            height - 10
        );
    }

    /**
     * Wrap text to fit within a given width
     */
    wrapText(text, ctx, maxWidth) {
        if (text === 'FREE') {
            return ['FREE'];
        }

        const words = text.split(' ');
        const lines = [];
        let currentLine = '';

        for (const word of words) {
            const testLine = currentLine + (currentLine ? ' ' : '') + word;
            const metrics = ctx.measureText(testLine);
            
            if (metrics.width > maxWidth && currentLine) {
                lines.push(currentLine);
                currentLine = word;
            } else {
                currentLine = testLine;
            }
        }
        
        if (currentLine) {
            lines.push(currentLine);
        }

        return lines.length > 0 ? lines : [text];
    }

    /**
     * Shuffle array using Fisher-Yates algorithm
     */
    shuffleArray(array) {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }

    /**
     * Check if a bingo card has any winning combinations
     * @param {string[][]} card - The bingo card
     * @param {Set} checkedPositions - Set of checked positions in format "row-col"
     * @returns {Object} Bingo status and type
     */
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

        // Check main diagonal (top-left to bottom-right)
        let hasMainDiagonal = true;
        for (let i = 0; i < size; i++) {
            const position = `${i}-${i}`;
            if (card[i][i] !== 'FREE' && !checkedPositions.has(position)) {
                hasMainDiagonal = false;
                break;
            }
        }
        if (hasMainDiagonal) {
            results.push({
                type: 'diagonal',
                number: 1,
                description: 'Diagonale (↘)'
            });
        }

        // Check anti-diagonal (top-right to bottom-left)
        let hasAntiDiagonal = true;
        for (let i = 0; i < size; i++) {
            const position = `${i}-${size - 1 - i}`;
            if (card[i][size - 1 - i] !== 'FREE' && !checkedPositions.has(position)) {
                hasAntiDiagonal = false;
                break;
            }
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

    /**
     * Generate a preview image for a bingo deck
     * @param {Object} deck - The bingo deck
     * @returns {Buffer} PNG image buffer
     */
    async generateDeckPreview(deck) {
        const width = 400;
        const height = 300;
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');

        // Background
        const gradient = ctx.createLinearGradient(0, 0, 0, height);
        gradient.addColorStop(0, deck.color || '#6366f1');
        gradient.addColorStop(1, '#1a1a1a');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);

        // Deck title
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 28px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(deck.name, width / 2, 50);

        // Description
        if (deck.description) {
            ctx.fillStyle = '#e0e0e0';
            ctx.font = '16px Arial, sans-serif';
            const wrappedDesc = this.wrapText(deck.description, ctx, width - 40);
            wrappedDesc.slice(0, 2).forEach((line, index) => {
                ctx.fillText(line, width / 2, 85 + index * 20);
            });
        }

        // Stats
        ctx.fillStyle = '#a0a0a0';
        ctx.font = '14px Arial, sans-serif';
        ctx.fillText(`${deck.events?.length || 0} Events verfügbar`, width / 2, 140);
        ctx.fillText(`Erstellt: ${new Date(deck.createdAt || Date.now()).toLocaleDateString('de-DE')}`, width / 2, 160);

        // Sample events (first 3)
        if (deck.events && deck.events.length > 0) {
            ctx.fillStyle = '#ffffff';
            ctx.font = '12px Arial, sans-serif';
            ctx.fillText('Beispiel Events:', width / 2, 190);
            
            const sampleEvents = deck.events.slice(0, 3);
            sampleEvents.forEach((event, index) => {
                ctx.fillStyle = '#c0c0c0';
                const truncated = event.length > 40 ? event.substring(0, 37) + '...' : event;
                ctx.fillText(`• ${truncated}`, width / 2, 210 + index * 16);
            });
        }

        return canvas.toBuffer('image/png');
    }

    /**
     * Save a bingo card image to the generated folder
     * @param {string[][]} card - The bingo card
     * @param {Object} options - Generation options
     * @param {string} filename - The filename to save as
     * @returns {string} Path to the saved file
     */
    async saveCardImage(card, options, filename) {
        const imageBuffer = await this.generateImage(card, options);
        const generatedDir = path.join(__dirname, '../../generated');
        
        // Ensure directory exists
        try {
            await fs.access(generatedDir);
        } catch {
            await fs.mkdir(generatedDir, { recursive: true });
        }

        const filePath = path.join(generatedDir, filename);
        await fs.writeFile(filePath, imageBuffer);
        
        return filePath;
    }

    /**
     * Generate multiple bingo cards for testing
     * @param {Object} deck - The bingo deck
     * @param {number} count - Number of cards to generate
     * @param {number} size - Size of each card
     * @returns {Array} Array of generated cards
     */
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

module.exports = BingoGenerator;
