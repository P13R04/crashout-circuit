/**
 * Paramètres de séance dans le menu HTML : accueil, difficulté, tours, chronomètre et conduite de développement.
 * Liens : client-table/index.html, server/rules/raceSettings.ts.
 * Appelé par client-table/main.ts dans l'ordre d'origine de l'initialisation de la table.
 */
import type { TableApp } from './tableApp.js';

/** Branche les champs de réglage de course et renvoie les fonctions qui les recopient depuis l'état serveur. */
export function setupRaceSettingsPanel(app: TableApp): { syncRaceOptions: () => void; syncDriveOptions: () => void } {
  const { view, conn, pcTools } = app;
  /** Demande le retour à l’accueil puis referme le panneau des paramètres. */
  document.getElementById('settings-home')!.addEventListener('click',()=>{conn.send({type:'Reset'});pcTools.open=false;});
  const difficultyInput=document.getElementById('race-difficulty') as HTMLSelectElement;
  const lapsInput=document.getElementById('race-laps') as HTMLInputElement;
  const timerInput=document.getElementById('race-timer') as HTMLInputElement;
  const minutesInput=document.getElementById('race-minutes') as HTMLInputElement;
  const timerDuration=document.getElementById('timer-duration')!;
  const raceOptions=document.getElementById('race-options')!;
  /** Envoie le niveau de difficulté sélectionné au serveur. */
  difficultyInput.addEventListener('change',()=>conn.send({type:'RaceSettings',difficulty:difficultyInput.value}));
  /** Envoie le nombre de tours uniquement lorsque le champ est valide. */
  lapsInput.addEventListener('change',()=>{if(lapsInput.checkValidity())conn.send({type:'RaceSettings',lapsToWin:Number(lapsInput.value)});});
  /** Envoie la durée choisie seulement lorsque le champ est valide ou que le chronomètre est désactivé. */
  const sendTimer=()=>{if(!timerInput.checked||minutesInput.checkValidity())conn.send({type:'RaceSettings',sessionMaxSeconds:timerInput.checked?Math.round(Number(minutesInput.value)*60):0});};
  /** Affiche la durée seulement lorsque le chronomètre est activé puis transmet le réglage. */
  timerInput.addEventListener('change',()=>{timerDuration.hidden=!timerInput.checked;sendTimer();});/* Transmet la durée modifiée si le chronomètre est déjà utilisé. */ minutesInput.addEventListener('change',()=>{if(timerInput.checked)sendTimer();});
  /** Répercute les réglages du serveur dans le menu sans écraser un champ en cours de saisie. */
  function syncRaceOptions(): void {
    const s=view.state;if(!s)return;
    raceOptions.hidden=!!s.tutorial||s.phase==='RESULT';
    const editable=!s.tutorial&&s.phase!=='RESULT';
    difficultyInput.disabled=!editable;lapsInput.disabled=!editable||s.sessionMode==='tangibles-test';timerInput.disabled=lapsInput.disabled;
    if(document.activeElement!==difficultyInput)difficultyInput.value=s.params.difficulty;
    if(document.activeElement!==lapsInput)lapsInput.value=String(s.params.lapsToWin);
    timerInput.checked=s.params.sessionMaxSeconds>0;timerDuration.hidden=!timerInput.checked;minutesInput.disabled=!timerInput.checked||timerInput.disabled;
    if(s.params.sessionMaxSeconds>0&&document.activeElement!==minutesInput)minutesInput.value=String(s.params.sessionMaxSeconds/60);
  }

  // Choix de conduite et simulations conservés pour le lancement de développement.
  const driveOptions=document.getElementById('drive-options')!;
  const driveButtons={A:document.getElementById('drive-A')!,B:document.getElementById('drive-B')!};
  for(const team of ['A','B'] as const)/* Demande le changement de conduite de l’équipe choisie dans le menu de développement. */ driveButtons[team].addEventListener('click',()=>conn.send({type:'ToggleDriveMode',team}));
  /** Affiche les réglages de conduite seulement dans le lancement de développement et les phases compatibles. */
  function syncDriveOptions(): void {
    const s=view.state;driveOptions.hidden=!s?.developerTools||!['LOBBY','READY','RACE','PAUSED'].includes(s.phase)||s.sessionMode==='tangibles-test';
    for(const team of ['A','B'] as const){const mode=s?.driveMode[team]??'auto';driveButtons[team].textContent=`${team==='A'?'Cyan':'Rose'} · ${mode==='auto'?'AUTO':'PÉDALE'}`;driveButtons[team].setAttribute('aria-pressed',String(mode==='pedal'));}
  }
  return { syncRaceOptions, syncDriveOptions };
}
