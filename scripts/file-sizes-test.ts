/**
 * Teste la fonction de comptage et les règles du garde-fou de taille : 500 lignes acceptées, 501 refusées.
 * Liens : scripts/file-sizes.ts.
 * Lancé par npm run test:file-sizes, depuis check et verify dans package.json.
 */
import assert from 'node:assert/strict';
import {MAX_LINES,countLines,findStaleEntries,findViolations} from './file-sizes.js';
/** Fabrique un texte de n lignes terminées par un retour à la ligne, comme un fichier source. */
const text=(n:number)=>'x\n'.repeat(n);
assert.equal(countLines(''),0);
assert.equal(countLines(text(500)),500);
assert.equal(countLines(text(501)),501);
assert.equal(countLines('a\r\nb\r\n'),2,'les fins de ligne Windows comptent une ligne chacune');
assert.deepEqual(findViolations({'a.ts':countLines(text(MAX_LINES))},{}),[],'500 lignes sont acceptées');
const refused=findViolations({'server/nouveau.ts':countLines(text(MAX_LINES+1))},{});
assert.equal(refused.length,1,'501 lignes sont refusées');assert.ok(refused[0].startsWith('server/nouveau.ts'),'le message cite le fichier');
assert.deepEqual(findViolations({'gros.ts':900},{'gros.ts':900}),[],'un fichier de la liste de base qui ne grossit pas passe');
assert.deepEqual(findViolations({'gros.ts':800},{'gros.ts':900}),[],'un fichier de la liste de base qui rétrécit passe');
const grown=findViolations({'gros.ts':901},{'gros.ts':900});
assert.equal(grown.length,1,'un fichier de la liste de base qui grossit échoue');assert.ok(grown[0].startsWith('gros.ts'));
assert.equal(findStaleEntries({'gros.ts':400},{'gros.ts':900}).length,1,'une entrée revenue sous le plafond doit être retirée');
assert.equal(findStaleEntries({},{'absent.ts':900}).length,1,'une entrée sans fichier doit être retirée');
assert.deepEqual(findStaleEntries({'gros.ts':900},{'gros.ts':900}),[]);
console.log('File sizes: line counting, 500/501 boundary and baseline growth rules passed');
