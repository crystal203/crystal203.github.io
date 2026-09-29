// Re-validate a solution rule against the current engine, including an exhaustive sweep.
// Loads the rule exactly the way the app does: dynamic import() + mod.default.
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { pathToFileURL } = require('url');

const ROLE_TABLE = {
  Beth:   { name: '贝丝',   type: '战士', ai: '射手刺客ai', short: 'Beth' },
  Kahlor: { name: '凯勒',   type: '战士', ai: '辅助刺客ai', short: 'Kahlor' },
  Seira:  { name: '塞拉',   type: '辅助', ai: '远程ai',     short: 'Seira' },
  Noel:   { name: '诺艾尔', type: '辅助', ai: '远程ai',     short: 'Noel' },
};
const mk = (side, short, r, c) => ({ side, role: ROLE_TABLE[short], pos: [r, c] });

const sandbox = {
  window: {}, console: { log(){}, warn(){}, error(){} },
  STATE: {}, ALL_ROLES: Object.values(ROLE_TABLE), renderMap() {}, showNotification() {},
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync('D:/github/new44/ruleEngine.js', 'utf8'), sandbox);
const evaluate = sandbox.evaluateRuleForState;
const targets = sandbox.computeTargetsForState;

const rulePath = process.argv[2];
const red = [ mk('red','Kahlor',2,11), mk('red','Beth',1,12), mk('red','Seira',3,12), mk('red','Noel',0,12) ];
const order = ['Kahlor', 'Beth', 'Seira', 'Noel'];
const board = (beth, noel, seira) => [
  mk('blue','Kahlor',0,0), mk('blue','Beth',...beth), mk('blue','Seira',...seira), mk('blue','Noel',...noel),
];

const cases = [
  ['Noel 正左方 (Noel r2c2, Beth r2c3)', board([2,3],[2,2],[4,0]), 140],
  ['Seira 正左方 (Seira r2c2, Beth r2c3)', board([2,3],[4,0],[2,2]), 140],
  ['Noel 隔两列 (Noel r2c1)', board([2,3],[2,1],[4,0]), 80],
  ['Noel 行不同 (Noel r4c2)', board([2,3],[4,2],[4,0]), 80],
  ['Noel 在贝丝右侧 (Noel r2c4)', board([2,3],[2,4],[4,0]), 80],
  ['Seira 隔两列 (Seira r2c1)', board([2,3],[4,0],[2,1]), 80],
  ['Seira 行不同 (Seira r4c2)', board([2,3],[4,0],[4,2]), 80],
  ['Seira 在贝丝右侧 (Seira r2c4)', board([2,3],[4,0],[2,4]), 80],
  ['均不相邻', board([2,3],[0,0],[4,0]), 80],
];

(async () => {
  // Load exactly like the app: dynamic import() then mod.default
  const mod = await import(pathToFileURL(path.resolve(rulePath)).href);
  const RULE = mod.default;
  if (!RULE) throw new Error('模块没有 default 导出 —— 应用会当作加载失败');
  console.log(`import() 成功, name="${RULE.name}", scoring ${RULE.scoring.length} 项, maxScore=${RULE.maxScore}\n`);

  let pass = true;
  for (const [label, blueOrder, expected] of cases) {
    const res = evaluate(RULE, { blueOrder, redOrder: red });
    const ok = res.score === expected && res.blueMatched && res.redMatched;
    if (!ok) pass = false;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(42)} score=${String(res.score).padStart(3)}/${RULE.maxScore} (exp ${String(expected).padStart(3)})`);
  }

  let tested = 0, mismatch = 0, n140 = 0;
  const cells = [];
  for (let r = 0; r < 5; r++) for (let c = 0; c < 4; c++) cells.push([r, c]);

  const rec = (i, used, acc) => {
    if (i === 4) {
      const blueOrder = order.map((s, k) => mk('blue', s, acc[k][0], acc[k][1]));
      const res = evaluate(RULE, { blueOrder, redOrder: red });
      tested++;
      const tg = targets({ blueOrder, redOrder: red });
      const beth = blueOrder.find(u => u.role.short === 'Beth');
      const kLock = tg.find(t => t.from.side === 'red' && t.from.role.short === 'Kahlor')?.to;
      const bLock = tg.find(t => t.from.side === 'red' && t.from.role.short === 'Beth')?.to;
      const myBeth = tg.find(t => t.from.side === 'blue' && t.from.role.short === 'Beth')?.to;
      let exp = 0;
      if (bLock && bLock.role.short === 'Beth') exp += 30;
      if (myBeth && myBeth.role.short === 'Kahlor') exp += 50;
      // 正左方 = same row, column one less
      if (kLock && ['Noel','Seira'].includes(kLock.role.short)
          && kLock.pos[0] === beth.pos[0] && kLock.pos[1] === beth.pos[1] - 1) exp += 60;
      if (res.score !== exp) mismatch++;
      if (res.score === 140) n140++;
      return;
    }
    for (const cell of cells) {
      const key = cell.join(',');
      if (used.has(key)) continue;
      used.add(key); rec(i + 1, used, [...acc, cell]); used.delete(key);
    }
  };
  rec(0, new Set(), []);

  console.log(`\n穷举: ${tested} 个站位, ${mismatch} 处与独立期望不符, ${n140} 个站位得 140`);
  console.log(pass && mismatch === 0 ? 'RESULT: ALL CHECKS PASS' : 'RESULT: PROBLEMS FOUND');
})();
