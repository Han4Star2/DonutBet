import express from "express";
import sqlite3 from "sqlite3";
import cors from "cors";
import crypto from "crypto";
import axios from "axios";

const app = express();
app.use(express.json());
app.use(cors());

// Datenbank initialisieren
const db = new sqlite3.Database("payments.db");

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

  res.send("ok");
});

// ------------------------
// Discord OAuth2 Login
// ------------------------
const CLIENT_ID = "DEINE_CLIENT_ID_HIER";
const CLIENT_SECRET = "DEIN_CLIENT_SECRET_HIER";
const REDIRECT_URI = "https://PLACEHOLDER_URL";  // später echte Railway URL eintragen

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

    res.send(`Hi ${username}, Login erfolgreich!`);
  } catch (err) {
    console.log(err);
    res.send("Fehler beim Discord-Login");
  }
});

// ------------------------
// Payment Status Abfrage
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
