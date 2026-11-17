/** Partage les consignes du tutoriel entre la table et les téléphones. */
import type { GameState, Team, TutorialStepId } from '../server/types.js';
import type { Role } from '../server/layout.js';
import { armedPickup } from '../server/rules/armedPickup.js';
import { TEAM_LABEL } from './seatLabels.js';

/** Identifie la démonstration visuelle associée à une consigne. */
export type GestureDemoId = TutorialStepId | 'watch' | 'impact' | 'deflect';

/** Réunit la consigne courte, son complément et l’animation demandée à un rôle. */
export interface Lesson { text:string; hint?:string; demo?:GestureDemoId }
/** Choisit la consigne et la démonstration selon le rôle, l’équipe et son étape actuelle. */
export function lessonOf(state:GameState,id:TutorialStepId,sub:number,team:Team,role:Role,mobile=false):Lesson {
  const pilot=role==='pilot',pc=state.mapMode==='pc',name=TEAM_LABEL[team].toLowerCase();
  const stock=armedPickup(state),otherArmed=stock&&stock.team!==team;
  if((id==='power'||id==='boostPower')&&otherArmed)return{text:pilot?'Gardez votre voiture en piste.':`Le bonus ${TEAM_LABEL[stock.team].toLowerCase()} est armé.`,hint:pilot?undefined:'Un seul bonus à la fois. Vous pouvez l’utiliser.',demo:pilot?'steer':stock.kind==='boost'?'boost':'sling'};
  switch(id){
    case 'identify':return{text:sub&(pilot?1:2)?'Votre poste est prêt.':(mobile?'Touchez Réparer sur votre téléphone.':'Touchez votre clé de réparation.'),hint:`Voiture ${name} · coéquipier en diagonale`,demo:'identify'};
    case 'steer':return pilot?{text:'Essayez gauche, puis droite.',hint:`${sub&1?'✓':'○'} gauche   ${sub&2?'✓':'○'} droite${state.driveMode[team]==='pedal'?' · maintenez la pédale':''}`,demo:id}:{text:`Suivez la voiture ${name}.`,hint:'Votre pilote essaie les commandes.',demo:'watch'};
    case 'pedal':return !pilot?{text:'Votre pilote essaie la pédale.',demo:id}:sub===0?{text:mobile?'Touchez Avance auto pour passer en mode pédale.':'Paramètres → Conduite → PÉDALE.',demo:id}:sub===1?{text:'Maintenez la pédale.',hint:mobile?undefined:team==='A'?'Clavier : Z':'Clavier : ↑',demo:id}:{text:mobile?'Touchez Mode pédale pour repasser en avance auto.':'Repassez en AUTO dans les paramètres.',demo:id};
    case 'pickup':case 'boostPickup':return pilot?{text:id==='pickup'?'Ramassez un lance-pierre.':'Ramassez une accélération.',hint:'Le bonus arrive chez votre copilote.',demo:id}:{text:'Votre pilote ramasse un bonus.',hint:mobile?'Il apparaîtra dans votre réserve.':'Il apparaîtra au-dessus de ⏻.',demo:id};
    case 'power':case 'boostPower':return pilot?{text:'Gardez votre voiture en piste.',hint:'Votre copilote prépare le bonus.',demo:'steer'}:{text:mobile?'Touchez Armer le bonus.':'Armez votre bonus avec ⏻.',hint:'Une fois armé, chacun peut l’utiliser.',demo:id};
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
      return !both?{text:'L’autre équipe termine ses essais.',hint:'Vous rangerez ensuite les trois obstacles.',demo:'depot'}:pilot?{text:'Vos copilotes rangent les obstacles.',hint:'La course commence ensuite sur votre circuit.',demo:id}:{text:'Rangez les trois obstacles dans la réserve.',hint:mobile?'La réserve est sur le bord droit de la table.':'Entre les deux postes de copilote.',demo:id};
    }
    case 'pylon':return pilot?{text:'Continuez à conduire.',hint:'Vos copilotes essaient les piliers.',demo:'arc'}:{text:sub===3?'Rapprochez les deux piliers.':'Encadrez la piste avec les deux piliers.',hint:sub===3?'Un arc les relie lorsqu’ils sont assez proches.':'Un doigt de chaque côté de chaque pilier.',demo:id};
  }
}

/** Fournit la consigne du rôle mobile à l'étape actuelle. */
export function mobileLesson(state: GameState, team: Team, role: Role): string {
  const tutorial = state.tutorial;
  if (!tutorial) return '';
  const { sub, step } = tutorial.teams[team];
  const id = tutorial.steps[step];
  if (!id) return 'Entraînement terminé. Consultez la table.';
  if (id === 'steer' && (['A', 'B'] as const).some(t => tutorial.steps[tutorial.teams[t].step] === 'identify')) {
    return 'Votre équipe est prête. En attente des autres joueurs.';
  }
  const lesson = lessonOf(state, id, sub, team, role, true);
  return [lesson.text, lesson.hint].filter(Boolean).join(' ');
}
