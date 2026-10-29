import {readFileSync} from 'node:fs';
if(process.argv.length!==4){console.error('Usage: node tools/fx/compare-replay.mjs reference.json actual.json');process.exit(2);}
const [expected,actual]=process.argv.slice(2).map(file=>JSON.parse(readFileSync(file,'utf8')));
if([expected,actual].some(t=>t.format!=='gtfx-replay-trace'||t.version!==1))throw Error('Both inputs must use gtfx-replay-trace version 1');
const changes=[],ignored=new Set(['fidelity','runtimeIssues','capturedAt']);let count=0;
function compare(a,b,path='$'){
  if(Object.is(a,b))return;
  if(a&&b&&typeof a==='object'&&typeof b==='object'&&Array.isArray(a)===Array.isArray(b)){
    for(const key of new Set([...Object.keys(a),...Object.keys(b)]))if(!ignored.has(key))compare(a[key],b[key],path+'.'+key);
  }else{count++;if(changes.length<20)changes.push({path,expected:a??null,actual:b??null});}
}
compare(expected,actual);
console.log(JSON.stringify({equal:count===0,differences:count,firstDifferences:changes,note:'Equal recorded fields do not prove unrecorded game behavior.'},null,2));
process.exitCode=count?1:0;
