import test from 'node:test';
import assert from 'node:assert/strict';
import { startStarfield } from '../starfield.js';

test('star background draws once, has no idle jobs, and preserves positions on resize/theme', () => {
  const names=['window','document','MutationObserver','requestAnimationFrame','setTimeout','setInterval'];
  const saved=Object.fromEntries(names.map(k=>[k,globalThis[k]]));
  let arcs=[],draws=0,themeChanged;
  const events=new Map();
  const ctx={clearRect(){arcs=[];draws++;},beginPath(){},arc(...v){arcs.push(v);},fill(){}};
  const canvas={dataset:{},getContext:()=>ctx};
  try {
    globalThis.window={innerWidth:398,innerHeight:600,addEventListener:(k,v)=>events.set(k,v),removeEventListener:k=>events.delete(k)};
    globalThis.document={hidden:false,documentElement:{dataset:{theme:'dark'}},addEventListener:(k,v)=>events.set(k,v),removeEventListener:k=>events.delete(k)};
    globalThis.MutationObserver=class {constructor(fn){themeChanged=fn;} observe(){} disconnect(){}};
    for(const name of ['requestAnimationFrame','setTimeout','setInterval'])globalThis[name]=()=>{throw Error('No recurring work permitted');};
    const stop=startStarfield(canvas), initial=structuredClone(arcs);
    assert.equal(draws,1);assert(arcs.length<=100);assert.equal(canvas.dataset.animated,'false');
    events.get('resize')();themeChanged();assert.equal(draws,1);
    document.documentElement.dataset.theme='light';themeChanged();
    assert.equal(draws,2);assert.deepEqual(arcs,initial);
    window.innerWidth=796;events.get('resize')();
    assert.deepEqual(arcs.map(p=>p[0]),initial.map(p=>p[0]*2));
    assert.deepEqual(arcs.map(p=>p[1]),initial.map(p=>p[1]));
    document.hidden=true;events.get('visibilitychange')();assert.equal(draws,3);
    stop();assert.equal(events.size,0);
  } finally {for(const [key,value] of Object.entries(saved)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}}
});
