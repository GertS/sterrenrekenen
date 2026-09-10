const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../city-model.js');

test('existing accounts receive one free house without changing their wallet', () => {
  assert.deepEqual(M.normalize(null), { tiles: [{ x:3, y:3, type:'house' }] });
});
test('purchase charges exactly once and does not mutate its input', () => {
  const original = M.initial();
  const result = M.apply(original, 45, { kind:'buy', type:'park', x:4, y:3 });
  assert.equal(result.stars, 25); assert.equal(result.city.tiles.length, 2);
  assert.equal(original.tiles.length, 1);
  const duplicate = M.apply(result.city, result.stars, { kind:'buy', type:'park', x:4, y:3 });
  assert.ok(duplicate.error); assert.equal(result.stars, 25);
});
test('insufficient stars, invalid purchases, out-of-bounds and detached tiles are rejected', () => {
  for (const [stars, action] of [
    [19,{kind:'buy',type:'park',x:4,y:3}],
    [100,{kind:'buy',type:'unknown',x:4,y:3}],
    [100,{kind:'buy',type:'park',x:7,y:3}],
    [100,{kind:'buy',type:'park',x:3.5,y:3}],
    [100,{kind:'buy',type:'park',x:0,y:0}],
    [NaN,{kind:'buy',type:'park',x:4,y:3}]
  ]) assert.ok(M.apply(M.initial(),stars,action).error);
});
test('all eight building types can be bought at their catalog price', () => {
  for (const t of M.catalog) {
    const r = M.apply(M.initial(),t.cost,{kind:'buy',type:t.id,x:3,y:4});
    assert.equal(r.stars,0); assert.equal(r.city.tiles[1].type,t.id);
  }
});
test('moving is free, preserves ownership and cannot split the town', () => {
  const city = { tiles:[{x:3,y:3,type:'house'},{x:4,y:3,type:'park'},{x:5,y:3,type:'school'}] };
  assert.ok(M.apply(city, 0, {kind:'move',fromX:4,fromY:3,x:3,y:4}).error);
  const valid = M.apply(city, 0, {kind:'move',fromX:5,fromY:3,x:4,y:4});
  assert.equal(valid.stars,0); assert.equal(valid.city.tiles.length,3);
  assert.equal(valid.city.tiles[2].type,'school');
  assert.ok(M.apply(city,0,{kind:'move',fromX:1,fromY:1,x:3,y:4}).error);
});
test('roads grow and shared edges are deduplicated', () => {
  assert.equal(M.roads(M.initial()).length,4);
  const r = M.apply(M.initial(),20,{kind:'buy',type:'park',x:4,y:3});
  assert.equal(M.roads(r.city).length,7);
});
test('saved cities survive serialization and malformed records are sanitized', () => {
  const r = M.apply(M.initial(),70,{kind:'buy',type:'school',x:3,y:4});
  assert.deepEqual(M.normalize(JSON.parse(JSON.stringify(r.city))),r.city);
  assert.deepEqual(M.normalize({tiles:[null,{x:3,y:3,type:'house'},{x:3,y:3,type:'park'},{x:-1,y:0,type:'house'},{x:1,y:1,type:'__proto__'}]}),M.initial());
});
test('a full 49-tile city remains connected and cannot be overbuilt', () => {
  let city = M.initial(), stars = 10000;
  for (let radius=1;radius<7;radius++) for (let x=0;x<7;x++) for(let y=0;y<7;y++) {
    if (Math.abs(x-3)+Math.abs(y-3) !== radius) continue;
    const r=M.apply(city,stars,{kind:'buy',type:'field',x,y});
    assert.equal(r.error,undefined); city=r.city; stars=r.stars;
  }
  assert.equal(city.tiles.length,49); assert.equal(stars,10000-48*15);
  assert.ok(M.apply(city,stars,{kind:'buy',type:'field',x:0,y:0}).error);
});
