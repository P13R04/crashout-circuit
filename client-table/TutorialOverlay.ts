/** Role-facing lessons at the four real stations. Game events, not animation timers, validate progress. */
import type { GameState, Team, Vec2, TutorialStepId } from '../server/types.js';
import {
  LOGICAL_W, LOGICAL_H, PANELS, panelOf, localToWorld, worldToLocal, padLocal,
  TANGIBLE_DEPOT, steerArea, PEDAL_LOCAL, POWER_BTN_LOCAL, type PanelLayout,
} from '../server/layout.js';
import { icon } from './icons.js';
import { TEAM_COLOR, TEAM_NAME } from './view.js';
import { themeLook, type ThemeId } from './themes.js';
import { armedPickup } from '../server/armedPickup.js';
import { drawGestureDemo, type GestureDemoId } from './TutorialGestures.js';

type Ctx = CanvasRenderingContext2D;
type Rect = { x: number; y: number; w: number; h: number };
type Role = 'pilot' | 'copilot';
const CARD = { w: 390, h: 144 };
function cardAt(team: Team, role: Role): PanelLayout {
  const panel=panelOf(team,role);
  return {...panel,cx:role==='pilot'?740:1220,cy:panel.cy<LOGICAL_H/2?145:935};
}
const SKIP: Rect = { x: 90, y: -65, w: 88, h: 28 };
export const TUTORIAL_END_BUTTON: Rect = { x: LOGICAL_W/2-200,y:LOGICAL_H/2-45,w:400,h:90 };
export type TutorialButton = { kind:'skip';team:Team } | {kind:'end'};
export function tutorialIdentifying(state: GameState): boolean {
  return !!state.tutorial && (['A','B'] as const).some(t=>state.tutorial!.steps[state.tutorial!.teams[t].step]==='identify');
}
export function tutorialButtonAt(state: GameState,p:Vec2):TutorialButton|null {
  const tut=state.tutorial;if(!tut)return null;
  const hit=(p:Vec2,r:Rect,margin=0)=>p.x>=r.x-margin&&p.x<=r.x+r.w+margin&&p.y>=r.y-margin&&p.y<=r.y+r.h+margin;
  if(tut.finished)return hit(p,TUTORIAL_END_BUTTON)?{kind:'end'}:null;
  for(const team of ['A','B'] as const){
    if(tut.steps[tut.teams[team].step]&&hit(worldToLocal(cardAt(team,'pilot'),p.x,p.y),SKIP,5))return{kind:'skip',team};
  }
  return null;
}
export function tutorialSkipCenter(team:Team):Vec2 {return localToWorld(cardAt(team,'pilot'),SKIP.x+SKIP.w/2,SKIP.y+SKIP.h/2);}
/** The whole card is a non-interactive demonstration, never a gesture surface. */
export function inTutorialCard(state:GameState,p:Vec2):boolean {
  if(!state.tutorial||state.tutorial.finished)return false;
  return PANELS.some(panel=>{const l=worldToLocal(cardAt(panel.team,panel.role),p.x,p.y);return Math.abs(l.x)<=CARD.w/2&&Math.abs(l.y)<=CARD.h/2;});
}

interface Lesson { text:string; hint?:string; demo?:GestureDemoId }
function lessonOf(state:GameState,id:TutorialStepId,sub:number,team:Team,role:Role):Lesson {
  const pilot=role==='pilot',pc=state.mapMode==='pc',name=TEAM_NAME[team].toLowerCase();
  const stock=armedPickup(state),otherArmed=stock&&stock.team!==team;
  if((id==='power'||id==='boostPower')&&otherArmed)return{text:pilot?'Gardez votre voiture en piste.':`Le bonus ${TEAM_NAME[stock.team].toLowerCase()} est armé.`,hint:pilot?undefined:'Un seul bonus à la fois. Vous pouvez l’utiliser.',demo:pilot?'steer':stock.kind==='boost'?'boost':'sling'};
  switch(id){
    case 'identify':return{text:sub&(pilot?1:2)?'Votre poste est prêt.':'Touchez votre clé de réparation.',hint:`Voiture ${name} · coéquipier en diagonale`,demo:'identify'};
    case 'steer':return pilot?{text:'Essayez gauche, puis droite.',hint:`${sub&1?'✓':'○'} gauche   ${sub&2?'✓':'○'} droite${state.driveMode[team]==='pedal'?' · maintenez la pédale':''}`,demo:id}:{text:`Suivez la voiture ${name}.`,hint:'Votre pilote essaie les commandes.',demo:'watch'};
    case 'pedal':return !pilot?{text:'Votre pilote essaie la pédale.',demo:id}:sub===0?{text:'Paramètres → Conduite → PÉDALE.',demo:id}:sub===1?{text:'Maintenez la pédale.',hint:team==='A'?'Clavier : Z':'Clavier : ↑',demo:id}:{text:'Repassez en AUTO dans les paramètres.',demo:id};
    case 'pickup':case 'boostPickup':return pilot?{text:id==='pickup'?'Ramassez un lance-pierre.':'Ramassez une accélération.',hint:'Le bonus arrive chez votre copilote.',demo:id}:{text:'Votre pilote ramasse un bonus.',hint:'Il apparaîtra au-dessus de ⏻.',demo:id};
    case 'power':case 'boostPower':return pilot?{text:'Gardez votre voiture en piste.',hint:'Votre copilote prépare le bonus.',demo:'steer'}:{text:'Armez votre bonus avec ⏻.',hint:'Une fois armé, chacun peut l’utiliser.',demo:id};
    case 'sling':return pilot?{text:'Évitez la zone d’impact.',hint:'Une pierre peut toucher les deux voitures.',demo:'impact'}:{text:pc?'Cliquez, tirez, relâchez.':'Deux doigts fixes. Tirez avec le troisième.',hint:'Relâchez le doigt qui tire pour lancer.',demo:id};
    case 'boost':return pilot?{text:'Visez la zone d’accélération.',hint:'Votre copilote la pose sur la piste.',demo:'boostCross'}:{text:pc?'Paramètres → Accélération, puis deux clics.':'Posez deux doigts sur la piste.',hint:'Ensemble ou l’un après l’autre.',demo:id};
    case 'boostCross':return pilot?{text:'Traversez les chevrons jaunes.',demo:id}:{text:'Guidez votre pilote vers la zone.',hint:'Votre voiture accélère en la traversant.',demo:id};
    case 'borderPull':return pilot?{text:'Suivez la piste qui se déforme.',demo:'watch'}:{text:'À deux doigts, maintenez puis tirez le bord.',hint:'Saisissez le même bord, même en virage.',demo:id};
    case 'repair':return{text:'Maintenez vos deux clés ensemble.',hint:'Gardez le contact jusqu’au remplissage.',demo:id};
    case 'wall':
      if(pc)return{text:pilot?'Touchez le mur.':'Le mur bloque les deux voitures.',hint:'Entraînement : aucun dégât.',demo:pilot?'deflect':id};
      return pilot?{text:sub?'Touchez le mur avec votre voiture.':'Restez en piste pendant la pose.',hint:'Entraînement : aucun dégât.',demo:'deflect'}:{text:sub?'Le mur bloque les deux voitures.':'Posez le mur avec un doigt de chaque côté.',hint:'Les doigts touchent la table à la pose.',demo:id};
    case 'arc':return{text:pilot?'Traversez l’arc électrique.':'Les piliers électrisent les deux voitures.',hint:'En course : dégâts et ralentissement.',demo:id};
    case 'depot': {
      const otherStep=state.tutorial!.steps[state.tutorial!.teams[team==='A'?'B':'A'].step];
      const both=!otherStep||otherStep==='depot';
      return !both?{text:'L’autre équipe termine ses essais.',hint:'Vous rangerez ensuite les trois obstacles.',demo:'depot'}:pilot?{text:'Vos copilotes rangent les obstacles.',hint:'La course commence ensuite sur votre circuit.',demo:id}:{text:'Rangez les trois obstacles dans la réserve.',hint:'Entre les deux postes de copilote.',demo:id};
    }
    case 'pylon':return pilot?{text:'Continuez à conduire.',hint:'Vos copilotes essaient les piliers.',demo:'arc'}:{text:sub===3?'Rapprochez les deux piliers.':'Encadrez la piste avec les deux piliers.',hint:sub===3?'Un arc les relie lorsqu’ils sont assez proches.':'Un doigt de chaque côté de chaque pilier.',demo:id};
  }
}
function wrap(ctx:Ctx,text:string,width:number):string[]{const lines:string[]=[];let line='';for(const word of text.split(' ')){const next=line?`${line} ${word}`:word;if(line&&ctx.measureText(next).width>width){lines.push(line);line=word;}else line=next;}if(line)lines.push(line);return lines;}

export function drawStationLabels(ctx:Ctx,theme:ThemeId):void {
  const look=themeLook(theme);
  for(const panel of PANELS){
    ctx.save();ctx.translate(panel.cx,panel.cy);ctx.rotate(panel.rot);
    ctx.fillStyle=look.panel+'f5';ctx.strokeStyle=TEAM_COLOR[panel.team];ctx.lineWidth=2;
    ctx.beginPath();ctx.roundRect(-118,-48,236,96,14);ctx.fill();ctx.stroke();
    icon(ctx,panel.role==='pilot'?'wheel':'power',-80,0,38,TEAM_COLOR[panel.team]);
    ctx.textAlign='left';ctx.fillStyle=TEAM_COLOR[panel.team];ctx.font='bold 21px system-ui';ctx.fillText(TEAM_NAME[panel.team],-48,-5);
    ctx.fillStyle=look.ink;ctx.font='600 16px system-ui';ctx.fillText(panel.role==='pilot'?'PILOTE':'COPILOTE',-48,23);ctx.restore();
  }
}

export function drawTutorial(ctx:Ctx,state:GameState,now:number,driveMode:Record<Team,Rect>):void {
  const tut=state.tutorial;if(!tut||state.phase==='PAUSED')return;
  if(tut.finished){drawEnd(ctx);return;}
  const pulse=now===0?.5:.5+.5*Math.sin(now/280);
  for(const team of ['A','B'] as const){
    drawHighlights(ctx,state,team,pulse,driveMode[team]);
    for(const role of ['pilot','copilot'] as const)drawCard(ctx,state,team,role,now);
    if(tutorialIdentifying(state)||['steer','pickup','boostPickup'].includes(tut.steps[tut.teams[team].step]))drawCarIdentity(ctx,state,team,pulse);
  }
}
function drawCard(ctx:Ctx,state:GameState,team:Team,role:Role,now:number):void {
  const tut=state.tutorial!,progress=tut.teams[team],id=tut.steps[progress.step],color=TEAM_COLOR[team],at=cardAt(team,role);
  const waitingForSeats=id==='steer'&&tutorialIdentifying(state);
  const lesson:Lesson=!id?{text:'Entraînement terminé.',hint:'L’autre équipe termine ses essais.'}:waitingForSeats?{text:'Votre équipe est prête.',hint:'Les quatre postes se préparent.',demo:'identify'}:lessonOf(state,id,progress.sub,team,role);
  ctx.save();ctx.translate(at.cx,at.cy);ctx.rotate(at.rot);
  ctx.fillStyle='#08141df5';ctx.strokeStyle=color+'aa';ctx.lineWidth=2;
  ctx.beginPath();ctx.roundRect(-CARD.w/2,-CARD.h/2,CARD.w,CARD.h,14);ctx.fill();ctx.stroke();
  ctx.textAlign='left';ctx.fillStyle=color;ctx.font='700 15px system-ui';ctx.fillText(`${TEAM_NAME[team]} · ${role==='pilot'?'PILOTE':'COPILOTE'}`,-177,-47);
  ctx.fillStyle='#ffffff18';ctx.fillRect(-177,-35,354,3);ctx.fillStyle=color;ctx.fillRect(-177,-35,354*Math.min(1,progress.step/tut.steps.length),3);
  ctx.fillStyle='#f4fbff';ctx.font='600 19px system-ui';wrap(ctx,lesson.text,230).slice(0,3).forEach((text,i)=>ctx.fillText(text,-177,-9+i*22));
  if(lesson.hint){ctx.fillStyle='#b4c9d2';ctx.font='13px system-ui';ctx.fillText(lesson.hint,-177,59);}
  if(lesson.demo){ctx.save();ctx.translate(131,4);ctx.scale(.8,.8);drawGestureDemo(ctx,lesson.demo,now,color,waitingForSeats?3:progress.sub);ctx.restore();}
  if(id&&role==='pilot'){
    ctx.fillStyle='#ffffff0c';ctx.strokeStyle='#728995';ctx.lineWidth=1;ctx.beginPath();ctx.roundRect(SKIP.x,SKIP.y,SKIP.w,SKIP.h,7);ctx.fill();ctx.stroke();
    ctx.textAlign='center';ctx.fillStyle='#c6d4db';ctx.font='13px system-ui';ctx.fillText('Passer ›',SKIP.x+SKIP.w/2,SKIP.y+19);
  }else if(id){ctx.textAlign='right';ctx.fillStyle='#8fa9b5';ctx.font='12px system-ui';ctx.fillText(`${progress.step+1}/${tut.steps.length}`,176,-47);}
  ctx.restore();
}
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
function drawHighlights(ctx:Ctx,state:GameState,team:Team,pulse:number,driveMode:Rect):void {
  const tut=state.tutorial!,p=tut.teams[team],id=tut.steps[p.step];if(!id)return;
  ctx.save();ctx.strokeStyle=TEAM_COLOR[team];ctx.shadowColor=TEAM_COLOR[team];ctx.shadowBlur=8+8*pulse;ctx.lineWidth=3;
  const panel=(role:Role,draw:()=>void)=>{const at=panelOf(team,role);ctx.save();ctx.translate(at.cx,at.cy);ctx.rotate(at.rot);draw();ctx.restore();};
  const box=(r:Rect)=>{ctx.beginPath();ctx.roundRect(r.x-5,r.y-5,r.w+10,r.h+10,12);ctx.stroke();};
  const circle=(x:number,y:number,r:number)=>{ctx.beginPath();ctx.arc(x,y,r+5+3*pulse,0,Math.PI*2);ctx.stroke();};
  switch(id){
    case 'identify':case 'repair':
      for(const role of ['pilot','copilot'] as const){if(id==='identify'&&(p.sub&(role==='pilot'?1:2)))continue;const pad=padLocal(role,state.driveMode[team]);panel(role,()=>circle(pad.x,pad.y,pad.r));}break;
    case 'steer':if(!tutorialIdentifying(state))panel('pilot',()=>{const a=steerArea(state.driveMode[team]);box({x:a.x-a.w/2,y:a.y-a.h/2,w:a.w,h:a.h});if(state.driveMode[team]==='pedal')box({x:PEDAL_LOCAL.x-PEDAL_LOCAL.w/2,y:PEDAL_LOCAL.y-PEDAL_LOCAL.h/2,w:PEDAL_LOCAL.w,h:PEDAL_LOCAL.h});});break;
    case 'pedal':if(p.sub===1)panel('pilot',()=>box({x:PEDAL_LOCAL.x-PEDAL_LOCAL.w/2,y:PEDAL_LOCAL.y-PEDAL_LOCAL.h/2,w:PEDAL_LOCAL.w,h:PEDAL_LOCAL.h}));else box(driveMode);break;
    case 'pickup':case 'boostPickup':for(const pickup of state.pickups)if(pickup.respawnAt===0&&pickup.kind===(id==='pickup'?'slingshot':'boost'))circle(pickup.pos.x,pickup.pos.y,25);break;
    case 'power':case 'boostPower':if(!armedPickup(state))panel('copilot',()=>circle(POWER_BTN_LOCAL.x,POWER_BTN_LOCAL.y,POWER_BTN_LOCAL.r));break;
    case 'boostCross':for(const g of state.boostGates)if(g.team===team)circle((g.a.x+g.b.x)/2,(g.a.y+g.b.y)/2,35);break;
    case 'wall':if(p.sub)for(const w of state.walls)if(w.id==='wall-1'||w.id===`tut-wall-${team}`)circle(w.pos.x,w.pos.y,w.lengthPx/2);break;
    case 'depot':if((['A','B'] as const).every(t=>tut.steps[tut.teams[t].step]==='depot'))box(TANGIBLE_DEPOT);break;
    case 'arc':for(const a of state.arcs)if(a.id===`tut-arc-${team}`||!a.id.startsWith('tut-'))circle((a.pylon1.x+a.pylon2.x)/2,(a.pylon1.y+a.pylon2.y)/2,50);break;
  }
  ctx.restore();
}
function drawEnd(ctx:Ctx):void {
  ctx.save();ctx.fillStyle='#06101deb';ctx.fillRect(0,0,LOGICAL_W,LOGICAL_H);ctx.textAlign='center';
  for(const rot of [0,Math.PI]){ctx.save();ctx.translate(LOGICAL_W/2,LOGICAL_H/2);ctx.rotate(rot);
    icon(ctx,'flag',0,-235,64,'#61f4ba');ctx.fillStyle='#f3fbff';ctx.font='800 43px system-ui';ctx.fillText('À VOUS DE JOUER',0,-162);
    ctx.fillStyle='#b5cbd5';ctx.font='22px system-ui';ctx.fillText('Dessinez votre circuit, puis lancez la course.',0,-119);ctx.restore();}
  const b=TUTORIAL_END_BUTTON;ctx.fillStyle='#61f4ba18';ctx.strokeStyle='#61f4ba';ctx.lineWidth=3;ctx.beginPath();ctx.roundRect(b.x,b.y,b.w,b.h,16);ctx.fill();ctx.stroke();
  for(const rot of [0,Math.PI]){ctx.save();ctx.translate(LOGICAL_W/2,LOGICAL_H/2);ctx.rotate(rot);ctx.fillStyle='#f3fbff';ctx.font='700 21px system-ui';ctx.fillText('CRÉER LE CIRCUIT ›',0,29);ctx.restore();}
  ctx.restore();
}
