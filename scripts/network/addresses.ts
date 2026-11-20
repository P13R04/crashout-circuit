/**
 * Vérifie le choix des adresses annoncées : carte réelle d'abord, adaptateurs virtuels et adresses inutilisables écartés, message de démarrage court.
 * Liens : server/net/networkAddresses.ts, server/net/sessionHttp.ts, server/net/startupBanner.ts.
 * Lancé depuis les scripts npm de package.json.
 */
import assert from 'node:assert/strict';
import type { NetworkInterfaceInfo } from 'node:os';
import { lanAddresses, type InterfaceTable } from '../../server/net/networkAddresses.js';
import { sessionAddresses } from '../../server/net/sessionHttp.js';
import { startupLines } from '../../server/net/startupBanner.js';

/** Fabrique une entrée du tableau des interfaces de la machine. */
function entry(address: string, family: 'IPv4' | 'IPv6' = 'IPv4', internal = false): NetworkInterfaceInfo {
  return { address, netmask: '255.255.255.0', family, mac: '00:00:00:00:00:00', internal, cidr: `${address}/24` } as NetworkInterfaceInfo;
}

// La machine de la séance du 18 novembre : WSL, VirtualBox et une carte Wi-Fi.
const windows: InterfaceTable = {
  'vEthernet (WSL)': [entry('172.19.32.1')],
  'VirtualBox Host-Only Network': [entry('192.168.56.1')],
  'Wi-Fi': [entry('192.168.75.9'), entry('fe80::1', 'IPv6')],
  'Loopback Pseudo-Interface 1': [entry('127.0.0.1', 'IPv4', true)],
};
assert.deepEqual(lanAddresses(windows), ['192.168.75.9'], 'seule la carte Wi-Fi reste');
assert.deepEqual(sessionAddresses(3000, 'http', null, windows).baseUrls, ['http://192.168.75.9:3000']);
assert.deepEqual(sessionAddresses(3000, 'http', null, windows).ozUrls, ['http://192.168.75.9:3000/oz']);

assert.deepEqual(lanAddresses({ 'Ethernet': [entry('10.0.0.4')], 'Wi-Fi': [entry('192.168.1.20')], 'Docker': [entry('172.17.0.1')] }),
  ['192.168.1.20', '10.0.0.4'], 'deux cartes réelles : les deux restent, sans fil d’abord');
assert.deepEqual(lanAddresses({ 'en0': [entry('192.168.0.8')], 'bridge100': [entry('192.168.64.1')], 'utun3': [entry('100.64.0.2')], 'awdl0': [entry('169.254.3.3')] }),
  ['192.168.0.8'], 'macOS : ponts, tunnels et adresses locales de lien écartés');
assert.deepEqual(lanAddresses({ 'vEthernet (WSL)': [entry('172.19.32.1')] }), ['172.19.32.1'],
  'sans carte réelle, l’adresse virtuelle reste le dernier recours');
assert.deepEqual(lanAddresses({ lo: [entry('127.0.0.1', 'IPv4', true)] }), []);
assert.deepEqual(sessionAddresses(3000, 'https', new URL('https://table.example.test'), windows).baseUrls,
  ['https://table.example.test', 'https://192.168.75.9:3000'], 'l’adresse publique passe avant le réseau local');

const base = {
  port: 3000, protocol: 'http' as const, baseUrls: ['http://192.168.75.9:3000'], secure: false, room: 'HL5B2', spectators: false,
  developerTools: false, soloTest: false, lapsToWin: 3, physicsHz: 60, hostUrl: (origin: string, path = '/') => origin + path,
};
const banner = startupLines(base).join('\n');
assert.equal(banner.match(/http:\/\/\d+\.\d+\.\d+\.\d+:3000\/oz/g)?.length, 1, 'une seule adresse Oz');
assert.equal(banner.match(/play\?room=HL5B2/g)?.length, 1, 'une seule adresse joueurs');
assert.ok(!banner.includes('Spectateurs') && !banner.includes('Autres'));
assert.ok(banner.includes('HTTP : capteurs iOS indisponibles'));
const several = startupLines({ ...base, baseUrls: ['http://192.168.1.20:3000', 'http://10.0.0.4:3000'], spectators: true, secure: true }).join('\n');
assert.ok(several.includes('http://192.168.1.20:3000/watch?room=HL5B2'));
assert.equal(several.match(/Autres.*10\.0\.0\.4/g)?.length, 1, 'les autres adresses tiennent sur une ligne');
assert.ok(!several.includes('capteurs iOS'));
assert.ok(startupLines({ ...base, baseUrls: [] }).join('\n').includes('aucune adresse trouvée'));
console.log('✓ Adresses : cartes virtuelles écartées, adresse principale unique, message de démarrage court');
