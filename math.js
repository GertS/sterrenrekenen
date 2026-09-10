(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MathTrainer = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  function makeMultiplyProblem(selectedTables = null, lastProblemKey = '') {
    const tables = Array.isArray(selectedTables)
      ? selectedTables.filter(table => Number.isInteger(table) && table >= 1 && table <= 10)
      : Number.isInteger(selectedTables) && selectedTables >= 1 && selectedTables <= 10
        ? [selectedTables]
        : [];
    for (let tries = 0; tries < 20; tries++) {
      let a, b, table = null;
      if (tables.length) {
        table = tables[Math.floor(Math.random() * tables.length)];
        const other = 1 + Math.floor(Math.random() * 10);
        if (Math.random() < 0.5) { a = table; b = other; }
        else { a = other; b = table; }
      } else {
        a = 1 + Math.floor(Math.random() * 10);
        b = 1 + Math.floor(Math.random() * 10);
      }
      const key = `m:${a}x${b}`;
      if (key !== lastProblemKey) return { a, b, table, answer: a * b, text: `${a} × ${b} = ?`, key };
    }
    const table = tables[0] || 2;
    const other = table === 2 ? 3 : 2;
    return { a: table, b: other, table: tables.length ? table : null, answer: table * other, text: `${table} × ${other} = ?`, key: `m:${table}x${other}` };
  }

  function makeSubtractProblem(lastProblemKey = '', step = 1) {
    const difficultyStep = Math.max(1, Math.min(10, Number(step) || 1));
    for (let tries = 0; tries < 30; tries++) {
      let a, b;
      if (difficultyStep <= 3) {
        // Kleine stapjes zonder tientaloverschrijding.
        const units = 2 + Math.floor(Math.random() * 8);
        a = 10 + 10 * Math.floor(Math.random() * 4) + units;
        b = 1 + Math.floor(Math.random() * units);
      } else if (difficultyStep <= 5) {
        // Eén cijfer eraf, nu ook over een tiental heen.
        a = 20 + Math.floor(Math.random() * 51);
        b = 2 + Math.floor(Math.random() * Math.min(8, a - 1));
      } else if (difficultyStep <= 7) {
        // Twee getallen met tientallen, maar nog niet maximaal groot.
        a = 30 + Math.floor(Math.random() * 61);
        b = 10 + Math.floor(Math.random() * Math.min(40, a - 9));
      } else {
        // De laatste drie sommen forceren lenen over een tiental.
        a = 50 + Math.floor(Math.random() * 51);
        b = 11 + Math.floor(Math.random() * Math.max(1, a - 11));
        if (a % 10 >= b % 10) continue;
      }
      if (b > a) [a, b] = [b, a];
      const key = `s:${a}-${b}`;
      if (key !== lastProblemKey) return { a, b, step: difficultyStep, answer: a - b, text: `${a} − ${b} = ?`, key };
    }
    return { a: 83, b: 47, step: difficultyStep, answer: 36, text: '83 − 47 = ?', key: 's:83-47' };
  }

  function localDay(now = new Date()) {
    return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
  }

  function tableProgress(value, now = new Date()) {
    const day = localDay(now);
    const source = value && value.day === day ? value.tables || {} : {};
    const tables = {};
    const integer = (v, max) => Number.isInteger(v) && v >= 0 ? Math.min(v, max) : 0;
    for (let n = 1; n <= 10; n++) {
      const t = source[n] || {};
      tables[n] = { attempts: integer(t.attempts, 9), mistakes: integer(t.mistakes, 9), perfect: integer(t.perfect, 3), locked: t.locked === true, others: integer(t.others, 5) };
    }
    return { day, tables };
  }

  function recordTableAnswer(value, table, correct, now = new Date()) {
    const progress = tableProgress(value, now);
    const t = progress.tables[table];
    if (!t || t.locked) return { progress, completed: false, newlyLocked: false };
    t.attempts++;
    if (!correct) t.mistakes++;
    if (t.attempts < 10) return { progress, completed: false, newlyLocked: false };
    // Every completed set on another table counts, including sets with mistakes.
    for (let n = 1; n <= 10; n++) {
      const other = progress.tables[n];
      if (n !== table && other.locked && ++other.others >= 6) {
        progress.tables[n] = { attempts: 0, mistakes: 0, perfect: 0, locked: false, others: 0 };
      }
    }
    if (t.mistakes === 0) t.perfect++;
    t.attempts = 0; t.mistakes = 0;
    t.locked = t.perfect >= 3;
    return { progress, completed: true, newlyLocked: t.locked };
  }

  return { makeMultiplyProblem, makeSubtractProblem, tableProgress, recordTableAnswer };
});
