/**
 * Compose les écrans de la table et choisit les couches de piste, d’objets, de voitures et d’interface selon
 * la phase.
 * Liens : server/layout.ts, server/types.ts, client-table/ui/HUD.ts, client-table/view.ts,
 * client-table/ui/icons.ts et les utilitaires importés ci-dessous.
 * Référencé par client-table/gesture/GestureRecognizer.ts, client-table/main.ts, scripts/acceptance.ts.
 * Façade : les couches par thème et la composition des écrans (render) restent ici ; les écrans et surcouches sont dans client-table/renderer/ (chaque méthode délègue à une fonction du même nom).
 */
import type { GameState, Team } from '../../server/types.js';
import { HUD } from '../ui/HUD.js';
import { type View, type SlingPreview } from '../view.js';
import { type Icon } from '../ui/icons.js';
import { drawTutorial } from '../ui/TutorialOverlay.js';
import { TangibleTransitions } from '../ui/TangibleTransitions.js';
import { playFeedback } from '../sound/Sound.js';
import { ScrapBackdrop } from '../themes/scrap/ScrapBackdrop.js';
import { ScrapTrack } from '../themes/scrap/ScrapTrack.js';
import { themeLook, type ThemeId, type CircuitTheme } from '../themes/themes.js';
import { CircuitTrack } from '../themes/circuit/CircuitTrack.js';
import { ThemeWorld } from '../themes/ThemeWorld.js';
import { VoidBackdrop } from '../themes/neon/VoidBackdrop.js';
import { NeonTrack } from '../themes/neon/NeonTrack.js';
import { NeonVehicles } from '../themes/neon/NeonVehicles.js';
import { NeonObjects } from '../themes/neon/NeonObjects.js';
import { NeonEffects } from '../themes/neon/NeonEffects.js';
import { presentingTrack, presentationFrame } from '../../server/track/trackPresentation.js';
import { TrackCreation } from '../ui/TrackCreation.js';
import { drawTangibleTouchPreview } from '../ui/TangibleTouchPreview.js';
import type { Ctx } from './rendererTypes.js';
import { DRIVE_MODE_BUTTONS } from './rendererButtons.js';
import * as raceOverlays from './raceOverlays.js';
import type { LobbyJoin } from './lobbyJoin.js';
import type { SetupLinks } from '../setup/setupLinks.js';
import { drawSetup } from '../setup/setupScreen.js';
import * as screenOverlays from './screenOverlays.js';
import * as mapCreationScreen from './mapCreationScreen.js';

// Réexports : les noms publics gardent leur chemin d’import.
export { START_TABLE_BUTTON, START_WIIMOTE_BUTTON, START_PC_BUTTON, START_TUTORIAL_BUTTON, START_TANGIBLE_TEST_BUTTON, RESULT_BUTTON, PAUSE_BUTTON, DRIVE_MODE_BUTTONS, DRIVE_MODE_BUTTON, MAP_GENERATE_BUTTON, RACE_START_BUTTON } from './rendererButtons.js';

/** Compose les écrans de la table et choisit les couches de piste, d’objets, de voitures et d’interface selon la phase. */


export class Renderer {
  hud = new HUD();

  lobbyJoin: LobbyJoin | null = null;

  /** Adresses et QR codes de l'écran de préparation, prêts dès que le serveur a annoncé son adresse. */
  setupLinks: SetupLinks | null = null;

  creation = new TrackCreation();

  transitions = new TangibleTransitions(playFeedback);

  backdrop = new VoidBackdrop();

  track = new NeonTrack();

  scrapTrack = new ScrapTrack();

  scrapBackdrop = new ScrapBackdrop();

  // Fall visibility belongs to the vehicle, not to its selected presentation.
  fallen = new Set<Team>();

  scrapVehicles = new NeonVehicles('scrap', this.fallen);

  scrapObjects = new NeonObjects('scrap');

  worlds = new Map<CircuitTheme, { track:CircuitTrack; backdrop:ThemeWorld; vehicles:NeonVehicles; objects:NeonObjects }>();

  /** Prépare puis conserve les couches du thème Miniature, Grand Prix ou Castagne demandé. */
  world(id:CircuitTheme) {
    let world=this.worlds.get(id);
    if(!world){world={track:new CircuitTrack(id),backdrop:new ThemeWorld(id),vehicles:new NeonVehicles(id,this.fallen),objects:new NeonObjects(id)};this.worlds.set(id,world);}
    return world;
  }

  theme: ThemeId = 'neon';

  vehicles = new NeonVehicles('neon', this.fallen);

  objects = new NeonObjects();

  effects = new NeonEffects();

  time = 0;

  reducedMotion = false;

  /** Conserve le contexte Canvas utilisé pour composer les écrans de la table. */
  constructor(readonly ctx: Ctx) {}

  /** Expose les compteurs de caches et de trajectoires utilisés pour les diagnostics de rendu. */
  get stats(): { trackBuilds: number; trailPoints: number } {
    return { trackBuilds: this.track.builds + this.scrapTrack.builds + [...this.worlds.values()].reduce(/* Additionne les constructions de revêtement des trois thèmes de circuit supplémentaires. */ (n,w)=>n+w.track.builds,0), trailPoints: this.theme === 'scrap' ? this.scrapVehicles.trailPoints : this.theme === 'neon' ? this.vehicles.trailPoints : this.world(this.theme).vehicles.trailPoints };
  }

  /** Compose les couches de l’écran correspondant à la phase sans modifier les règles de la partie. */
  render(view: View): void {
    const state = view.state;
    const ctx = this.ctx;
    if (this.theme !== view.theme) { this.vehicles.clearTrails(); this.scrapVehicles.clearTrails(); for(const w of this.worlds.values())w.vehicles.clearTrails(); this.theme = view.theme; }
    const industrial = this.theme === 'scrap';
    const world = this.theme !== 'neon' && this.theme !== 'scrap' ? this.world(this.theme) : null;
    const look = themeLook(this.theme);
    const building = state && presentingTrack(state,view.now()) && state.track && state.trackPresentation;
    const buildFrame = building ? presentationFrame(building,view.now()) : null;
    const vehicles = world?.vehicles ?? (industrial ? this.scrapVehicles : this.vehicles);
    const objects = world?.objects ?? (industrial ? this.scrapObjects : this.objects);
    const track = world?.track ?? (industrial ? this.scrapTrack : this.track);
    if (state) this.transitions.update(state, view.visualTime);
    this.reducedMotion = view.reducedMotion;
    this.time = view.visualTime;
    if(world)world.backdrop.draw(ctx,this.time,view.reducedMotion,state?.phase==='MAP',state?.track??null,state?.phase==='LOBBY'||state?.phase==='SETUP'?'lobby':state?.phase==='MAP'?'map':'race',buildFrame?.reveal??1);
    else (industrial?this.scrapBackdrop:this.backdrop).draw(ctx,this.time,view.reducedMotion,state?.phase==='MAP');
    if (!state) return;

    if (state.phase === 'LOBBY') { vehicles.clear(); objects.clearPickups(); this.drawLobby(ctx, state.developerTools, state.seats, state.soloTest); return; }
    if (state.phase === 'SETUP') { vehicles.clear(); objects.clearPickups(); drawSetup(ctx, state, this.setupLinks, this.theme, this.time, view.wiimotes); return; }
    if (state.phase === 'MAP') { vehicles.clear(); objects.clearPickups(); this.drawMap(ctx, state, view);  return; }
    if (state.phase !== 'READY' && state.phase !== 'RACE' && state.phase !== 'PAUSED' && state.phase !== 'RESULT') return;
    const now = state.phase === 'PAUSED' ? state.pausedAt : view.now();

    if(building && state.track){
      vehicles.clear();
      /** Fournit à la révélation le revêtement du thème sans y dessiner le départ final trop tôt. */
      this.creation.draw(ctx,state.track,state.trackVersion,building,now,this.reducedMotion,look.accent,view.strokes.values(),
        ()=>track.draw(ctx,state.track!,state.trackVersion,this.time,this.reducedMotion,false));
      if(buildFrame?.stage==='lock')for(const team of ['A','B'] as const)vehicles.draw(ctx,state.cars[team],this.time,now,this.reducedMotion,[]);
      return;
    }
    // Course : piste, objets, voitures, retours visuels, puis postes et tutoriel.
    if (state.track) track.draw(ctx, state.track, state.trackVersion, this.time, this.reducedMotion);
    vehicles.drawTrails(ctx, state, this.time, now, this.reducedMotion);
    objects.drawPickups(ctx, state, this.time, this.reducedMotion);
    objects.drawGates(ctx, state, now, this.time, this.reducedMotion);
    this.transitions.draw(ctx, this.time, this.reducedMotion, look.electric);
    objects.drawWalls(ctx, state, now, this.time, this.reducedMotion);
    objects.drawArcs(ctx, state, now, this.time, this.reducedMotion);
    objects.drawPylons(ctx, state, this.time, this.reducedMotion);
    this.transitions.drawActivation(ctx, this.time, this.reducedMotion, look.electric);
    this.drawStones(ctx, state, now);
    for (const t of ['A', 'B'] as Team[]) {
      if (!state.soloTest || t === 'A') vehicles.draw(ctx, state.cars[t], this.time, now, this.reducedMotion, view.effects);
    }
    this.drawRespawnLights(ctx,state,now);
    this.effects.draw(ctx, view);
    this.drawSling(ctx, state, view.sling);
    drawTangibleTouchPreview(ctx, view);
    this.drawExpectedBonus(ctx,state);
    if (!state.soloTest) this.hud.draw(ctx, state, view);
    this.drawDisabledAlerts(ctx, state);
    this.drawNeutralZones(ctx,state);
    this.effects.draw(ctx,view,true);
    if (state.phase === 'READY') { this.drawRaceReady(ctx, state); }
    if (state.phase === 'RACE') { this.drawCountdown(ctx, state, now); this.drawPauseButton(ctx, 'PAUSE'); }
    if (state.phase === 'PAUSED') { this.drawPaused(ctx); this.drawPauseButton(ctx, 'REPRENDRE'); }
    if (state.phase === 'RESULT') this.drawResult(ctx, state);
    drawTutorial(ctx, state, this.reducedMotion ? 0 : this.time, DRIVE_MODE_BUTTONS);

  }

  /** Affiche les feux rouges puis verts au-dessus des voitures réparées avant leur reprise. */
  drawRespawnLights(ctx: Ctx, state: GameState, now:number): void { raceOverlays.drawRespawnLights(this, ctx, state, now); }
  /** Affiche le pictogramme du seul bonus dont le geste est actuellement armé sur la table. */
  drawExpectedBonus(ctx: Ctx, state: GameState): void { raceOverlays.drawExpectedBonus(this, ctx, state); }
  /** Dessine la réserve des tangibles et la zone de commandes neutres. */
  drawNeutralZones(ctx: Ctx, state: GameState): void { raceOverlays.drawNeutralZones(this, ctx, state); }
  /** Dessine les pierres en vol et les avertissements d’impact destinés aux deux équipes. */
  drawStones(ctx: Ctx, state: GameState, now: number): void { raceOverlays.drawStones(this, ctx, state, now); }
  /** Dessine la fourche, l’élastique et la cible du lance-pierre en préparation. */
  drawSling(ctx: Ctx, state: GameState, sling: SlingPreview | null): void { raceOverlays.drawSling(this, ctx, state, sling); }
  /** Indique la panne au poste de la voiture concernée avec une lecture orientée vers ses joueurs. */
  drawDisabledAlerts(ctx: Ctx, state: GameState): void { raceOverlays.drawDisabledAlerts(this, ctx, state); }
  /** Dessine l’accueil et ses boutons sans révéler les modes de test lors d’une séance publique. */
  drawLobby(ctx: Ctx, developerTools?: boolean, seats?: GameState['seats'], soloTest = false): void {
    screenOverlays.drawLobby(this, ctx, developerTools, seats, soloTest);
  }
  /** Affiche les feux de départ une fois les postes du tutoriel prêts. */
  drawCountdown(ctx: Ctx, state: GameState, now: number): void { screenOverlays.drawCountdown(this, ctx, state, now); }
  /** Dessine le bouton commun de pause ou de reprise. */
  drawPauseButton(ctx: Ctx, label: string): void { screenOverlays.drawPauseButton(this, ctx, label); }
  /** Dessine un bouton de validation à pictogramme avec les couleurs du thème. */
  drawAction(ctx: Ctx, b: { x: number; y: number; w: number; h: number }, glyph: Icon, color?: string): void { screenOverlays.drawAction(this, ctx, b, glyph, color); }
  /** Affiche le départ lorsque le circuit est prêt à être lancé. */
  drawRaceReady(ctx: Ctx, state: GameState): void { screenOverlays.drawRaceReady(this, ctx, state); }
  /** Assombrit la piste et affiche la commande de reprise. */
  drawPaused(ctx: Ctx): void { screenOverlays.drawPaused(this, ctx); }
  /** Présente le résultat aux deux côtés de la table avec le retour à l’accueil. */
  drawResult(ctx: Ctx, state: GameState): void { screenOverlays.drawResult(this, ctx, state); }
  /** Dessine les points, les tracés et les repères de joueurs pendant la création du circuit. */
  drawMap(ctx: Ctx, state: GameState, view: View): void { mapCreationScreen.drawMap(this, ctx, state, view); }
}
