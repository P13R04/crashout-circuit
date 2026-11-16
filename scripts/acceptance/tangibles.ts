/**
 * Scénarios des tangibles neutres : pose atomique, dépôt, échelle LEGO et effets du mur et des piliers.
 * Liens : server/tangibles.ts, client-shared/tangibleGeometry.ts.
 * Importé par scripts/acceptance.ts, lancé depuis les scripts npm de package.json.
 */
import assert from 'node:assert/strict';
import { physicalDimensions, wallContact } from '../../client-shared/tangibleGeometry.js';
import { CAR_RADIUS } from '../../server/GameRules.js';
import { config } from '../../server/config.js';
import { panelOf, chargeZoneTeam, depotPose } from '../../server/layout.js';
import { test, section, raceRig, msg } from './harness.js';
import { place } from './scenarioActions.js';

section('Tangibles · neutral fixed objects');
/** Vérifie la pose atomique d’un tangible neutre et l’absence d’effet de POWER sur son activation. */
test('atomic first placement fixes the kind and neutral ownership; POWER has no effect', () => {
  const r = raceRig(); place(r, 1, .4, .5, 20, false);
  assert.equal(r.state.tangibles[1].kind, 'wall');
  assert.equal(r.state.tangibles[1].team, null);
  assert.equal(r.state.walls.length, 0);
  r.rules.onPower('A'); assert.equal(r.state.tangibles[1].active, false);
  r.rules.onTangibleControl(msg({ type: 'TangibleControl', id: 1, action: 'activate' }));
  assert.equal(r.state.walls.length, 1);
  const placed = { ...r.state.tangibles[1] };
  r.rules.onTangibleControl(msg({ type: 'TangibleControl', id: 1, action: 'deactivate' }));
  assert.equal(r.state.walls.length, 0);
  assert.deepEqual(r.state.tangibles[1], { ...placed, active: false });
  r.rules.onTangibleControl(msg({ type: 'TangibleControl', id: 1, action: 'activate' }));
  assert.deepEqual(r.state.tangibles[1], placed);
  r.rules.onTangibleControl(msg({ type: 'TangibleControl', id: 1, action: 'configure', team: 'B', kind: 'pylon' }));
  assert.deepEqual(r.state.tangibles[1], placed, 'legacy configuration cannot change fixed type or neutrality');
});
/** Vérifie les dégâts et le rebond du même mur sur les deux équipes. */
test('T-03 neutral wall damages and bounces both teams', () => {
  for (const team of ['A', 'B'] as const) {
    const r = raceRig(), p = { ...r.state.cars[team].pos };
    place(r, 1, p.x / config.logicalWidth, p.y / config.logicalHeight);
    r.rules.afterMove(team, p, r.clock.now);
    assert.equal(r.state.cars[team].hp, config.hpMax - config.dmgWall);
    r.rules.afterMove(team, p, r.clock.now);
    assert.equal(r.state.cars[team].hp, config.hpMax - config.dmgWall, 'invulnerability still applies');
  }
});
/** Vérifie que les deux piliers forment un arc neutre qui ralentit les deux voitures. */
test('T-04 two fixed pylons form a neutral arc that slows both teams', () => {
  for (const team of ['A', 'B'] as const) {
    const r = raceRig(), car = r.state.cars[team], p = { ...car.pos };
    place(r, 2, (p.x - 100) / config.logicalWidth, p.y / config.logicalHeight);
    assert.equal(r.state.arcs.length, 0);
    place(r, 3, (p.x + 100) / config.logicalWidth, p.y / config.logicalHeight);
    assert.equal(r.state.arcs.length, 1); assert.equal(r.state.walls.length, 0);
    assert.equal(r.state.arcs[0].team, null);
    car.speed = 300; r.rules.afterMove(team, p, r.clock.now);
    assert.equal(car.hp, config.hpMax - config.dmgArc);
    assert.equal(car.speed, 300 * config.arcSlowFactor);
    assert.equal(car.slowUntil, r.clock.now + config.arcSlowS * 1000);
  }
});
/** Vérifie la limite exacte de distance entre les piliers pour former un arc. */
test(`arc includes exactly ${config.arcMaxDistPx} px, breaks beyond range, and unpaired pylons stay pylons`, () => {
  const r = raceRig(); place(r, 2, 600 / 1920, .5); place(r, 3, (600 + config.arcMaxDistPx) / 1920, .5);
  assert.equal(r.state.arcs.length, 1);
  place(r, 3, (600 + config.arcMaxDistPx + 1) / 1920, .5); assert.equal(r.state.arcs.length, 0);
  assert.equal(r.state.walls.length, 0);
  assert.equal(r.state.tangibles[2].kind, 'pylon');
});
/** Vérifie le rangement initial et la réutilisation immédiate des objets sans recharge. */
test('objects start inactive in the neutral depot and can be reused immediately without a copilot charging zone',()=>{
  const r=raceRig();
  for(const id of [1,2,3]){assert.equal(r.state.tangibles[id].status,'parked');assert.equal(r.state.tangibles[id].active,false);}
  for(const team of ['A','B'] as const){const p=panelOf(team,'copilot');assert.equal(chargeZoneTeam({x:p.cx,y:p.cy}),null);}
  place(r,2);assert.equal(r.state.tangibles[2].active,true);assert.equal(r.state.tangibles[2].team,null);
  r.rules.onTangibleRemoved(msg({type:'TangibleRemoved',id:2}));assert.equal(r.state.tangibles[2].status,'parked');
  place(r,2,.6);assert.equal(r.state.tangibles[2].status,'placed');assert.equal(r.state.tangibles[2].active,true);
  r.rules.resetToLobby();assert.deepEqual(r.state.tangibles,{});r.rules.startRace();assert.equal(r.state.walls.length,0);
});

/** Vérifie le rejet des poses invalides et la conservation d’une activation non précisée. */
test('invalid ids, phases, coordinates and activation are ignored; omitted activation is preserved', () => {
  const r = raceRig(); place(r, 2); place(r, 3, .6);
  r.rules.onTangibleRemoved(msg({ type: 'TangibleRemoved', id: 2 })); assert.equal(r.state.arcs.length, 0);
  const before = structuredClone(r.state.tangibles[3]);
  for (const value of [NaN, Infinity, -0.1, 1.1]) place(r, 3, value);
  r.rules.onTangibleMoved(msg({ type: 'TangibleMoved', id: 4 as 1, x: .5, y: .5, angle: 0, active: true }));
  r.rules.onTangibleMoved(msg({ type: 'TangibleMoved', id: 3, x: .5, y: .5, angle: 0, active: 'yes' as unknown as boolean }));
  assert.deepEqual(r.state.tangibles[3], before); assert.equal(r.state.tangibles[4], undefined);
  r.rules.onTangibleControl(msg({ type: 'TangibleControl', id: 3, action: 'deactivate' }));
  r.rules.onTangibleMoved(msg({ type: 'TangibleMoved', id: 3, x: .605, y: .5, angle: 0 }));
  assert.equal(r.state.tangibles[3].active, false);
  r.state.phase = 'RESULT'; place(r, 1); assert.equal(r.state.tangibles[1].status,'parked');
});

section('LEGO scale and recharge');
/** Vérifie la conversion des bases LEGO sur une table de 55 pouces indépendamment de sa résolution. */
test('55-inch active image maps LEGO 10×4 and 4×4 footprints, independent of display resolution', () => {
  const d = physicalDimensions(55);
  assert.ok(Math.abs(d.pxPerMm - 1.577) < .002);
  assert.equal(d.wallLengthPx / d.pxPerMm, 80);
  assert.equal(d.wallWidthPx / d.pxPerMm, 32);
  assert.equal(d.pylonBasePx / d.pxPerMm, 32);
  assert.equal(d.pylonFieldRadiusPx / d.pxPerMm, 42);
  assert.equal(physicalDimensions(55,3840,2160).wallLengthPx, d.wallLengthPx*2);
  assert.ok(Math.abs(physicalDimensions(65).wallWidthPx / d.wallWidthPx - 55/65) < 1e-9);
});
/** Vérifie les extrémités rectangulaires, la frange de tolérance et la sortie d’un contact déjà engagé dans le mur. */
test('rounded wall collision keeps rectangular ends, covers its fringe, and clears embedded cars', () => {
  const center = {x:960,y:540}, p=config;
  const radius=CAR_RADIUS+p.tangibleTolerancePx, hx=p.wallLengthPx/2, hy=p.wallWidthPx/2;
  /** Teste le contact d’une voiture immobile avec le mur aux dimensions physiques choisies. */
  const contact=(x:number,y:number)=>wallContact({x,y},{x,y},center,0,p.wallLengthPx,p.wallWidthPx,radius);
  assert.ok(contact(960,540+hy+radius-.1));
  assert.equal(contact(960,540+hy+radius+.1),null);
  assert.equal(contact(960+hx+radius+.1,540),null,'no exaggerated capsule end');
  assert.equal(contact(960+hx+radius*.8,540+hy+radius*.8),null,'rounded corners do not fill the bounding box');
  const embedded=contact(960,540)!;
  assert.equal(contact(embedded.point.x,embedded.point.y),null,'rebound pushes clear of the whole footprint');
  for(const angle of [0,45,90,175,270]){
    const a=angle*Math.PI/180,n={x:-Math.sin(a),y:Math.cos(a)};
    const from={x:960-n.x*200,y:540-n.y*200},to={x:960+n.x*200,y:540+n.y*200};
    const hit=wallContact(from,to,center,angle,p.wallLengthPx,p.wallWidthPx,radius);
    assert.ok(hit,'swept collision cannot tunnel through a rotated wall');
    assert.equal(wallContact(hit.point,hit.point,center,angle,p.wallLengthPx,p.wallWidthPx,radius),null);
  }
});
/** Vérifie qu’un pilier isolé produit déjà un champ électrique neutre au sol. */
test('a single neutral pillar has an electrical ground field that slows either car', () => {
  for(const team of ['A','B'] as const){
    const r=raceRig(),car=r.state.cars[team],at={...car.pos};
    place(r,2,(at.x+config.pylonFieldRadiusPx-3)/1920,at.y/1080);
    car.speed=200;r.rules.afterMove(team,at,r.clock.now);
    assert.equal(r.state.arcs.length,0);
    assert.equal(car.hp,config.hpMax-config.dmgArc);
    assert.equal(car.speed,200*config.arcSlowFactor);
  }
});
/** Vérifie les déplacements manuels successifs et la désactivation immédiate dans la réserve. */
test('manual repositioning is unlimited and parking disables all effects without charging or cooldown',()=>{
  const r=raceRig();place(r,1);
  for(const x of [.55,.6,.7,.4]){place(r,1,x,.5,30);assert.equal(r.state.tangibles[1].x,x);assert.equal(r.state.tangibles[1].active,true);}
  r.rules.onTangibleMoved(msg({type:'TangibleMoved',id:1,...depotPose(1),active:true}));
  assert.equal(r.state.tangibles[1].status,'parked');assert.equal(r.state.tangibles[1].active,false);assert.equal(r.state.walls.length,0);
  place(r,1,.7,.5,90);assert.equal(r.state.walls.length,1);assert.equal(r.state.tangibles[1].team,null);
});
