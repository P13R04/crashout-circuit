/**
 * Affiche les consignes, les repères de couleur et les surbrillances du tutoriel autour des quatre postes.
 * Liens : server/layout.ts, server/types.ts, client-table/ui/icons.ts, client-table/view.ts,
 * client-table/themes/themes.ts et les utilitaires importés ci-dessous.
 * Référencé par client-table/gesture/GestureRecognizer.ts, client-table/renderer/Renderer.ts, scripts/acceptance.ts.
 */
import type { GameState, Team, Vec2 } from '../../server/types.js';
import {
  LOGICAL_W, LOGICAL_H, panelOf, localToWorld, worldToLocal, padLocal,
  TANGIBLE_DEPOT, steerArea, PEDAL_LOCAL, POWER_BTN_LOCAL, type PanelLayout,
} from '../../server/layout.js';
import { icon } from './icons.js';
import { TEAM_COLOR, TEAM_NAME } from '../view.js';
import { themeLook, type ThemeId } from '../themes/themes.js';
import { armedPickup } from '../../server/rules/armedPickup.js';
import { drawGestureDemo } from './TutorialGestures.js';
import { lessonOf, type Lesson } from '../../client-shared/tutorialLessons.js';
import { isPhoneStation, tablePanels } from '../../server/tableStations.js';

/** Désigne le contexte Canvas 2D partagé par les fonctions de dessin du module. */
type Ctx = CanvasRenderingContext2D;
/** Décrit la surface d’un bouton ou d’une carte à dessiner ou à toucher. */
type Rect = { x: number; y: number; w: number; h: number };
/** Distingue les commandes et l’orientation du pilote et du copilote. */
type Role = 'pilot' | 'copilot';
const CARD = { w: 390, h: 144 };
/** Place la carte d’aide à côté du poste concerné en respectant son orientation. */
function cardAt(team: Team, role: Role): PanelLayout {
  const panel=panelOf(team,role);
  return {...panel,cx:role==='pilot'?740:1220,cy:panel.cy<LOGICAL_H/2?145:935};
}
const SKIP: Rect = { x: 90, y: -65, w: 88, h: 28 };
export const TUTORIAL_END_BUTTON: Rect = { x: LOGICAL_W/2-200,y:LOGICAL_H/2-45,w:400,h:90 };
/** Associe le toucher du tutoriel au passage d’étape d’une équipe ou au départ de création. */
export type TutorialButton = { kind:'skip';team:Team } | {kind:'end'};
/** Indique si une équipe attend encore l’identification de ses postes avant le départ. */
export function tutorialIdentifying(state: GameState): boolean {
  return !!state.tutorial && (['A','B'] as const).some(/* Repère une équipe dont les postes ne sont pas encore identifiés. */ t=>state.tutorial!.steps[state.tutorial!.teams[t].step]==='identify');
}
/** Retrouve le bouton de tutoriel touché et l’équipe concernée. */
export function tutorialButtonAt(state: GameState,p:Vec2):TutorialButton|null {
  const tut=state.tutorial;if(!tut)return null;
  /** Teste le bouton du tutoriel avec la petite marge de contact autorisée. */
  const hit=(p:Vec2,r:Rect,margin=0)=>p.x>=r.x-margin&&p.x<=r.x+r.w+margin&&p.y>=r.y-margin&&p.y<=r.y+r.h+margin;
  if(tut.finished)return hit(p,TUTORIAL_END_BUTTON)?{kind:'end'}:null;
  for(const team of ['A','B'] as const){
    if (!tut.steps[tut.teams[team].step]) continue;
    if (isPhoneStation(state, team, 'pilot')) {
      if (hit(p, sharedSkip(team))) return {kind:'skip',team};
    } else if (hit(worldToLocal(cardAt(team,'pilot'),p.x,p.y),SKIP,5)) {
      return {kind:'skip',team};
    }
  }
  return null;
}
/** Donne le centre du bouton de passage d’étape pour les essais automatisés. */
export function tutorialSkipCenter(team:Team):Vec2 {return localToWorld(cardAt(team,'pilot'),SKIP.x+SKIP.w/2,SKIP.y+SKIP.h/2);}
/** Signale qu’un contact se situe sur une démonstration et ne doit pas devenir un geste de jeu. */
export function inTutorialCard(state:GameState,p:Vec2):boolean {
  if(!state.tutorial||state.tutorial.finished)return false;
  return tablePanels(state).some(/* Vérifie si le point touche l’une des cartes orientées des quatre rôles. */ panel=>{const l=worldToLocal(cardAt(panel.team,panel.role),p.x,p.y);return Math.abs(l.x)<=CARD.w/2&&Math.abs(l.y)<=CARD.h/2;});
}

/** Répartit les mots sur plusieurs lignes sans dépasser la largeur disponible. */
function wrap(ctx:Ctx,text:string,width:number):string[]{const lines:string[]=[];let line='';for(const word of text.split(' ')){const next=line?`${line} ${word}`:word;if(line&&ctx.measureText(next).width>width){lines.push(line);line=word;}else line=next;}if(line)lines.push(line);return lines;}

/** Affiche les repères de couleur et de rôle aux quatre places pendant la création. */
export function drawStationLabels(ctx:Ctx,theme:ThemeId,state:GameState):void {
  const look=themeLook(theme);
  for(const panel of tablePanels(state)){
    ctx.save();ctx.translate(panel.cx,panel.cy);ctx.rotate(panel.rot);
    ctx.fillStyle=look.panel+'f5';ctx.strokeStyle=TEAM_COLOR[panel.team];ctx.lineWidth=2;
    ctx.beginPath();ctx.roundRect(-118,-48,236,96,14);ctx.fill();ctx.stroke();
    icon(ctx,panel.role==='pilot'?'wheel':'power',-80,0,38,TEAM_COLOR[panel.team]);
    ctx.textAlign='left';ctx.fillStyle=TEAM_COLOR[panel.team];ctx.font='bold 21px system-ui';ctx.fillText(TEAM_NAME[panel.team],-48,-5);
    ctx.fillStyle=look.ink;ctx.font='600 16px system-ui';ctx.fillText(panel.role==='pilot'?'PILOTE':'COPILOTE',-48,23);ctx.restore();
  }
}

/** Compose les cartes, les repères de voiture et les surbrillances de l’entraînement. */
export function drawTutorial(ctx:Ctx,state:GameState,now:number,driveMode:Record<Team,Rect>):void {
  const tut=state.tutorial;if(!tut||state.phase==='PAUSED')return;
  if(tut.finished){drawEnd(ctx);return;}
  const pulse=now===0?.5:.5+.5*Math.sin(now/280);
  for(const team of ['A','B'] as const){
    drawHighlights(ctx,state,team,pulse,driveMode[team]);
    for (const role of ['pilot', 'copilot'] as const) {
      if (!isPhoneStation(state, team, role)) drawCard(ctx, state, team, role, now);
    }
    if (isPhoneStation(state, team, 'pilot') && tut.steps[tut.teams[team].step]) drawSharedSkip(ctx, team);
    if(tutorialIdentifying(state)||['steer','pickup','boostPickup'].includes(tut.steps[tut.teams[team].step]))drawCarIdentity(ctx,state,team,pulse);
  }
}
/** Donne la position du contrôle d'étape lorsqu'aucun poste pilote n'est affiché. */
function sharedSkip(team: Team): Rect {
  return { x: 12, y: team === 'A' ? 770 : 250, w: 108, h: 46 };
}

/** Laisse l'animateur débloquer une étape depuis le bord de la table. */
function drawSharedSkip(ctx: Ctx, team: Team): void {
  const { x, y, w, h } = sharedSkip(team);
  ctx.save();
  ctx.fillStyle = '#08141dee';
  ctx.strokeStyle = TEAM_COLOR[team];
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 7);
  ctx.fill();
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.font = '600 15px system-ui';
  ctx.fillStyle = '#fff';
  ctx.fillText(`Passer ${TEAM_NAME[team].toLowerCase()}`, x + w / 2, y + 29);
  ctx.restore();
}

/** Dessine la consigne orientée vers son lecteur avec l’animation et le bouton pour passer l’étape. */
function drawCard(ctx:Ctx,state:GameState,team:Team,role:Role,now:number):void {
  const tut=state.tutorial!,progress=tut.teams[team],id=tut.steps[progress.step],color=TEAM_COLOR[team],at=cardAt(team,role);
  const waitingForSeats=id==='steer'&&tutorialIdentifying(state);
  const lesson:Lesson=!id?{text:'Entraînement terminé.',hint:'L’autre équipe termine ses essais.'}:waitingForSeats?{text:'Votre équipe est prête.',hint:'Les quatre postes se préparent.',demo:'identify'}:lessonOf(state,id,progress.sub,team,role);
  ctx.save();ctx.translate(at.cx,at.cy);ctx.rotate(at.rot);
  ctx.fillStyle='#08141df5';ctx.strokeStyle=color+'aa';ctx.lineWidth=2;
  ctx.beginPath();ctx.roundRect(-CARD.w/2,-CARD.h/2,CARD.w,CARD.h,14);ctx.fill();ctx.stroke();
  ctx.textAlign='left';ctx.fillStyle=color;ctx.font='700 15px system-ui';ctx.fillText(`${TEAM_NAME[team]} · ${role==='pilot'?'PILOTE':'COPILOTE'}`,-177,-47);
  ctx.fillStyle='#ffffff18';ctx.fillRect(-177,-35,354,3);ctx.fillStyle=color;ctx.fillRect(-177,-35,354*Math.min(1,progress.step/tut.steps.length),3);
  ctx.fillStyle='#f4fbff';ctx.font='600 19px system-ui';/* Affiche les lignes de la consigne sans dépasser la hauteur de sa carte. */ wrap(ctx,lesson.text,230).slice(0,3).forEach((text,i)=>ctx.fillText(text,-177,-9+i*22));
  if(lesson.hint){ctx.fillStyle='#b4c9d2';ctx.font='13px system-ui';ctx.fillText(lesson.hint,-177,59);}
  if(lesson.demo){ctx.save();ctx.translate(131,4);ctx.scale(.8,.8);drawGestureDemo(ctx,lesson.demo,now,color,waitingForSeats?3:progress.sub);ctx.restore();}
  if(id&&role==='pilot'){
    ctx.fillStyle='#ffffff0c';ctx.strokeStyle='#728995';ctx.lineWidth=1;ctx.beginPath();ctx.roundRect(SKIP.x,SKIP.y,SKIP.w,SKIP.h,7);ctx.fill();ctx.stroke();
    ctx.textAlign='center';ctx.fillStyle='#c6d4db';ctx.font='13px system-ui';ctx.fillText('Passer ›',SKIP.x+SKIP.w/2,SKIP.y+19);
  }else if(id){ctx.textAlign='right';ctx.fillStyle='#8fa9b5';ctx.font='12px system-ui';ctx.fillText(`${progress.step+1}/${tut.steps.length}`,176,-47);}
  ctx.restore();
}
/** Relie la voiture à son nom de couleur pour aider les joueurs à la retrouver. */
function drawCarIdentity(ctx:Ctx,state:GameState,team:Team,pulse:number):void {
  const car=state.cars[team],color=TEAM_COLOR[team];
  ctx.save();ctx.translate(car.pos.x,car.pos.y);
  ctx.strokeStyle=color;ctx.lineWidth=2;ctx.globalAlpha=.5+.3*pulse;ctx.beginPath();ctx.arc(0,0,29+4*pulse,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1;
  // Separate the labels at the side-by-side start, with a short link to the actual car.
  const other=state.cars[team==='A'?'B':'A'].pos,dx=car.pos.x-other.x,dy=car.pos.y-other.y,d=Math.hypot(dx,dy);
  const label={x:d<130?(team==='A'?-55:55):0,y:car.pos.y<400?90:-62};
  label.y=Math.max(320,Math.min(780,car.pos.y+label.y))-car.pos.y;
  ctx.strokeStyle=color+'88';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(label.x*.4,label.y*.4);ctx.lineTo(label.x,label.y);ctx.stroke();
  ctx.translate(label.x,label.y);ctx.fillStyle='#07131ef5';ctx.beginPath();ctx.roundRect(-36,-24,72,48,8);ctx.fill();
  for(const rot of [0,Math.PI]){ctx.save();ctx.rotate(rot);ctx.textAlign='center';ctx.fillStyle=color;ctx.font='700 13px system-ui';ctx.fillText(TEAM_NAME[team],0,17);ctx.restore();}
  ctx.restore();
}
/** Met en évidence les commandes ou les objets utiles à la leçon en cours. */
function drawHighlights(ctx:Ctx,state:GameState,team:Team,pulse:number,driveMode:Rect):void {
  const tut=state.tutorial!,p=tut.teams[team],id=tut.steps[p.step];if(!id)return;
  ctx.save();ctx.strokeStyle=TEAM_COLOR[team];ctx.shadowColor=TEAM_COLOR[team];ctx.shadowBlur=8+8*pulse;ctx.lineWidth=3;
  /** Ramène le dessin de surbrillance dans le repère du poste concerné. */
  const panel=(role:Role,draw:()=>void)=>{if(isPhoneStation(state,team,role))return;const at=panelOf(team,role);ctx.save();ctx.translate(at.cx,at.cy);ctx.rotate(at.rot);draw();ctx.restore();};
  /** Entoure une commande rectangulaire utile à la leçon. */
  const box=(r:Rect)=>{ctx.beginPath();ctx.roundRect(r.x-5,r.y-5,r.w+10,r.h+10,12);ctx.stroke();};
  /** Entoure une commande circulaire avec la pulsation de l’aide visuelle. */
  const circle=(x:number,y:number,r:number)=>{ctx.beginPath();ctx.arc(x,y,r+5+3*pulse,0,Math.PI*2);ctx.stroke();};
  switch(id){
    case 'identify':case 'repair':
      for(const role of ['pilot','copilot'] as const){if(id==='identify'&&(p.sub&(role==='pilot'?1:2)))continue;const pad=padLocal(role,state.driveMode[team]);/* Met en évidence la clé du poste à présenter ou à maintenir. */ panel(role,()=>circle(pad.x,pad.y,pad.r));}break;
    case 'steer':if(!tutorialIdentifying(state))/* Entoure les commandes de direction et la pédale affichée pour l’exercice du pilote. */ panel('pilot',()=>{const a=steerArea(state.driveMode[team]);box({x:a.x-a.w/2,y:a.y-a.h/2,w:a.w,h:a.h});if(state.driveMode[team]==='pedal')box({x:PEDAL_LOCAL.x-PEDAL_LOCAL.w/2,y:PEDAL_LOCAL.y-PEDAL_LOCAL.h/2,w:PEDAL_LOCAL.w,h:PEDAL_LOCAL.h});});break;
    case 'pedal':if(p.sub===1)/* Met en évidence la pédale demandée par la leçon clavier. */ panel('pilot',()=>box({x:PEDAL_LOCAL.x-PEDAL_LOCAL.w/2,y:PEDAL_LOCAL.y-PEDAL_LOCAL.h/2,w:PEDAL_LOCAL.w,h:PEDAL_LOCAL.h}));else box(driveMode);break;
    case 'pickup':case 'boostPickup':for(const pickup of state.pickups)if(pickup.respawnAt===0&&pickup.kind===(id==='pickup'?'slingshot':'boost'))circle(pickup.pos.x,pickup.pos.y,25);break;
    case 'power':case 'boostPower':if(!armedPickup(state))/* Met en évidence POWER au poste copilote. */ panel('copilot',()=>circle(POWER_BTN_LOCAL.x,POWER_BTN_LOCAL.y,POWER_BTN_LOCAL.r));break;
    case 'boostCross':for(const g of state.boostGates)if(g.team===team)circle((g.a.x+g.b.x)/2,(g.a.y+g.b.y)/2,35);break;
    case 'wall':if(p.sub)for(const w of state.walls)if(w.id==='wall-1'||w.id===`tut-wall-${team}`)circle(w.pos.x,w.pos.y,w.lengthPx/2);break;
    case 'depot':if((['A','B'] as const).every(/* Attend les deux équipes à l’étape de rangement avant de demander les objets. */ t=>tut.steps[tut.teams[t].step]==='depot'))box(TANGIBLE_DEPOT);break;
    case 'arc':for(const a of state.arcs)if(a.id===`tut-arc-${team}`||!a.id.startsWith('tut-'))circle((a.pylon1.x+a.pylon2.x)/2,(a.pylon1.y+a.pylon2.y)/2,50);break;
  }
  ctx.restore();
}
/** Affiche la fin de l’entraînement et le passage vers la création d’un circuit. */
function drawEnd(ctx:Ctx):void {
  ctx.save();ctx.fillStyle='#06101deb';ctx.fillRect(0,0,LOGICAL_W,LOGICAL_H);ctx.textAlign='center';
  for(const rot of [0,Math.PI]){ctx.save();ctx.translate(LOGICAL_W/2,LOGICAL_H/2);ctx.rotate(rot);
    icon(ctx,'flag',0,-235,64,'#61f4ba');ctx.fillStyle='#f3fbff';ctx.font='800 43px system-ui';ctx.fillText('À VOUS DE JOUER',0,-162);
    ctx.fillStyle='#b5cbd5';ctx.font='22px system-ui';ctx.fillText('Dessinez votre circuit, puis lancez la course.',0,-119);ctx.restore();}
  const b=TUTORIAL_END_BUTTON;ctx.fillStyle='#61f4ba18';ctx.strokeStyle='#61f4ba';ctx.lineWidth=3;ctx.beginPath();ctx.roundRect(b.x,b.y,b.w,b.h,16);ctx.fill();ctx.stroke();
  for(const rot of [0,Math.PI]){ctx.save();ctx.translate(LOGICAL_W/2,LOGICAL_H/2);ctx.rotate(rot);ctx.fillStyle='#f3fbff';ctx.font='700 21px system-ui';ctx.fillText('CRÉER LE CIRCUIT ›',0,29);ctx.restore();}
  ctx.restore();
}
