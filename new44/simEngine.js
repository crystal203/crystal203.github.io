const svgNS = "http://www.w3.org/2000/svg";

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

function sweptAABB(startPos, endPos, otherPos, radius = 0.4) {
    const [x1, y1] = startPos;
    const [x2, y2] = endPos;
    const [ox, oy] = otherPos;

    const dx = x2 - x1;
    const dy = y2 - y1;

    const expandedMinX = ox - radius - radius; 
    const expandedMaxX = ox + radius + radius; 
    const expandedMinY = oy - radius - radius;
    const expandedMaxY = oy + radius + radius;

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
        const effectiveTauntRadius = (unit.side !== 'blue' && unit.role.tauntRadius > 0)
            ? unit.role.tauntRadius + 0.05
            : unit.role.tauntRadius;

        const role = {
            ...unit.role,
            resistA: unit.role.resistA ?? 1,
            resistB: unit.role.resistB ?? 2,
            resistC: unit.role.resistC ?? Infinity,
            tauntRadius: effectiveTauntRadius  
        };
        const simUnit = {
            id,
            side: unit.side,
            role,
            pos: [r + 0.5, c + 0.5],
            oldPos: [r + 0.5, c + 0.5],
            vel: [0, 0],
            target: null,
            originalTarget: null,
            markers: 0,
            state: 'MOVING',
            skillTimer: 0,
            dashTimer: 0,
            dashDuration: 0,
            dashStartPos: null,
            dashEndPos: null,
            tauntActive: false,
            lastTauntTime: -10,
            hasUsedSkill: false,
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
        const effectiveRadius = tank.role.tauntRadius + 0.5;
        if (dist <= effectiveRadius + 1e-5 && !u._tauntedThisFrame.has(tank.id)) {
            u.markers += 1;
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
    if (dist < 1e-6) return;
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

function updateTargetsBasedOnMarkers(simUnits) {
    const blueEnemies = simUnits.filter(u => u.side === 'red');
    const redEnemies = simUnits.filter(u => u.side === 'blue');
    simUnits.forEach(u => {
        if (u.role.tauntRadius <= 0) {
            const tanks = simUnits.filter(t =>
                t.side !== u.side && t.role.tauntRadius > 0 && t.tauntActive
            );
            if (tanks.length === 0) return;
            if (u.markers >= u.role.resistB) {
                u.target = findNearestForSim(u, tanks);
                if (u.state !== 'LOCKED') u.state = 'MOVING';
            } else if (u.state === 'LOCKED' && u.markers >= u.role.resistA) {
                u.target = findNearestForSim(u, tanks);
                u.state = 'MOVING';
            }
        } else if (u.tauntActive) {
            const enemies = u.side === 'blue' ? blueEnemies : redEnemies ;
            const lockedByAllies = new Set();
            for (const other of simUnits) {
                if (other.side === u.side && other.target && enemies.includes(other.target)) {
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
        }
    });
}

// --- 主循环 ---
function tick(simState, dt = 1/12) {
    const { simUnits, time } = simState;
    simUnits.forEach(u => {
        u._tauntedThisFrame = new Set();
        u.oldPos = [...u.pos];
        u.vel = [0, 0];
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

            let collided = false;
            for (const other of simUnits) {
                if (other === u || other.side === u.side || !other.target) continue;
                const [or, oc] = other.pos;
                const [nr, nc] = newPos;
                const overlapR = 0.8 - Math.abs(nr - or);
                const overlapC = 0.8 - Math.abs(nc - oc);
                if (overlapR > 1e-6 && overlapC > 1e-6) {
                    collided = true;
                    break;
                }
            }

            if (!collided && u.target) {
                const [tr, tc] = u.target.pos;
                const [nr, nc] = newPos;
                const dist = Math.hypot(tr - nr, tc - nc);
                if (dist <= u.role.reach + 1e-4) {
                    u.pos = [...newPos];
                    u.state = 'LOCKED';
                }
            }

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

        if (dist <= u.role.reach + 1e-4) {
            u.state = 'LOCKED';
            return;
        }

        if (u.role.skillRange > 0 && !u.hasUsedSkill && dist <= u.role.skillRange && u.skillTimer <= 0) {
            u.state = 'CASTING';
            u.skillTimer = u.role.skillCastTime;
            if (u.markers >= u.role.resistC) {
                const tanks = simUnits.filter(t =>
                    t.side !== u.side &&
                    t.role.tauntRadius > 0 &&
                    t.tauntActive
                );
                if (tanks.length > 0) {
                    const newTarget = findNearestForSim(u, tanks);
                    if (newTarget) {
                        u.target = newTarget;
                    }
                }
            }
            if (u.role.tauntRadius > 0) {
                u.tauntActive = true;
                u.lastTauntTime = time;
                applyTaunt(u, simUnits);
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

        for (const other of simUnits) {
            if (other === u || other.side === u.side || !other.target) continue;

            const isSolid = other.state !== 'MOVING' || 
                            Math.hypot(other.vel[0], other.vel[1]) < 1e-4;

            if (!isSolid) continue;

            const sweep = sweptAABB(u.pos, intendedEnd, other.pos, 0.1); 
            if (sweep.hit && sweep.tEnter < minT) {
                minT = sweep.tEnter;
            }
        }

        if (minT < 1.0) {
            finalEnd = [
                lerp(ux, intendedEnd[0], minT),
                lerp(uy, intendedEnd[1], minT)
            ];
        }

        u.vel = [finalEnd[0] - ux, finalEnd[1] - uy];
        u.pos = finalEnd;

        const [tr, tc] = u.target.pos;
        const newDist = Math.hypot(tr - u.pos[0], tc - u.pos[1]);
        if (newDist <= u.role.reach + 1e-4) {
            u.state = 'LOCKED';
        }
    });

    
    simUnits.filter(u => u.tauntActive).forEach(u => {
        const elapsed = time - u.lastTauntTime;
        if (elapsed >= 1.0) {
            const count = Math.floor(elapsed / 1.0);
            for (let i = 0; i < count; i++) {
                applyTaunt(u, simUnits);
            }
            u.lastTauntTime += count * 1.0;
        }
    });
    if (simState.time >= 4.0) {
        simUnits.filter(u => u.role.reach > 1 && u.target).forEach(u => {
            const [ur, uc] = u.pos;
            const [tr, tc] = u.target.pos;
            const dx = tc - uc; 
            const dy = tr - ur;  
            const dist = Math.hypot(dx, dy);
            const reach = u.role.reach;
            const lowerBound = 0.5 * reach;
            const upperBound = 0.7 * reach;
            if (dist < lowerBound) {
                const nx = dx / (dist || 1e-6);
                const ny = dy / (dist || 1e-6); 
                const backoffSpeed = u.role.speed * 0.7;  
                const dt = 1/12;  
                const deltaR = -ny * backoffSpeed * dt;
                const deltaC = -nx * backoffSpeed * dt;
                let newR = ur + deltaR;
                let newC = uc + deltaC;

                newR = Math.max(0.5, Math.min(4.5, newR));
                newC = Math.max(0.5, Math.min(13.5, newC));

                const actualDeltaR = newR - ur;
                const actualDeltaC = newC - uc;
                const actualBackDist = Math.hypot(actualDeltaR, actualDeltaC);

                if (actualBackDist > 1e-6) {
                    u.oldPos = [ur, uc];
                    u.pos = [newR, newC];
                    u.vel = [actualDeltaR, actualDeltaC];

                    if (u.state === 'LOCKED') {
                        u.state = 'MOVING';
                    }
                }
            }
        });
    }
    const allLocked = simUnits.every(u => u.state === 'LOCKED' || !u.target);
    if (allLocked) {
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
        if (u.markers > 0) {
            const text = document.createElementNS(svgNS, "text");
            text.setAttribute("x", x + avatarSize * 0.7);
            text.setAttribute("y", y - avatarSize * 0.7);
            text.setAttribute("font-size", `${avatarSize * 0.75}px`);
            text.setAttribute("fill", "#FF5722");
            text.setAttribute("font-weight", "bold");
            text.textContent = `×${u.markers}`;
            svg.appendChild(text);
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