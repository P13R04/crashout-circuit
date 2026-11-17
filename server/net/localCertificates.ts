/** Maintient une autorité locale persistante et signe un certificat pour les adresses disponibles. */
import { execFileSync } from 'node:child_process';
import { randomBytes, X509Certificate } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

function openssl(args: string[]): void {
  execFileSync('openssl', args, { stdio: ['ignore', 'ignore', 'pipe'] });
}

export function localAuthority(root = join(homedir(), '.local', 'share', 'crashout-circuit')) {
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const authority = join(root, 'authority');
  if (!existsSync(authority)) {
    const staged = mkdtempSync(join(root, 'authority-'));
    try {
      openssl(['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-days', '3650',
        '-subj', '/CN=Crashout Circuit Local Test CA',
        '-addext', 'basicConstraints=critical,CA:TRUE,pathlen:0',
        '-addext', 'keyUsage=critical,keyCertSign,cRLSign', '-keyout', join(staged, 'ca-key.pem'),
        '-out', join(staged, 'ca.pem')]);
      try { renameSync(staged, authority); } catch (error) { if (!existsSync(authority)) throw error; }
    } finally { rmSync(staged, { recursive: true, force: true }); }
  }
  const cert = join(authority, 'ca.pem'), key = join(authority, 'ca-key.pem');
  return { cert, key, certificate: new X509Certificate(readFileSync(cert)).raw };
}

/** Génère un certificat feuille valable sur localhost et toutes les IPv4 du lien. */
export function signLocalCertificate(authority: ReturnType<typeof localAuthority>, addresses: readonly string[]) {
  const dir = mkdtempSync(join(tmpdir(), 'crashout-leaf-'));
  try {
    const request = join(dir, 'request.csr');
    const key = join(dir, 'key.pem'), cert = join(dir, 'cert.pem');
    const extensions = join(dir, 'extensions.cnf');
    writeFileSync(extensions, [
      'basicConstraints=critical,CA:FALSE', 'keyUsage=critical,digitalSignature,keyEncipherment',
      'extendedKeyUsage=serverAuth',
      'subjectAltName=DNS:localhost,IP:127.0.0.1' + addresses.map(ip => ',IP:' + ip).join(''),
    ].join('\n') + '\n');
    openssl(['req', '-new', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-subj', '/CN=localhost',
      '-keyout', key, '-out', request]);
    openssl(['x509', '-req', '-in', request, '-CA', authority.cert, '-CAkey', authority.key,
      '-set_serial', '0x' + randomBytes(16).toString('hex'), '-days', '30', '-sha256',
      '-extfile', extensions, '-out', cert]);
    return { key: readFileSync(key), cert: readFileSync(cert) };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
