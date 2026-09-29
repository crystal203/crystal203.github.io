// Regression harness: evaluate every rule file against a set of fixed states.
// Usage: node _regress.js            -> prints a hash of all results
//        node _regress.js --json     -> prints full JSON
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const crypto = require('crypto');

const ROLE_TABLE = {
  Beth:   { name: '贝丝',   type: '战士', ai: '射手刺客ai', short: 'Beth' },
  Kahlor: { name: '凯勒',   type: '战士', ai: '辅助刺客ai', short: 'Kahlor' },
  Seira:  { name: '塞拉',   type: '辅助', ai: '远程ai',     short: 'Seira' },
  Noel:   { name: '诺艾尔', type: '辅助', ai: '远程ai',     short: 'Noel' },
  Eva:    { name: '伊娃',   type: '辅助', ai: '近战ai',     short: 'Eva' },
  Daisy:  { name: '黛西',   type: '坦克', ai: '近战ai',     short: 'Daisy' },
  Rie:    { name: '莉耶',   type: '战士', ai: '射手刺客ai', short: 'Rie' },
  Eunha:  { name: '银河',   type: '射手', ai: '远程ai',     short: 'Eunha' },
  Estel:  { name: '艾丝黛尔', type: '射手', ai: '近战ai',   short: 'Estel' },
  Miya:   { name: '美娅',   type: '辅助', ai: '就近刺客ai', short: 'Miya' },
};
const mk = (side, short, r, c) => ({ side, role: ROLE_TABLE[short], pos: [r, c] });

const sandbox = {
  window: {}, console: { log(){}, warn(){}, error(){} },
  STATE: {}, ALL_ROLES: Object.values(ROLE_TABLE), renderMap() {}, showNotification() {},
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync('D:/github/new44/ruleEngine.js', 'utf8'), sandbox);
const evaluate = sandbox.evaluateRuleForState;

// Fixed states exercising several roster/position shapes.
const states = {
  S1: {
    blueOrder: [mk('blue','Kahlor',0,0), mk('blue','Beth',2,3), mk('blue','Seira',4,0), mk('blue','Noel',2,2)],
    redOrder:  [mk('red','Kahlor',2,11), mk('red','Beth',1,12), mk('red','Seira',3,12), mk('red','Noel',0,12)],
  },
  S2: {
    blueOrder: [mk('blue','Beth',1,2), mk('blue','Eva',0,0), mk('blue','Daisy',3,3), mk('blue','Kahlor',4,1)],
    redOrder:  [mk('red','Kahlor',2,11), mk('red','Rie',0,12), mk('red','Beth',3,12), mk('red','Eva',4,10)],
  },
  S3: {
    blueOrder: [mk('blue','Kahlor',2,3), mk('blue','Rie',2,3), mk('blue','Eva',0,0), mk('blue','Beth',0,1)],
    redOrder:  [mk('red','Eva',1,10), mk('red','Beth',2,11), mk('red','Daisy',3,12), mk('red','Eunha',4,13)],
  },
  S4: {
    blueOrder: [mk('blue','Beth',1,2), mk('blue','Eva',0,0), mk('blue','Daisy',3,3), mk('blue','Rie',4,1)],
    redOrder:  [mk('red','Kahlor',2,11), mk('red','Rie',0,12), mk('red','Beth',3,12), mk('red','Eva',4,10)],
  },
  S5: {
    blueOrder: [mk('blue','Beth',0,0), mk('blue','Eva',1,1), mk('blue','Daisy',2,2), mk('blue','Kahlor',3,3)],
    redOrder:  [mk('red','Eva',0,10), mk('red','Beth',1,11), mk('red','Daisy',2,12), mk('red','Eunha',3,13)],
  },
};

const ruleDir = 'D:/github/new44/rule';
const files = fs.readdirSync(ruleDir).filter(f => f.endsWith('.js') || f.endsWith('.json')).sort();

const out = {};
for (const f of files) {
  const full = path.join(ruleDir, f);
  let rule;
  try {
    if (f.endsWith('.json')) rule = JSON.parse(fs.readFileSync(full, 'utf8'));
    else {
      const src = fs.readFileSync(full, 'utf8').replace(/^\s*export\s+default\s+/, 'module.exports = ');
      const mod = { exports: {} };
      const fn = new Function('module', 'exports', src);
      fn(mod, mod.exports);
      rule = mod.exports;
    }
  } catch (e) {
    out[f] = { loadError: e.message };
    continue;
  }
  const rec = {};
  for (const [sn, state] of Object.entries(states)) {
    try {
      const r = evaluate(rule, state);
      rec[sn] = {
        redMatched: !!r.redMatched, blueMatched: !!r.blueMatched,
        score: r.score === undefined ? null : (Number.isFinite(r.score) ? r.score : String(r.score)),
        maxScore: r.maxScore === undefined ? null : (Number.isFinite(r.maxScore) ? r.maxScore : String(r.maxScore)),
        bluePositionSatisfied: r.bluePositionSatisfied,
      };
    } catch (e) {
      rec[sn] = { error: e.message };
    }
  }
  out[f] = rec;
}

const json = JSON.stringify(out, null, 2);
if (process.argv.includes('--json')) console.log(json);
console.log('RULES=' + files.length);
console.log('SHA256=' + crypto.createHash('sha256').update(json).digest('hex'));
