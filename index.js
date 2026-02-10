const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const session = require('express-session');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Discord OAuth config
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID || 'YOUR_DISCORD_CLIENT_ID';
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET || 'YOUR_DISCORD_CLIENT_SECRET';
const DISCORD_REDIRECT_URI = process.env.DISCORD_REDIRECT_URI || 'http://localhost:3000/auth/discord/callback';

// Middleware
app.use(express.json());
app.use(express.static('public'));
app.use(session({
    secret: 'snake-game-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }
}));

// Initialize Database
const db = new sqlite3.Database('./game.db', (err) => {
    if (err) {
        console.error('Database connection error:', err);
    } else {
        console.log('Connected to SQLite database');
        initializeDatabase();
    }
});

function initializeDatabase() {
    db.serialize(() => {
        // Users table
        db.run(`
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                discord_id TEXT UNIQUE NOT NULL,
                username TEXT NOT NULL,
                coins REAL DEFAULT 1000,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // System/House wallet
        db.run(`
            CREATE TABLE IF NOT EXISTS system (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                house_coins REAL DEFAULT 0
            )
        `);

        // Insert default system row
        db.run(`INSERT OR IGNORE INTO system (id, house_coins) VALUES (1, 0)`);

        // Active game sessions (in-memory tracking)
        db.run(`
            CREATE TABLE IF NOT EXISTS game_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                discord_id TEXT NOT NULL,
                username TEXT NOT NULL,
                current_coins REAL DEFAULT 0,
                segments INTEGER DEFAULT 3,
                kills INTEGER DEFAULT 0,
                is_cashing_out BOOLEAN DEFAULT 0,
                entry_fee REAL DEFAULT 0,
                is_tournament BOOLEAN DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        `);
    });
}

// ==================== DISCORD AUTH ====================

app.get('/auth/discord', (req, res) => {
    const discordAuthUrl = `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(DISCORD_REDIRECT_URI)}&response_type=code&scope=identify`;
    res.redirect(discordAuthUrl);
});

app.get('/auth/discord/callback', async (req, res) => {
    const { code } = req.query;

    if (!code) {
        return res.redirect('/?error=no_code');
    }

    try {
        // Exchange code for token
        const tokenResponse = await axios.post('https://discord.com/api/oauth2/token', 
            new URLSearchParams({
                client_id: DISCORD_CLIENT_ID,
                client_secret: DISCORD_CLIENT_SECRET,
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: DISCORD_REDIRECT_URI
            }),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );

        const { access_token } = tokenResponse.data;

        // Get user info
        const userResponse = await axios.get('https://discord.com/api/users/@me', {
            headers: {
                Authorization: `Bearer ${access_token}`
            }
        });

        const { id: discord_id, username } = userResponse.data;

        // Store or update user in database
        db.run(
            `INSERT INTO users (discord_id, username) VALUES (?, ?) 
             ON CONFLICT(discord_id) DO UPDATE SET username = ?`,
            [discord_id, username, username],
            function(err) {
                if (err) {
                    console.error('Database error:', err);
                    return res.redirect('/?error=db_error');
                }

                // Set session
                req.session.user = {
                    discord_id,
                    username
                };

                res.redirect('/');
            }
        );

    } catch (error) {
        console.error('Discord OAuth error:', error.response?.data || error.message);
        res.redirect('/?error=auth_failed');
    }
});

app.get('/auth/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

app.get('/auth/user', (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    db.get(
        'SELECT discord_id, username, coins FROM users WHERE discord_id = ?',
        [req.session.user.discord_id],
        (err, user) => {
            if (err || !user) {
                return res.status(404).json({ error: 'User not found' });
            }
            res.json(user);
        }
    );
});

// ==================== GAME ENDPOINTS ====================

// Join game
app.post('/game/join', (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    const { entryFee = 0, isTournament = false } = req.body;

    db.get(
        'SELECT id, discord_id, username, coins FROM users WHERE discord_id = ?',
        [req.session.user.discord_id],
        (err, user) => {
            if (err || !user) {
                return res.status(404).json({ error: 'User not found' });
            }

            if (user.coins < entryFee) {
                return res.status(400).json({ error: 'Insufficient coins' });
            }

            // Check if user already has active session
            db.get(
                'SELECT id FROM game_sessions WHERE discord_id = ? AND is_cashing_out = 0',
                [user.discord_id],
                (err, existingSession) => {
                    if (existingSession) {
                        return res.status(400).json({ error: 'Already in game' });
                    }

                    // Deduct entry fee atomically
                    db.run('BEGIN TRANSACTION');
                    db.run(
                        'UPDATE users SET coins = coins - ? WHERE discord_id = ?',
                        [entryFee, user.discord_id],
                        (err) => {
                            if (err) {
                                db.run('ROLLBACK');
                                return res.status(500).json({ error: 'Failed to deduct entry fee' });
                            }

                            // Create game session
                            db.run(
                                `INSERT INTO game_sessions (user_id, discord_id, username, current_coins, entry_fee, is_tournament)
                                 VALUES (?, ?, ?, ?, ?, ?)`,
                                [user.id, user.discord_id, user.username, entryFee, entryFee, isTournament ? 1 : 0],
                                function(err) {
                                    if (err) {
                                        db.run('ROLLBACK');
                                        return res.status(500).json({ error: 'Failed to create session' });
                                    }

                                    db.run('COMMIT');
                                    res.json({
                                        sessionId: this.lastID,
                                        username: user.username,
                                        startingCoins: entryFee,
                                        remainingCoins: user.coins - entryFee
                                    });
                                }
                            );
                        }
                    );
                }
            );
        }
    );
});

// Register kill
app.post('/game/kill', (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    const { killedDiscordId } = req.body;

    db.serialize(() => {
        db.run('BEGIN TRANSACTION');

        // Get killer session
        db.get(
            'SELECT * FROM game_sessions WHERE discord_id = ? AND is_cashing_out = 0',
            [req.session.user.discord_id],
            (err, killer) => {
                if (err || !killer) {
                    db.run('ROLLBACK');
                    return res.status(404).json({ error: 'Killer session not found' });
                }

                // Get killed session
                db.get(
                    'SELECT * FROM game_sessions WHERE discord_id = ?',
                    [killedDiscordId],
                    (err, killed) => {
                        if (err || !killed) {
                            db.run('ROLLBACK');
                            return res.status(404).json({ error: 'Killed session not found' });
                        }

                        // Transfer coins and segments
                        const newCoins = killer.current_coins + killed.current_coins;
                        const newSegments = killer.segments + killed.segments;
                        const newKills = killer.kills + 1;

                        // Update killer
                        db.run(
                            `UPDATE game_sessions 
                             SET current_coins = ?, segments = ?, kills = ?
                             WHERE id = ?`,
                            [newCoins, newSegments, newKills, killer.id],
                            (err) => {
                                if (err) {
                                    db.run('ROLLBACK');
                                    return res.status(500).json({ error: 'Failed to update killer' });
                                }

                                // Delete killed session
                                db.run(
                                    'DELETE FROM game_sessions WHERE id = ?',
                                    [killed.id],
                                    (err) => {
                                        if (err) {
                                            db.run('ROLLBACK');
                                            return res.status(500).json({ error: 'Failed to delete killed session' });
                                        }

                                        db.run('COMMIT');
                                        res.json({
                                            gainedCoins: killed.current_coins,
                                            gainedSegments: killed.segments,
                                            totalCoins: newCoins,
                                            totalSegments: newSegments,
                                            totalKills: newKills
                                        });
                                    }
                                );
                            }
                        );
                    }
                );
            }
        );
    });
});

// Start cashout
app.post('/game/start-cashout', (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    db.run(
        'UPDATE game_sessions SET is_cashing_out = 1 WHERE discord_id = ?',
        [req.session.user.discord_id],
        function(err) {
            if (err) {
                return res.status(500).json({ error: 'Failed to start cashout' });
            }

            if (this.changes === 0) {
                return res.status(404).json({ error: 'Session not found' });
            }

            res.json({ success: true, message: 'Cashout started' });
        }
    );
});

// Finish cashout (successful - snake fully disappeared)
app.post('/game/finish-cashout', (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    db.serialize(() => {
        db.run('BEGIN TRANSACTION');

        // Get session
        db.get(
            'SELECT * FROM game_sessions WHERE discord_id = ? AND is_cashing_out = 1',
            [req.session.user.discord_id],
            (err, session) => {
                if (err || !session) {
                    db.run('ROLLBACK');
                    return res.status(404).json({ error: 'Cashout session not found' });
                }

                // Calculate payout (95% to player, 5% to house)
                const totalCoins = session.current_coins;
                const fee = totalCoins * 0.05;
                const playerPayout = totalCoins * 0.95;

                // Update user coins
                db.run(
                    'UPDATE users SET coins = coins + ? WHERE discord_id = ?',
                    [playerPayout, session.discord_id],
                    (err) => {
                        if (err) {
                            db.run('ROLLBACK');
                            return res.status(500).json({ error: 'Failed to update user coins' });
                        }

                        // Update house coins
                        db.run(
                            'UPDATE system SET house_coins = house_coins + ? WHERE id = 1',
                            [fee],
                            (err) => {
                                if (err) {
                                    db.run('ROLLBACK');
                                    return res.status(500).json({ error: 'Failed to update house coins' });
                                }

                                // Delete session
                                db.run(
                                    'DELETE FROM game_sessions WHERE id = ?',
                                    [session.id],
                                    (err) => {
                                        if (err) {
                                            db.run('ROLLBACK');
                                            return res.status(500).json({ error: 'Failed to delete session' });
                                        }

                                        // Get updated user coins
                                        db.get(
                                            'SELECT coins FROM users WHERE discord_id = ?',
                                            [session.discord_id],
                                            (err, user) => {
                                                db.run('COMMIT');
                                                res.json({
                                                    success: true,
                                                    gained: playerPayout,
                                                    fee: fee,
                                                    kills: session.kills,
                                                    totalCoins: user ? user.coins : 0
                                                });
                                            }
                                        );
                                    }
                                );
                            }
                        );
                    }
                );
            }
        );
    });
});

// Get active players (for rendering other snakes)
app.get('/game/players', (req, res) => {
    db.all(
        'SELECT discord_id, username, segments, is_cashing_out FROM game_sessions',
        [],
        (err, players) => {
            if (err) {
                return res.status(500).json({ error: 'Failed to fetch players' });
            }
            res.json({ players });
        }
    );
});

// Tournament join
app.post('/tournament/join', (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    const TOURNAMENT_ENTRY_FEE = 5000000; // 5 million coins

    db.get(
        'SELECT coins FROM users WHERE discord_id = ?',
        [req.session.user.discord_id],
        (err, user) => {
            if (err || !user) {
                return res.status(404).json({ error: 'User not found' });
            }

            if (user.coins < TOURNAMENT_ENTRY_FEE) {
                return res.status(400).json({ 
                    error: 'Insufficient coins',
                    required: TOURNAMENT_ENTRY_FEE,
                    current: user.coins
                });
            }

            // Use the join game endpoint with tournament flag
            req.body = { entryFee: TOURNAMENT_ENTRY_FEE, isTournament: true };
            // Forward to join endpoint
            res.json({ success: true, entryFee: TOURNAMENT_ENTRY_FEE });
        }
    );
});

// Start server
app.listen(PORT, () => {
    console.log(`🐍 Snake Game Server running on http://localhost:${PORT}`);
});
