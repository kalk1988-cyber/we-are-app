// lib/ludu.js
// সহজ সংস্করণের লুডু গেম ইঞ্জিন (সার্ভার-সাইড, অথরিটেটিভ)
// সরলীকরণ: ৪টি রঙ (লাল, সবুজ, হলুদ, নীল), প্রতি খেলোয়াড়ের ৪টি গুটি
// কমন ট্র্যাক ৫২ ঘর + প্রতি রঙের হোম-স্ট্রেচ ৬ ঘর

const COLORS = ["red", "green", "yellow", "blue"];
const ENTRY_OFFSET = { red: 0, green: 13, yellow: 26, blue: 39 };
const TRACK_LEN = 52;
const HOME_STRETCH = 6;
const SAFE_CELLS = new Set([0, 8, 13, 21, 26, 34, 39, 47]); // এন্ট্রি + স্টার ঘর

class LuduGame {
  constructor(players) {
    // players: [{id, name, color}]
    this.players = players;
    this.tokens = {}; // color -> [pos, pos, pos, pos]; pos: -1=ইয়ার্ডে, 0-51 কমন ট্র্যাক, 100-105 হোম স্ট্রেচ, 999=সম্পূর্ণ ঘরে পৌঁছেছে
    players.forEach((p) => {
      this.tokens[p.color] = [-1, -1, -1, -1];
    });
    this.turnIndex = 0;
    this.lastDice = null;
    this.extraTurn = false;
    this.winner = null;
    this.log = [];
  }

  currentPlayer() {
    return this.players[this.turnIndex];
  }

  rollDice() {
    const dice = 1 + Math.floor(Math.random() * 6);
    this.lastDice = dice;
    return dice;
  }

  // কোন গুটিগুলো এই মুহূর্তে চালযোগ্য তার তালিকা
  movableTokens(color, dice) {
    const positions = this.tokens[color];
    const movable = [];
    positions.forEach((pos, idx) => {
      if (pos === -1) {
        if (dice === 6) movable.push(idx); // ইয়ার্ড থেকে বের হতে ৬ লাগবে
      } else if (pos === 999) {
        // ইতিমধ্যে ঘরে পৌঁছে গেছে, নড়বে না
      } else {
        const newPos = this._advance(pos, dice);
        if (newPos !== null) movable.push(idx);
      }
    });
    return movable;
  }

  _advance(pos, dice) {
    if (pos >= 100) {
      const stretchPos = pos - 100;
      const newStretch = stretchPos + dice;
      if (newStretch > HOME_STRETCH - 1) return null; // ওভারশুট, চাল বৈধ না
      if (newStretch === HOME_STRETCH - 1) return 999;
      return 100 + newStretch;
    }
    const newPos = pos + dice;
    if (newPos < TRACK_LEN) return newPos;
    const overflow = newPos - TRACK_LEN;
    if (overflow > HOME_STRETCH - 1) return null;
    if (overflow === HOME_STRETCH - 1) return 999;
    return 100 + overflow;
  }

  moveToken(color, tokenIdx, dice) {
    const positions = this.tokens[color];
    const pos = positions[tokenIdx];
    let newPos;
    if (pos === -1) {
      if (dice !== 6) throw new Error("ইয়ার্ড থেকে বের হতে ৬ প্রয়োজন");
      newPos = ENTRY_OFFSET[color];
    } else {
      const advanced = this._advance(pos, dice);
      if (advanced === null) throw new Error("অবৈধ চাল");
      newPos = advanced;
    }

    positions[tokenIdx] = newPos;

    // ক্যাপচার চেক (কমন ট্র্যাকে, সেফ সেল ছাড়া)
    let captured = false;
    if (newPos >= 0 && newPos < TRACK_LEN && !SAFE_CELLS.has(newPos)) {
      COLORS.forEach((otherColor) => {
        if (otherColor === color) return;
        const otherPositions = this.tokens[otherColor];
        otherPositions.forEach((otherPos, otherIdx) => {
          if (otherPos === newPos) {
            otherPositions[otherIdx] = -1; // বাড়ি ফেরত পাঠানো
            captured = true;
          }
        });
      });
    }

    this.extraTurn = dice === 6 || captured;

    // জয় চেক
    const finished = this.players.filter((p) => this.tokens[p.color].every((t) => t === 999));
    if (finished.length > 0 && !this.winner) {
      this.winner = finished[0].id;
    }

    return { newPos, captured };
  }

  nextTurn() {
    if (!this.extraTurn) {
      this.turnIndex = (this.turnIndex + 1) % this.players.length;
    }
    this.extraTurn = false;
    this.lastDice = null;
  }

  getState() {
    return {
      players: this.players,
      tokens: this.tokens,
      turnIndex: this.turnIndex,
      currentPlayerId: this.currentPlayer().id,
      lastDice: this.lastDice,
      winner: this.winner
    };
  }
}

module.exports = { LuduGame, COLORS };
