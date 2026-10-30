// Static source contracts plus one aggregate, headless action construction pass.
// Does not infer ammunition consumption from WeaponSpec.MagazineSize.
import {readFileSync,readdirSync,existsSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const args=process.argv.slice(2),arg=(name,fallback)=>{const i=args.indexOf(name);return i<0?fallback:args[i+1];};
const root=resolve(arg('--root',fileURLToPath(new URL('../../',import.meta.url))));
const output=arg('--output',null),scriptRoot=arg('--scripts','E:/GTFiles/decrypted');
const activeWIP=arg('--active-wip','').split(',').filter(Boolean);
const {actionModules}=await import(pathToFileURL(join(root,'gtfx/action-modules.js')));
const {equipmentProfile}=await import(pathToFileURL(join(root,'gtfx/equipment-selection.js')));
const {equipmentStyle}=await import(pathToFileURL(join(root,'gtfx/equipment-options.js')));
const {expandManagedStyle}=await import(pathToFileURL(join(root,'gtfx/managed-actions.js')));
const sha=b=>createHash('sha256').update(b).digest('hex'),snapshots={},readCache=new Map();
function raw(file){file=resolve(file);if(!readCache.has(file)){const b=readFileSync(file);readCache.set(file,b.toString('utf8'));snapshots[file.replaceAll('\\','/')]=sha(b);}return readCache.get(file);}
const json=file=>JSON.parse(raw(join(root,file))),unique=a=>[...new Set(a)],kind=n=>n.$type.split('.').at(-1);
const unbox=x=>x&&typeof x==='object'&&'$content'in x?x.$content:x;
const tracked=['gtfx/action-modules.js','gtfx/graph-action.js','gtfx/graph-preview-helpers.js','gtfx/script-actions.js','gtfx/script-projectile-patterns.js','gtfx/native-weapon-actions.js','gtfx/native-manager-operations.js','gtfx/native-area-actions.js','gtfx/projectile-actions.js','gtfx/managed-actions.js','gtfx/equipment-selection.js','tools/fx/native_csharp_grenade.py','tools/fx/native_csharp_managers.py','tools/fx/native_script_persistent_area.py'];
for(const f of tracked)raw(join(root,f));
const categories={confirmed_missing:[],consumed_and_covered:[],unconsumed_fields:[],source_only_unknown:[]},inventory=[],builds=[];
function record(category,item){categories[category].push(item);return item;}
function sourceFor(a,p){
 const plan=p.plans?.find(x=>x.action===a.Name&&x.source?.endsWith('.lua'));
 const path=plan?.source||join(scriptRoot,'Battle/BattleAction',a.Name.split(':')[0]+'BattleAction.lua');
 if(!existsSync(path))return {path:path.replaceAll('\\','/'),available:false};
 const text=raw(path),code=text.replace(/--\[\[[\s\S]*?\]\]/g,'').replace(/--[^\n]*/g,'');
 const lines=text.split(/\r?\n/),consumption=lines.flatMap((line,i)=>/\b(?:discrete_stamina_action_util\.use_stamina|[\w.:]*UseStamina(?:PerAction)?\s*\()/.test(line)&&!/^\s*--/.test(line)?[{line:i+1,text:line.trim()}]:[]);
 const gates=lines.flatMap((line,i)=>/\b(?:is_there_stamina_for_action|persistent_is_available|can_trigger)\b/.test(line)&&!/^\s*--/.test(line)?[{line:i+1,text:line.trim()}]:[]);
 return {path:path.replaceAll('\\','/'),available:true,sha256:sha(text),consumption,gates,resourceTokens:unique(code.match(/\b(?:\w*stamina\w*|\w*magazine\w*|ammo\w*|reload\w*|\w*_reload\w*)\b/gi)||[])};
}
function graphConsumer(a,p){
 const g=p.graphs?.[a.GraphName];if(!g)return null;
 const nodes=new Map(g.nodes.map(n=>[n.$id,n]));
 function constant(n,key){
  const edge=g.connections.find(e=>e.$type.endsWith('ValueConnection')&&e.destinationUnit.$ref===n.$id&&e.destinationKey===key);
  if(!edge)return unbox(n.defaultValues?.[key]);const source=nodes.get(edge.sourceUnit.$ref);
  if(!source)return null;if(kind(source)==='GetVariable')return unbox(g.variables.find(v=>v.name===unbox(source.defaultValues?.name))?.value);
  if(kind(source)==='Literal')return unbox(source.value);return null;
 }
 const use=g.nodes.filter(n=>kind(n)==='UseStaminaPerAction');
 if(!use.length)return null;
 return {graph:a.GraphName,capacity:p.battleDefaults?.maxStamina??200,nodes:use.map(n=>({id:n.$id,hasControlConsumer:g.connections.some(e=>e.$type.endsWith('ControlConnection')&&e.destinationUnit.$ref===n.$id),resolvedCost:constant(n,'StaminaPerAction')||a.StaminaPerAction||null,rawCost:unbox(n.defaultValues?.StaminaPerAction)}))};
}
function closure(p,names){const out=new Set();function visit(name){if(out.has(name))return;out.add(name);const a=p.actions[name];for(const n of [...a?.ComboAction||[],...a?.ExtraAction||[]])visit(n);}for(const name of names)visit(name);return [...out];}
const basicName=n=>! /^(?:GraphRole:|GraphSupport:|GraphMyth:|GraphTrigger:|Role|BasicSupport:)/.test(n);
function summarize(m){return {id:m.id,actorEnd:m.actor.end,tracks:m.tracks.length,clips:m.actor.clips.length,magazine:m.magazine??null,shots:m.sourceTrace?.shots?.length??m.attackSequence?.length??null,staminaTrace:m.sourceTrace?.shots?.filter(s=>s.staminaBefore!=null).map(s=>({at:s.at,before:s.staminaBefore,cost:s.staminaCost,isBreak:s.isBreak}))??null,nativeManager:m.nativeManager??null,nativeWeapon:m.nativeWeapon??null,continuous:m.continuous??null};}
for(const file of readdirSync(join(root,'gtfx/assets/native-characters')).filter(x=>x.endsWith('.json')).sort()){
 const id=file.slice(0,-5),p=json('gtfx/assets/native-characters/'+file),profile=p.profile;
 const allStyles=Object.values(p.styles||{}).filter(s=>s.ManualBattleActions?.length),names=closure(p,allStyles.flatMap(s=>s.ManualBattleActions)).filter(basicName);
 const basicActions=names.map(n=>p.actions[n]).filter(Boolean),rows=[];
 for(const a of basicActions){
  const source=sourceFor(a,p),graph=graphConsumer(a,p),plans=(p.plans||[]).filter(x=>x.action===a.Name),plan=plans.find(x=>x.staminaCost||x.magazine||x.nativeManager||x.nativeArea)||plans.find(x=>x.category==='basic');
  const consumption=graph?'graph_stamina':source.consumption?.length?'lua_stamina':plan?.staminaCost?'registered_native_stamina':plan?.nativeManager?.operation==='distanceMagazine'?'native_manager_option_magazine':a.Name==='ManualRifle'?'native_equipped_rifle_magazine':a.Name.startsWith('ManualGrenadeLauncher:')?'registered_native_launcher_magazine':plan?.magazine?'source_persistent_cycle':null;
  const route=graph&&a.Name.startsWith('GraphStamina:')?'graphStaminaMagazine':plan?.behavior==='source-persistent-area'&&plan.nativeArea&&a.StaminaPerAction>0?'nativeAreaActionModules':plan?.staminaCost&&(plan.behavior==='timeline'||plan.behavior==='source-projectile-pattern')?plan.behavior:plan?.nativeManager?'nativeManagerActionModules':a.Name==='ManualRifle'?'buildNativeWeaponActions':a.Name.startsWith('ManualGrenadeLauncher:')?'projectileActionModules':plan?.magazine&&plan.behavior==='source-projectile-pattern'?'sourceProjectileModules':null;
  const row={character:id,action:a.Name,graph,source,consumption,route,flatStaminaCost:a.StaminaPerAction??null,plan:plan?{behavior:plan.behavior,staminaCost:plan.staminaCost??null,magazine:plan.magazine??null,nativeManager:plan.nativeManager??null,nativeArea:plan.nativeArea??null,source:plan.source??null,sourceSha256:plan.sourceSha256??null}:null};
  rows.push(row);
  if(consumption&&!route){record(activeWIP.includes(id)?'source_only_unknown':'confirmed_missing',{...row,status:activeWIP.includes(id)?'activeWIP_source_confirmed_consumption':'confirmed_consumer_missing_composite_route'});}
  else if(!consumption&&(a.StaminaPerAction>0||source.resourceTokens?.length)){record('source_only_unknown',{character:id,action:a.Name,status:'resource_fields_or_source_tokens_require_native_contract',flatStaminaCost:a.StaminaPerAction??null,source});}
 }
 const hero=profile.forms?.find(f=>f.hero.endsWith('_myth'))?.hero||profile.defaultSkin;
 // One source-contract construction per default pack, plus one representative
 // per alternate weapon action family. No costume/facing/weapon capacity sweep.
 const selections=[{hero,weapon:profile.weaponByAppearance?.[hero]||profile.weapon,profile}];
 const cls=p.heroClasses?.[hero]||p.heroClasses?.[profile.defaultSkin];
 for(const style of allStyles.filter(s=>s.Class===cls)){
  if(!style.ManualBattleActions.some(n=>n==='ManualRifle'))continue;
  const weapon=Object.keys(p.weapons||{}).find(k=>p.weapons[k].weaponType===style.Weapon1&&p.weapons[k].magazineSize>0);
  if(weapon&&!selections.some(s=>s.profile.weaponType===style.Weapon1))selections.push({hero,weapon,profile:equipmentProfile(p,profile,hero,hero,weapon)});
 }
 const packBuilds=[];
 for(const selection of selections){
  let modules=[],error=null;try{modules=actionModules(id,json('gtfx/assets/characters/'+id+'.json'),{appearance:hero,heroAppearance:hero,profile:selection.profile,weapon:selection.weapon,direction:'right',targetDistance:6},p,{[id]:p.plans});}catch(e){error=e.message;}
  const style=equipmentStyle(p,selection.profile,hero),expanded=expandManagedStyle(p,style,{buffScores:{}}),active=unique([...closure(p,expanded?.ManualBattleActions||[]),...modules.map(m=>m.nativeManager?.manager).filter(Boolean)]).filter(basicName);
  const build={character:id,hero,weapon:selection.weapon,weaponType:selection.profile.weaponType,activeBasicActions:active,modules:modules.filter(m=>m.id.startsWith('basic')).map(summarize),error};
  builds.push(build);packBuilds.push(build);
  const consumers=rows.filter(r=>active.includes(r.action)&&r.consumption);
  for(const consumer of consumers){
   if(!consumer.route)continue;
   const magazine=modules.find(m=>m.id==='basic-magazine'),item={character:id,action:consumer.action,consumption:consumer.consumption,route:consumer.route,weapon:selection.weapon,source:consumer.source.available?consumer.source.path:consumer.plan?.source??null,sourceSha256:consumer.source.sha256??consumer.plan?.sourceSha256??null,graph:consumer.graph,composite:magazine?summarize(magazine):null};
   if(error)record('source_only_unknown',{...item,status:'construction_error_not_attributed_to_ammunition',error});
   else if(!magazine)record('confirmed_missing',{...item,status:'actual_consumer_constructed_without_magazine_module'});
   else if(!(magazine.actor.end>0&&magazine.actor.clips.length&&magazine.tracks.length))record('confirmed_missing',{...item,status:'magazine_module_missing_actor_or_fx_content'});
   else record('consumed_and_covered',{...item,status:'source_route_and_composite_content_present_not_visual_acceptance'});
  }
  const singles=modules.filter(m=>/^basic-\d+$/.test(m.id));
  if(singles.length>1&&!modules.some(m=>m.id==='basic-combo'||m.id==='basic-magazine'))record('confirmed_missing',{character:id,status:'multiple_basic_segments_without_contiguous_entry',segments:singles.map(m=>m.id)});
 }
 const weaponFields=Object.entries(p.weapons||{}).filter(([,w])=>w.magazineSize>0).map(([weapon,w])=>({weapon,magazineSize:w.magazineSize,shootTerm:w.shootTerm,reloadTime:w.reloadTime,sourceItemId:w.sourceItemId}));
 if(weaponFields.length){
  const usesWeapon=rows.some(r=>['native_equipped_rifle_magazine','registered_native_launcher_magazine','source_persistent_cycle'].includes(r.consumption));
  if(!usesWeapon)record('unconsumed_fields',{character:id,status:'weapon_capacity_not_consumed_by_registered_basic_actions',fields:weaponFields,actualContracts:rows.filter(r=>r.consumption).map(r=>({action:r.action,consumption:r.consumption})),note:'Weapon display capacity does not authorize inventing shots. A stamina consumer can have a different capacity.'});
 }
 // List declarations not exercised by the chosen source-contract scene. Presence
 // of a compiler route alone is not counted as execution/coverage.
 for(const row of rows.filter(r=>r.consumption&&r.route&&!packBuilds.some(b=>b.activeBasicActions.includes(r.action))))record('source_only_unknown',{character:id,action:row.action,status:'source_consumer_outside_bounded_selected_contract',consumption:row.consumption,route:row.route});
 inventory.push({character:id,ownership:id==='legendaryhero'?'externally_owned_read_only':activeWIP.includes(id)?'activeWIP':'shared_audit',styles:allStyles.map(s=>({name:s.Name,class:s.Class,weapon:s.Weapon1,actions:s.ManualBattleActions})),actions:rows,weaponFields,buildCount:packBuilds.length});
}
const contractChecks=[];
function check(name,fn){try{const evidence=fn();contractChecks.push({name,status:'passed',evidence});}catch(e){contractChecks.push({name,status:'failed',error:e.message});}}
check('graph_variable_costs_discovered_without_flat_field',()=>{const rows=inventory.flatMap(p=>p.actions).filter(a=>a.graph&&!a.flatStaminaCost);if(!rows.some(r=>r.character==='squirrelgirl')||!rows.some(r=>r.character==='mermaidspy'))throw Error('graph variable consumers lost');return rows.map(r=>({character:r.character,action:r.action,nodes:r.graph.nodes}));});
check('weapon_metadata_does_not_create_mercenary_ammo_bug',()=>{const r=categories.unconsumed_fields.find(r=>r.character==='mercenary');if(!r||categories.confirmed_missing.some(r=>r.character==='mercenary'))throw Error('weapon-only inference regression');return {character:r.character,sourceCombo:builds.find(b=>b.character==='mercenary')?.modules.find(m=>m.id==='basic-combo')};});
check('native_manager_ranged_magazine_is_reachable',()=>{const m=builds.find(b=>b.character==='eugene')?.modules.find(m=>m.id==='basic-magazine');if(m?.magazine?.capacity!==8||m.magazine.reloadDuration!==.7)throw Error('native ranged manager contract lost');return m;});
check('graph_magazines_exhaust_actual_consumption_trace',()=>{const rows=categories.consumed_and_covered.filter(r=>r.graph);for(const row of rows){const m=row.composite.magazine;if(m.remaining!==0||!m.sequence?.length||m.sequence.some(s=>!(s.before>s.remaining)))throw Error(row.character+' graph resource trace not exhausted');}return rows.map(r=>({character:r.character,rounds:r.composite.magazine.sequence.length,remaining:r.composite.magazine.remaining}));});
check('twins_owner_stamina_is_independent_of_weapon_capacity',()=>{const m=builds.find(b=>b.character==='twinsandroid')?.modules.find(m=>m.id==='basic-magazine');if(m?.magazine?.count!==13||m.magazine.cost!==16)throw Error('owner stamina contract lost');return {capacity:200,cost:m.magazine.cost,rounds:m.magazine.count};});
check('persistent_cycle_counts_keep_shots_and_repetitions_distinct',()=>{const b=builds.find(b=>b.character==='summerandroid'),single=b?.modules.find(m=>m.id==='basic-1'),m=b?.modules.find(m=>m.id==='basic-magazine');if(single?.shots!==1||m?.magazine?.count!==3||m.shots!==3)throw Error('1 shot per action and 3 bounded repetitions changed');return {shotsPerAction:single.shots,actionRepetitions:m.magazine.count,shots:m.shots,note:'Persistent Lua entry consumes its native action availability gate. Weapon size bounds this preview; it does not establish a stamina pool.'};});
check('source_persistent_area_consumes_native_stamina_and_keeps_one_final_shot',()=>{const m=builds.find(b=>b.character==='storeangel')?.modules.find(m=>m.id==='basic-magazine'),trace=m?.staminaTrace;if(m?.magazine?.capacity!==200||m.magazine.cost!==20||m.magazine.count!==10||m.shots!==10||Math.abs(m.actorEnd-6)>1e-9||trace?.filter(s=>s.isBreak).length!==1||!trace.at(-1).isBreak)throw Error('source area stamina/last-shot contract lost');return {capacity:m.magazine.capacity,cost:m.magazine.cost,shots:m.shots,actorEnd:m.actorEnd,finalShots:trace.filter(s=>s.isBreak).length,trace};});
const report={format:'gtfx-ammo-contract-audit',version:1,auditDate:'2026-10-30',scope:{nativePacks:inventory.length,headlessBuilds:builds.length,renderedPixels:0,costumeFacingSweep:false,legendaryhero:'read_only_no_asset_modifications',activeWIP,meaning:'Static consumption, registered route and built composite content only; source-import, visual fidelity and user acceptance remain separate.'},policy:{confirmed_missing:'Actual source/registered consumer plus absent route or absent usable composite. Weapon metadata alone never qualifies.',consumed_and_covered:'Source consumer route built with basic-magazine actor clips and FX content in one bounded scene.',unconsumed_fields:'Native data field is not read by the registered basic action consumer; do not synthesize shot count.',source_only_unknown:'Resource evidence outside selected construction, explicitly passed --active-wip, or construction error not safely attributable to ammunition.'},summary:Object.fromEntries(Object.entries(categories).map(([k,v])=>[k,{count:v.length,characters:unique(v.map(r=>r.character)).sort()}])),inputSnapshot:{files:snapshots,combinedSha256:sha(JSON.stringify(Object.entries(snapshots).sort()))},categories,contractChecks,inventory,builds,limitations:['Lua token scanning is a conservative discovery mechanism. Source calls and registered consumers establish contracts; mere token/field matches remain unknown.','All available styles/actions/graphs are statically listed; only one default mythical/basic source contract per pack and one alternate rifle family per applicable pack are constructed. No costume/direction/skin sweep.','Composite actor clips and FX presence do not establish rendered animation continuity or visual parity.','Summonables remain independently owned entities; their names and weapon metadata cannot override owner stamina cost. Turret autonomous action is not a five-round owner magazine.','Unconsumed weapon fields are scoped to currently registered actions and can become consumers after future implementation changes.']};
if(output)writeFileSync(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({scope:report.scope,summary:report.summary,contractChecks,constructionErrors:builds.filter(b=>b.error).map(b=>({character:b.character,error:b.error}))},null,2));
if(categories.confirmed_missing.some(r=>r.character!=='legendaryhero')||contractChecks.some(c=>c.status==='failed'))process.exitCode=1;
