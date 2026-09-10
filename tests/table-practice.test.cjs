const {test}=require('node:test');
const assert=require('node:assert/strict');
const M=require('../math.js');
const today=new Date(2026,8,10,23,59);
function answer(p,n,count,correct=true){for(let i=0;i<count;i++)p=M.recordTableAnswer(p,n,correct,today).progress;return p;}
test('locks exactly after three perfect sets, and ignores further answers',()=>{
 let p=answer(null,1,29);assert.equal(p.tables[1].locked,false);
 p=answer(p,1,1);assert.equal(p.tables[1].locked,true);
 assert.deepEqual(answer(p,1,10),p);
});
test('a mistake prevents that set from being perfect; completed perfect sets are retained',()=>{
 let p=answer(null,10,10);p=answer(p,10,1,false);p=answer(p,10,9);
 assert.equal(p.tables[10].perfect,1);assert.equal(p.tables[10].attempts,0);
 p=answer(p,10,20);assert.equal(p.tables[10].locked,true);
});
test('six completed other sets unlock; partial sets and same table do not',()=>{
 let p=answer(null,1,30);p=answer(p,1,60);assert.equal(p.tables[1].others,0);
 p=answer(p,2,29);assert.equal(p.tables[1].others,2);
 p=answer(p,2,1);p=answer(p,3,29);assert.equal(p.tables[1].locked,true);
 p=answer(p,3,1);assert.equal(p.tables[1].locked,false);assert.equal(p.tables[1].perfect,0);
});
test('sets with mistakes also count as practice on other tables',()=>{
 let p=answer(null,1,30);p=answer(p,2,60,false);assert.equal(p.tables[1].locked,false);
});
test('mixed tables keep independent counts, preserved across serialization',()=>{
 let p=answer(null,1,9);p=answer(p,10,9);p=JSON.parse(JSON.stringify(p));
 p=answer(p,1,1);assert.equal(p.tables[1].perfect,1);assert.equal(p.tables[10].perfect,0);
 assert.equal(p.tables[10].attempts,9);
});
test('local calendar day releases tables at midnight, not after 24 hours',()=>{
 const p=answer(null,1,30);
 assert.equal(M.tableProgress(p,new Date(2026,8,10,23,59,59)).tables[1].locked,true);
 const next=M.tableProgress(p,new Date(2026,8,11,0,0));
 assert.equal(next.tables[1].locked,false);assert.equal(next.tables[1].perfect,0);
});
test('old accounts and malformed counters are normalized',()=>{
 assert.equal(M.tableProgress(null,today).tables[1].attempts,0);
 const p=M.tableProgress({day:'2026-9-10',tables:{1:{attempts:-1,perfect:'3',others:Infinity}}},today);
 assert.equal(p.tables[1].perfect,0);assert.equal(p.tables[1].others,0);
});
