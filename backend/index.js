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
const CLIENT_SECRET = "DEIN_CLIENT_SECRET_HIER"; // Dein Client Secret
const REDIRECT_URI = "https://donutbet.up.railway.app/auth/discord/callback"; // Railway URL + Callback

// Login starten
app.get("/auth/discord", (req, res) => {
  const url = `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=identify`;
  res.redirect(url);
});

// Callback von Discord
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

    // User in DB speichern / aktualisieren
    db.run(`
      INSERT INTO users (discord_id, username, coins)
      VALUES (?, ?, 100)
      ON CONFLICT(discord_id) DO UPDATE SET username=excluded.username
    `, [discordId, username]);

    // Weiterleitung ans Frontend mit discordId
    res.redirect(`/?discordId=${discordId}`);

  } catch (err) {
    console.log(err);
    res.send("Fehler beim Discord-Login");
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
