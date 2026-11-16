/**
 * Actions de scénario partagées : client de table simulé, tutoriel prêt à jouer, commandes pilote, pose des tangibles et pads de réparation.
 * Liens : scripts/acceptance/harness.ts et les scénarios qui rejouent ces actions.
 * Importé par scripts/acceptance.ts, lancé depuis les scripts npm de package.json.
 */
import assert from 'node:assert/strict';
import type { Team, Vec2 } from '../../server/types.js';
import { createInitialState } from '../../server/GameRules.js';
import { config } from '../../server/config.js';
import { GestureRecognizer } from '../../client-table/GestureRecognizer.js';
import { createView } from '../../client-table/view.js';
import { test, type Rig, rig, msg } from './harness.js';

/** Prépare un tutoriel et identifie les postes avant les exercices de jeu. */
export function tutorialRig(mode: 'table' | 'pc' = 'table'): Rig {
  const r = rig();
  r.rules.startTutorial(mode);
  if(mode==='table')for(const team of ['A','B'] as const)for(const role of ['pilot','copilot'] as const){
    r.rules.onPadHold(msg({type:'PadHold' as const,team,role,on:true}));
    r.rules.onPadHold(msg({type:'PadHold' as const,team,role,on:false}));
  }
  r.advance(3100);
  return r;
}
/** Lit la leçon courante de l’équipe pour vérifier son avancement. */
export const lesson = (r: Rig, team: Team) => r.state.tutorial!.steps[r.state.tutorial!.teams[team].step];
/** Fait avancer les étapes avec une garde pour atteindre la leçon étudiée sans boucler indéfiniment. */
export function skipTo(r: Rig, team: Team, id: string): void {
  for (let guard = 0; lesson(r, team) !== id; guard++) {
    assert.ok(guard < 20, `lesson ${id} not reached`);
    r.rules.tutorialSkip(team);
  }
}
/** Déplace la voiture au point étudié puis applique les contacts des règles de jeu. */
export function driveTo(r: Rig, team: Team, to: Vec2): void {
  const car = r.state.cars[team];
  const prev = { ...car.pos };
  car.pos = { x: to.x, y: to.y };
  r.rules.afterMove(team, prev, r.clock.now);
}
/** Envoie une commande pilote à l’équipe pendant l’exercice. */
export const pilot = (r: Rig, team: Team, steer: number, throttle = 1) =>
  r.rules.onPilotInput(team, msg({ type: 'PilotInput' as const, team, throttle, steer }));
/** Relie un canvas simulé à la reconnaissance pour collecter les commandes de la table. */
export function tableClient(mode: 'table' | 'pc') {
  const handlers: Record<string, (e: unknown) => void> = {};
  const canvas = {
    /** Conserve le gestionnaire du navigateur simulé pour pouvoir lui rejouer un événement. */
    addEventListener: (type: string, fn: (e: unknown) => void) => { handlers[type] = fn; },
    /** Fournit les dimensions fixes du canvas de test pour convertir les contacts. */
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1920, height: 1080 }),
    /** Remplace la capture du navigateur, inutile lorsque les événements sont rejoués directement. */
    setPointerCapture: () => {},
  } as unknown as HTMLCanvasElement;
  const view = createView(/* Fournit l’heure contrôlée du scénario au composant qui consulte son horloge. */ () => 0);
  const state = createInitialState();
  state.phase = 'MAP';
  state.mapMode = mode;
  view.state = state;
  const sent: Array<{ type: string } & Record<string, unknown>> = [];
  const gestures = new GestureRecognizer(canvas, view, /* Collecte la commande produite pour la comparer aux résultats attendus. */ m => sent.push(m));
  /** Construit l’événement de pointeur synthétique envoyé à la reconnaissance. */
  const ev = (id: number, p: Vec2, type: string, pointerType = 'touch') => ({ type, pointerId: id, clientX: p.x, clientY: p.y, pointerType, timeStamp: 0, /* Remplace l’annulation de l’événement natif dans le navigateur simulé. */ preventDefault() {} });
  return {
    view, sent, gestures,
    /** Rejoue la pose d’un doigt dans le gestionnaire de contacts du test. */
    down: (id: number, p: Vec2, pointerType?: string) => handlers.pointerdown(ev(id, p, 'pointerdown', pointerType)),
    /** Rejoue le déplacement d’un doigt maintenu dans le scénario. */
    move: (id: number, p: Vec2) => handlers.pointermove(ev(id, p, 'pointermove')),
    /** Rejoue le retrait d’un doigt pour terminer sa commande ou son geste. */
    up: (id: number, p: Vec2) => handlers.pointerup(ev(id, p, 'pointerup')),
    /** Rejoue une interruption système du contact sans la confondre avec un geste confirmé. */
    cancel: (id: number, p: Vec2) => handlers.pointercancel(ev(id, p, 'pointercancel')),
    /** Extrait les commandes de raccord envoyées par la table simulée. */
    dividers: () => sent.filter(/* Isole les poses de raccord pour vérifier le résultat de ce scénario. */ m => m.type === 'MapDivider'),
  };
}
/** Initialise l’ancien point d’entrée de rangement utilisé par les tests de compatibilité. */
export function charge(r: Rig, id: 1|2|3, team: Team = 'A') {
  r.rules.onTangibleControl(msg({type:'TangibleControl',id,action:'dock',team}));
  r.rules.onTangibleControl(msg({type:'TangibleControl',id,action:'activate'}));
}
/** Pose le tangible avec les coordonnées du scénario en passant par les règles serveur. */
export function place(r: Rig, id: 1 | 2 | 3, x = .5, y = .5, angle = 0, active = true) {
  if (!r.state.tangibles[id]) charge(r,id);
  r.rules.onTangibleMoved(msg({ type: 'TangibleMoved', id, x, y, angle, active }));
}
/** Pose un mur sur la trajectoire de la voiture pour étudier son choc. */
export function placeBlocking(r: Rig) {
  const p = r.state.cars.A.pos;
  place(r, 1, p.x / config.logicalWidth, p.y / config.logicalHeight);
}
/** Envoie le maintien ou le relâchement du pad de réparation étudié. */
export const pad = (r: Rig, team: Team, role: 'pilot' | 'copilot', on: boolean) =>
  r.rules.onPadHold(msg({ type: 'PadHold' as const, team, role, on }));
