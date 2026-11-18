/**
 * Choisit les adresses réseau utiles aux joueurs : carte physique d'abord, adaptateurs virtuels écartés.
 * Liens : server/net/sessionHttp.ts, server/net/startupBanner.ts.
 * Windows déclare plusieurs adresses privées (WSL, VirtualBox, Hyper-V…) que les téléphones ne peuvent pas joindre.
 */
import type { NetworkInterfaceInfo } from 'node:os';

export type InterfaceTable = Record<string, NetworkInterfaceInfo[] | undefined>;

/** Reconnaît les adaptateurs créés par un hyperviseur, un conteneur, un VPN ou une liaison Bluetooth. */
const VIRTUAL_NAME = /vethernet|virtualbox|vbox|vmware|vmnet|hyper-?v|\bwsl|docker|podman|\bbr-|\bveth|virbr|\btap\b|\btun\b|utun|awdl|\bllw|bridge|loopback|tailscale|zerotier|hamachi|bluetooth|npcap|\bvpn\b|pseudo/i;
/** Reconnaît les cartes sans fil, celles auxquelles se connectent le plus souvent les téléphones. */
const WIRELESS_NAME = /wi-?fi|wlan|wireless|sans fil|^wl/i;
/** Reconnaît les noms usuels des autres cartes réseau réelles. */
const PHYSICAL_NAME = /\beth|ethernet|^en\d/i;

/** Indique qu'une adresse ne sert qu'à joindre la machine elle-même ou un autre hôte du lien local. */
function unusable(address: NetworkInterfaceInfo): boolean {
  return address.family !== 'IPv4' || address.internal || address.address.startsWith('169.254.');
}

/** Liste les adresses IPv4 que les autres appareils du réseau peuvent joindre, la plus probable en premier. */
export function lanAddresses(interfaces: InterfaceTable): string[] {
  const candidates = Object.entries(interfaces).flatMap(([name, list]) =>
    (list ?? []).filter(address => !unusable(address)).map(address => ({ name, address: address.address })));
  const real = candidates.filter(candidate => !VIRTUAL_NAME.test(candidate.name));
  const kept = real.length ? real : candidates;
  const rank = (name: string) => WIRELESS_NAME.test(name) ? 0 : PHYSICAL_NAME.test(name) ? 1 : 2;
  const ranked = [...kept].sort((a, b) => rank(a.name) - rank(b.name));
  return [...new Set(ranked.map(candidate => candidate.address))];
}
