import assert from 'node:assert/strict';
import {generatePreset,generate,randomizePickups} from '../server/MapGenerator.js';
import {nearestOnTrack} from '../server/geometry.js';
const random=(seed:number)=>()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
const a={x:560,y:540},b={x:1360,y:540};
const wave=(p:typeof a,q:typeof a)=>Array.from({length:121},(_,i)=>({x:p.x+(q.x-p.x)*i/120,y:540-170*Math.sin(2*Math.PI*i/120)}));
const eight=generate(wave(a,b),wave(b,a),a,b,b,a);
for(const source of [generatePreset(),eight]){
 const original=JSON.stringify(source),variants=new Set<string>();
 for(let seed=1;seed<=80;seed++){
  const track=randomizePickups(source,random(seed));assert.equal(track.pickupPositions.length,4);
  variants.add(JSON.stringify(track.pickupPositions));assert.deepEqual(track.pickupPositions,randomizePickups(source,random(seed)).pickupPositions);
  for(let i=0;i<4;i++){
   const p=track.pickupPositions[i],hit=nearestOnTrack(p,track);assert.ok(hit.distance+24<=hit.halfWidth,'the complete icon fits inside the ribbon');
   assert.ok(Math.hypot(p.x-track.startLine.pos.x,p.y-track.startLine.pos.y)>=120,'the finish remains clear');
   for(let j=0;j<i;j++)assert.ok(Math.hypot(p.x-track.pickupPositions[j].x,p.y-track.pickupPositions[j].y)>=120,'pickups do not cluster');
   assert.ok(track.featureIndices.pickups[i]>=0&&track.featureIndices.pickups[i]<track.centerline.length,'deformation anchor retained');
  }
 }
 assert.ok(variants.size>70);assert.equal(JSON.stringify(source),original,'the source geometry is preserved');
}
console.log('Pickups: 160 seeded layouts, spacing, road margins, reproducibility and deformation anchors passed');
