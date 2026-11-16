/**
 * Garde-fou de taille et d'organisation des sources : refuse un nouveau fichier .ts de plus de 500 lignes,
 * l'agrandissement d'un fichier de la liste de base et un dossier qui contient plus de 12 fichiers .ts.
 * Liens : scripts/quality/file-sizes.baseline.json, scripts/quality/file-sizes-test.ts, .claude/skills/limiter-taille-fichiers/SKILL.md.
 * Lancé par npm run check:sizes, depuis check et verify dans package.json.
 */
import {readdirSync,readFileSync} from 'node:fs';
import {join,relative,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
/** Nombre maximal de lignes accepté pour un fichier hors liste de base. */
export const MAX_LINES=500;
/** Nombre maximal de fichiers .ts placés directement dans un même dossier. */
export const MAX_FILES_PER_DIR=12;
/** Dossiers ignorés pendant le parcours : historique, sorties de compilation, dépendances et configuration d'outils. */
const IGNORED_DIRS=new Set(['prototypes','dist','node_modules','.git','.claude']);
/** Compte les lignes d'un texte comme wc -l : le nombre de retours à la ligne. */
export function countLines(text:string):number{let n=0;for(let i=0;i<text.length;i++)if(text.charCodeAt(i)===10)n++;return n;}
/** Liste récursivement les fichiers .ts d'un dossier, en chemins relatifs avec des barres obliques. */
export function listSources(root:string,dir=root):string[]{
 const out:string[]=[];
 for(const entry of readdirSync(dir,{withFileTypes:true})){
  if(entry.isDirectory()){if(!IGNORED_DIRS.has(entry.name))out.push(...listSources(root,join(dir,entry.name)));}
  else if(entry.name.endsWith('.ts')&&!entry.name.endsWith('.d.ts'))out.push(relative(root,join(dir,entry.name)).split('\\').join('/'));
 }
 return out.sort();
}
/** Compare les tailles mesurées à la liste de base et renvoie les messages d'erreur, vide si tout est conforme. */
export function findViolations(sizes:Record<string,number>,baseline:Record<string,number>):string[]{
 const errors:string[]=[];
 for(const [file,lines] of Object.entries(sizes)){
  const allowed=baseline[file];
  if(allowed===undefined){if(lines>MAX_LINES)errors.push(`${file} : ${lines} lignes, plafond ${MAX_LINES}. Découper par responsabilité (skill limiter-taille-fichiers).`);}
  else if(lines>allowed)errors.push(`${file} : ${lines} lignes, il grossit alors qu'il est dans la liste de base (${allowed} lignes autorisées).`);
 }
 return errors;
}
/** Signale les entrées de la liste de base devenues inutiles : fichier disparu ou revenu sous le plafond. */
export function findStaleEntries(sizes:Record<string,number>,baseline:Record<string,number>):string[]{
 return Object.keys(baseline).filter(file=>sizes[file]===undefined||sizes[file]<=MAX_LINES).map(file=>`${file} : retirer cette entrée de scripts/quality/file-sizes.baseline.json (${sizes[file]===undefined?'fichier absent':`${sizes[file]} lignes`}).`);
}
/** Signale les dossiers qui contiennent trop de fichiers .ts directs : ils doivent être répartis en sous-dossiers par responsabilité. */
export function findCrowdedDirs(files:string[]):string[]{
 const counts=new Map<string,number>();
 for(const f of files){const i=f.lastIndexOf('/');const dir=i<0?'.':f.slice(0,i);counts.set(dir,(counts.get(dir)||0)+1);}
 return [...counts].filter(([,n])=>n>MAX_FILES_PER_DIR).sort().map(([dir,n])=>`${dir}/ : ${n} fichiers .ts, plafond ${MAX_FILES_PER_DIR}. Créer des sous-dossiers par responsabilité (skill limiter-taille-fichiers).`);
}
/** Mesure le dépôt, applique les règles et termine avec un code d'erreur si une règle est violée. */
function main():void{
 const root=resolve(fileURLToPath(import.meta.url),'..','..','..');
 const baseline=JSON.parse(readFileSync(join(root,'scripts','quality','file-sizes.baseline.json'),'utf8')) as Record<string,number>;
 const sizes:Record<string,number>={};
 for(const file of listSources(root))sizes[file]=countLines(readFileSync(join(root,file),'utf8'));
 const errors=[...findViolations(sizes,baseline),...findStaleEntries(sizes,baseline),...findCrowdedDirs(Object.keys(sizes))];
 if(errors.length){console.error('Tailles de fichiers non conformes :\n'+errors.map(e=>' - '+e).join('\n'));process.exit(1);}
 console.log(`Tailles de fichiers : ${Object.keys(sizes).length} sources .ts, plafond ${MAX_LINES} lignes et ${MAX_FILES_PER_DIR} fichiers par dossier, ${Object.keys(baseline).length} fichier(s) encore dans la liste de base`);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
