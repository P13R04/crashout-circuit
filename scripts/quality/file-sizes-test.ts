/**
 * Teste la fonction de comptage et les règles du garde-fou de taille : 500 lignes acceptées, 501 refusées.
 * Liens : scripts/quality/file-sizes.ts.
 * Lancé par npm run test:file-sizes, depuis check et verify dans package.json.
 */
import assert from 'node:assert/strict';
import {MAX_FILES_PER_DIR,MAX_LINES,countLines,findCrowdedDirs,findStaleEntries,findViolations} from './file-sizes.js';
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
/** Fabrique n chemins de fichiers .ts placés directement dans le dossier donné. */
const filesIn=(dir:string,n:number)=>Array.from({length:n},(_,i)=>`${dir}/f${i}.ts`);
assert.deepEqual(findCrowdedDirs(filesIn('server',MAX_FILES_PER_DIR)),[],'12 fichiers dans un dossier sont acceptés');
const crowded=findCrowdedDirs([...filesIn('server',MAX_FILES_PER_DIR+1),...filesIn('server/rules',3)]);
assert.equal(crowded.length,1,'13 fichiers dans un dossier sont refusés');assert.ok(crowded[0].startsWith('server/ :'),'le message cite le dossier');
assert.deepEqual(findCrowdedDirs(['a.ts',...filesIn('x/y',MAX_FILES_PER_DIR)]),[],'les sous-dossiers se comptent séparément');
console.log('File sizes: line counting, 500/501 boundary, baseline growth and 12/13 files-per-folder rules passed');
