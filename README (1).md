# 🐍 Snake Arena - Real Money PvP Snake Game

A multiplayer Snake/Slither.io-style game where players compete with real money coins. Features cashout mechanics, kill rewards, tournament mode, and Discord OAuth authentication.

## 🎮 Features

### Gameplay
- **PvP Snake Mechanics**: Classic snake gameplay with multiplayer elements
- **Kill & Absorb**: Kill other snakes to steal their coins and segments
- **Food System**: Collect food pellets to grow and earn coins
- **Smart Movement**: WASD or Arrow keys for smooth directional control

### Cashout System
- **Active Cashout**: Press "Cash Out" to begin payout process
- **Vulnerable State**: Snake shrinks during cashout - can still be killed!
- **5% House Fee**: Automatic fee deduction on successful cashout
- **Atomic Transactions**: Coins only transferred after complete snake disappearance

### Game Modes
- **Free Play**: No entry fee, casual mode
- **High Stakes Tournament**: 5,000,000 coins entry fee, winner-takes-all

### User Interface (All in English)
- **Home Screen**: Balance display, game mode selection
- **Live HUD**: Real-time coins, kills, and size tracking
- **Result Screen**: Detailed post-game statistics with animations
- **GSAP Animations**: Smooth transitions and visual effects

## 🏗️ Technical Stack

### Backend
- **Node.js + Express**: RESTful API server
- **SQLite3**: Lightweight database for users and sessions
- **Discord OAuth**: Secure authentication
- **Session Management**: Express-session for user state

### Frontend
- **Vanilla JavaScript**: No framework dependencies
- **Canvas API**: High-performance game rendering
- **GSAP**: Professional-grade animations
- **Responsive Design**: Adapts to window size

### Database Schema
```sql
-- Users table
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    discord_id TEXT UNIQUE NOT NULL,
    username TEXT NOT NULL,
    coins REAL DEFAULT 1000,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- System/House wallet
CREATE TABLE system (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    house_coins REAL DEFAULT 0
);

-- Active game sessions
CREATE TABLE game_sessions (
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
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## 🚀 Setup Instructions

### Prerequisites
- Node.js (v14 or higher)
- Discord Developer Application
- npm or yarn

### 1. Discord OAuth Setup
1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create new application
3. Navigate to OAuth2 → General
4. Add redirect URI: `http://localhost:3000/auth/discord/callback`
5. Note your Client ID and Client Secret

### 2. Installation
```bash
# Clone or create project directory
mkdir snake-arena
cd snake-arena

# Install dependencies
npm install

# Create .env file (see .env.example)
cp .env.example .env
```

### 3. Environment Configuration
Create `.env` file:
```env
DISCORD_CLIENT_ID=your_discord_client_id
DISCORD_CLIENT_SECRET=your_discord_client_secret
DISCORD_REDIRECT_URI=http://localhost:3000/auth/discord/callback
PORT=3000
```

### 4. Run Server
```bash
# Development mode (with auto-restart)
npm run dev

# Production mode
npm start
```

Server runs on `http://localhost:3000`

## 📡 API Endpoints

### Authentication
- `GET /auth/discord` - Initiate Discord OAuth
- `GET /auth/discord/callback` - OAuth callback handler
- `GET /auth/logout` - Destroy session
- `GET /auth/user` - Get current user info

### Game Management
- `POST /game/join` - Join game (optional entry fee)
  ```json
  { "entryFee": 0, "isTournament": false }
  ```

- `POST /game/kill` - Register kill event
  ```json
  { "killedDiscordId": "victim_discord_id" }
  ```

- `POST /game/start-cashout` - Begin cashout process

- `POST /game/finish-cashout` - Complete cashout (snake disappeared)

- `GET /game/players` - Get active players list

### Tournament
- `POST /tournament/join` - Join 5M coins tournament

## 🎯 Game Flow

### 1. Join Game
```
User → POST /game/join
  ↓
Entry fee deducted (if tournament)
  ↓
Session created in game_sessions
  ↓
Game starts
```

### 2. Kill System
```
Player kills enemy
  ↓
POST /game/kill
  ↓
Killer gains: coins + segments
  ↓
Killed session deleted
  ↓
NO coins to database yet
```

### 3. Cashout (Success)
```
Player presses "Cash Out"
  ↓
POST /game/start-cashout
  ↓
Snake shrinks (GSAP animation)
  ↓
Snake fully disappears
  ↓
POST /game/finish-cashout
  ↓
ATOMIC TRANSACTION:
  - Calculate: player = coins × 0.95
  - Calculate: house = coins × 0.05
  - Update users.coins
  - Update system.house_coins
  - Delete session
  ↓
Show result screen
```

### 4. Cashout (Killed During)
```
Player presses "Cash Out"
  ↓
POST /game/start-cashout
  ↓
Snake shrinking...
  ↓
Enemy kills player
  ↓
POST /game/kill (killer gains coins)
  ↓
Session deleted
  ↓
Player gets ZERO coins
  ↓
Show result screen (0 coins)
```

## 🔒 Security Features

### Database Transactions
- All coin transfers use `BEGIN TRANSACTION` / `COMMIT` / `ROLLBACK`
- Prevents race conditions and double-spending
- Atomic operations ensure data consistency

### Validation
- Entry fee verification before game join
- Session existence checks on all game actions
- Authentication required for all game endpoints

### Anti-Cheat Measures
- Server-side coin calculations only
- No client-side coin manipulation possible
- Session-based state tracking

## 🎨 UI/UX Features

### GSAP Animations
- Coin counter animations on home screen
- Cashout shrinking effect
- Result screen entrance transitions
- Smooth button hover effects

### Visual Feedback
- Real-time HUD updates
- Color-coded snake states:
  - Green: Normal play
  - Yellow/Gold: Cashing out
  - Red: Enemy snakes
- Dynamic food spawning with values

### Responsive Design
- Canvas auto-resizes to window
- Grid dimensions adapt dynamically
- Mobile-friendly controls

## 📊 Game Balance

### Starting Values
- New users: 1,000 coins
- Starting snake size: 3 segments
- Free play entry: 0 coins
- Tournament entry: 5,000,000 coins

### Fee Structure
- House fee: 5% on cashout
- Example: 10,000 coins → 9,500 to player, 500 to house

### Growth Mechanics
- Food value: 10-60 coins (random)
- Kill reward: All victim coins + segments
- No segment cap (grow unlimited)

## 🐛 Troubleshooting

### "Not authenticated" errors
- Ensure Discord OAuth is properly configured
- Check session secret in code
- Verify redirect URI matches Discord app settings

### Database errors
- Delete `game.db` and restart server to reset
- Check file permissions in project directory

### Canvas not showing
- Check browser console for errors
- Ensure `public/` folder structure is correct
- Verify GSAP CDN is accessible

## 🔧 Development

### File Structure
```
snake-arena/
├── index.js           # Express server & API
├── package.json       # Dependencies
├── game.db           # SQLite database (auto-created)
└── public/
    ├── index.html    # Main UI
    └── game.js       # Game logic & rendering
```

### Adding Features
1. **New game modes**: Modify `/game/join` endpoint
2. **Custom fees**: Update fee calculation in `/game/finish-cashout`
3. **Leaderboards**: Add new table + endpoints for high scores
4. **Chat system**: Add WebSocket support for real-time messaging

## 📝 License
MIT License - Feel free to modify and use

## 🤝 Contributing
Contributions welcome! Please test thoroughly before submitting PRs.

---

**Built with ❤️ using Node.js, Canvas, GSAP, and Discord OAuth**
