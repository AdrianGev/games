const fs = require('fs');
const vm = require('vm');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const stub = new Proxy(function () {}, {
  get: (t, k) => (k === Symbol.toPrimitive ? () => '' : k === 'value' ? '4' : stub),
  apply: () => stub,
  construct: () => stub,
  set: () => true,
});

function load(game, tests) {
  const dir = path.join(root, 'games', game);
  const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  let code = '';
  for (const m of html.matchAll(/<script(?: src="([^"]+)")?>([\s\S]*?)<\/script>/g)) {
    code += (m[1] ? fs.readFileSync(path.join(dir, m[1]), 'utf8') : m[2]) + '\n';
  }
  const ids = {};
  for (const m of html.matchAll(/<select id="([^"]+)"[^>]*>([\s\S]*?)<\/select>/g)) {
    const opts = [...m[2].matchAll(/<option([^>]*)>([^<]*)/g)].map(o => ({ attrs: o[1], text: o[2] }));
    const pick = opts.find(o => /selected/.test(o.attrs)) || opts[0];
    const value = (/value="([^"]*)"/.exec(pick.attrs) || [])[1] ?? pick.text;
    ids[m[1]] = new Proxy(function () {}, {
      get: (t, k) => (k === Symbol.toPrimitive ? () => '' : k === 'value' ? value : stub),
      apply: () => stub,
      set: () => true,
    });
  }
  const doc = new Proxy({}, { get: (t, k) => (k === 'getElementById' ? id => ids[id] || stub : stub) });
  const ctx = {
    document: doc, window: stub, assert, console,
    setTimeout: () => 0, setInterval: () => 0, clearInterval() {}, clearTimeout() {},
    performance: { now: () => 0 }, requestAnimationFrame: () => 0, cancelAnimationFrame() {},
  };
  vm.runInNewContext(code + '\n{\n' + tests + '\n}', ctx, { filename: game });
  console.log('ok  ', game);
}

const only = process.argv[2];
const tested = new Set();
const t = (name, tests) => { tested.add(name); if (!only || only === name) load(name, tests); };

t('tictactoe', `
  const match = (xBot, oBot) => {
    let s = { b: Array(9).fill(''), t: 'X' };
    while (!outcome(s.b)) {
      const bot = s.t === 'X' ? xBot : oBot;
      s = G.apply(s, bot ? Search.pick(G, s, 9) : Search.random(G, s));
    }
    return outcome(s.b);
  };
  for (let i = 0; i < 40; i++) {
    assert.notStrictEqual(match(true, false), 'O', 'hard bot as X lost');
    assert.notStrictEqual(match(false, true), 'X', 'hard bot as O lost');
  }
  assert.strictEqual(match(true, true), 'draw');
`);

t('connect4', `
  const row = Array(42).fill(0);
  [35, 36, 37, 38].forEach(i => row[i] = 1);
  assert.strictEqual(outcome(row), 1);
  const diag = Array(42).fill(0);
  [35, 29, 23, 17].forEach(i => diag[i] = 2);
  assert.strictEqual(outcome(diag), 2);
  let s = { b: Array(42).fill(0), t: 1 };
  for (const c of [0, 6, 1, 6, 2]) s = G.apply(s, c);
  s = G.apply(s, 6);
  assert.strictEqual(Search.pick(G, s, 3), 3, 'red should play the winning column');
  s = { b: Array(42).fill(0), t: 2 };
  for (const c of [0, 6, 1, 6, 2]) s = G.apply(s, c);
  assert.strictEqual(Search.pick(G, s, 3), 3, 'black should block');
  let wins = 0, slowest = 0;
  for (let g = 0; g < 4; g++) {
    s = { b: Array(42).fill(0), t: 1 };
    while (!outcome(s.b)) {
      const t0 = Date.now();
      const bot = s.t === 1;
      const m = bot ? Search.pick(G, s, DEPTH.hard) : Search.random(G, s);
      if (bot) slowest = Math.max(slowest, Date.now() - t0);
      s = G.apply(s, m);
    }
    if (outcome(s.b) === 1) wins++;
  }
  assert.strictEqual(wins, 4, 'hard bot should beat random');
  console.log('      slowest hard move ms:', slowest);
  assert(slowest < 3000);
`);

t('2048', `
  assert.deepStrictEqual(slide([2, 2, 2, 2]), [[4, 4, 0, 0], 8]);
  assert.deepStrictEqual(slide([2, 0, 2, 4]), [[4, 4, 0, 0], 4]);
  assert.deepStrictEqual(slide([4, 2, 2, 0]), [[4, 4, 0, 0], 4]);
  const E = () => Array.from({ length: 4 }, () => Array(4).fill(0));
  for (const [name, dir, from, to] of [['left', 0, [1, 2], [1, 0]], ['right', 2, [1, 2], [1, 3]], ['up', 3, [2, 1], [0, 1]], ['down', 1, [2, 1], [3, 1]]]) {
    g = E(); g[from[0]][from[1]] = 2; score = 0;
    move(dir);
    assert.strictEqual(g[to[0]][to[1]], 2, name + ' moved the wrong way');
  }
  g = [[2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [4, 2, 4, 2]];
  assert(stuck());
`);

t('rock-paper-scissors', `
  const run = lvl => {
    const h = []; let bot = 0, me = 0;
    for (let i = 0; i < 300; i++) {
      const m = i % 3, b = botPick(lvl, h);
      h.push(m);
      if (m !== b) { if (beatenBy(b) === m) me++; else bot++; }
    }
    return [me, bot];
  };
  const [hm, hb] = run('hard');
  assert(hb > hm * 3, 'hard bot should read a cycle: ' + [hm, hb]);
  const [em, eb] = run('easy');
  assert(Math.abs(em - eb) < 60, 'easy bot should be random: ' + [em, eb]);
`);

t('mastermind', `
  assert.deepStrictEqual(feedback([1, 1, 2, 2], [1, 2, 1, 2]), [2, 2]);
  assert.deepStrictEqual(feedback([1, 1, 1, 1], [1, 2, 3, 4]), [1, 0]);
  assert.deepStrictEqual(feedback([3, 4, 5, 6], [6, 5, 4, 3]), [0, 4]);
  assert.deepStrictEqual(feedback([1, 2, 3, 4], [1, 2, 3, 4]), [4, 0]);
`);

t('lights-out', `
  lit = Array(25).fill(0);
  press(12);
  assert.strictEqual(lit.filter(Boolean).length, 5);
  press(12);
  assert.strictEqual(lit.filter(Boolean).length, 0);
  lit = Array(25).fill(0);
  press(0);
  assert.strictEqual(lit.filter(Boolean).length, 3);
`);

t('sliding-puzzle', `
  for (const size of [3, 4, 5]) {
    n = size;
    t = [...Array(n * n).keys()].map(i => (i + 1) % (n * n));
    assert(solved());
    const g = t.indexOf(0);
    assert(slide(g - 1) && !solved(), 'adjacent tile should slide');
    assert(!slide(0) || n === 2, 'a far tile must not slide');
  }
`);

t('hanoi', `
  n = 3; pegs = [[3, 2, 1], [], []]; sel = null; moves = 0;
  click(0); click(1);
  click(0); click(1);
  assert.deepStrictEqual(pegs, [[3, 2], [1], []]);
  assert.strictEqual(moves, 1);
`);

t('pig', `
  const game = (a, b) => {
    const lv = [a, b], sc = [0, 0];
    let p = Math.random() < 0.5 ? 0 : 1;
    while (sc[0] < 100 && sc[1] < 100) {
      let turn = 0;
      while (botRolls(lv[p], sc[p], sc[1 - p], turn)) {
        const d = 1 + Math.floor(Math.random() * 6);
        if (d === 1) { turn = 0; break; }
        turn += d;
      }
      sc[p] += turn;
      p = 1 - p;
    }
    return sc[0] >= 100 ? 0 : 1;
  };
  const rate = (a, b) => { let w = 0; for (let i = 0; i < 3000; i++) if (game(a, b) === 0) w++; return w / 3000; };
  const mh = rate('medium', 'easy'), hm = rate('hard', 'medium');
  console.log('      medium beats easy', mh, '· hard beats medium', hm);
  assert(mh > 0.5 && hm > 0.5);
`);

t('blackjack', `
  const c = r => ({ r, s: 'S' });
  const rig = cards => { deck = Array.from({ length: 16 }, () => c(2)); deck.push(...cards.reverse()); };
  bank = 100; rig([c(5), c(6), c(10), c(7), c(10)]);
  deal();
  assert.strictEqual(bank, 90);
  double();
  assert.strictEqual(bank, 120, 'doubled win should pay 2x the doubled bet');
  bank = 15; rig([c(5), c(6), c(10), c(7), c(10)]);
  deal();
  double();
  assert.strictEqual(bank, 30, 'win pays back the 15 staked twice');
  bank = 4; rig([c(5), c(6), c(10), c(7)]);
  deal();
  assert.strictEqual(bank, 0);
  assert.strictEqual(wager, 4);
`);

t('blackjack', `
  const c = r => ({ r, s: 'S' });
  assert.strictEqual(total([c(1), c(1), c(9)]), 21);
  assert.strictEqual(total([c(10), c(6), c(5)]), 21);
  assert.strictEqual(total([c(1), c(13)]), 21);
  assert(natural([c(1), c(12)]));
  assert(!natural([c(7), c(7), c(7)]));
  assert.strictEqual(total([c(10), c(9), c(5)]), 24);
  deck = [];
  draw1();
  assert.strictEqual(deck.length, 51);
  assert.strictEqual(new Set(deck.map(x => x.r + x.s)).size, 51);
`);

t('sudoku', `
  const t0 = Date.now();
  for (const n of [36, 46, 54]) {
    const p = makePuzzle(n);
    assert.strictEqual(p.filter(v => !v).length >= n - 12, true);
    assert.strictEqual(count(p.slice(), 2), 1, 'puzzle must have exactly one solution');
    const g = p.slice();
    assert(fill(g));
    for (let r = 0; r < 9; r++) assert.strictEqual(new Set(g.slice(r * 9, r * 9 + 9)).size, 9);
    for (let c = 0; c < 9; c++) assert.strictEqual(new Set([...Array(9).keys()].map(r => g[r * 9 + c])).size, 9);
  }
  console.log('      3 puzzles ms:', Date.now() - t0);
`);

t('wordle', `
  assert(WORDS.every(w => /^[a-z]{5}$/.test(w)), 'bad word: ' + WORDS.find(w => !/^[a-z]{5}$/.test(w)));
  assert.strictEqual(new Set(WORDS).size, WORDS.length, 'duplicate words');
  assert.deepStrictEqual(score('speed', 'abide'), ['miss', 'miss', 'near', 'miss', 'near']);
  assert.deepStrictEqual(score('geese', 'geese'), Array(5).fill('hit'));
  assert.deepStrictEqual(score('eerie', 'tepee'), ['near', 'hit', 'miss', 'miss', 'hit']);
`);

t('minesweeper', `
  [W, H, M] = [9, 9, 10];
  mines = new Set(); shown = new Set(); flags = new Set(); over = null; started = false;
  reveal(40);
  assert.strictEqual(mines.size, 10);
  assert(!mines.has(40) && neighbors(40).every(n => !mines.has(n)), 'first click area must be safe');
  assert(shown.size > 1, 'a safe opening should flood');
  assert.strictEqual(over, null);
  for (const m of mines) assert(!shown.has(m), 'flood must not open a mine');
  const m = [...mines][0];
  reveal(m);
  assert.strictEqual(over, 'lost');
`);

t('checkers', `
  let s = { b: startBoard(), t: 1, q: 0 };
  assert.strictEqual(legalMoves(s).length, 7);
  let b = Array(64).fill(0);
  b[42] = 1; b[35] = -1; b[63] = -1;
  let ms = legalMoves({ b, t: 1, q: 0 });
  assert.strictEqual(ms.length, 1);
  assert.deepStrictEqual(ms[0], { from: 42, to: 28, caps: [35] });
  b = Array(64).fill(0);
  b[42] = 1; b[35] = -1; b[21] = -1; b[63] = -1;
  ms = legalMoves({ b, t: 1, q: 0 });
  assert.deepStrictEqual(ms[0], { from: 42, to: 14, caps: [35, 21] });
  b = Array(64).fill(0);
  b[9] = 1; b[63] = -1;
  const k = applyMove({ b, t: 1, q: 0 }, { from: 9, to: 0, caps: [] });
  assert.strictEqual(k.b[0], 2);
  let slowest = 0;
  for (let g = 0; g < 20; g++) {
    s = { b: startBoard(), t: 1, q: 0 };
    let plies = 0;
    while (!G.over(s) && plies++ < 600) s = G.apply(s, Search.random(G, s));
  }
  s = { b: startBoard(), t: 1, q: 0 };
  for (let plies = 0; plies < 60 && !G.over(s); plies++) {
    const t0 = Date.now();
    const m = s.t === 1 ? Search.pick(G, s, DEPTH.hard) : Search.pick(G, s, DEPTH.medium);
    if (s.t === 1) slowest = Math.max(slowest, Date.now() - t0);
    assert(legalMoves(s).some(l => l.from === m.from && l.to === m.to), 'bot played an illegal move');
    s = G.apply(s, m);
  }
  console.log('      slowest hard move ms:', slowest);
  assert(slowest < 3000);
`);

for (const g of fs.readdirSync(path.join(root, 'games'))) if (!tested.has(g)) t(g, '');
