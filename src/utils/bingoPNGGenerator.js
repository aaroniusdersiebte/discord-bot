const fs = require('fs').promises;
const path = require('path');

// Try to load canvas with better error handling
let canvas;
let canvasError = null;

try {
    canvas = require('canvas');
    // Test if canvas actually works
    const testCanvas = canvas.createCanvas(10, 10);
    const testCtx = testCanvas.getContext('2d');
    testCtx.fillRect(0, 0, 10, 10);
    console.log('✅ Canvas successfully loaded and tested');
} catch (error) {
    canvasError = error;
    console.warn('⚠️ Canvas nicht verfügbar:', error.message);
    console.warn('⚠️ Fallback auf Text-Karten. Führe fix-canvas.bat aus für PNG-Unterstützung.');
    canvas = null;
}

class BingoPNGGenerator {
    constructor() {
        this.cardSize = 5;
        this.generatedDir = path.join(__dirname, '../../generated');
        this.canvasAvailable = !!canvas;
        this.canvasError = canvasError;
        this.ensureGeneratedDir();
        
        if (!this.canvasAvailable) {
            console.log('📝 PNG Generator läuft im Text-Modus (Canvas nicht verfügbar)');
        } else {
            console.log('🖼️ PNG Generator läuft im Bild-Modus');
        }
    }

    async ensureGeneratedDir() {
        try {
            await fs.access(this.generatedDir);
        } catch {
            await fs.mkdir(this.generatedDir, { recursive: true });
        }
    }

    /**
     * Generate a beautiful PNG bingo card or fallback to text
     */
    async generateCardPNG(card, options = {}) {
        if (!this.canvasAvailable) {
            return this.generateTextFallback(card, options);
        }

        try {
            const {
                title = 'Stream Bingo',
                username = 'Player',
                color = '#6366f1',
                checkedItems = new Set(),
                confirmedEvents = [],
                width = 1000,
                height = 1100
            } = options;

            const canvasInstance = canvas.createCanvas(width, height);
            const ctx = canvasInstance.getContext('2d');

            // Enable high quality rendering
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';

            const size = card.length;
            const cellSize = Math.min((width - 120) / size, (height - 300) / size);
            const gridSize = cellSize * size;
            const gridStartX = (width - gridSize) / 2;
            const gridStartY = 180;

            // Background gradient
            const bgGradient = ctx.createLinearGradient(0, 0, 0, height);
            bgGradient.addColorStop(0, '#0f0f23');
            bgGradient.addColorStop(1, '#1a1a2e');
            ctx.fillStyle = bgGradient;
            ctx.fillRect(0, 0, width, height);

            // Header background
            const headerGradient = ctx.createLinearGradient(0, 0, width, 0);
            headerGradient.addColorStop(0, color + '40');
            headerGradient.addColorStop(0.5, color + '80');
            headerGradient.addColorStop(1, color + '40');
            ctx.fillStyle = headerGradient;
            ctx.fillRect(0, 0, width, 150);

            // Title
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 42px "Segoe UI", Arial, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(title, width / 2, 50);

            // Username
            ctx.fillStyle = '#e0e0e0';
            ctx.font = '24px "Segoe UI", Arial, sans-serif';
            ctx.fillText(`Spieler: ${username}`, width / 2, 90);

            // Decorative line
            ctx.strokeStyle = color;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(80, 130);
            ctx.lineTo(width - 80, 130);
            ctx.stroke();

            // Draw grid shadow
            ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
            ctx.shadowBlur = 10;
            ctx.shadowOffsetY = 5;
            ctx.fillStyle = '#2a2a2a';
            ctx.fillRect(gridStartX - 5, gridStartY - 5, gridSize + 10, gridSize + 10);
            ctx.shadowColor = 'transparent';

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
                    let borderColor = '#444';
                    if (isFree) {
                        const freeGradient = ctx.createLinearGradient(cellX, cellY, cellX + cellSize, cellY + cellSize);
                        freeGradient.addColorStop(0, color);
                        freeGradient.addColorStop(1, this.darkenColor(color, 20));
                        ctx.fillStyle = freeGradient;
                        borderColor = color;
                    } else if (isConfirmed) {
                        const confirmedGradient = ctx.createLinearGradient(cellX, cellY, cellX + cellSize, cellY + cellSize);
                        confirmedGradient.addColorStop(0, '#22c55e');
                        confirmedGradient.addColorStop(1, '#16a34a');
                        ctx.fillStyle = confirmedGradient;
                        borderColor = '#22c55e';
                    } else if (isChecked) {
                        const pendingGradient = ctx.createLinearGradient(cellX, cellY, cellX + cellSize, cellY + cellSize);
                        pendingGradient.addColorStop(0, '#fbbf24');
                        pendingGradient.addColorStop(1, '#f59e0b');
                        ctx.fillStyle = pendingGradient;
                        borderColor = '#fbbf24';
                    } else {
                        ctx.fillStyle = bgColor;
                    }

                    // Draw cell with rounded corners
                    this.roundRect(ctx, cellX + 2, cellY + 2, cellSize - 4, cellSize - 4, 8);
                    ctx.fill();

                    // Border
                    ctx.strokeStyle = borderColor;
                    ctx.lineWidth = 2;
                    this.roundRect(ctx, cellX + 2, cellY + 2, cellSize - 4, cellSize - 4, 8);
                    ctx.stroke();

                    // Position label
                    ctx.fillStyle = '#888';
                    ctx.font = '12px "Segoe UI", Arial, sans-serif';
                    ctx.textAlign = 'left';
                    ctx.textBaseline = 'top';
                    ctx.fillText(`${row + 1}.${col + 1}`, cellX + 8, cellY + 8);

                    // Cell text
                    const wrappedText = this.wrapText(ctx, cellText, cellSize - 20);
                    const textColor = (isFree || isConfirmed || isChecked) ? '#000000' : '#ffffff';
                    const fontSize = Math.max(14, cellSize / 10);
                    
                    ctx.fillStyle = textColor;
                    ctx.font = `${isFree ? 'bold ' : ''}${fontSize}px "Segoe UI", Arial, sans-serif`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';

                    const lineHeight = fontSize * 1.2;
                    const totalHeight = wrappedText.length * lineHeight;
                    const startY = cellY + cellSize / 2 - totalHeight / 2 + lineHeight / 2;

                    wrappedText.forEach((line, index) => {
                        ctx.fillText(line, cellX + cellSize / 2, startY + index * lineHeight);
                    });

                    // Status indicator
                    if (isConfirmed) {
                        this.drawCheckmark(ctx, cellX + cellSize - 25, cellY + 10, '#ffffff');
                    } else if (isChecked) {
                        this.drawQuestionMark(ctx, cellX + cellSize - 25, cellY + 10, '#000000');
                    }
                }
            }

            // Legend
            const legendY = height - 120;
            const legendItems = [
                { icon: '⏳', text: 'Ereignis gemeldet (warte auf Bestätigung)', color: '#fbbf24' },
                { icon: '✓', text: 'Ereignis bestätigt', color: '#22c55e' },
                { icon: '★', text: 'Kostenloser Platz', color: color }
            ];

            ctx.fillStyle = 'rgba(42, 42, 42, 0.8)';
            this.roundRect(ctx, 40, legendY - 20, width - 80, 80, 10);
            ctx.fill();

            legendItems.forEach((item, index) => {
                const y = legendY + index * 20;
                ctx.fillStyle = item.color;
                ctx.font = 'bold 16px "Segoe UI", Arial, sans-serif';
                ctx.textAlign = 'left';
                ctx.fillText(item.icon, 60, y);
                
                ctx.fillStyle = '#e0e0e0';
                ctx.font = '14px "Segoe UI", Arial, sans-serif';
                ctx.fillText(item.text, 90, y);
            });

            // Footer
            ctx.fillStyle = '#888';
            ctx.font = '12px "Segoe UI", Arial, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(`Erstellt: ${new Date().toLocaleString('de-DE')}`, width / 2, height - 15);

            return canvasInstance.toBuffer('image/png');
            
        } catch (error) {
            console.error('❌ Canvas PNG generation failed, falling back to text:', error);
            return this.generateTextFallback(card, options);
        }
    }

    /**
     * Generate enhanced text fallback when Canvas is not available
     */
    generateTextFallback(card, options = {}) {
        const {
            title = 'Stream Bingo',
            username = 'Player',
            checkedItems = new Set(),
            confirmedEvents = []
        } = options;

        let text = `╔════════════════════════════════════════════╗\n`;
        text += `║              ${title.toUpperCase().padStart(20)}              ║\n`;
        text += `║              Spieler: ${username.padEnd(20)}     ║\n`;
        text += `╠════════════════════════════════════════════╣\n`;
        
        const size = card.length;
        
        // Create ASCII grid header
        text += `║  Pos │ Status │ Event${' '.repeat(25)}║\n`;
        text += `╠══════╪════════╪═══════════════════════════════╣\n`;
        
        // Create visual grid
        for (let row = 0; row < size; row++) {
            for (let col = 0; col < size; col++) {
                const cellText = card[row][col];
                const positionKey = `${row}-${col}`;
                
                let statusIcon = '  □  ';
                let statusText = 'Offen    ';
                
                if (confirmedEvents.includes(cellText)) {
                    statusIcon = ' ✅ ';
                    statusText = 'Bestätigt';
                } else if (checkedItems.has(positionKey)) {
                    statusIcon = ' ⏳ ';
                    statusText = 'Gemeldet ';
                } else if (cellText === 'FREE') {
                    statusIcon = ' ★ ';
                    statusText = 'Frei     ';
                }
                
                const position = `${row + 1}.${col + 1}`;
                const shortEvent = cellText.length > 25 ? cellText.substring(0, 22) + '...' : cellText.padEnd(25);
                
                text += `║ ${position.padEnd(4)} │ ${statusIcon} │ ${shortEvent} ║\n`;
            }
        }
        
        text += `╠════════════════════════════════════════════╣\n`;
        text += `║                  LEGENDE                   ║\n`;
        text += `╠════════════════════════════════════════════╣\n`;
        text += `║ □  = Nicht markiert                        ║\n`;
        text += `║ ⏳ = Gemeldet (warte auf Bestätigung)      ║\n`;
        text += `║ ✅ = Bestätigt                             ║\n`;
        text += `║ ★  = Kostenloser Platz                     ║\n`;
        text += `╠════════════════════════════════════════════╣\n`;
        text += `║ Erstellt: ${new Date().toLocaleString('de-DE').padEnd(28)} ║\n`;
        text += `╚════════════════════════════════════════════╝\n`;
        
        return Buffer.from(text, 'utf8');
    }

    /**
     * Save bingo card as PNG file or text fallback
     */
    async saveCardPNG(card, options, filename) {
        const buffer = await this.generateCardPNG(card, options);
        const extension = this.canvasAvailable ? '.png' : '.txt';
        const filePath = path.join(this.generatedDir, filename.replace(/\.[^.]*$/, extension));
        await fs.writeFile(filePath, buffer);
        return filePath;
    }

    /**
     * Generate a quick update PNG (smaller, faster)
     */
    async generateQuickUpdatePNG(card, options = {}) {
        if (!this.canvasAvailable) {
            return this.generateTextFallback(card, options);
        }
        
        try {
            return await this.generateCardPNG(card, {
                ...options,
                width: 800,
                height: 900
            });
        } catch (error) {
            console.error('❌ Quick PNG generation failed, falling back to text:', error);
            return this.generateTextFallback(card, options);
        }
    }

    // Helper methods
    roundRect(ctx, x, y, width, height, radius) {
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        ctx.lineTo(x + width, y + height - radius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        ctx.lineTo(x + radius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
    }

    wrapText(ctx, text, maxWidth) {
        if (text === 'FREE') return ['FREE'];
        
        const words = text.split(' ');
        const lines = [];
        let currentLine = words[0];

        for (let i = 1; i < words.length; i++) {
            const word = words[i];
            const width = ctx.measureText(currentLine + ' ' + word).width;
            if (width < maxWidth) {
                currentLine += ' ' + word;
            } else {
                lines.push(currentLine);
                currentLine = word;
            }
        }
        lines.push(currentLine);
        
        return lines.slice(0, 4); // Max 4 lines
    }

    drawCheckmark(ctx, x, y, color) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x, y + 8);
        ctx.lineTo(x + 5, y + 13);
        ctx.lineTo(x + 15, y + 3);
        ctx.stroke();
    }

    drawQuestionMark(ctx, x, y, color) {
        ctx.fillStyle = color;
        ctx.font = 'bold 16px "Segoe UI", Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('?', x + 8, y + 12);
    }

    darkenColor(color, percent) {
        const num = parseInt(color.replace('#', ''), 16);
        const amt = Math.round(2.55 * percent);
        const R = (num >> 16) - amt;
        const G = (num >> 8 & 0x00FF) - amt;
        const B = (num & 0x0000FF) - amt;
        return '#' + (0x1000000 + (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 +
            (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 +
            (B < 255 ? B < 1 ? 0 : B : 255)).toString(16).slice(1);
    }

    /**
     * Generate bingo card from events
     */
    generateCard(events, size = 5) {
        if (!events || events.length === 0) {
            throw new Error('Keine Events verfügbar für die Bingo-Karte');
        }

        const totalCells = size * size;
        const hasCenter = size % 2 === 1;
        const requiredEvents = hasCenter ? totalCells - 1 : totalCells;

        if (events.length < requiredEvents) {
            throw new Error(`Nicht genügend Events (${events.length}) für ${size}x${size} Karte (benötigt: ${requiredEvents})`);
        }

        const shuffledEvents = this.shuffleArray([...events]);
        const selectedEvents = shuffledEvents.slice(0, requiredEvents);

        const card = [];
        let eventIndex = 0;

        for (let row = 0; row < size; row++) {
            const cardRow = [];
            for (let col = 0; col < size; col++) {
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

    shuffleArray(array) {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }

    // Diagnostic methods
    getCanvasInfo() {
        return {
            available: this.canvasAvailable,
            error: this.canvasError ? this.canvasError.message : null,
            fallbackMode: !this.canvasAvailable
        };
    }
}

module.exports = BingoPNGGenerator;
