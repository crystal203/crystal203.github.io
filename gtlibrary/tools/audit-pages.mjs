/** Conservative preflight for the existing branch/Jekyll Pages build. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const root=fileURLToPath(new URL('../../',import.meta.url));
const config=fs.readFileSync(path.join(root,'_config.yml'),'utf8');
const excluded=config.split(/\r?\n/).filter(s=>s.startsWith('  - ')).map(s=>s.slice(4).trim());
assert.ok(excluded.length,'Missing Pages exclusions');
assert.ok(!fs.existsSync(path.join(root,'.nojekyll')),'Root .nojekyll bypasses Pages exclusions');
const ctx={};vm.runInNewContext(fs.readFileSync(path.join(root,'gtlibrary/core/delivery-config.js'),'utf8'),ctx);
const delivery=ctx.GTDeliveryConfig;
assert.ok(delivery.rawBase,'Excluded assets need a GitHub raw fallback');
for(const p of delivery.cdnPrefixes)assert.ok(excluded.includes('gtlibrary/'+p.replace(/\/$/,'')), 'Missing Pages exclusion: '+p);
for(const p of excluded.filter(p=>p.startsWith('gtlibrary/')&&p!=='gtlibrary/tools'))assert.ok(delivery.cdnPrefixes.includes(p.slice(10)+'/'),'Excluded runtime assets have no delivery rule: '+p);
const cdnSHA=new URL(delivery.cdnBase).pathname.match(/@([a-f0-9]{40})\//)?.[1];
assert.ok(cdnSHA&&delivery.rawBase.includes('/'+cdnSHA+'/'),'CDN and raw must pin the same commit');
const files=execFileSync('git',['ls-files','-z'],{cwd:root,maxBuffer:32*1024*1024}).toString().split('\0').filter(Boolean);
let bytes=0,count=0,tarBytes=1024;const groups={};
for(const file of files){
 if(excluded.some(e=>file===e||file.startsWith(e+'/')))continue;
 const size=fs.statSync(path.join(root,file)).size;
 bytes+=size;count++;tarBytes+=Math.ceil(size/512)*512+1024;
 const group=file.startsWith('gtlibrary/')?file.split('/').slice(0,2).join('/'):file.split('/')[0];groups[group]=(groups[group]||0)+size;
}
console.log(JSON.stringify({files:count,bytes,MiB:+(bytes/1048576).toFixed(2),estimatedTarMiB:+(tarBytes/1048576).toFixed(2),largestGroups:Object.entries(groups).sort((a,b)=>b[1]-a[1]).slice(0,10)},null,2));
assert.ok(tarBytes<900*1024*1024,'Pages bundle is approaching 1 GB; reduce it before publishing');
console.log('PASS Pages budget (<900 MiB with tar allowance), exclusions and pinned delivery configuration');
