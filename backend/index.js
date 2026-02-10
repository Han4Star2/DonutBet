import express from "express";
import sqlite3 from "sqlite3";
import cors from "cors";
import crypto from "crypto";
import axios from "axios";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(cors());

// ------------------------
// Statische Dateien ausliefern
// ------------------------
app.use(express.static(__dirname));

// ------------------------
// Startseite
// ------------------------
app.get("/", (req, res) => {
  res.send(`
    <h2>Willkommen bei DonutBet!</h2>
    <p><a href="/auth/discord">Login mit Discord</a></p>
  `);
});

// ------------------------
// Datenbank initialisieren
// ------------------------
const db = new sqlite3.Database("payments.db");

// Tabelle für Minecraft-Zahlungen
db.run(`
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  username TEXT,
  amount INTEGER,
  status TEXT,
  created_at INTEGER,
  confirmed_at INTEGER
)
`);

// Tabelle für Discord-User + Coins
db.run(`
CREATE TABLE IF NOT EXISTS users (
  discord_id TEXT PRIMARY KEY,
  username TEXT,
  coins INTEGER DEFAULT 0
)
`);

// ------------------------
// Minecraft Payment Endpoints
// ------------------------
app.post("/create-payment", (req, res) => {
  const { username, amount } = req.body;
  const id = crypto.randomUUID();

  db.run(
    `INSERT INTO payments VALUES (?, ?, ?, 'pending', ?, NULL)`,
    [id, username, amount, Date.now()]
  );

  res.json({ id });
});

app.post("/confirm-payment", (req, res) => {
  const { username, amount } = req.body;

  db.run(
    `UPDATE payments SET status='confirmed', confirmed_at=?
     WHERE username=? AND amount=? AND status='pending'`,
    [Date.now(), username, amount]
  );

  // Coins automatisch hinzufügen (1 Coin pro 1 Einheit)
  const coinsToAdd = amount;
  db.run(
    `UPDATE users SET coins = coins + ? WHERE username=?`,
    [coinsToAdd, username]
  );

  res.send("ok");
});

// ------------------------
// Discord OAuth2 Login
// ------------------------
const CLIENT_ID = "1470520069086904456"; // Deine echte Client ID
const CLIENT_SECRET = "Y9TBbIElTU0MoH6VodaG5J-Sgj2jTUlw"; // Dein Client Secret
const REDIRECT_URI = "https://donutbet.up.railway.app/auth/discord/callback"; // Railway URL + Callback

// Login starten
app.get("/auth/discord", (req, res) => {
  const url = `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=identify`;
  res.redirect(url);
});

app.get("/auth/discord/callback", async (req, res) => {
  const code = req.query.code;

  try {
    const tokenRes = await axios.post(
      "https://discord.com/api/oauth2/token",
      new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: "authorization_code",
        code: code,
        redirect_uri: REDIRECT_URI
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    const accessToken = tokenRes.data.access_token;

    const userRes = await axios.get("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    const discordId = userRes.data.id;
    const username = userRes.data.username;

    console.log("User logged in:", discordId, username);

    db.run(`
      INSERT INTO users (discord_id, username, coins)
      VALUES (?, ?, 100)
      ON CONFLICT(discord_id) DO UPDATE SET username=excluded.username
    `, [discordId, username]);

    res.redirect(`/?discordId=${discordId}`);

  } catch (err) {
    // Detailliertes Logging für Discord Fehler
    console.error("Discord OAuth Error:", err.response?.data || err.message);
    res.send(`Fehler beim Discord-Login:<br>${JSON.stringify(err.response?.data || err.message)}`);
  }
});

// ------------------------
// Coins abfragen
// ------------------------
app.get("/get-coins/:discordId", (req, res) => {
  const discordId = req.params.discordId;
  db.get(`SELECT coins FROM users WHERE discord_id=?`, [discordId], (err, row) => {
    if (!row) return res.json({ coins: 0 });
    res.json({ coins: row.coins });
  });
});

// ------------------------
// Coins ändern (für Spiele)
app.get("/change-coins/:discordId/:amount", (req, res) => {
  const { discordId, amount } = req.params;
  const a = parseInt(amount);
  db.run(`UPDATE users SET coins = coins + ? WHERE discord_id=?`, [a, discordId]);
  res.send("ok");
});

// ------------------------
// Payment Status abfragen
// ------------------------
app.get("/payment-status/:id", (req, res) => {
  db.get(
    `SELECT status FROM payments WHERE id=?`,
    [req.params.id],
    (err, row) => {
      if (!row) return res.json({ status: "not_found" });
      res.json({ status: row.status });
    }
  );
});

// ------------------------
app.listen(process.env.PORT || 3000, () => {
  console.log("Backend läuft");
});

<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>DonutBet - Premium Coinflip Casino</title>
    
    <!-- GSAP für Animationen -->
    <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"></script>
    
    <!-- Fonts -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700;900&family=Montserrat:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            -webkit-tap-highlight-color: transparent;
        }

        :root {
            --bg-dark: #0a0e27;
            --bg-darker: #050816;
            --gold: #ffd700;
            --gold-dark: #daa520;
            --gold-light: #ffe55c;
            --blue-accent: #1e3a8a;
            --text-light: #e5e7eb;
            --text-dim: #9ca3af;
            --success: #10b981;
            --error: #ef4444;
            --shadow-gold: rgba(255, 215, 0, 0.3);
            --shadow-dark: rgba(0, 0, 0, 0.5);
        }

        body {
            font-family: 'Montserrat', sans-serif;
            background: linear-gradient(135deg, var(--bg-darker) 0%, var(--bg-dark) 50%, #1a1f3a 100%);
            color: var(--text-light);
            min-height: 100vh;
            overflow-x: hidden;
            position: relative;
        }

        /* Decorative Background Elements */
        body::before {
            content: '';
            position: fixed;
            top: -50%;
            left: -50%;
            width: 200%;
            height: 200%;
            background: radial-gradient(circle at 30% 50%, rgba(255, 215, 0, 0.05) 0%, transparent 50%),
                        radial-gradient(circle at 70% 80%, rgba(30, 58, 138, 0.08) 0%, transparent 50%);
            pointer-events: none;
            z-index: 0;
        }

        .container {
            max-width: 1400px;
            margin: 0 auto;
            padding: 20px;
            position: relative;
            z-index: 1;
        }

        /* Header */
        header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 20px 0;
            margin-bottom: 40px;
            border-bottom: 2px solid rgba(255, 215, 0, 0.2);
        }

        .logo {
            font-family: 'Cinzel', serif;
            font-size: clamp(2rem, 5vw, 3.5rem);
            font-weight: 900;
            background: linear-gradient(135deg, var(--gold) 0%, var(--gold-light) 50%, var(--gold) 100%);
            -webkit-background-clip: text;
            background-clip: text;
            -webkit-text-fill-color: transparent;
            text-shadow: 0 0 40px var(--shadow-gold);
            letter-spacing: 2px;
            position: relative;
        }

        .logo::after {
            content: '🍩';
            position: absolute;
            top: -10px;
            right: -40px;
            font-size: 0.6em;
            filter: drop-shadow(0 0 10px var(--gold));
        }

        .user-section {
            display: flex;
            align-items: center;
            gap: 20px;
        }

        .coin-balance {
            font-family: 'Cinzel', serif;
            font-size: 1.2rem;
            color: var(--gold);
            font-weight: 600;
            display: none; /* Nur wenn angemeldet */
        }

        .coin-balance.active {
            display: block;
        }

        .login-btn, .profile {
            padding: 12px 28px;
            background: linear-gradient(135deg, var(--gold-dark) 0%, var(--gold) 100%);
            color: var(--bg-darker);
            border: none;
            border-radius: 50px;
            font-weight: 600;
            font-size: 1rem;
            cursor: pointer;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            box-shadow: 0 4px 15px var(--shadow-gold), inset 0 1px 0 rgba(255, 255, 255, 0.3);
            font-family: 'Montserrat', sans-serif;
            text-transform: uppercase;
            letter-spacing: 1px;
        }

        .login-btn:hover, .login-btn:active {
            transform: scale(1.05);
            box-shadow: 0 6px 25px var(--shadow-gold);
        }

        .login-btn:active {
            transform: scale(1.1);
        }

        .profile {
            display: none; /* Nur wenn angemeldet */
            align-items: center;
            gap: 12px;
            padding: 8px 20px 8px 8px;
        }

        .profile.active {
            display: flex;
        }

        .profile img {
            width: 40px;
            height: 40px;
            border-radius: 50%;
            border: 2px solid var(--gold);
        }

        /* Game Overview */
        .games-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 30px;
            margin-bottom: 50px;
        }

        .game-card {
            background: linear-gradient(135deg, rgba(255, 215, 0, 0.05) 0%, rgba(30, 58, 138, 0.1) 100%);
            border: 2px solid rgba(255, 215, 0, 0.2);
            border-radius: 20px;
            padding: 40px 30px;
            text-align: center;
            cursor: pointer;
            transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
            position: relative;
            overflow: hidden;
            backdrop-filter: blur(10px);
        }

        .game-card::before {
            content: '';
            position: absolute;
            top: -50%;
            left: -50%;
            width: 200%;
            height: 200%;
            background: radial-gradient(circle, rgba(255, 215, 0, 0.1) 0%, transparent 70%);
            opacity: 0;
            transition: opacity 0.4s;
        }

        .game-card:hover::before {
            opacity: 1;
        }

        .game-card:hover {
            transform: translateY(-10px) scale(1.02);
            border-color: var(--gold);
            box-shadow: 0 20px 60px var(--shadow-gold);
        }

        .game-card.disabled {
            opacity: 0.4;
            cursor: not-allowed;
            filter: grayscale(1);
        }

        .game-card.disabled:hover {
            transform: none;
            box-shadow: none;
        }

        .game-icon {
            font-size: 4rem;
            margin-bottom: 20px;
            filter: drop-shadow(0 0 20px var(--gold));
        }

        .game-title {
            font-family: 'Cinzel', serif;
            font-size: 1.8rem;
            font-weight: 700;
            color: var(--gold);
            margin-bottom: 10px;
        }

        .game-desc {
            color: var(--text-dim);
            font-size: 0.95rem;
        }

        /* Coinflip Game Section */
        .coinflip-section {
            display: none;
            max-width: 800px;
            margin: 0 auto;
            padding: 40px 20px;
        }

        .coinflip-section.active {
            display: block;
        }

        .back-btn {
            background: rgba(255, 215, 0, 0.1);
            border: 1px solid rgba(255, 215, 0, 0.3);
            color: var(--gold);
            padding: 10px 20px;
            border-radius: 10px;
            cursor: pointer;
            font-weight: 600;
            margin-bottom: 30px;
            transition: all 0.3s;
            font-family: 'Montserrat', sans-serif;
        }

        .back-btn:hover {
            background: rgba(255, 215, 0, 0.2);
            transform: scale(1.05);
        }

        .coin-container {
            perspective: 1000px;
            margin: 60px auto;
            width: 250px;
            height: 250px;
            position: relative;
        }

        .coin {
            width: 100%;
            height: 100%;
            position: relative;
            transform-style: preserve-3d;
            transition: transform 0.1s;
        }

        .coin-face {
            position: absolute;
            width: 100%;
            height: 100%;
            border-radius: 50%;
            background: linear-gradient(135deg, var(--gold-dark) 0%, var(--gold) 50%, var(--gold-light) 100%);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 8rem;
            font-family: 'Cinzel', serif;
            font-weight: 900;
            color: var(--bg-darker);
            backface-visibility: hidden;
            box-shadow: 0 20px 60px var(--shadow-gold), inset 0 0 30px rgba(0, 0, 0, 0.3);
            border: 8px solid var(--gold-light);
            text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3);
        }

        .coin-face.heads {
            transform: rotateY(0deg);
        }

        .coin-face.tails {
            transform: rotateY(180deg);
        }

        /* Game Controls */
        .game-controls {
            display: flex;
            flex-direction: column;
            gap: 30px;
            align-items: center;
        }

        .choice-buttons {
            display: flex;
            gap: 20px;
            flex-wrap: wrap;
            justify-content: center;
        }

        .choice-btn {
            padding: 20px 50px;
            font-size: 1.3rem;
            font-weight: 700;
            font-family: 'Cinzel', serif;
            border: 3px solid var(--gold);
            background: rgba(255, 215, 0, 0.1);
            color: var(--gold);
            border-radius: 15px;
            cursor: pointer;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            position: relative;
            overflow: hidden;
            text-transform: uppercase;
            letter-spacing: 2px;
        }

        .choice-btn::before {
            content: '';
            position: absolute;
            top: 50%;
            left: 50%;
            width: 0;
            height: 0;
            border-radius: 50%;
            background: rgba(255, 215, 0, 0.3);
            transform: translate(-50%, -50%);
            transition: width 0.6s, height 0.6s;
        }

        .choice-btn:hover::before {
            width: 300px;
            height: 300px;
        }

        .choice-btn:hover {
            transform: scale(1.08);
            box-shadow: 0 10px 40px var(--shadow-gold);
            background: rgba(255, 215, 0, 0.2);
        }

        .choice-btn:active {
            transform: scale(1.15);
        }

        .choice-btn.selected {
            background: linear-gradient(135deg, var(--gold-dark) 0%, var(--gold) 100%);
            color: var(--bg-darker);
            border-color: var(--gold-light);
        }

        .bet-input-group {
            display: flex;
            flex-direction: column;
            gap: 15px;
            width: 100%;
            max-width: 400px;
        }

        .bet-input {
            padding: 18px 25px;
            font-size: 1.3rem;
            font-weight: 600;
            background: rgba(255, 215, 0, 0.05);
            border: 2px solid rgba(255, 215, 0, 0.3);
            border-radius: 12px;
            color: var(--gold);
            text-align: center;
            font-family: 'Cinzel', serif;
            transition: all 0.3s;
        }

        .bet-input:focus {
            outline: none;
            border-color: var(--gold);
            background: rgba(255, 215, 0, 0.1);
            box-shadow: 0 0 30px var(--shadow-gold);
        }

        .bet-input::placeholder {
            color: var(--text-dim);
        }

        .bet-btn {
            padding: 20px 60px;
            font-size: 1.5rem;
            font-weight: 900;
            font-family: 'Cinzel', serif;
            background: linear-gradient(135deg, var(--gold-dark) 0%, var(--gold) 50%, var(--gold-light) 100%);
            color: var(--bg-darker);
            border: none;
            border-radius: 15px;
            cursor: pointer;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            box-shadow: 0 10px 40px var(--shadow-gold);
            text-transform: uppercase;
            letter-spacing: 3px;
        }

        .bet-btn:hover {
            transform: scale(1.08);
            box-shadow: 0 15px 50px var(--shadow-gold);
        }

        .bet-btn:active {
            transform: scale(1.12);
        }

        .bet-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
            transform: none;
        }

        /* Result Display */
        .result-display {
            margin-top: 40px;
            text-align: center;
            min-height: 100px;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .result-text {
            font-family: 'Cinzel', serif;
            font-size: 2.5rem;
            font-weight: 900;
            opacity: 0;
            transform: scale(0.5);
            text-transform: uppercase;
            letter-spacing: 3px;
        }

        .result-text.win {
            color: var(--success);
            text-shadow: 0 0 30px var(--success);
        }

        .result-text.lose {
            color: var(--error);
            text-shadow: 0 0 30px var(--error);
        }

        /* Responsive */
        @media (max-width: 768px) {
            .logo {
                font-size: 2rem;
            }

            .logo::after {
                right: -30px;
                top: -5px;
            }

            .games-grid {
                grid-template-columns: 1fr;
                gap: 20px;
            }

            .coin-container {
                width: 200px;
                height: 200px;
            }

            .coin-face {
                font-size: 6rem;
            }

            .choice-btn {
                padding: 15px 35px;
                font-size: 1.1rem;
            }

            .bet-btn {
                padding: 18px 40px;
                font-size: 1.2rem;
            }

            .result-text {
                font-size: 1.8rem;
            }
        }

        /* Touch feedback */
        @media (hover: none) {
            .choice-btn:active,
            .bet-btn:active,
            .login-btn:active {
                transform: scale(1.15);
            }
        }

        /* Loading spinner */
        .spinner {
            display: none;
            width: 50px;
            height: 50px;
            border: 5px solid rgba(255, 215, 0, 0.2);
            border-top-color: var(--gold);
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin: 20px auto;
        }

        @keyframes spin {
            to { transform: rotate(360deg); }
        }
    </style>
</head>
<body>
    <div class="container">
        <!-- Header -->
        <header>
            <div class="logo">DonutBet</div>
            <div class="user-section">
                <div class="coin-balance" id="coinBalance">💰 1000 Coins</div>
                <button class="login-btn" id="loginBtn">Login mit Discord</button>
                <div class="profile" id="profile">
                    <img src="https://via.placeholder.com/40" alt="Profile" id="profileImg">
                    <span id="username">User#1234</span>
                </div>
            </div>
        </header>

        <!-- Games Overview -->
        <div class="games-overview" id="gamesOverview">
            <div class="games-grid">
                <div class="game-card disabled" data-game="coinflip">
                    <div class="game-icon">🪙</div>
                    <h2 class="game-title">Coinflip</h2>
                    <p class="game-desc">Setze auf Heads oder Tails und verdopple deinen Einsatz!</p>
                </div>
                <div class="game-card disabled" data-game="dice">
                    <div class="game-icon">🎲</div>
                    <h2 class="game-title">Dice Roll</h2>
                    <p class="game-desc">Coming Soon - Würfle dein Glück!</p>
                </div>
                <div class="game-card disabled" data-game="crash">
                    <div class="game-icon">🚀</div>
                    <h2 class="game-title">Crash</h2>
                    <p class="game-desc">Coming Soon - Wie hoch kannst du fliegen?</p>
                </div>
                <div class="game-card disabled" data-game="roulette">
                    <div class="game-icon">🎰</div>
                    <h2 class="game-title">Roulette</h2>
                    <p class="game-desc">Coming Soon - Drehe das Rad des Glücks!</p>
                </div>
            </div>
        </div>

        <!-- Coinflip Game Section -->
        <div class="coinflip-section" id="coinflipSection">
            <button class="back-btn" id="backBtn">← Zurück zur Übersicht</button>
            
            <div class="coin-container">
                <div class="coin" id="coin">
                    <div class="coin-face heads">H</div>
                    <div class="coin-face tails">T</div>
                </div>
            </div>

            <div class="game-controls">
                <div class="choice-buttons">
                    <button class="choice-btn" data-choice="heads"><span style="font-size: 2rem; font-weight: 900; margin-right: 8px;">H</span>Heads</button>
                    <button class="choice-btn" data-choice="tails"><span style="font-size: 2rem; font-weight: 900; margin-right: 8px;">T</span>Tails</button>
                </div>

                <div class="bet-input-group">
                    <input type="number" class="bet-input" id="betAmount" placeholder="Einsatz eingeben" min="1" value="10">
                    <button class="bet-btn" id="betBtn">FLIP!</button>
                </div>
            </div>

            <div class="result-display">
                <div class="result-text" id="resultText"></div>
            </div>
        </div>
    </div>

    <script>
        // ===== STATE MANAGEMENT =====
        let isLoggedIn = false;
        let userCoins = 1000;
        let selectedChoice = null;
        let isFlipping = false;
        let discordId = null;
        let currentRotation = 0; // Tracking der aktuellen Rotation für Bug-Fix

        // DOM Elements
        const loginBtn = document.getElementById('loginBtn');
        const profile = document.getElementById('profile');
        const coinBalance = document.getElementById('coinBalance');
        const gamesOverview = document.getElementById('gamesOverview');
        const coinflipSection = document.getElementById('coinflipSection');
        const backBtn = document.getElementById('backBtn');
        const gameCards = document.querySelectorAll('.game-card');
        const choiceBtns = document.querySelectorAll('.choice-btn');
        const betBtn = document.getElementById('betBtn');
        const betInput = document.getElementById('betAmount');
        const coin = document.getElementById('coin');
        const resultText = document.getElementById('resultText');
        const profileImg = document.getElementById('profileImg');
        const username = document.getElementById('username');

        // ===== BACKEND INTEGRATION: CHECK LOGIN STATUS =====
        async function checkLoginStatus() {
    const params = new URLSearchParams(window.location.search);
    discordId = params.get("discordId");

    if (!discordId) {
        isLoggedIn = false;
        updateLoginState();
        return;
    }

    isLoggedIn = true;

    try {
        const response = await fetch(`/get-coins/${discordId}`);
        const data = await response.json();
        userCoins = data.coins ?? 0;
    } catch (e) {
        console.error("Coins konnten nicht geladen werden", e);
    }

    updateLoginState();
    window.history.replaceState({}, document.title, "/");
}

        // ===== LOGIN SYSTEM =====
        loginBtn.addEventListener('click', () => {
    window.location.href = "/auth/discord";
});

        function updateLoginState() {
            if (isLoggedIn) {
                loginBtn.style.display = 'none';
                profile.classList.add('active');
                coinBalance.classList.add('active');
                
                // Aktiviere Coinflip-Button (andere bleiben disabled)
                gameCards.forEach(card => {
                    if (card.dataset.game === 'coinflip') {
                        card.classList.remove('disabled');
                        // Animiere das Aktivieren
                        gsap.fromTo(card, 
                            { filter: 'grayscale(1)', opacity: 0.4 },
                            { filter: 'grayscale(0)', opacity: 1, duration: 0.8, ease: 'power2.out' }
                        );
                    }
                });
            } else {
                loginBtn.style.display = 'block';
                profile.classList.remove('active');
                coinBalance.classList.remove('active');
                
                // Deaktiviere alle Spiele-Buttons
                gameCards.forEach(card => {
                    card.classList.add('disabled');
                });
            }
            updateCoinDisplay();
        }

        function updateCoinDisplay() {
            coinBalance.textContent = `💰 ${userCoins} Coins`;
        }

        // ===== NAVIGATION =====
        gameCards.forEach(card => {
            card.addEventListener('click', () => {
                if (card.classList.contains('disabled')) {
                    if (!isLoggedIn) {
                        alert('Du musst dich zuerst anmelden!');
                    } else {
                        alert('Dieses Spiel ist noch nicht verfügbar!');
                    }
                    return;
                }

                const game = card.dataset.game;
                if (game === 'coinflip') {
                    showCoinflip();
                }
            });

            // Touch feedback
            card.addEventListener('touchstart', () => {
                if (!card.classList.contains('disabled')) {
                    gsap.to(card, { scale: 1.05, duration: 0.2 });
                }
            });
            card.addEventListener('touchend', () => {
                if (!card.classList.contains('disabled')) {
                    gsap.to(card, { scale: 1, duration: 0.2 });
                }
            });
        });

        backBtn.addEventListener('click', () => {
            showOverview();
        });

        function showCoinflip() {
            gsap.to(gamesOverview, {
                opacity: 0,
                duration: 0.3,
                onComplete: () => {
                    gamesOverview.style.display = 'none';
                    coinflipSection.classList.add('active');
                    gsap.fromTo(coinflipSection, 
                        { opacity: 0, y: 20 },
                        { opacity: 1, y: 0, duration: 0.5 }
                    );
                }
            });
        }

        function showOverview() {
            gsap.to(coinflipSection, {
                opacity: 0,
                duration: 0.3,
                onComplete: () => {
                    coinflipSection.classList.remove('active');
                    gamesOverview.style.display = 'block';
                    gsap.fromTo(gamesOverview,
                        { opacity: 0, y: 20 },
                        { opacity: 1, y: 0, duration: 0.5 }
                    );
                }
            });
            resetGame();
        }

        // ===== COINFLIP GAME LOGIC =====
        choiceBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                selectedChoice = btn.dataset.choice;
                choiceBtns.forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
            });

            // Touch scale effect
            btn.addEventListener('touchstart', () => {
                gsap.to(btn, { scale: 1.15, duration: 0.2 });
            });
            btn.addEventListener('touchend', () => {
                gsap.to(btn, { scale: 1, duration: 0.2 });
            });
            btn.addEventListener('mousedown', () => {
                gsap.to(btn, { scale: 1.15, duration: 0.2 });
            });
            btn.addEventListener('mouseup', () => {
                gsap.to(btn, { scale: 1, duration: 0.2 });
            });
            btn.addEventListener('mouseleave', () => {
                gsap.to(btn, { scale: 1, duration: 0.2 });
            });
        });

        betBtn.addEventListener('click', flipCoin);

        // Touch scale effect for bet button
        betBtn.addEventListener('touchstart', () => {
            if (!isFlipping && selectedChoice && betInput.value > 0) {
                gsap.to(betBtn, { scale: 1.12, duration: 0.2 });
            }
        });
        betBtn.addEventListener('touchend', () => {
            gsap.to(betBtn, { scale: 1, duration: 0.2 });
        });
        betBtn.addEventListener('mousedown', () => {
            if (!isFlipping && selectedChoice && betInput.value > 0) {
                gsap.to(betBtn, { scale: 1.12, duration: 0.2 });
            }
        });
        betBtn.addEventListener('mouseup', () => {
            gsap.to(betBtn, { scale: 1, duration: 0.2 });
        });
        betBtn.addEventListener('mouseleave', () => {
            gsap.to(betBtn, { scale: 1, duration: 0.2 });
        });

        async function flipCoin() {
    if (isFlipping) return;
    if (!selectedChoice) {
        alert('Wähle zuerst Heads oder Tails!');
        return;
    }

    const betAmount = parseInt(betInput.value);
    if (!betAmount || betAmount <= 0) {
        alert('Gib einen gültigen Einsatz ein!');
        return;
    }

    if (betAmount > userCoins) {
        alert('Nicht genug Coins!');
        return;
    }

    isFlipping = true;
    betBtn.disabled = true;

    // SIMULIERTE SERVERLOGIK
    let result;
let won;

try {
    const response = await fetch("/coinflip", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            discordId: discordId,
            bet: betAmount,
            choice: selectedChoice
        })
    });

    const data = await response.json();

    if (!response.ok) {
        alert(data.error || "Fehler beim Coinflip");
        isFlipping = false;
        betBtn.disabled = false;
        return;
    }

    result = data.result;   // "heads" oder "tails"
    won = data.won;         // true / false
    userCoins = data.coins; // neuer Kontostand vom Server
    updateCoinDisplay();

} catch (err) {
    console.error(err);
    alert("Server nicht erreichbar");
    isFlipping = false;
    betBtn.disabled = false;
    return;
}

    userCoins += won ? betAmount : -betAmount;
    updateCoinDisplay();

    // Münze drehen
    const rotations = 5 + Math.floor(Math.random() * 3); // 5-7 Drehungen
    const finalRotation = result === 'heads' ? 0 : 180;
    const targetRotation = currentRotation + (rotations * 360) + finalRotation;

    gsap.to(coin, {
        rotationY: targetRotation,
        duration: 3,
        ease: "power2.out",
        onComplete: () => {
            currentRotation = targetRotation % 360;
            showResult(won, betAmount);
            setTimeout(() => {
                isFlipping = false;
                betBtn.disabled = false;
            }, 3000);
        }
    });
}

        function showResult(won, amount) {
            resultText.className = 'result-text';
            
            if (won) {
                resultText.classList.add('win');
                resultText.textContent = `🎉 You Win! +${amount} Coins`;
            } else {
                resultText.classList.add('lose');
                resultText.textContent = `💔 You Lose! -${amount} Coins`;
            }

            gsap.fromTo(resultText,
                { opacity: 0, scale: 0.5, y: -20 },
                { 
                    opacity: 1, 
                    scale: 1, 
                    y: 0,
                    duration: 0.6,
                    ease: "back.out(2)"
                }
            );

            gsap.to(resultText, {
                opacity: 0,
                scale: 0.8,
                y: 20,
                duration: 0.4,
                delay: 2.5,
                ease: "power2.in"
            });
        }

        function resetGame() {
            selectedChoice = null;
            choiceBtns.forEach(btn => btn.classList.remove('selected'));
            resultText.style.opacity = 0;
            // Setze Münze auf Ausgangsposition zurück
            currentRotation = 0;
            gsap.set(coin, { rotationY: 0 });
        }

        // ===== INITIALIZATION =====
        // Prüfe Login-Status beim Laden
        checkLoginStatus();

        // Entrance Animation
        gsap.from('.logo', {
            opacity: 0,
            scale: 0.5,
            duration: 1,
            ease: "elastic.out(1, 0.5)"
        });

        gsap.from('.game-card', {
            opacity: 0,
            y: 50,
            stagger: 0.1,
            duration: 0.8,
            ease: "power3.out",
            delay: 0.3
        });
    </script>
</body>
</html>
