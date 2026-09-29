import {existsSync,readFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {join} from 'node:path';
const root=fileURLToPath(new URL('../../',import.meta.url));
const cargoPath=join(homedir(),'.cargo','bin',process.platform==='win32'?'cargo.exe':'cargo');
const cargo=existsSync(cargoPath)?cargoPath:'cargo';
const args=process.argv.slice(2);
if(!existsSync(join(root,'native/assets/world.json'))||JSON.parse(readFileSync(join(root,'native/assets/world.json'))).version!==2||!existsSync(join(root,'native/assets/coast-mask.bin'))||!existsSync(join(root,'native/assets/rendering/complete.json'))){
 console.log('Converting Coastlove artwork for the native build…');
 const result=spawnSync(process.execPath,['native/tools/export-world.mjs'],{cwd:root,stdio:'inherit'});
 if(result.status!==0)process.exit(result.status||1);
}
const result=spawnSync(cargo,['run','--release','--locked','--manifest-path','native/Cargo.toml','--',...args],{cwd:root,stdio:'inherit'});
if(result.error){console.error('Rust is required to build the app. Install the stable toolchain from https://rustup.rs, then run this command again.');console.error(result.error.message);}
process.exit(result.status|| (result.error?1:0));
