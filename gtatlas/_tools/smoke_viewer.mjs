// Exercise the viewer's OWN parsing code (extracted from index.html) against every
// published atlas, with a minimal DOM stub. Catches syntax errors, a broken entry in
// the spritesheets array, wrong paths, and any JSON shape the viewer cannot read.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const dir = path.resolve(import.meta.dirname, '..');
const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
const code = html.match(/<script>([\s\S]*?)<\/script>/)[1];

const noop = () => {};
const el = () => ({ style: {}, classList: { add: noop, remove: noop }, appendChild: noop, addEventListener: noop, set innerHTML(_) {}, set textContent(_) {}, get innerHTML() { return ''; }, click: noop, value: '', files: [] });
const sandbox = {
  console,
  document: { addEventListener: noop, getElementById: el, createElement: el, querySelector: el },
  window: {},
  Image: class { set src(_) {} },
  alert: noop,
  URL: { createObjectURL: () => 'blob:x' },
  fetch: noop,
  setTimeout,
};
vm.createContext(sandbox);
vm.runInContext(code, sandbox, { filename: 'index.html:script' });

if (typeof sandbox.parseSpritesheetData !== 'function') throw new Error('parseSpritesheetData not defined');
// `let spritesheets` is lexically scoped, so read it back through the context
const sheets = vm.runInContext('spritesheets', sandbox);
if (!Array.isArray(sheets)) throw new Error('spritesheets is not an array');
console.log(`script parsed OK; spritesheets has ${sheets.length} entries\n`);

let bad = 0;
for (const s of sheets) {
  const png = path.join(dir, s.png.replace(/^\.\//, ''));
  const json = path.join(dir, s.json.replace(/^\.\//, ''));
  const problems = [];
  if (!fs.existsSync(png)) problems.push(`png missing: ${s.png}`);
  if (!fs.existsSync(json)) problems.push(`json missing: ${s.json}`);
  let regions = 0, rotated = 0, declaredRotated = 0, named = '-', myth = 0, stars = 0;
  if (!problems.length) {
    const data = JSON.parse(fs.readFileSync(json, 'utf8'));
    // the viewer passes its <img> element; only .width/.height are ever read back
    const parsed = sandbox.parseSpritesheetData(data, { width: 0, height: 0 });
    regions = parsed.length;
    rotated = parsed.filter(r => r.rotated).length;
    declaredRotated = Object.values(data.frames).filter(f => f.rotated).length;
    if (!regions) problems.push('parseSpritesheetData returned 0 regions');
    if (rotated !== declaredRotated) problems.push(`rotated flag lost: ${rotated} != ${declaredRotated}`);
    for (const r of parsed) {
      if (!Number.isFinite(r.x) || !Number.isFinite(r.y) || !(r.w > 0) || !(r.h > 0)) {
        problems.push(`bad geometry for ${r.name}`); break;
      }
    }
    // optional Chinese sidecar: every key must be a real frame, so the viewer's
    // zhNames[region.name] lookup can never silently miss
    if (s.zh) {
      const zhPath = path.join(dir, s.zh.replace(/^\.\//, ''));
      if (!fs.existsSync(zhPath)) {
        problems.push(`zh sidecar missing: ${s.zh}`);
      } else {
        const zh = JSON.parse(fs.readFileSync(zhPath, 'utf8'));
        const codes = new Set(Object.keys(data.frames));
        const strays = Object.keys(zh).filter(k => !codes.has(k));
        if (strays.length) problems.push(`${strays.length} zh key(s) are not frames: ${strays.slice(0, 3)}`);
        const empty = Object.entries(zh).filter(([, v]) => !String(v).trim());
        if (empty.length) problems.push(`${empty.length} zh value(s) empty`);
        named = `${Object.keys(zh).length}/${regions}`;
        // tier annotations must be present and therefore searchable by name
        myth = Object.values(zh).filter(v => String(v).includes('开花')).length;
        stars = Object.values(zh).filter(v => /（\d+星）/.test(String(v))).length;
      }
    }
  }
  if (problems.length) bad++;
  console.log(`  ${problems.length ? 'FAIL' : 'OK  '} ${String(s.name).padEnd(18)} ${path.basename(s.json).padEnd(38)} `
            + `regions=${String(regions).padEnd(5)} rotated=${String(rotated).padEnd(3)} zh=${String(named).padEnd(11)} `
            + `开花=${myth} 星=${stars}`);
  for (const p of problems) console.log(`         - ${p}`);
}

console.log(`\n${sheets.length} entries, ${bad} failing`);
process.exit(bad ? 1 : 0);
