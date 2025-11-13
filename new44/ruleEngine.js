function getUnitByShort(side, short, orderList = null) {
  const order = orderList || (side === 'blue' ? STATE.blueOrder : STATE.redOrder);
  return order.find(u => u.role.short === short);
}

function getPos(unit) { return unit ? unit.pos : null; }

function getX(unit) { return getPos(unit)?.[1] ?? -1; }

function getY(unit) { return getPos(unit)?.[0] ?? -1; }

function resolveChar(expr, blueOrder, redOrder) {
  const m1 = expr.match(/^([BR])\-([A-Za-z]+)$/);
  const m2 = expr.match(/^([BR])\-([A-Za-z]+)\-lock$/);
  if (m1) {
    const [_, sideChar, short] = m1;
    return getUnitByShort(sideChar === 'B' ? 'blue' : 'red', short, sideChar === 'B' ? blueOrder : redOrder);
  } else if (m2) {
    const [_, sideChar, short] = m2;
    const unit = getUnitByShort(sideChar === 'B' ? 'blue' : 'red', short, sideChar === 'B' ? blueOrder : redOrder);
    if (!unit) return null;
    const targets = computeTargetsForState({ blueOrder, redOrder });
    const target = targets.find(t => t.from === unit)?.to;
    return target;
  }
  return null;
}

const REL = {
  equ: (a, b) => a === b,
  eq: (a, b) => a === b,
  neq: (a, b) => a !== b,
  ne: (a, b) => a !== b,
  geq: (a, b) => a >= b,
  ge: (a, b) => a >= b,
  leq: (a, b) => a <= b,
  le: (a, b) => a <= b,
  l: (a, b) => a < b,
  g: (a, b) => a > b,
};

function computeTargetsForState(state) {
  const { blueOrder, redOrder } = state;
  const originalHitStates = new Map();
  [...redOrder, ...blueOrder].forEach(u => {
    originalHitStates.set(u, u.isHit || false);
    u.isHit = false;
  });
  const targets = [];
  for (const attacker of [...blueOrder, ...redOrder]) {
    const enemyOrder = attacker.side === 'blue' ? redOrder : blueOrder;
    if (enemyOrder.length === 0) continue;
    const target = findTargetForState(attacker, enemyOrder);
    if (target) {
      targets.push({ from: attacker, to: target });
    }
  }
  originalHitStates.forEach((value, unit) => {
    unit.isHit = value;
  });
  return targets;
}

function findTargetForState(attacker, candidates) {
  const { ai } = attacker.role;
  const unhit = candidates.filter(c => !c.isHit);
  let target = null;
  if (ai === '辅助刺客ai' || ai === '射手刺客ai') {
    const targetType = ai === '辅助刺客ai' ? '辅助' : '射手';
    target = unhit.find(u => u.role.type === targetType);
    if (!target) target = candidates.find(u => u.role.type === targetType);
    if (!target) target = findNearestForState(attacker, unhit.length > 0 ? unhit : candidates);
  } else if (ai === '近战ai') {
    target = findNearestForState(attacker, unhit.length > 0 ? unhit : candidates);
  } else if (ai === '远程ai') {
    target = findNearestForState(attacker, candidates);
  }
  if (target) target.isHit = true;
  return target;
}

function findNearestForState(unit, candidates) {
  if (candidates.length === 0) return null;
  const [ar, ac] = unit.pos;
  return candidates.reduce((best, u) => {
    const [br, bc] = u.pos;
    const d = (ar - br) ** 2 + (ac - bc) ** 2;
    return d < best.dist ? { unit: u, dist: d } : best;
  }, { unit: null, dist: Infinity }).unit;
}

function evaluateRuleForState(rule, state) {
  const { blueOrder, redOrder } = state;
  const checkTeamMatch = (sideOrder, targetList) => {
    if (sideOrder.length !== 4) return false;
    if (sideOrder[0]?.role.short !== targetList[0]) return false;
    const actualSet = new Set(sideOrder.map(u => u.role.short));
    const targetSet = new Set(targetList);
    return actualSet.size === 4 && [...actualSet].sort().join() === [...targetSet].sort().join();
  };
  const pre = rule.preconditions;
  const redMatched = checkTeamMatch(redOrder, pre.team.red) &&
    (pre.redPosition || []).every(([short, axis, rel, val]) => {
      const unit = getUnitByShort('red', short, redOrder);
      if (!unit) return false;
      const posVal = axis === 'x-pos' ? getX(unit) : getY(unit);
      return REL[rel](posVal, val);
    });
  if (!redMatched) {
    return { redMatched: false };
  }
  const blueMatched = checkTeamMatch(blueOrder, pre.team.blue);
  let bluePositionSatisfied = true;
  if (rule.bluePosition && rule.bluePosition.length > 0) {
    for (let [short, axis, rel, val] of rule.bluePosition) {
      const unit = getUnitByShort('blue', short, blueOrder);
      if (!unit) {
        bluePositionSatisfied = false;
        break;
      }
      const posVal = axis === 'x-pos' ? getX(unit) : getY(unit);
      if (!REL[rel](posVal, val)) {
        bluePositionSatisfied = false;
        break;
      }
    }
  }
  let score = 0;
  const values = [];
  const resolveArg = (arg) => {
    if (typeof arg === 'string' && /^#\d+$/.test(arg)) {
      const idx = parseInt(arg.slice(1), 10);
      if (idx < 0 || idx >= values.length || values[idx] === undefined) {
        return NaN;
      }
      return values[idx];
    }
    return arg;
  };
  for (let idx = 0; idx < (rule.scoring?.length || 0); idx++) {
    const item = rule.scoring[idx];
    let result = false;
    let ptsToAdd = 0;
    try {
      if (item.length === 2) {
        const [expr, axis] = item;
        const unit = resolveChar(expr, blueOrder, redOrder);
        result = (unit ? (axis === 'x-pos' ? getX(unit) : getY(unit)) : -1);
      } else if (item.length === 4 && item[3] === 'delta') {
        const [e1, e2, axis] = item;
        const u1 = resolveChar(e1, blueOrder, redOrder);
        const u2 = resolveChar(e2, blueOrder, redOrder);
        if (u1 && u2) {
          const p1 = axis === 'x-pos' ? getX(u1) : getY(u1);
          const p2 = axis === 'x-pos' ? getX(u2) : getY(u2);
          result = Math.abs(p1 - p2);
        } else {
          result = Infinity;
        }
      } else if (item[0] === 'const' && item.length === 2) {
        result = Number(resolveArg(item[1]));
      } else if (item[0] === 'subabs' && item.length === 3) {
        const a = Number(resolveArg(item[1]));
        const b = Number(resolveArg(item[2]));
        result = Math.abs(a - b);
      } else if (item[0] === 'sub' && item.length === 3) {
        const a = Number(resolveArg(item[1]));
        const b = Number(resolveArg(item[2]));
        result = a - b;
      }else if (item[0] === 'compare' && item.length === 4) {
        const v1 = resolveArg(item[1]);
        const rel = item[2];
        const v2 = resolveArg(item[3]);
        result = REL[rel] ? REL[rel](v1, v2) : false;
      } else if (item[0] === 'and' && (item.length === 3 || item.length === 4)) {
        const b1 = Boolean(values[item[1]]);
        const b2 = Boolean(values[item[2]]);
        result = b1 && b2;
        if (item.length === 4 && result) ptsToAdd = Number(item[3]);
      } else if (item[0] === 'or' && (item.length === 3 || item.length === 4)) {
        const b1 = Boolean(values[item[1]]);
        const b2 = Boolean(values[item[2]]);
        result = b1 || b2;
        if (item.length === 4 && result) ptsToAdd = Number(item[3]);

      } else if (item[0] === 'not' && (item.length === 2 || item.length === 3)) {
        const b = Boolean(values[item[1]]);
        result = !b;
        if (item.length === 3 && result) ptsToAdd = Number(item[2]);
      } else if (item[0] === 'xor' && (item.length === 3 || item.length === 4)) {
        const b1 = Boolean(values[item[1]]);
        const b2 = Boolean(values[item[2]]);
        result = b1 !== b2;
        if (item.length === 4 && result) ptsToAdd = Number(item[3]);
      } else if (item.length === 5) {
        const [expr, axis, rel, rawVal, pts] = item;
        const unit = resolveChar(expr, blueOrder, redOrder);
        if (unit) {
          const posVal = axis === 'x-pos' ? getX(unit) : getY(unit);
          const val = resolveArg(rawVal);
          result = REL[rel](posVal, val);
          if (result) ptsToAdd = Number(pts);
        }
      } else if (item.length === 7 && item[3] === 'delta') {
        const [e1, e2, axis, , rel, rawVal, pts] = item;
        const u1 = resolveChar(e1, blueOrder, redOrder);
        const u2 = resolveChar(e2, blueOrder, redOrder);
        if (u1 && u2) {
          const p1 = axis === 'x-pos' ? getX(u1) : getY(u1);
          const p2 = axis === 'x-pos' ? getX(u2) : getY(u2);
          const diff = Math.abs(p1 - p2);
          const val = resolveArg(rawVal);
          result = REL[rel](diff, val);
          if (result) ptsToAdd = Number(pts);
        }
      } else if (item.length === 4 && item[1] === 'lock') {
        const [fromExpr, , toExpr, pts] = item;
        const fromUnit = resolveChar(fromExpr, blueOrder, redOrder);
        const toUnit = resolveChar(toExpr, blueOrder, redOrder);
        if (fromUnit && toUnit) {
          const targets = computeTargetsForState({ blueOrder, redOrder });
          const target = targets.find(t => t.from === fromUnit)?.to;
          result = (target === toUnit);
          if (result) ptsToAdd = Number(pts);
        }
      } else {
        console.warn(`Unknown scoring command [${idx}]:`, item);
        result = false;
      }
    } catch (e) {
      console.error(`Scoring command [${idx}] failed:`, item, e);
      result = false;
    }
    values.push(result);
    score += ptsToAdd;
  }
  if (!bluePositionSatisfied) score = 0;
  const maxScore = rule.maxScore !== undefined ? rule.maxScore :
    (rule.scoring?.reduce((s, it) => {
      if (it.length === 5 || it.length === 7 || (it.length === 4 && it[1] === 'lock')) {
        return s + (Number(it[it.length - 1]) || 0);
      }
      if (['and', 'or', 'not', 'xor'].includes(it[0]) && it.length === 4) {
        return s + (Number(it[3]) || 0);
      }
      return s;
    }, 0) || 0);
  return {
    redMatched: true,
    blueMatched,
    score,
    maxScore,
    bluePositionSatisfied,
    recommendedBlueTeam: rule.preconditions?.team?.blue || [],
  };
}

function evaluateRule(rule) {
  return evaluateRuleForState(rule, STATE);
}

function* permutations(arr, k) {
  if (k === 0) { yield []; return; }
  for (let i = 0; i < arr.length; i++) {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
    for (const perm of permutations(rest, k - 1)) {
      yield [arr[i], ...perm];
    }
  }
}

function satisfiesBluePosition(units, bluePositionRules) {
  if (!bluePositionRules || bluePositionRules.length === 0) return true;
  for (const [short, axis, rel, val] of bluePositionRules) {
    const unit = units.find(u => u.role.short === short);
    if (!unit) return false;
    const posVal = axis === 'x-pos' ? unit.pos[1] : unit.pos[0];
    if (rel === 'equ' && posVal !== val) return false;
    if (rel === 'neq' && posVal === val) return false;
    if (rel === 'ge' && posVal < val) return false;
    if (rel === 'le' && posVal > val) return false;
  }
  return true;
}

function computeBestBluePlacementForRule(rule) {
  const blueTeamShorts = rule.preconditions?.team?.blue || [];
  if (!Array.isArray(blueTeamShorts) || blueTeamShorts.length === 0) return null;
  const roles = blueTeamShorts.map(s => ALL_ROLES.find(r => r.short === s)).filter(Boolean);
  if (roles.length === 0) return null;
  while (roles.length < 4) roles.push(roles[roles.length % roles.length]);
  roles.length = 4;
  const firstRole = roles[0];
  const tailRoles = roles.slice(1);
  const tailPerms = [...permutations(tailRoles, Math.min(3, tailRoles.length))];
  const teamVariants = tailPerms.length > 0 ? tailPerms.map(p => [firstRole, ...p]) : [[firstRole, ...tailRoles.slice(0, 3)]];
  teamVariants.forEach(t => { while (t.length < 4) t.push(firstRole); });
  const blueCells = [];
  for (let r = 0; r < 5; r++) for (let c = 0; c < 4; c++) blueCells.push([r, c]);
  let best = { score: -Infinity, units: null };
  for (const team of teamVariants) {
    for (const posPerm of permutations(blueCells, 4)) {
      const units = team.map((role, i) => ({ side: 'blue', role, pos: posPerm[i], index: i }));
      if (!satisfiesBluePosition(units, rule.bluePosition)) continue;
      const tempMap = Array(5).fill().map(() => Array(14).fill(null));
      const tempBlue = [], tempRed = STATE.redOrder.map(u => ({ ...u, pos: [...u.pos] }));
      units.forEach(u => { const [r, c] = u.pos; tempMap[r][c] = u; tempBlue.push(u); });
      tempRed.forEach(u => { const [r, c] = u.pos; if (r < 5 && c < 14) tempMap[r][c] = u; });
      const result = evaluateRuleForState(rule, { map: tempMap, blueOrder: tempBlue, redOrder: tempRed });
      if (result.score > best.score) {
        best = { score: result.score, units: units.map(u => ({ ...u, pos: [...u.pos] })) };
      }
    }
  }
  return best.score > -Infinity ? best : null;
}

window._ruleCache = {};
window._teamCache = {};

function applyTactic(arg) {
  let shortList;
  if (Array.isArray(arg)) {
    shortList = arg;
  } else if (typeof arg === 'string' && arg.startsWith('team_')) {
    shortList = window._teamCache[arg] || [];
  } else {
    shortList = [];
  }
  STATE.blueOrder.forEach(u => { const [r, c] = u.pos; STATE.map[r][c] = null; });
  STATE.blueOrder = [];
  const validRoles = [...new Set(shortList)].map(s => ALL_ROLES.find(r => r.short === s)).filter(Boolean);
  const cols = [0, 1, 2, 3], rows = [0, 1, 2, 3, 4];
  for (let i = 0; i < validRoles.length && i < 4; i++) {
    const c = cols[i % 4];
    for (let dr = 0; dr < 5; dr++) {
      const r = (rows[i] + dr) % 5;
      if (!STATE.map[r][c]) {
        const unit = { side: 'blue', role: validRoles[i], pos: [r, c], index: i, isNew: true };
        STATE.map[r][c] = unit;
        STATE.blueOrder.push(unit);
        break;
      }
    }
  }
  STATE.blueOrder.forEach((u, i) => u.index = i);
  renderMap();
  const names = validRoles.map(v => v.name).join('、');
  showNotification(`✅ 已配置阵容：${names || '（空）'}`, 'success');
}

function doOptimalPlacement(ruleId) {
  const rule = window._ruleCache[ruleId];
  if (!rule) {
    showNotification('❌ 规则缓存失效', 'error');
    return;
  }
  showNotification('🔍 正在计算最优站位（可能需 2~5 秒）…', 'info');
  setTimeout(() => {
    try {
      const best = computeBestBluePlacementForRule(rule);
      if (!best?.units) {
        showNotification('❌ 未找到有效站位', 'warning');
        return;
      }
      STATE.blueOrder.forEach(u => { const [r, c] = u.pos; STATE.map[r][c] = null; });
      STATE.blueOrder = [];
      best.units.forEach(u => {
        const [r, c] = u.pos;
        const unit = { ...u, pos: [r, c], isNew: true };
        STATE.map[r][c] = unit;
        STATE.blueOrder.push(unit);
      });
      STATE.blueOrder.forEach((u, i) => u.index = i);
      renderMap();
      const max = rule.maxScore || (rule.scoring?.reduce((s, it) => s + (it[it.length - 1] || 0), 0) || 100);
      const pct = (best.score / max * 100).toFixed(1);
      showNotification(`✅ 最优站位已部署！得分: ${best.score}/${max} (${pct}%)`, 'success');
    } catch (e) {
      console.error('站位计算失败:', e);
      showNotification('⚠️ 站位计算出错', 'error');
    }
  }, 50);
}

async function checkAllRules() {
  window._ruleCache = {};
  window._teamCache = {};
  // ===== 1. 加载所有规则 =====
  const rulePaths = [
    './rule/暗刀火龙解火龙三切.js',
    './rule/萝冰火龙解火龙三切.js',
    './rule/暗炮偶像解偶像艾丝.js',
    './rule/火龙三切解偶像暗刀.js',
    './rule/火龙三切解偶像莉耶.js',
    './rule/偶像艾弓解偶像暗刀.js',
  ];
  const allResults = [];
  for (let url of rulePaths) {
    try {
      const mod = await import(url + '?t=' + Date.now());
      const rule = mod.default;
      const result = evaluateRule(rule);
      if (result.redMatched) allResults.push({ rule, result });
    } catch (e) {
      console.warn(`规则 ${url} 加载失败:`, e.message);
    }
  }
  // ===== 2. 渲染评分面板 =====
  const scorePanel = document.getElementById('scorePanel') ||
    (() => {
      const panel = document.createElement('div');
      panel.id = 'scorePanel';
      panel.style.cssText = `
                position: fixed; top: 20px; right: 20px; max-width: 320px;
                background: white; border-radius: 12px; box-shadow: 0 6px 20px rgba(0,0,0,0.15);
                z-index: 999; font-size: 13px; display: none;
            `;
      panel.innerHTML = `
                <div style="background: linear-gradient(90deg, #1E88E5, #E53935); color: white; padding: 10px 16px;
                    font-weight: 600; border-radius: 12px 12px 0 0; display: flex; justify-content: space-between;">
                    <span><i class="fas fa-trophy"></i> 战术评分</span>
                    <button onclick="this.parentElement.parentElement.style.display='none'"
                        style="background:none; border:none; color:white; font-size:16px; cursor:pointer;">×</button>
                </div>
                <div id="scoreContent" style="padding: 12px;"></div>
            `;
      document.body.appendChild(panel);
      return panel;
    })();
  if (allResults.some(r => r.result.blueMatched)) {
    let html = '';
    allResults.filter(r => r.result.blueMatched).forEach(({ rule, result }) => {
      const pct = result.maxScore > 0 ? (result.score / result.maxScore * 100).toFixed(1) : '0.0';
      const color = pct >= 80 ? '#4CAF50' : pct >= 60 ? '#FF9800' : '#F44336';
      const isBlueFail = !result.bluePositionSatisfied;
      html += `
                <div style="margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid #eee;">
                    <div style="font-weight: 600; color: #333; margin-bottom: 6px;">
                        🎯 ${rule.name}
                        ${isBlueFail ? '<span style="color:#F44336; font-size:0.9em; margin-left:8px;">(蓝方站位未达标)</span>' : ''}
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                        <div style="width:100%; height:6px; background:#e0e0e0; border-radius:3px; overflow:hidden;">
                            <div style="height:100%; background:${isBlueFail ? '#9E9E9E' : color}; width:${isBlueFail ? '0' : pct}%; border-radius:3px;"></div>
                        </div>
                        <span style="font-weight:bold; color:${isBlueFail ? '#9E9E9E' : color}; min-width:50px; text-align:right;">
                            ${result.score}/${result.maxScore}
                        </span>
                    </div>
                    <div style="font-size:12px; color:#666;">${rule.desc || ''}</div>
                </div>
            `;
    });
    document.getElementById('scoreContent').innerHTML = html;
    scorePanel.style.display = 'block';
  } else {
    scorePanel.style.display = 'none';
  }
  // ===== 3. 渲染战术推荐面板 =====
  const orderContainer = document.querySelector('.order-container');
  let tacticPanel = document.getElementById('tacticPanel');
  if (!tacticPanel && orderContainer) {
    tacticPanel = document.createElement('div');
    tacticPanel.id = 'tacticPanel';
    tacticPanel.style.cssText = `
            display: none; margin: 20px auto; max-width: 1000px;
            background: white; border-radius: 12px; box-shadow: var(--shadow); overflow: hidden;
        `;
    tacticPanel.innerHTML = `
            <div style="background: linear-gradient(90deg, #1E88E5, #7B1FA2); color: white; padding: 14px 20px;
                font-weight: 600; display: flex; align-items: center; gap: 10px;">
                <i class="fas fa-microchip"></i>
                <span>智能战术推荐</span>
            </div>
            <div id="tacticContent" style="padding: 16px;"></div>
        `;
    orderContainer.parentNode.insertBefore(tacticPanel, orderContainer);
  }
  if (tacticPanel && allResults.length > 0) {
    let html = '';
    let ruleIdCounter = 0;
    let teamIdCounter = 0;
    allResults.forEach(({ rule, result }) => {
      const blueTeam = Array.isArray(result.recommendedBlueTeam) ? result.recommendedBlueTeam : [];
      const ruleId = 'rule_' + Date.now() + '_' + (ruleIdCounter++);
      const teamId = 'team_' + Date.now() + '_' + (teamIdCounter++);
      window._ruleCache[ruleId] = rule;
      window._teamCache[teamId] = blueTeam;

      const teamNames = blueTeam.length > 0
        ? blueTeam.map(short => {
          const role = ALL_ROLES.find(r => r.short === short);
          return role ? role.name : short;
        }).join('、')
        : '（清空现有阵容）';
      html += `
                <div style="margin-bottom: 16px; padding: 14px; border: 1px solid #eee; border-radius: 8px;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
                        <div>
                            <div style="font-weight: 600; color: #1E88E5; font-size: 1.1rem;">${rule.name}</div>
                            <div style="font-size: 0.9rem; color: #666; margin-top: 4px;">${rule.desc || ''}</div>
                        </div>
                    </div>
                    <div style="font-size: 0.95rem; margin-bottom: 12px;">推荐我方：${teamNames}</div>
                    <div style="display: flex; gap: 8px;">
                        <button class="btn btn-confirm"
                                onclick="applyTactic('${teamId}')"
                                style="flex: 1; padding: 6px 12px; font-size: 0.9rem;">
                            <i class="fas fa-bolt"></i> 一键配置
                        </button>
                        <button class="btn"
                                style="background: #6a1b9a; color: white; flex: 1; padding: 6px 12px; font-size: 0.9rem;"
                                onclick="doOptimalPlacement('${ruleId}')">
                            <i class="fas fa-magic"></i> 一键站位
                        </button>
                    </div>
                </div>
            `;
    });
    document.getElementById('tacticContent').innerHTML = html || '<div style="text-align:center; color:#999; padding:20px;">暂无战术推荐</div>';
    tacticPanel.style.display = 'block';
  } else if (tacticPanel) {
    tacticPanel.style.display = 'none';
  }
}

window.evaluateRule = evaluateRule;
window.checkAllRules = checkAllRules;
window.applyTactic = applyTactic;
window.doOptimalPlacement = doOptimalPlacement;