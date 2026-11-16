/** Charge les adresses et le code de la séance depuis le serveur de l'interface. */
export interface SessionInfo {
  room: string;
  baseUrls: string[];
  ozUrls: string[];
  secure: boolean;
}

/** Renvoie les informations actuelles de la séance. */
export async function readSession(): Promise<SessionInfo> {
  const response = await fetch('/api/session', { cache: 'no-store' });
  if (!response.ok) throw new Error('Informations de séance indisponibles');
  return response.json();
}
