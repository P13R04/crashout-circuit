/** Charge les adresses et le code de la séance depuis le serveur de l'interface. */
export interface SessionInfo {
  room: string;
  baseUrls: string[];
  ozUrls: string[];
  secure: boolean;
  spectators?: boolean;
  localNetwork?: boolean;
  secureBaseUrls?: string[];
}

/** Renvoie les informations actuelles de la séance. */
export async function readSession(): Promise<SessionInfo> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4500);
  try {
    const response = await fetch('/api/session', { cache: 'no-store', signal: controller.signal });
    if (!response.ok) throw new Error('Informations de séance indisponibles');
    return await response.json();
  } finally { clearTimeout(timeout); }
}
