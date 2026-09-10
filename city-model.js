/* Shared city rules: no browser dependencies, also exercised by the tests. */
(function (root) {
  'use strict';
  const SIZE = 7;
  const catalog = [
    { id: 'house', name: 'Woning', cost: 30, sprite: 0, residents: 4, description: 'Een gezellig huis met een bloementuin.' },
    { id: 'flat', name: 'Flat', cost: 60, sprite: 1, residents: 16, description: 'Meer buren, meer gezelligheid!' },
    { id: 'park', name: 'Park', cost: 20, sprite: 2, residents: 0, description: 'Een groene plek om samen te spelen.' },
    { id: 'police', name: 'Politie', cost: 80, sprite: 3, residents: 0, description: 'Een eigen bureau voor de wijk.' },
    { id: 'farm', name: 'Boerderij', cost: 50, sprite: 4, residents: 3, description: 'Buiten wonen, tussen de dieren.' },
    { id: 'field', name: 'Akker', cost: 15, sprite: 5, residents: 0, description: 'Hier groeien de lekkerste groenten.' },
    { id: 'school', name: 'School', cost: 70, sprite: 6, residents: 0, description: 'Een fijne school voor alle kinderen.' },
    { id: 'garden', name: 'Bloementuin', cost: 25, sprite: 7, residents: 0, description: 'Nog meer kleur in jouw stad.' }
  ];
  const byId = Object.fromEntries(catalog.map(t => [t.id, t]));
  const key = (x, y) => `${x},${y}`;
  const inside = (x, y) => Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < SIZE && y < SIZE;
  const initial = () => ({ tiles: [{ x: 3, y: 3, type: 'house' }] });
  function normalize(value) {
    if (!value || !Array.isArray(value.tiles)) return initial();
    const seen = new Set();
    const tiles = value.tiles.filter(t => {
      if (!t || !inside(t.x, t.y) || !Object.hasOwn(byId, t.type) || seen.has(key(t.x, t.y))) return false;
      seen.add(key(t.x, t.y)); return true;
    }).map(({ x, y, type }) => ({ x, y, type }));
    return tiles.length ? { tiles } : initial();
  }
  function connected(tiles) {
    if (!tiles.length) return false;
    const occupied = new Set(tiles.map(t => key(t.x, t.y)));
    const reached = new Set(); const queue = [tiles[0]];
    for (let i = 0; i < queue.length; i++) {
      const { x, y } = queue[i]; const k = key(x, y);
      if (reached.has(k)) continue;
      reached.add(k);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (occupied.has(key(x + dx, y + dy)) && !reached.has(key(x + dx, y + dy))) queue.push({ x: x + dx, y: y + dy });
      }
    }
    return reached.size === tiles.length;
  }
  function apply(city, stars, action) {
    const tiles = normalize(city).tiles;
    if (!action || !inside(action.x, action.y)) return { error: 'Kies een vak binnen je wereld.' };
    if (tiles.some(t => t.x === action.x && t.y === action.y)) return { error: 'Hier staat al een tegel. Kies een vrij vak.' };
    let next, cost = 0;
    if (action.kind === 'buy') {
      const item = Object.hasOwn(byId, action.type) ? byId[action.type] : null;
      if (!item) return { error: 'Kies eerst een tegel in de winkel.' };
      cost = item.cost;
      if (!Number.isSafeInteger(stars) || stars < cost) return { error: `Nog ${cost - (Number.isSafeInteger(stars) ? stars : 0)} sterren nodig. Maak eerst wat sommen!` };
      next = [...tiles, { x: action.x, y: action.y, type: item.id }];
    } else if (action.kind === 'move') {
      const source = tiles.find(t => t.x === action.fromX && t.y === action.fromY);
      if (!source) return { error: 'Deze tegel is al verplaatst. Kies hem opnieuw.' };
      next = tiles.map(t => t === source ? { ...t, x: action.x, y: action.y } : t);
    } else return { error: 'Kies een tegel om te bouwen.' };
    if (!connected(next)) return { error: 'Bouw naast je stad, zodat alle straten verbonden blijven.' };
    return { city: { tiles: next }, stars: stars - cost, cost };
  }
  // Road edges lie on tile boundaries. Shared edges occur only once.
  function roads(city) {
    const edges = new Map();
    for (const { x, y } of normalize(city).tiles) {
      for (const [a, b] of [ [[x,y],[x+1,y]], [[x+1,y],[x+1,y+1]], [[x+1,y+1],[x,y+1]], [[x,y+1],[x,y]] ]) {
        const id = [a.join(','), b.join(',')].sort().join('|');
        edges.set(id, { a, b });
      }
    }
    return [...edges.values()];
  }
  const api = { SIZE, catalog, byId, initial, normalize, connected, apply, roads };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.StarCityModel = api;
})(typeof window !== 'undefined' ? window : globalThis);
