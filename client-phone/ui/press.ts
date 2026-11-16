/** Relie un bouton maintenu aux événements tactiles et clavier du téléphone. */

/** Fournit un bouton instrumenté et un relâchement à appeler quand l'écran est suspendu. */
export function holdButton(label: string, change: (held: boolean) => void) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.className = 'hold';
  let pointer: number | null = null;
  let key: string | null = null;

  /** Annule tout maintien, y compris lorsqu'un contact est interrompu par le système. */
  const release = () => {
    if (pointer === null && key === null) return;
    const activePointer = pointer;
    pointer = key = null;
    if (activePointer !== null && button.hasPointerCapture(activePointer)) button.releasePointerCapture(activePointer);
    button.classList.remove('held');
    change(false);
  };
  /** Active le bouton jusqu'au relâchement du même contact. */
  const press = () => { button.classList.add('held'); change(true); };
  button.addEventListener('pointerdown', event => {
    if (pointer !== null || key !== null || event.button !== 0 || button.disabled) return;
    pointer = event.pointerId;
    button.setPointerCapture(pointer);
    press();
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
    button.addEventListener(type, event => { if (event.pointerId === pointer) release(); });
  }
  button.addEventListener('keydown', event => {
    if (event.key !== ' ' && event.key !== 'Enter') return;
    event.preventDefault();
    if (pointer !== null || key !== null || button.disabled) return;
    key = event.key;
    press();
  });
  button.addEventListener('keyup', event => { if (event.key === key) release(); });
  button.addEventListener('blur', release);
  button.addEventListener('contextmenu', event => event.preventDefault());
  return { button, release };
}

/** Crée un bouton tactile pour une commande instantanée. */
export function actionButton(label: string, action: () => void, className = ''): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  button.addEventListener('click', action);
  return button;
}
