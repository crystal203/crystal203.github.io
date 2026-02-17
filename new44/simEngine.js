const svgNS = "http://www.w3.org/2000/svg";
const SIM_WARNING = {
    MISSING_PARAM: 'missing_param',
    NEAR_TAUNT: 'near_taunt',
    NEAR_COLLISION: 'near_collision',
    // 可扩展
};
window.SIM_WARNING = SIM_WARNING;

// --- 工具函数 ---
function lerp(a, b, t) { return a + (b - a) * t; }

function findNearestForSim(unit, candidates) {
    if (candidates.length === 0) return null;
    const [ar, ac] = unit.pos;
    return candidates.reduce((best, u) => {
        const [br, bc] = u.pos;
        const d = (ar - br) ** 2 + (ac - bc) ** 2;
        return d < best.dist ? { unit: u, dist: d } : best;
    }, { unit: null, dist: Infinity }).unit;
}

function sweptCircleCircle(startA, endA, radiusA, startB, endB, radiusB) {
    const [x1, y1] = startA;
    const [x2, y2] = endA;
    const [x3, y3] = startB;
    const [x4, y4] = endB;

    const vx = x2 - x1;
    const vy = y2 - y1;
    const rx = x3 - x1;
    const ry = y3 - y1;

    const radius = radiusA + radiusB;
    const radiusSq = radius * radius;

    const a = vx * vx + vy * vy;
    const b = 2 * (vx * rx + vy * ry);
    const c = rx * rx + ry * ry - radiusSq;

    // 判别式
    const disc = b * b - 4 * a * c;
    if (disc < 0 || a < 1e-9) return { hit: false };

    const sqrtDisc = Math.sqrt(disc);
    let t1 = (-b - sqrtDisc) / (2 * a);
    let t2 = (-b + sqrtDisc) / (2 * a);

    // 仅考虑 [0, 1] 内的 t
    if (t1 > t2) [t1, t2] = [t2, t1];
    const tEnter = Math.max(0, t1);
    if (tEnter > 1 || t2 < 0) return { hit: false };

    // 碰撞点位置
    const hitX = x1 + vx * tEnter;
    const hitY = y1 + vy * tEnter;
    const nx = (hitX - (x3 + (x4 - x3) * tEnter)) / radius;
    const ny = (hitY - (y3 + (y4 - y3) * tEnter)) / radius;

    return {
        hit: true,
        tEnter: tEnter,
        normal: [nx, ny],               // 碰撞法向（从 B 指向 A）
        point: [hitX, hitY]
    };
}

function sweptAABB(startPos, endPos, otherPos, radius = 0.4) {
    const [x1, y1] = startPos;
    const [x2, y2] = endPos;
    const [ox, oy] = otherPos;

    const dx = x2 - x1;
    const dy = y2 - y1;

    const expandedMinX = ox - radius;
    const expandedMaxX = ox + radius;
    const expandedMinY = oy - radius;
    const expandedMaxY = oy + radius;

    let tEnter = -Infinity;
    let tExit = Infinity;

    if (Math.abs(dx) < 1e-9) {
        if (x1 < expandedMinX || x1 > expandedMaxX) return { hit: false };
    } else {
        const tx1 = (expandedMinX - x1) / dx;
        const tx2 = (expandedMaxX - x1) / dx;
        const tMinX = Math.min(tx1, tx2);
        const tMaxX = Math.max(tx1, tx2);
        tEnter = Math.max(tEnter, tMinX);
        tExit = Math.min(tExit, tMaxX);
    }

    if (Math.abs(dy) < 1e-9) {
        if (y1 < expandedMinY || y1 > expandedMaxY) return { hit: false };
    } else {
        const ty1 = (expandedMinY - y1) / dy;
        const ty2 = (expandedMaxY - y1) / dy;
        const tMinY = Math.min(ty1, ty2);
        const tMaxY = Math.max(ty1, ty2);
        tEnter = Math.max(tEnter, tMinY);
        tExit = Math.min(tExit, tMaxY);
    }

    if (tEnter > tExit || tExit < 0) return { hit: false };

    const actualTEnter = Math.max(0, tEnter);
    if (actualTEnter > 1) return { hit: false };

    let nx = 0, ny = 0;
    if (tEnter === (dx >= 0 ? (expandedMinX - x1) / dx : (expandedMaxX - x1) / dx)) {
        nx = dx >= 0 ? -1 : 1;
    } else {
        ny = dy >= 0 ? -1 : 1;
    }

    return { hit: true, tEnter: actualTEnter, normal: [nx, ny] };
}

// --- 核心模拟逻辑 ---
function initSimulation() {
    const originalTargets = computeTargets();
    const simUnits = [];
    const idMap = new Map();
    const allUnits = [...STATE.blueOrder, ...STATE.redOrder];
    allUnits.forEach(unit => {
        const [r, c] = unit.pos;
        const id = `${unit.side}-${unit.index}`;
        
        const globalCfg = window.SIM_CONFIG || {};
        const enemyBonus = (unit.side !== 'blue' && unit.role.tauntRadius > 0) 
            ? (globalCfg.enemyTauntBonus || 0.05) 
            : 0;
        const effectiveTauntRadius = unit.role.tauntRadius + enemyBonus;

        let collisionSize = globalCfg.collisionSize || 0.8; // 默认 0.8
        if (unit.role.short === "Beth") collisionSize = 0;
        const role = {
            ...unit.role,
            resistA: unit.role.resistA ?? 1,
            resistB: unit.role.resistB ?? 2,
            resistC: unit.role.resistC ?? Infinity,
            tauntRadius: effectiveTauntRadius,
            collisionSize: collisionSize,
        };
        let _tauntTime = 10;
        if (unit.role.short === "Daisy") _tauntTime = 1;
        const simUnit = {
            id,
            index: unit.index,
            side: unit.side,
            role,
            pos: [r + 0.5, c + 0.5],
            oldPos: [r + 0.5, c + 0.5],
            vel: [0, 0],
            target: null,
            originalTarget: null,
            markers: [0, 0, 0, 0],
            state: 'MOVING',
            skillTimer: 0,
            dashTimer: 0,
            dashDuration: 0,
            dashStartPos: null,
            dashEndPos: null,
            tauntActive: false,
            lastTauntTime: -10,
            hasUsedSkill: false,
            tauntTime: _tauntTime,
            startDelay: unit.role.startDelay || 0,
            remainingDelay: unit.role.startDelay || 0,
        };
        simUnits.push(simUnit);
        idMap.set(id, simUnit);
    });
    originalTargets.forEach(({ from, to }) => {
        const fromId = `${from.side}-${from.index}`;
        const toId = `${to.side}-${to.index}`;
        const fromSim = idMap.get(fromId);
        const toSim = idMap.get(toId);
        if (fromSim && toSim) {
            fromSim.target = toSim;
            fromSim.originalTarget = toSim;
        }
    });
    return { simUnits, idMap, time: 0, isRunning: true };
}

function applyTaunt(tank, allUnits) {
    allUnits.forEach(u => {
        if (u.side === tank.side) return;
        const dx = u.pos[1] - tank.pos[1];
        const dy = u.pos[0] - tank.pos[0];
        const dist = Math.hypot(dx, dy);
        const effectiveRadius = tank.role.tauntRadius;
        if (dist <= effectiveRadius + 1e-5 && !u._tauntedThisFrame.has(tank.id)) {
            u.markers[tank.index] += 1;
            u._tauntedThisFrame.add(tank.id);
        }
    });
}

function startDash(unit, simUnits) {
    if (!unit.target) return;
    const [tx, ty] = unit.target.pos;
    const [ux, uy] = unit.pos;
    const dx = ty - uy;
    const dy = tx - ux;
    const dist = Math.hypot(dx, dy);
    if (dist < 1e-6 || dist > unit.role.skillRange + 1) {
        unit.state = 'MOVING';
        return;
    }
    const dashDist = Math.min(unit.role.skillDashDist, dist - unit.role.reach);
    const nx = dx / dist;
    const ny = dy / dist;
    unit.dashStartPos = [...unit.pos];
    unit.dashEndPos = [
        ux + ny * dashDist,
        uy + nx * dashDist
    ];
    unit.dashDuration = dashDist / unit.role.skillDashSpeed;
    unit.dashTimer = unit.dashDuration;
    unit.state = 'DASHING';
}

// --- 主循环 ---
function tick(simState, dt = 1/12) {
    const { simUnits, time } = simState;

    if (simState.time === 0) {
        const missingParams = [];
        simUnits.forEach(u => {
            const r = u.role;
            if (r.speed <= 1.01) {
                missingParams.push(`${u.role.name}(${u.side})`);
            }
        });
        if (missingParams.length > 0) {
            showSimulationWarning(
                `⚠️ 角色参数缺失：${missingParams.join(', ')} 缺少必要模拟参数（speed/reach/resist）`,
                SIM_WARNING.MISSING_PARAM
            );
        }
    }
    simUnits.forEach(u => {
        u._tauntedThisFrame = new Set();
        u.oldPos = [...u.pos];
        u.vel = [0, 0];
        if (u.remainingDelay > 0) {
            u.remainingDelay -= dt;
            if (u.remainingDelay <= 0) {
                u.remainingDelay = 0;
                if (u.state === 'DELAYED') {
                    u.state = 'MOVING';
                }
            } else {
                u.state = 'DELAYED'; 
                u.vel = [0, 0];
                return; 
            }
        }
    });

    simUnits.forEach(u => {
        if (u.state === 'CASTING') {
            u.skillTimer -= dt;
            if (u.skillTimer <= 0) {
                u.hasUsedSkill = true;
                startDash(u, simUnits);
            }
        }
        if (u.state === 'DASHING') {
            u.dashTimer -= dt;
            const prev = [...u.pos];
            let newPos;
            if (u.dashTimer <= 0) {
                newPos = [...u.dashEndPos];
            } else {
                const t = 1 - u.dashTimer / u.dashDuration;
                newPos = [
                    lerp(u.dashStartPos[0], u.dashEndPos[0], t),
                    lerp(u.dashStartPos[1], u.dashEndPos[1], t)
                ];
            }

            const [nr, nc] = newPos;
            let collided = false;
            const globalCfg = window.SIM_CONFIG || {};
            const useAdvanced = globalCfg.useAdvancedCollision === true;

            for (const other of simUnits) {
                if (other === u || other.side === u.side) continue;

                let overlap = false;
                if (useAdvanced) {
                    const radiusA = u.role.collisionSize / 2;
                    const radiusB = other.role.collisionSize / 2;
                    const dx = nr - other.pos[0];
                    const dy = nc - other.pos[1];
                    const distSq = dx * dx + dy * dy;
                    overlap = distSq < (radiusA + radiusB) * (radiusA + radiusB);
                } else {
                    const radius = (u.role.collisionSize + other.role.collisionSize) / 4;
                    const overlapR = radius * 2 - Math.abs(nr - other.pos[0]);
                    const overlapC = radius * 2 - Math.abs(nc - other.pos[1]);
                    overlap = overlapR > 1e-6 && overlapC > 1e-6;
                }

                if (overlap) {
                    collided = true;
                    break;
                }
            }

            /*if (!collided && u.target) {
                const [tr, tc] = u.target.pos;
                const [nr, nc] = newPos;
                const dist = Math.hypot(tr - nr, tc - nc);
                if (dist <= u.role.reach + 1e-4) {
                    u.pos = [...newPos];
                    //u.state = 'LOCKED';
                }
            }*/

            if (collided) {
                u.pos = [...prev];
                u.state = 'MOVING';
            } else {
                u.pos = [...newPos];
                u.vel = [u.pos[0] - prev[0], u.pos[1] - prev[1]];
                if (u.dashTimer <= 0) {
                    u.state = 'MOVING';
                }
            }
        }
    });

    simUnits.filter(u => u.state === 'MOVING').forEach(u => {
        if (!u.target) return;

        const [ux, uy] = u.pos;
        const dx = u.target.pos[1] - uy;
        const dy = u.target.pos[0] - ux;
        const dist = Math.hypot(dx, dy);

        /*if (dist <= u.role.reach + 1e-4) {
            u.state = 'LOCKED';
            return;
        }*/

        if (u.role.skillRange > 0 && !u.hasUsedSkill && dist <= u.role.skillRange && u.skillTimer <= 0) {
            u.state = 'CASTING';
            u.skillTimer = u.role.skillCastTime;
            for (let i = 0; i < 4; ++i) {
                if (u.markers[i] >= u.role.resistC) {
                    const tank = simUnits.filter(t =>
                        t.side !== u.side &&
                        t.index === i
                    );
                    if (tank.length > 0) {
                        const newTarget = findNearestForSim(u, tank);
                        if (newTarget) u.target = newTarget;
                    }
                }
            }
            if (u.role.tauntRadius > 0) {
                u.tauntActive = true;
                u.lastTauntTime = time;
                const tauntRadius = u.role.tauntRadius;
                simUnits.forEach(enemy => {
                    if (enemy.side === u.side) return;
                    const dx = enemy.pos[1] - u.pos[1];
                    const dy = enemy.pos[0] - u.pos[0];
                    const dist = Math.hypot(dx, dy);
                    const eps = 0.25; // 临界阈值，可调
                    if (Math.abs(dist - tauntRadius) < eps) {
                        const isInside = dist < tauntRadius;
                        showSimulationWarning(
                            `❗ ${enemy.role.name}(${enemy.side}) 与 ${u.role.name}(${u.side}) 距离 ${dist.toFixed(3)}，`
                            + `嘲讽半径 ${tauntRadius} → ${isInside ? '被嘲讽' : '未被嘲讽'}（临界）`,
                            SIM_WARNING.NEAR_TAUNT
                        );
                    }
                });
                applyTaunt(u, simUnits);

                if (!(u.target.role.tauntRadius > 0 && u.target.tauntActive)) {
                    let oldTarget = u.target;
                    const blueEnemies = simUnits.filter(u => u.side === 'red');
                    const redEnemies = simUnits.filter(u => u.side === 'blue');
                    const enemies = u.side === 'blue' ? blueEnemies : redEnemies ;
                    const lockedByAllies = new Set();
                    for (const other of simUnits) {
                        if (other !== u && other.side === u.side && other.target && enemies.includes(other.target)) {
                            lockedByAllies.add(other.target);
                        }
                    }
                    const unlockedEnemies = enemies.filter(enemy => !lockedByAllies.has(enemy));
                    if (unlockedEnemies.length > 0) {
                        u.target = findNearestForSim(u, unlockedEnemies);
                    } else {
                        if (!u.target || !enemies.includes(u.target)) {
                            u.target = findNearestForSim(u, enemies);
                        }
                    }
                    if (oldTarget !== u.target) {
                        showSimulationWarning(
                            `❗ ${u.role.name}(${u.side}) 的索敌发生了变化（跳空锁）`
                        );
                    }
                }
            }
            return;
        }

        const speed = u.role.speed;
        const intendedMoveDist = speed * dt;
        const moveDist = Math.min(intendedMoveDist, dist - u.role.reach);
        if (moveDist <= 0) return;

        const nx = dx / dist;
        const ny = dy / dist;
        const intendedEnd = [
            ux + ny * moveDist,
            uy + nx * moveDist
        ];

        let finalEnd = intendedEnd;
        let minT = 1.0;
        let finalNormal = null;

        const globalCfg = window.SIM_CONFIG || {};
        const useAdvanced = globalCfg.useAdvancedCollision === true;

        for (const other of simUnits) {
            if (other === u || other.side === u.side) continue;
            let sweep;
            if (useAdvanced) {
                const radiusA = u.role.collisionSize / 2;
                const radiusB = other.role.collisionSize / 2;
                sweep = sweptCircleCircle(
                    u.pos, intendedEnd, radiusA,
                    other.pos, other.oldPos, radiusB  
                );
            } else {
                const radius = (u.role.collisionSize + other.role.collisionSize) / 4;
                sweep = sweptAABB(u.pos, intendedEnd, other.pos, radius);
            }

            if (sweep.hit && sweep.tEnter < minT) {
                minT = sweep.tEnter;
                finalNormal = sweep.normal;
            }
        }

        if (minT < 1.0) {
            finalEnd = [
                lerp(ux, intendedEnd[0], minT),
                lerp(uy, intendedEnd[1], minT)
            ];
            if (useAdvanced && finalNormal) {
                const [nx, ny] = finalNormal;
                const vx = finalEnd[0] - ux;
                const vy = finalEnd[1] - uy;

                const dot = vx * nx + vy * ny;
                const normalVx = dot * nx;
                const normalVy = dot * ny;

                const tangentVx = vx - normalVx;
                const tangentVy = vy - normalVy;
                const frictionCoef = 0.95;
                const finalVx = normalVx + tangentVx * frictionCoef;
                const finalVy = normalVy + tangentVy * frictionCoef;

                finalEnd = [ux + finalVx, uy + finalVy];
            }
        }
        u.vel = [finalEnd[0] - ux, finalEnd[1] - uy]; 
        u.pos = finalEnd;                           
    });

    
    simUnits.filter(u => u.tauntActive).forEach(u => {
        const elapsed = time - u.lastTauntTime;
        if (elapsed >= u.tauntTime) {
            const count = Math.floor(elapsed / 1.0);
            for (let i = 0; i < count; i++) {
                applyTaunt(u, simUnits);
            }
            u.lastTauntTime += count * 1.0;
        }
    });
    const allLocked = simUnits.every(u => u.state === 'LOCKED' || !u.target);
    if (allLocked || simState.time >= 4.0) {
        simState.isRunning = false;
    }
    simState.time += dt;
}

// --- 可视化 ---
function renderSimulation(simState) {
    const overlay = document.getElementById('simOverlay');
    if (!overlay || !mapEl) return;
    const mapContainer = document.querySelector('.map-container');
    const mapRect = mapEl.getBoundingClientRect();
    const containerRect = mapContainer.getBoundingClientRect();
    const offsetX = mapRect.left - containerRect.left;
    const offsetY = mapRect.top - containerRect.top;
    const cellGap = 4;
    const cellW = (mapRect.width - cellGap * 13) / 14;
    const cellH = (mapRect.height - cellGap * 4) / 5;

    const avatarScale = 0.8;
    const avatarSize = avatarScale * Math.min(cellW, cellH);

    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");
    svg.setAttribute("viewBox", `0 0 ${containerRect.width} ${containerRect.height}`);

    const defs = document.createElementNS(svgNS, "defs");
    const createMarker = (id, color) => {
        const marker = document.createElementNS(svgNS, "marker");
        marker.setAttribute("id", id);
        marker.setAttribute("markerWidth", "6");
        marker.setAttribute("markerHeight", "5");
        marker.setAttribute("refX", "6");
        marker.setAttribute("refY", "2.5");
        marker.setAttribute("orient", "auto");
        const poly = document.createElementNS(svgNS, "polygon");
        poly.setAttribute("points", "0 0, 6 2.5, 0 5");
        poly.setAttribute("fill", color);
        marker.appendChild(poly);
        return marker;
    };
    defs.append(
        createMarker("blueArrow", "#1E88E5"),
        createMarker("redArrow", "#E53935")
    );
    svg.appendChild(defs);

    simState.simUnits.forEach(u => {
        const [r, c] = u.pos;
        const x = offsetX + (c - 0.5) * (cellW + cellGap) + cellGap / 2;
        const y = offsetY + (r - 0.5) * (cellH + cellGap) + cellGap / 2;

        // 圆点（底层）
        const circle = document.createElementNS(svgNS, "circle");
        circle.setAttribute("cx", x);
        circle.setAttribute("cy", y);
        circle.setAttribute("r", avatarSize * 0.5);
        circle.setAttribute("fill", u.side === 'blue' ? "#1E88E5" : "#E53935");
        circle.setAttribute("stroke", "white");
        circle.setAttribute("stroke-width", "1.2");
        svg.appendChild(circle);

        // 头像
        const img = document.createElementNS(svgNS, "image");
        img.setAttribute("x", x - avatarSize / 2);
        img.setAttribute("y", y - avatarSize / 2);
        img.setAttribute("width", avatarSize);
        img.setAttribute("height", avatarSize);
        img.setAttribute("href", `./asset/${u.role.short}.png`);
        img.setAttribute("preserveAspectRatio", "xMidYMid slice");
        img.addEventListener('error', () => {
            img.remove();
            const fallback = document.createElementNS(svgNS, "text");
            fallback.setAttribute("x", x);
            fallback.setAttribute("y", y + avatarSize * 0.25);
            fallback.setAttribute("font-size", `${avatarSize * 0.5}px`);
            fallback.setAttribute("text-anchor", "middle");
            fallback.setAttribute("fill", "white");
            fallback.setAttribute("font-weight", "bold");
            fallback.setAttribute("pointer-events", "none");
            fallback.textContent = u.role.short.substring(0, 2).toUpperCase();
            svg.appendChild(fallback);
        });
        svg.appendChild(img);

        // 标记数
        let markerCount = 0;
        for (let i = 0; i < 4; ++i) {
            if (u.markers[i] > 0) {
                const text = document.createElementNS(svgNS, "text");
                text.setAttribute("x", x + avatarSize * 0.7 + markerCount * avatarSize);
                text.setAttribute("y", y - avatarSize * 0.7);
                text.setAttribute("font-size", `${avatarSize * 0.75}px`);
                if (markerCount == 0) text.setAttribute("fill", "#FF5722");
                else text.setAttribute("fill", "#57FF22");
                text.setAttribute("font-weight", "bold");
                text.textContent = `×${u.markers[i]}`;
                svg.appendChild(text);
                markerCount++;
            }
        }


        // 嘲讽圈
        if (u.tauntActive && u.role.tauntRadius > 0) {
            const radiusPx = u.role.tauntRadius * (cellW + cellGap);
            const ring = document.createElementNS(svgNS, "circle");
            ring.setAttribute("cx", x);
            ring.setAttribute("cy", y);
            ring.setAttribute("r", radiusPx);
            ring.setAttribute("fill", "none");
            ring.setAttribute("stroke", "#FF9800");
            ring.setAttribute("stroke-width", "1.5");
            ring.setAttribute("stroke-dasharray", "3,3");
            svg.appendChild(ring);
        }

        // 箭头
        if (u.target) {
            const [tr, tc] = u.target.pos;
            const tx = offsetX + (tc - 0.5) * (cellW + cellGap) + cellGap / 2;
            const ty = offsetY + (tr - 0.5) * (cellH + cellGap) + cellGap / 2;
            const path = document.createElementNS(svgNS, "path");
            path.setAttribute("d", `M ${x} ${y} L ${tx} ${ty}`);
            path.setAttribute("stroke", u.side === 'blue' ? "#1E88E5" : "#E53935");
            path.setAttribute("stroke-width", "1.2");
            path.setAttribute("stroke-linecap", "round");
            path.setAttribute("marker-end", `url(#${u.side}Arrow)`);
            svg.appendChild(path);
        }
    });

    overlay.innerHTML = '';
    overlay.appendChild(svg);
}

// --- 暴露接口 ---
window.renderSimulation = renderSimulation;
window.initSimulation = initSimulation;
window.tick = tick;