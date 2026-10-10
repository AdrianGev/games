const Search = (() => {
  function evaluate(g, s, depth, alpha, beta) {
    if (depth === 0 || g.over(s)) return g.eval(s, depth);
    let best = -Infinity;
    for (const m of g.moves(s)) {
      const v = -evaluate(g, g.apply(s, m), depth - 1, -beta, -alpha);
      if (v > best) best = v;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
    return best;
  }

  function pick(g, s, depth) {
    let best = -Infinity, ties = [];
    for (const m of g.moves(s)) {
      const v = -evaluate(g, g.apply(s, m), depth - 1, -Infinity, Infinity);
      if (v > best) { best = v; ties = [m]; }
      else if (v === best) ties.push(m);
    }
    return ties[Math.floor(Math.random() * ties.length)];
  }

  const random = (g, s) => {
    const ms = g.moves(s);
    return ms[Math.floor(Math.random() * ms.length)];
  };

  return { evaluate, pick, random };
})();