/**
 * Garde-fou de taille des fichiers sources : refuse un nouveau fichier .ts de plus de 500 lignes et
 * l'agrandissement d'un fichier de la liste de base.
 * Liens : scripts/file-sizes.baseline.json, scripts/file-sizes-test.ts, .claude/skills/limiter-taille-fichiers/SKILL.md.
 * Lancé par npm run check:sizes, depuis check et verify dans package.json.
 */
import {readdirSync,readFileSync} from 'node:fs';
import {join,relative,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
/** Nombre maximal de lignes accepté pour un fichier hors liste de base. */
export const MAX_LINES=500;
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
 return Object.keys(baseline).filter(file=>sizes[file]===undefined||sizes[file]<=MAX_LINES).map(file=>`${file} : retirer cette entrée de scripts/file-sizes.baseline.json (${sizes[file]===undefined?'fichier absent':`${sizes[file]} lignes`}).`);
}
/** Mesure le dépôt, applique les règles et termine avec un code d'erreur si une règle est violée. */
function main():void{
 const root=resolve(fileURLToPath(import.meta.url),'..','..');
 const baseline=JSON.parse(readFileSync(join(root,'scripts','file-sizes.baseline.json'),'utf8')) as Record<string,number>;
 const sizes:Record<string,number>={};
 for(const file of listSources(root))sizes[file]=countLines(readFileSync(join(root,file),'utf8'));
 const errors=[...findViolations(sizes,baseline),...findStaleEntries(sizes,baseline)];
 if(errors.length){console.error('Tailles de fichiers non conformes :\n'+errors.map(e=>' - '+e).join('\n'));process.exit(1);}
 console.log(`Tailles de fichiers : ${Object.keys(sizes).length} sources .ts, plafond ${MAX_LINES} lignes, ${Object.keys(baseline).length} fichier(s) encore dans la liste de base`);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
