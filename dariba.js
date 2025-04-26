// Game configuration setup
const config = {
    type: Phaser.AUTO,
    width: 560,
    height: 760, // Adjusted height from 720
    backgroundColor: '#DDDDDD',
    scene: { create, update } // Define scene methods
};

// Create Phaser game instance
const game = new Phaser.Game(config);

// Board and game state variables
const ROWS = 6, COLS = 6, CELL_SIZE = 80;
let board = [], playerKeys = { 1: 0, 2: 0 }, score = { 1: 0, 2: 0 };
let currentPlayer = 1, leadPlayer = 1;
let selectedPiece = null, strikeReady = false;
let graphics, statusText, infoText, leadText, scoreText, restartButton, undoButton;
let helpText;
let moveHistory = [], phase = 1, gameOver = false, winner = null;
let concedeClicks = 0;
let hoverCell = null;
let popupText;

// Create scene: setup input events, UI elements, and initialize the board
function create() {
    graphics = this.add.graphics();

    // Mouse click and move handlers
    this.input.on('pointerdown', (pointer) => handleClick(this, pointer));
    this.input.on('pointermove', handleHover);

    // Keyboard input for Undo (Ctrl+Z)
    this.input.keyboard.on('keydown-Z', undoLastMove);

    // Setup text elements
    leadText = this.add.text(config.width / 2, 10, '', { font: '20px Arial' }).setOrigin(0.5);
    infoText = this.add.text(config.width / 2, 40, '', { font: '16px Arial', fill: '#000' }).setOrigin(0.5);
    statusText = this.add.text(config.width / 2, 570, '', { font: '18px Arial' }).setOrigin(0.5);
    scoreText = this.add.text(config.width / 2, 590, '', { font: '16px Arial', fill: '#000' }).setOrigin(0.5);
    
    // Concede button
    concedeButton = this.add.text(config.width / 2, 705, 'Concede', {
        font: '18px Arial',
        fill: '#ffffff',
        backgroundColor: '#a00',
        padding: { x: 10, y: 5 }
    }).setOrigin(0.5).setInteractive();
    
    // Concede button events
    concedeButton.on('pointerdown', () => {
        if (!gameOver && phase === 2) {
            winner = 3 - currentPlayer;
            gameOver = true;
            score[winner]++;
            const winnerColor = winner === 1 ? "Black" : "Red";
            infoText.setText(`Player ${winner} (${winnerColor}) wins by concession!`);
            drawGrid();
            updateStatus();
        }
    });
    concedeButton.on('pointerover', () => concedeButton.setStyle({ backgroundColor: '#c00' }));

    // Help texts for players
    helpText1 = this.add.text(config.width / 2, 620,
        'Phase 1: Place 12 keys each without forming a line of 3.',
        { font: '14px Arial', fill: '#555' }
    ).setOrigin(0.5);
    
    helpText2 = this.add.text(config.width / 2, 640,
        'Phase 2: Move to form a line of 3 and strike. Concede if stuck.',
        { font: '14px Arial', fill: '#555' }
    ).setOrigin(0.5);

    // Strategy tips for advanced players
    strategyTipText = this.add.text(config.width / 2, 660,
        '🧠 Masters avoid Phase 1 traps by undoing placements that force 3+ keys.',
        { font: '13px Arial', fill: '#666', wordWrap: { width: 500 } }
    ).setOrigin(0.5);
    

    // Restart button
    restartButton = this.add.text(config.width / 2 - 100, 690, 'Restart Game', {
        font: '18px Arial',
        fill: '#ffffff',
        backgroundColor: '#444',
        padding: { x: 10, y: 5 }
    }).setOrigin(0.5).setInteractive();
    restartButton.on('pointerdown', resetGame);

    // Undo button
    undoButton = this.add.text(config.width / 2 + 100, 690, 'Undo Move', {
        font: '18px Arial',
        fill: '#ffffff',
        backgroundColor: '#444',
        padding: { x: 10, y: 5 }
    }).setOrigin(0.5).setInteractive();
    undoButton.on('pointerdown', undoLastMove);
    //This creates a red popup area right above the status line.
    popupText = this.add.text(config.width / 2, 530, '', {
        font: '16px Arial',
        fill: '#fff',
        backgroundColor: '#c00',
        padding: { x: 10, y: 5 }
    }).setOrigin(0.5).setVisible(false);

    // Initialize board state
    for (let r = 0; r < ROWS; r++) {
        board[r] = [];
        for (let c = 0; c < COLS; c++) {
            board[r][c] = 0;
        }
    }

    drawGrid();
    updateStatus();
}

// Empty update loop (needed by Phaser, even if unused)
function update() {}

// Draw the game grid and pieces
function drawGrid() {
    graphics.clear();
    graphics.lineStyle(4, 0x000000);
    const offsetX = (config.width - COLS * CELL_SIZE) / 2;
    const offsetY = 60;

    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            const x = offsetX + c * CELL_SIZE;
            const y = offsetY + r * CELL_SIZE;
            graphics.strokeRect(x, y, CELL_SIZE, CELL_SIZE);

            if (board[r][c] === 1) {
                graphics.fillStyle(0x000000, 1);
                graphics.fillCircle(x + CELL_SIZE / 2, y + CELL_SIZE / 2, 22);
            } else if (board[r][c] === 2) {
                graphics.fillStyle(0xDC143C, 1);
                graphics.fillCircle(x + CELL_SIZE / 2, y + CELL_SIZE / 2, 22);
            }

            // Highlight selected piece
            if (selectedPiece && selectedPiece[0] === r && selectedPiece[1] === c) {
                graphics.lineStyle(3, 0xFFD700);
                graphics.strokeCircle(x + CELL_SIZE / 2, y + CELL_SIZE / 2, 24);
                graphics.lineStyle(2, 0x000000);
            }
        }
    }
}

// Handle click events on the board
function handleClick(scene, pointer) {
    if (gameOver) return;

    const offsetX = (config.width - COLS * CELL_SIZE) / 2;
    const offsetY = 60;
    const col = Math.floor((pointer.x - offsetX) / CELL_SIZE);
    const row = Math.floor((pointer.y - offsetY) / CELL_SIZE);
    if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return;

    if (phase === 1) {
        // Phase 1: Placing keys
        if (board[row][col] === 0 && playerKeys[currentPlayer] < 12) {
            if (violatesRule(row, col, currentPlayer)) return;
            board[row][col] = currentPlayer;
            playerKeys[currentPlayer]++;
            moveHistory.push({ row, col, player: currentPlayer });

            if (playerKeys[1] === 12 && playerKeys[2] === 12) {
                phase = 2;
                currentPlayer = leadPlayer;
                infoText.setText("Phase 2 Begins. Move and Strike!");
            } else {
                currentPlayer = 3 - currentPlayer;
            }

            drawGrid();
            updateStatus();
        }
    } else if (phase === 2) {
        // Phase 2: Moving and striking
        if (strikeReady) {
            // Strike opponent's key
            if (board[row][col] === 3 - currentPlayer) {
                board[row][col] = 0;
                strikeReady = false;
                if (checkVictory()) {
                    gameOver = true;
                    score[winner]++;
                    statusText.setText(`Player ${winner} wins!`);
                } else {
                    currentPlayer = 3 - currentPlayer;
                    concedeClicks = 0;
                }
                drawGrid();
                updateStatus();
            }
            return;
        }

        if (selectedPiece) {
            const [sr, sc] = selectedPiece;
            if (Math.abs(sr - row) + Math.abs(sc - col) === 1 && board[row][col] === 0) {
                // Simulate the move
                board[sr][sc] = 0;
                board[row][col] = currentPlayer;
            
                // Check for invalid 4+ line
                const totalLine = getLineLength(row, col, currentPlayer);
            
                if (totalLine > 3) {
                    // ❗ Revert the move
                    board[sr][sc] = currentPlayer;
                    board[row][col] = 0;
                    showPopup("Invalid move: You cannot form more than 3 in a line.");
                    return;
                }
            
                // VALID move: check for strike
                selectedPiece = null;
            
                if (formsExactlyLineOfThree(row, col, currentPlayer)) {
                    strikeReady = true;
                    infoText.setText("Line of 3! Strike an opponent key.");
                } else {
                    currentPlayer = 3 - currentPlayer;
                    concedeClicks = 0;
                }
            
                drawGrid();
                updateStatus();            
            } else {
                selectedPiece = null;
                drawGrid();
            }
        } else if (board[row][col] === currentPlayer) {
            if (strikeReady) {
                showPopup("You must strike before making another move.");
            } else {
                selectedPiece = [row, col];
                drawGrid();
            }
        }
    }
}

// Undo the last move during Phase 1
function undoLastMove() {
    if (phase === 1 && moveHistory.length > 0) {
        const last = moveHistory.pop();
        board[last.row][last.col] = 0;
        playerKeys[last.player]--;
        currentPlayer = last.player;
        drawGrid();
        updateStatus();
    } else if (phase === 2) {
        showPopup("Undo is only available during key placement (Phase 1).");
    }
}
// Helper function for undo in second phase
function showPopup(message) {
    popupText.setText(message).setVisible(true);

    // Fade out after 2.5 seconds
    setTimeout(() => {
        popupText.setVisible(false);
    }, 2500);
}


// Handle hover for visual feedback (not used for gameplay)
function handleHover(pointer) {
    const offsetX = (config.width - COLS * CELL_SIZE) / 2;
    const offsetY = 60;
    const col = Math.floor((pointer.x - offsetX) / CELL_SIZE);
    const row = Math.floor((pointer.y - offsetY) / CELL_SIZE);
    hoverCell = (col >= 0 && col < COLS && row >= 0 && row < ROWS) ? [row, col] : null;
    drawGrid();
}

// Update status texts and game UI
function updateStatus() {
    const lead = leadPlayer === 1 ? "Black" : "Red";
    const leadColor = leadPlayer === 1 ? '#000000' : '#DC143C';
    const statusColor = currentPlayer === 1 ? '#000000' : '#DC143C';

    leadText.setText(`Lead: ${lead}`);
    leadText.setStyle({ fill: leadColor });
    statusText.setStyle({ fill: statusColor });

    if (concedeButton) {
        concedeButton.setVisible(phase === 2 && !gameOver);
    }

    if (!gameOver) {
        const playerColor = currentPlayer === 1 ? "Black" : "Red";

        if (phase === 1) {
            statusText.setText(`Player ${currentPlayer}'s Turn (${playerColor}) | Black Keys: ${playerKeys[1]} | Red Keys: ${playerKeys[2]}`);
        } else {
            statusText.setText(`Player ${currentPlayer}'s Turn (${playerColor})`);
        }
    }

    scoreText.setText(`Score - Black: ${score[1]} | Red: ${score[2]}`);
}

// Reset the game for a new round
function resetGame() {
    for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS; c++)
            board[r][c] = 0;

    playerKeys = { 1: 0, 2: 0 };
    selectedPiece = null;
    strikeReady = false;
    moveHistory = [];
    gameOver = false;
    winner = null;
    concedeClicks = 0;
    phase = 1;

    leadPlayer = leadPlayer === 1 ? 2 : 1;
    currentPlayer = leadPlayer;

    infoText.setText("");
    drawGrid();
    updateStatus();
}

// Check if placing here would create a line of three
function violatesRule(r, c, player) {
    board[r][c] = player;
    const result = createsLineOfThreeOrMore(r, c, player);
    board[r][c] = 0;
    return result;
}

// Check for a line of three for given player
// Phase 1: Prevent placing keys that form 3 or more in a line
function createsLineOfThreeOrMore(r, c, player) {
    const directions = [{ dr: 1, dc: 0 }, { dr: 0, dc: 1 }]; // Vertical and horizontal
    for (let { dr, dc } of directions) {
        let count = 1;

        // Count forward
        let i = 1;
        while (true) {
            const nr = r + dr * i;
            const nc = c + dc * i;
            if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS || board[nr][nc] !== player) break;
            count++;
            i++;
        }

        // Count backward
        i = 1;
        while (true) {
            const nr = r - dr * i;
            const nc = c - dc * i;
            if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS || board[nr][nc] !== player) break;
            count++;
            i++;
        }

        if (count >= 3) return true; // ❌ Illegal in Phase 1
    }
    return false;
}

// Phase 2: Check if move forms exactly a line of 3
function formsExactlyLineOfThree(r, c, player) {
    const directions = [{ dr: 1, dc: 0 }, { dr: 0, dc: 1 }];
    for (let { dr, dc } of directions) {
        let forward = 0, backward = 0;

        // Forward direction
        let i = 1;
        while (true) {
            const nr = r + dr * i;
            const nc = c + dc * i;
            if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS || board[nr][nc] !== player) break;
            forward++;
            i++;
        }

        // Backward direction
        i = 1;
        while (true) {
            const nr = r - dr * i;
            const nc = c - dc * i;
            if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS || board[nr][nc] !== player) break;
            backward++;
            i++;
        }

        // Total connected count = current + forward + backward
        const total = 1 + forward + backward;

        if (total === 3) return true;
    }
    return false;
}


// Check victory condition: fewer than 3 keys left
function checkVictory() {
    let p1 = 0, p2 = 0;
    for (let row of board)
        for (let cell of row)
            if (cell === 1) p1++; else if (cell === 2) p2++;
    if (p1 <= 2) return winner = 2, true;
    if (p2 <= 2) return winner = 1, true;
    return false;
}

// Helper Check if a player has a line of 4 or more
function getLineLength(r, c, player) {
    const directions = [{ dr: 1, dc: 0 }, { dr: 0, dc: 1 }];
    let maxLength = 1;

    for (let { dr, dc } of directions) {
        let forward = 0, backward = 0;

        let i = 1;
        while (true) {
            const nr = r + dr * i;
            const nc = c + dc * i;
            if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS || board[nr][nc] !== player) break;
            forward++;
            i++;
        }

        i = 1;
        while (true) {
            const nr = r - dr * i;
            const nc = c - dc * i;
            if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS || board[nr][nc] !== player) break;
            backward++;
            i++;
        }

        maxLength = Math.max(maxLength, 1 + forward + backward);
    }

    return maxLength;
}
