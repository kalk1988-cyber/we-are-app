// lib/cardgame.js
// সরলীকৃত "তাশ" ট্রিক-টেকিং গেম (কল ব্রেক ধাঁচের) — সার্ভার-সাইড অথরিটেটিভ
// নিয়ম সরলীকরণ: ট্রাম্প সবসময় স্পেড, কোনো বিডিং নেই, সবচেয়ে বেশি ট্রিক জেতা খেলোয়াড় বিজয়ী

const SUITS = ["♠", "♥", "♦", "♣"];
const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
const RANK_VALUE = Object.fromEntries(RANKS.map((r, i) => [r, i]));
const TRUMP_SUIT = "♠";

function buildDeck() {
  const deck = [];
  SUITS.forEach((s) => RANKS.forEach((r) => deck.push({ suit: s, rank: r })));
  return deck;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

class CardGame {
  constructor(players) {
    // players: [{id, name, isBot}] — ঠিক ৪ জন হতে হবে (ফাঁকা সিট বট দিয়ে পূরণ হবে)
    this.players = players;
    this.hands = {}; // id -> [cards]
    this.tricksWon = {}; // id -> count
    this.currentTrick = []; // [{playerId, card}]
    this.leadSuit = null;
    this.turnIndex = 0;
    this.roundsPlayed = 0;
    this.winner = null;
    this.dealCards();
  }

  dealCards() {
    const deck = shuffle(buildDeck());
    this.players.forEach((p, idx) => {
      this.hands[p.id] = deck.slice(idx * 13, idx * 13 + 13);
      this.tricksWon[p.id] = 0;
    });
  }

  currentPlayer() {
    return this.players[this.turnIndex];
  }

  legalMoves(playerId) {
    const hand = this.hands[playerId];
    if (!this.leadSuit) return hand.map((_, i) => i);
    const followable = hand
      .map((c, i) => ({ c, i }))
      .filter((x) => x.c.suit === this.leadSuit);
    if (followable.length > 0) return followable.map((x) => x.i);
    return hand.map((_, i) => i); // সুট না থাকলে যেকোনো কার্ড
  }

  playCard(playerId, cardIdx) {
    const hand = this.hands[playerId];
    const card = hand[cardIdx];
    if (!card) throw new Error("অবৈধ কার্ড");

    const legal = this.legalMoves(playerId);
    if (!legal.includes(cardIdx)) throw new Error("সুট মেনে চলুন");

    hand.splice(cardIdx, 1);
    this.currentTrick.push({ playerId, card });
    if (!this.leadSuit) this.leadSuit = card.suit;

    let trickComplete = false;
    let trickWinnerId = null;

    if (this.currentTrick.length === this.players.length) {
      trickComplete = true;
      trickWinnerId = this._resolveTrick();
      this.tricksWon[trickWinnerId]++;
      this.roundsPlayed++;
      this.currentTrick = [];
      this.leadSuit = null;
      this.turnIndex = this.players.findIndex((p) => p.id === trickWinnerId);

      if (this.roundsPlayed === 13) {
        this.winner = Object.entries(this.tricksWon).sort((a, b) => b[1] - a[1])[0][0];
      }
    } else {
      this.turnIndex = (this.turnIndex + 1) % this.players.length;
    }

    return { trickComplete, trickWinnerId };
  }

  _resolveTrick() {
    const trumps = this.currentTrick.filter((t) => t.card.suit === TRUMP_SUIT);
    const pool = trumps.length > 0 ? trumps : this.currentTrick.filter((t) => t.card.suit === this.leadSuit);
    pool.sort((a, b) => RANK_VALUE[b.card.rank] - RANK_VALUE[a.card.rank]);
    return pool[0].playerId;
  }

  // সহজ বট চাল: বৈধ চালের মধ্যে থেকে র‍্যান্ডম বেছে নেওয়া
  botMove(playerId) {
    const legal = this.legalMoves(playerId);
    const choice = legal[Math.floor(Math.random() * legal.length)];
    return this.playCard(playerId, choice);
  }

  getPublicState(forPlayerId) {
    return {
      players: this.players.map((p) => ({ id: p.id, name: p.name, cardsLeft: this.hands[p.id].length })),
      tricksWon: this.tricksWon,
      currentTrick: this.currentTrick,
      leadSuit: this.leadSuit,
      currentPlayerId: this.currentPlayer().id,
      roundsPlayed: this.roundsPlayed,
      winner: this.winner,
      myHand: forPlayerId ? this.hands[forPlayerId] : undefined
    };
  }
}

module.exports = { CardGame, TRUMP_SUIT };
