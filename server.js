// server.js
// মাল্টি-ইউজার অ্যাপ ব্যাকএন্ড: রেজিস্ট্রেশন/লগইন, প্রোফাইল, অ্যাডমিন প্যানেল, বিজ্ঞাপন সেটিংস

const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const http = require("http");
const { Server } = require("socket.io");
const { LuduGame, COLORS: LUDU_COLORS } = require("./lib/ludu");
const { CardGame } = require("./lib/cardgame");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "change-this-secret-in-production";

// সাইনআপ বোনাস (পয়েন্ট/কয়েন — রিয়েল টাকা নয়, শুধু অ্যাপের ভেতরের গেম রুম আনলক ও স্কোরের জন্য)
const SIGNUP_BONUS_POINTS = 100000;

// পয়েন্ট-ভিত্তিক রুম টায়ার — এই পরিমাণ পয়েন্ট থাকলে সংশ্লিষ্ট রুম আনলক হয়
const ROOM_TIERS = {
  bronze: { label: "ব্রোঞ্জ", minPoints: 0 },
  silver: { label: "সিলভার", minPoints: 20000 },
  gold: { label: "গোল্ড", minPoints: 60000 }
};

// গেম জেতার পুরস্কার (পয়েন্ট) — টায়ার অনুযায়ী
const GAME_REWARDS = {
  bronze: { winner: 500, participant: 50 },
  silver: { winner: 1500, participant: 150 },
  gold: { winner: 4000, participant: 400 }
};

const USERS_FILE = path.join(__dirname, "data", "users.json");

// ---------- ছোট JSON-ফাইল ভিত্তিক "ডাটাবেস" (ডেমো/ছোট স্কেলের জন্য) ----------
function readJSON(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    return fallback;
  }
}
function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

if (!fs.existsSync(USERS_FILE)) writeJSON(USERS_FILE, []);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ---------- সহায়ক ফাংশন ----------
function getUsers() {
  return readJSON(USERS_FILE, []);
}
function saveUsers(users) {
  writeJSON(USERS_FILE, users);
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: "লগইন প্রয়োজন" });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: "টোকেন অবৈধ বা মেয়াদোত্তীর্ণ" });
  }
}

function adminOnly(req, res, next) {
  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "শুধুমাত্র অ্যাডমিনের জন্য" });
  }
  next();
}

// ---------- রেজিস্ট্রেশন ----------
app.post("/api/register", async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: "নাম, ইমেইল ও পাসওয়ার্ড আবশ্যক" });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: "পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে" });
  }

  const users = getUsers();
  const exists = users.find((u) => u.email.toLowerCase() === email.toLowerCase());
  if (exists) {
    return res.status(409).json({ error: "এই ইমেইল দিয়ে ইতিমধ্যে অ্যাকাউন্ট আছে" });
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  // সিস্টেমের প্রথম ইউজারটি স্বয়ংক্রিয়ভাবে অ্যাডমিন হবে
  const role = users.length === 0 ? "admin" : "user";

  const newUser = {
    id: Date.now().toString(),
    name,
    email,
    password: hashedPassword,
    role,
    points: SIGNUP_BONUS_POINTS, // সাইনআপ বোনাস — ইন-অ্যাপ পয়েন্ট, রিয়েল টাকা নয়
    createdAt: new Date().toISOString(),
    banned: false
  };
  users.push(newUser);
  saveUsers(users);

  const token = jwt.sign({ id: newUser.id, email: newUser.email, role: newUser.role }, JWT_SECRET, {
    expiresIn: "7d"
  });

  res.json({
    token,
    user: { id: newUser.id, name: newUser.name, email: newUser.email, role: newUser.role }
  });
});

// ---------- লগইন ----------
app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;
  const users = getUsers();
  const user = users.find((u) => u.email.toLowerCase() === (email || "").toLowerCase());
  if (!user) return res.status(401).json({ error: "ইমেইল বা পাসওয়ার্ড ভুল" });
  if (user.banned) return res.status(403).json({ error: "এই অ্যাকাউন্ট নিষিদ্ধ করা হয়েছে" });

  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.status(401).json({ error: "ইমেইল বা পাসওয়ার্ড ভুল" });

  const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, {
    expiresIn: "7d"
  });

  res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role }
  });
});

// ---------- নিজের প্রোফাইল দেখা ----------
app.get("/api/me", authMiddleware, (req, res) => {
  const users = getUsers();
  const user = users.find((u) => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: "ইউজার পাওয়া যায়নি" });
  res.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      points: user.points || 0,
      createdAt: user.createdAt
    }
  });
});

// ---------- কোন কোন রুম-টায়ার আনলক করা আছে তা জানা ----------
app.get("/api/games/tiers", authMiddleware, (req, res) => {
  const users = getUsers();
  const user = users.find((u) => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: "ইউজার পাওয়া যায়নি" });

  const tiers = Object.entries(ROOM_TIERS).map(([key, val]) => ({
    key,
    label: val.label,
    minPoints: val.minPoints,
    unlocked: (user.points || 0) >= val.minPoints
  }));
  res.json({ points: user.points || 0, tiers });
});

// ---------- প্রোফাইল আপডেট ----------
app.put("/api/me", authMiddleware, (req, res) => {
  const { name } = req.body;
  const users = getUsers();
  const idx = users.findIndex((u) => u.id === req.user.id);
  if (idx === -1) return res.status(404).json({ error: "ইউজার পাওয়া যায়নি" });
  if (name) users[idx].name = name;
  saveUsers(users);
  res.json({ ok: true });
});

// ---------- অ্যাডমিন: সব ইউজার দেখা ----------
app.get("/api/admin/users", authMiddleware, adminOnly, (req, res) => {
  const users = getUsers().map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    banned: u.banned,
    createdAt: u.createdAt
  }));
  res.json({ users });
});

// ---------- অ্যাডমিন: ইউজার ব্যান/আনব্যান ----------
app.put("/api/admin/users/:id/ban", authMiddleware, adminOnly, (req, res) => {
  const { banned } = req.body;
  const users = getUsers();
  const idx = users.findIndex((u) => u.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "ইউজার পাওয়া যায়নি" });
  if (users[idx].role === "admin") {
    return res.status(400).json({ error: "অ্যাডমিনকে ব্যান করা যাবে না" });
  }
  users[idx].banned = !!banned;
  saveUsers(users);
  res.json({ ok: true });
});

// ---------- অ্যাডমিন: ইউজার ডিলিট ----------
app.delete("/api/admin/users/:id", authMiddleware, adminOnly, (req, res) => {
  let users = getUsers();
  const target = users.find((u) => u.id === req.params.id);
  if (target && target.role === "admin") {
    return res.status(400).json({ error: "অ্যাডমিনকে ডিলিট করা যাবে না" });
  }
  users = users.filter((u) => u.id !== req.params.id);
  saveUsers(users);
  res.json({ ok: true });
});

// ==================== গেম রুম ও সকেট লজিক ====================
// ইন-মেমরি রুম স্টোর (সার্ভার রিস্টার্ট হলে হারিয়ে যাবে — ক্যাজুয়াল গেমের জন্য এটাই যথেষ্ট)
const rooms = {}; // roomCode -> { tier, gameType, seats: [{id,name,socketId}], engine, status }

function genRoomCode() {
  return Math.random().toString(36).slice(2, 7).toUpperCase();
}

function getUserPoints(userId) {
  const user = getUsers().find((u) => u.id === userId);
  return user ? user.points || 0 : 0;
}

function addUserPoints(userId, amount) {
  const users = getUsers();
  const idx = users.findIndex((u) => u.id === userId);
  if (idx === -1) return;
  users[idx].points = (users[idx].points || 0) + amount;
  saveUsers(users);
}

// রুমের তালিকা (লবি) দেখা
app.get("/api/games/rooms", authMiddleware, (req, res) => {
  const { gameType, tier } = req.query;
  const list = Object.entries(rooms)
    .filter(([, r]) => r.status === "waiting" && (!gameType || r.gameType === gameType) && (!tier || r.tier === tier))
    .map(([code, r]) => ({
      code,
      gameType: r.gameType,
      tier: r.tier,
      seatsFilled: r.seats.length,
      seatsMax: r.gameType === "card" ? 4 : 4
    }));
  res.json({ rooms: list });
});

// নতুন রুম তৈরি (roomCode রিটার্ন করে; বন্ধুদের সাথে শেয়ার করার জন্য)
app.post("/api/games/rooms", authMiddleware, (req, res) => {
  const { gameType, tier } = req.body; // gameType: 'ludu' | 'card'
  if (!["ludu", "card"].includes(gameType)) return res.status(400).json({ error: "অবৈধ গেম টাইপ" });
  if (!ROOM_TIERS[tier]) return res.status(400).json({ error: "অবৈধ টায়ার" });

  const points = getUserPoints(req.user.id);
  if (points < ROOM_TIERS[tier].minPoints) {
    return res.status(403).json({ error: `এই রুম খেলতে কমপক্ষে ${ROOM_TIERS[tier].minPoints} পয়েন্ট দরকার` });
  }

  const code = genRoomCode();
  rooms[code] = { tier, gameType, seats: [], engine: null, status: "waiting" };
  res.json({ code });
});

// রুম কোড দিয়ে রুমের তথ্য খোঁজা (কোন গেম, কোন টায়ার তা জানতে)
app.get("/api/games/rooms/:code", authMiddleware, (req, res) => {
  const room = rooms[req.params.code.toUpperCase()];
  if (!room) return res.status(404).json({ error: "এই কোডে কোনো রুম পাওয়া যায়নি" });
  res.json({ code: req.params.code.toUpperCase(), gameType: room.gameType, tier: room.tier, status: room.status });
});

// ==================== Socket.IO — রিয়েল-টাইম গেমপ্লে ====================
io.on("connection", (socket) => {
  let joinedRoom = null;
  let me = null; // {id, name}

  socket.on("join-room", ({ roomCode, token }) => {
    let payload;
    try {
      payload = jwt.verify(token, JWT_SECRET);
    } catch {
      socket.emit("error-msg", "লগইন সেশনের মেয়াদ শেষ, আবার লগইন করুন");
      return;
    }
    const room = rooms[roomCode];
    if (!room) {
      socket.emit("error-msg", "রুম পাওয়া যায়নি");
      return;
    }
    const users = getUsers();
    const user = users.find((u) => u.id === payload.id);
    if (!user) return;

    me = { id: user.id, name: user.name };
    joinedRoom = roomCode;
    socket.join(roomCode);

    const already = room.seats.find((s) => s.id === me.id);
    if (!already) {
      if (room.status !== "waiting") {
        socket.emit("error-msg", "গেম ইতিমধ্যে শুরু হয়ে গেছে");
        return;
      }
      const maxSeats = room.gameType === "ludu" ? 4 : 4;
      if (room.seats.length >= maxSeats) {
        socket.emit("error-msg", "রুম পূর্ণ হয়ে গেছে");
        return;
      }
      room.seats.push({ id: me.id, name: me.name, socketId: socket.id });
    } else {
      already.socketId = socket.id;
    }

    io.to(roomCode).emit("room-update", {
      seats: room.seats.map((s) => ({ id: s.id, name: s.name })),
      tier: room.tier,
      gameType: room.gameType,
      status: room.status
    });
  });

  socket.on("start-game", ({ roomCode }) => {
    const room = rooms[roomCode];
    if (!room || room.status !== "waiting") return;
    if (room.seats.length < 2) {
      io.to(roomCode).emit("error-msg", "শুরু করতে কমপক্ষে ২ জন খেলোয়াড় দরকার");
      return;
    }

    room.status = "playing";
    let players = room.seats.map((s) => ({ id: s.id, name: s.name }));

    if (room.gameType === "ludu") {
      players = players.map((p, i) => ({ ...p, color: LUDU_COLORS[i] }));
      room.engine = new LuduGame(players);
      io.to(roomCode).emit("ludu-state", room.engine.getState());
    } else {
      // কার্ড গেমে ঠিক ৪ আসন লাগে — ফাঁকা সিট বট দিয়ে পূরণ করা হয়
      while (players.length < 4) {
        players.push({ id: `bot_${players.length}`, name: `বট ${players.length}`, isBot: true });
      }
      room.engine = new CardGame(players);
      broadcastCardState(roomCode);
      maybePlayBot(roomCode);
    }
  });

  // ---------- লুডু চাল ----------
  socket.on("ludu-roll", ({ roomCode }) => {
    const room = rooms[roomCode];
    if (!room || !room.engine || room.gameType !== "ludu") return;
    const engine = room.engine;
    if (engine.currentPlayer().id !== me?.id) return;

    const dice = engine.rollDice();
    const movable = engine.movableTokens(engine.currentPlayer().color, dice);
    if (movable.length === 0) {
      engine.extraTurn = dice === 6;
      engine.nextTurn();
    }
    io.to(roomCode).emit("ludu-state", { ...engine.getState(), movableTokens: movable });
  });

  socket.on("ludu-move", ({ roomCode, tokenIdx }) => {
    const room = rooms[roomCode];
    if (!room || !room.engine || room.gameType !== "ludu") return;
    const engine = room.engine;
    if (engine.currentPlayer().id !== me?.id || engine.lastDice === null) return;

    try {
      engine.moveToken(engine.currentPlayer().color, tokenIdx, engine.lastDice);
    } catch (e) {
      socket.emit("error-msg", e.message);
      return;
    }

    if (engine.winner) {
      awardGamePoints(room, engine.winner);
      room.status = "finished";
    } else {
      engine.nextTurn();
    }
    io.to(roomCode).emit("ludu-state", engine.getState());
  });

  // ---------- কার্ড গেম চাল ----------
  socket.on("card-play", ({ roomCode, cardIdx }) => {
    const room = rooms[roomCode];
    if (!room || !room.engine || room.gameType !== "card") return;
    const engine = room.engine;
    if (engine.currentPlayer().id !== me?.id) return;

    try {
      engine.playCard(me.id, cardIdx);
    } catch (e) {
      socket.emit("error-msg", e.message);
      return;
    }

    if (engine.winner) {
      awardGamePoints(room, engine.winner);
      room.status = "finished";
    }
    broadcastCardState(roomCode);
    maybePlayBot(roomCode);
  });

  socket.on("disconnect", () => {
    // ঘরে থাকা অবস্থায় ডিসকানেক্ট হলে বিশেষ কিছু করছি না — ক্যাজুয়াল গেম, পুনরায় জয়েন করা যাবে
  });

  function broadcastCardState(roomCode) {
    const room = rooms[roomCode];
    if (!room || !room.engine) return;
    room.seats.forEach((s) => {
      const state = room.engine.getPublicState(s.id);
      io.to(s.socketId).emit("card-state", state);
    });
  }

  function maybePlayBot(roomCode) {
    const room = rooms[roomCode];
    if (!room || !room.engine || room.status === "finished") return;
    const engine = room.engine;
    const current = engine.currentPlayer();
    if (current.id.startsWith("bot_")) {
      setTimeout(() => {
        if (rooms[roomCode]?.status === "finished") return;
        engine.botMove(current.id);
        if (engine.winner) {
          awardGamePoints(room, engine.winner);
          room.status = "finished";
        }
        broadcastCardState(roomCode);
        maybePlayBot(roomCode);
      }, 800);
    }
  }

  function awardGamePoints(room, winnerId) {
    const reward = GAME_REWARDS[room.tier];
    room.seats.forEach((s) => {
      if (s.id === winnerId) addUserPoints(s.id, reward.winner);
      else addUserPoints(s.id, reward.participant);
    });
    io.to(Object.keys(rooms).find((c) => rooms[c] === room)).emit("game-over", {
      winnerId,
      reward
    });
  }
});

server.listen(PORT, () => {
  console.log(`✅ সার্ভার চালু হয়েছে: http://localhost:${PORT}`);
});
