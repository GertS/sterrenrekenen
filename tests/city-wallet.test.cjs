const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const M = require('../city-model.js');
function appFixture(initial) {
  let stored = JSON.stringify(initial), fail = false, cityApi;
  const listeners = {};
  const element = { classList:{toggle(){},remove(){},add(){}}, remove(){}, setAttribute(){}, addEventListener(){}, replaceChildren(){}, content:{cloneNode(){return {};}} };
  const document = { querySelector(){return element;}, querySelectorAll(){return [];},getElementById(){return element;}, addEventListener(event,fn){listeners[event]=fn;} };
  const context = { document, localStorage:{getItem(){return stored;},setItem(k,v){if(fail)throw Error('Quota exceeded');stored=v;}}, console, setTimeout, clearTimeout, navigator:{}, location:{protocol:'file:'} };
  context.window = { StarCityModel:M,StarCity:{mount(host,api){cityApi=api;return ()=>{};}},addEventListener(){} };
  vm.runInNewContext(fs.readFileSync(require.resolve('../app.js'),'utf8'),context);
  element.remove=()=>{};
  listeners.click({target:{closest(selector){return selector==='[data-action]'?{dataset:{action:'city'}}:null;}}});
  return { api:cityApi, saved:()=>JSON.parse(stored), setFailure:()=>{fail=true;}, external:data=>{stored=JSON.stringify(data);} };
}
test('city wallet preserves math progress and saves wallet plus city together',()=>{
  const app=appFixture({stars:50,correctMultiply:17,sound:false});
  const result=app.api.commit({kind:'buy',type:'park',x:4,y:3});
  assert.equal(result.stars,30);assert.equal(app.saved().correctMultiply,17);assert.equal(app.saved().city.tiles.length,2);
});
test('failed persistence does not spend stars or change the live city',()=>{
  const app=appFixture({stars:50,sound:false});app.setFailure();
  assert.ok(app.api.commit({kind:'buy',type:'park',x:4,y:3}).error);
  assert.equal(app.api.getState().stars,50);assert.equal(app.api.getState().city.tiles.length,1);assert.equal(app.saved().stars,50);
});
test('a purchase rechecks the current shared wallet before spending',()=>{
  const app=appFixture({stars:50,sound:false});app.external({stars:10,sound:false,city:M.initial()});
  assert.ok(app.api.commit({kind:'buy',type:'park',x:4,y:3}).error);
  assert.equal(app.api.getState().stars,10);assert.equal(app.saved().stars,10);
});
