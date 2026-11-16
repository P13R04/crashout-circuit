/**
 * Paramètres audio du menu : activation, volumes, déverrouillage au premier contact et clic de l’interface.
 * Liens : client-table/Sound.ts, client-table/index.html.
 * Appelé par client-table/main.ts dans l'ordre d'origine de l'initialisation de la table.
 */
import { playFeedback, unlock, tableAudio } from '../Sound.js';

/** Branche le menu audio et le déverrouillage du son sur la table. */
export function setupAudioSettings(): void {
  // Son : volumes du menu et déverrouillage audio au premier contact.
  window.addEventListener('pointerdown',unlock,{capture:true});
  /** Profite du premier appui clavier pour autoriser l’audio sans répéter l’ouverture du contexte. */
  window.addEventListener('keydown',e=>{if(!e.repeat)unlock();},{capture:true});
  /** Joue un clic discret pour les boutons et les tiroirs de l’interface HTML. */
  document.addEventListener('click',e=>{if(e.target instanceof Element&&e.target.closest('button,summary'))playFeedback('ui');},{capture:true});
  const audioToggle=document.getElementById('audio-enabled') as HTMLButtonElement;
  const audioRanges={effects:document.getElementById('audio-effects') as HTMLInputElement,ambience:document.getElementById('audio-ambience') as HTMLInputElement,music:document.getElementById('audio-music') as HTMLInputElement};
  /** Reporte les préférences de l’instance audio dans les boutons et les curseurs. */
  function syncAudioSettings():void{
    audioToggle.setAttribute('aria-pressed',String(tableAudio.settings.enabled));audioToggle.textContent=tableAudio.settings.enabled?'Son activé':'Son coupé';
    for(const key of ['effects','ambience','music'] as const)audioRanges[key].value=String(Math.round(tableAudio.settings[key]*100));
  }
  /** Applique le réglage audio demandé en tolérant un stockage local inaccessible. */
  function changeAudio(value:Parameters<typeof tableAudio.configure>[0]):void{
    try{tableAudio.configure(value,window.localStorage);}catch{tableAudio.configure(value);}syncAudioSettings();
  }
  /** Bascule le son de la table sans modifier séparément les volumes mémorisés. */
  audioToggle.addEventListener('click',()=>changeAudio({enabled:!tableAudio.settings.enabled}));
  for(const key of ['effects','ambience','music'] as const)/* Convertit le curseur de volume en proportion pour le groupe audio concerné. */ audioRanges[key].addEventListener('input',()=>changeAudio({[key]:Number(audioRanges[key].value)/100}));
  /** Joue l’exemple sonore demandé pour régler les volumes. */
  document.getElementById('audio-test')!.addEventListener('click',()=>tableAudio.preview());syncAudioSettings();
}
