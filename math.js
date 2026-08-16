(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MathTrainer = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  function makeMultiplyProblem(selectedTable = null, lastProblemKey = '') {
    for (let tries = 0; tries < 20; tries++) {
      let a, b;
      if (selectedTable) {
        const other = 1 + Math.floor(Math.random() * 10);
        if (Math.random() < 0.5) { a = selectedTable; b = other; }
        else { a = other; b = selectedTable; }
      } else {
        a = 1 + Math.floor(Math.random() * 10);
        b = 1 + Math.floor(Math.random() * 10);
      }
      const key = `m:${a}x${b}`;
      if (key !== lastProblemKey) return { a, b, answer: a * b, text: `${a} × ${b} = ?`, key };
    }
    return { a: 2, b: 2, answer: 4, text: '2 × 2 = ?', key: 'm:2x2' };
  }

  function makeSubtractProblem(lastProblemKey = '') {
    for (let tries = 0; tries < 30; tries++) {
      const r = Math.random();
      let a, b;
      if (r < 0.28) {
        a = 10 + Math.floor(Math.random() * 41);
        b = 1 + Math.floor(Math.random() * Math.min(9, a));
      } else if (r < 0.62) {
        a = 20 + Math.floor(Math.random() * 81);
        b = 10 + Math.floor(Math.random() * Math.max(1, a - 9));
      } else if (r < 0.82) {
        a = 10 * (2 + Math.floor(Math.random() * 9));
        b = 1 + Math.floor(Math.random() * Math.min(a, 49));
      } else {
        a = 50 + Math.floor(Math.random() * 51);
        b = Math.floor(Math.random() * (a + 1));
      }
      if (b > a) [a, b] = [b, a];
      const key = `s:${a}-${b}`;
      if (key !== lastProblemKey) return { a, b, answer: a - b, text: `${a} − ${b} = ?`, key };
    }
    return { a: 34, b: 8, answer: 26, text: '34 − 8 = ?', key: 's:34-8' };
  }

  return { makeMultiplyProblem, makeSubtractProblem };
});
