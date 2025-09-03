// Space Game
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// Ship pixel art (16x16)
// Load SVG ship image
const shipImg = new Image();
shipImg.src = 'ship.svg';

// Load SVG engine fire image
const engineFireImg = new Image();
engineFireImg.src = 'engine-fire.svg';

// Ship state
// Ship position is always at world coordinates (not canvas)
let ship = {
    x: 0,
    y: 0,
    angle: 0,
    velocity: 0,
    vx: 0,
    vy: 0,
    radius: 16,
    thrust: 0.15,
    friction: 0.99,
    maxSpeed: 6,
    // frames remaining while the ship phases in after respawn
    spawnTimer: 0
};

// Remember where the ship was when it was destroyed so we can respawn there
let savedShipPos = null;

// Controls
let keys = {
    up: false,
    left: false,
    right: false,
    space: false
};

// Pause state
let paused = false;

// Plasma balls
let plasma = [];
let plasmaSpeed = 8;
const plasmaRadius = 4;
// Load SVG for plasma bolt
const plasmaImg = new Image();
plasmaImg.src = 'plasma.svg';
// Load player firing sound (single play, no loop)
const playerSound = new Audio('PlayerSound.flac');
playerSound.preload = 'auto';
playerSound.loop = false;

// Some browsers block audio until a user gesture; prime sounds on first gesture so the
// initial player shots play immediately. This will attempt to play & pause each sound
// once on the first key or pointer event and then remove the listeners.
let _audioUnlocked = false;
function _unlockAudioOnce() {
    if (_audioUnlocked) return;
    _audioUnlocked = true;
    try {
        const p = playerSound.cloneNode();
        p.play().then(() => { try { p.pause(); p.currentTime = 0; } catch (e) { } }).catch(() => { });
    } catch (e) { }
    try {
        const s = stationSound.cloneNode();
        s.play().then(() => { try { s.pause(); s.currentTime = 0; } catch (e) { } }).catch(() => { });
    } catch (e) { }
    try {
        const x = explosionSound.cloneNode();
        x.play().then(() => { try { x.pause(); x.currentTime = 0; } catch (e) { } }).catch(() => { });
    } catch (e) { }
    // Ensure background music starts on user gesture if it wasn't allowed earlier
    try {
        music.play().catch(() => {
            try { music.currentTime = 0; music.play().catch(() => { }); } catch (e) { }
        });
    } catch (e) { }
    window.removeEventListener('keydown', _unlockAudioOnce);
    window.removeEventListener('pointerdown', _unlockAudioOnce);
}
window.addEventListener('keydown', _unlockAudioOnce, { once: true });
window.addEventListener('pointerdown', _unlockAudioOnce, { once: true });

// Load player firing sound (single play, no loop)
const stationSound = new Audio('PlayerSound.flac');
stationSound.preload = 'auto';
stationSound.loop = false;

// Background music (loop)
const music = new Audio('Music.mp3');
music.preload = 'auto';
music.loop = true;
// Try to start music immediately; if the browser blocks autoplay this will be
// handled by the unlock helper below which will call play after a user gesture.
try { music.play().catch(() => { }); } catch (e) { }


// Load SVG station image and station-related constants (moved up so functions that run at load can use them)
const stationImg = new Image();
stationImg.src = 'station.svg';
// Spawn effect SVG for stations (used during 1s phase-in)
const stationSpawnImg = new Image();
stationSpawnImg.src = 'station-spawn.svg';
// Ship spawn effect SVG (phase-in)
const shipSpawnImg = new Image();
shipSpawnImg.src = 'ship-spawn.svg';
const stationRadius = 30;
const stationFireRate = 60; // frames
let stationShots = [];
let stationShotSpeed = 5;
const stationShotRadius = 5;
// Load SVG for station shot
const stationShotImg = new Image();
stationShotImg.src = 'station-shot.svg';

// Hostile stations
// Level
let level = 1;
function updateLevelDisplay() {
    const el = document.getElementById('levelDisplay');
    if (el) el.textContent = `Level: ${level}`;
}

// Base values that are adjusted by level
let globalStationBaseSpeed = 1.5;

function applyLevelScaling() {
    // Stations get noticeably faster each level
    globalStationBaseSpeed = 1.2 + (level - 1) * 0.25;
    // Station shots get faster with level
    stationShotSpeed = 4 + (level - 1) * 0.5;
    // Player plasma scales with level (so player firepower keeps pace)
    plasmaSpeed = 7 + (level - 1) * 0.6;
    // Ship handling slightly improves with level (small bump)
    ship.thrust = 0.12 + (level - 1) * 0.015;
    ship.maxSpeed = 6 + (level - 1) * 0.25;
    // Update existing stations to match the new level scaling
    for (let s of stations) {
        s.speed = globalStationBaseSpeed + Math.random() * 0.5;
        s.fireRate = Math.max(20, stationFireRate - Math.floor((level - 1) * 3));
    }
}

function randomStationPos() {
    // Place station randomly within 0-1 screen lengths from the player
    const screenLen = Math.max(canvas.width, canvas.height) || 800;
    let distFromPlayer = Math.random() * screenLen; // 0 .. 1 screen lengths
    let ang = Math.random() * Math.PI * 2;
    let speed = globalStationBaseSpeed + Math.random() * 0.5;
    return {
        x: ship.x + Math.cos(ang) * distFromPlayer,
        y: ship.y + Math.sin(ang) * distFromPlayer,
        // start with a randomized cooldown so stations don't all fire in sync
        cooldown: Math.floor(Math.random() * stationFireRate),
        // spawnTimer frames: when >0 the station is phasing in and should not act
        spawnTimer: 60, // 60 frames = ~1 second at 60fps
        // base speed scales with level; add a small random variance
        speed: speed,
        // per-station velocity (used for wandering when player is dead)
        vx: Math.cos(ang) * speed * 0.6,
        vy: Math.sin(ang) * speed * 0.6,
        // which direction the station's turret/gun is currently facing (radians)
        gunAngle: ang,
        // how quickly the station can rotate its turret (0..1, larger is faster)
        gunTurnRate: 0.18,
    // visual spin angle (radians) for perpetual rotation
    spinAngle: Math.random() * Math.PI * 2,
    // visual spin speed (radians per frame) - increased range to be more noticeable
    spinSpeed: (Math.random() * 0.06 + 0.02),
        // tactical state: idle/tracking/burst
        state: 'idle',
        // number of shots remaining in the current burst
        burstRemaining: 0,
        // frames until next shot within a burst
        shotTimer: 0,
        // Fire rate decreases (faster firing) with level, clamped
        fireRate: Math.max(20, stationFireRate - Math.floor((level - 1) * 3))
    };
}
let stations = [randomStationPos()];

// Load SVG explosion image
const explosionImg = new Image();
explosionImg.src = 'explosion.svg';

// Explosion sound (play once per explosion)
const explosionSound = new Audio('Explosion.wav');
explosionSound.preload = 'auto';
explosionSound.loop = false;

let explosions = [];
// Separate explosion used for the player ship so it can be removed when its animation ends
let shipExplosion = null;

// Camera offset
let camera = { x: 0, y: 0 };

// Dynamic, tiled star field so stars exist everywhere without storing a huge array.
// Instead of keeping all stars in memory we deterministically generate a small
// set of stars per tiled cell around the camera using a hashed PRNG. This
// makes the starfield appear infinite and stable as the camera/ship moves.
const STAR_COLORS = ['#fff', '#bbf', '#88f', '#eef', '#ccf'];
// Number of stars per tile cell (tune for density).
const STARS_PER_CELL = 40;
// Size of each tile in world pixels. Larger => fewer PRNG calls but coarser distribution.
const STAR_TILE_SIZE = 800;

// Simple integer hash to produce a deterministic seed from cell coords
function cellSeed(cx, cy) {
    // mix coordinates into a 32-bit integer
    let n = cx * 374761393 + cy * 668265263;
    n = (n ^ (n >>> 13)) >>> 0;
    return n;
}

// Small PRNG (Mulberry32) seeded with a 32-bit integer
function mulberry32(a) {
    return function() {
        a |= 0;
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function drawBackground() {
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Determine world bounds we need to cover (add small padding so stars don't pop at edges)
    const pad = 64;
    const left = camera.x - pad;
    const top = camera.y - pad;
    const right = camera.x + canvas.width + pad;
    const bottom = camera.y + canvas.height + pad;

    // Determine which tile cells intersect the visible area
    const cellLeft = Math.floor(left / STAR_TILE_SIZE);
    const cellRight = Math.floor(right / STAR_TILE_SIZE);
    const cellTop = Math.floor(top / STAR_TILE_SIZE);
    const cellBottom = Math.floor(bottom / STAR_TILE_SIZE);

    for (let cy = cellTop; cy <= cellBottom; cy++) {
        for (let cx = cellLeft; cx <= cellRight; cx++) {
            // seed per cell
            const seed = cellSeed(cx, cy);
            const rand = mulberry32(seed);
            for (let i = 0; i < STARS_PER_CELL; i++) {
                // position inside this cell
                const localX = rand() * STAR_TILE_SIZE;
                const localY = rand() * STAR_TILE_SIZE;
                const worldX = cx * STAR_TILE_SIZE + localX;
                const worldY = cy * STAR_TILE_SIZE + localY;

                // small variation in radius and color
                const r = 0.5 + rand() * 1.5;
                const color = STAR_COLORS[Math.floor(rand() * STAR_COLORS.length)];

                const sx = worldX - camera.x;
                const sy = worldY - camera.y;
                if (sx >= -10 && sx <= canvas.width + 10 && sy >= -10 && sy <= canvas.height + 10) {
                    ctx.beginPath();
                    ctx.arc(sx, sy, r, 0, Math.PI * 2);
                    ctx.fillStyle = color;
                    ctx.globalAlpha = 0.75;
                    ctx.fill();
                    ctx.globalAlpha = 1.0;
                }
            }
        }
    }
}

// Input
window.addEventListener('keydown', e => {
    if (e.code === 'ArrowUp') keys.up = true;
    if (e.code === 'ArrowLeft') keys.left = true;
    if (e.code === 'ArrowRight') keys.right = true;
    if (e.code === 'Space') keys.space = true;
    if (e.code === 'Escape') {
        paused = !paused;
        // prevent default to avoid exiting full-screen or other browser actions
        e.preventDefault();
    }
});
window.addEventListener('keyup', e => {
    if (e.code === 'ArrowUp') keys.up = false;
    if (e.code === 'ArrowLeft') keys.left = false;
    if (e.code === 'ArrowRight') keys.right = false;
    if (e.code === 'Space') keys.space = false;
});

function drawShip(x, y, angle) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    // Draw engine fire if moving forward
    if (keys.up) {
        // Fire is drawn at the rear (left side, negative X in ship's local space)
        ctx.save();
        ctx.translate(-36, 0); // move fire just a tad further back
        ctx.rotate(-Math.PI / 2); // rotate fire to match ship orientation
        ctx.drawImage(engineFireImg, -8, 8, 16, 24);
        ctx.restore();
    }
    ctx.drawImage(shipImg, -16, -16, 32, 32);
    ctx.restore();
}

// Draw ship with spawn overlay centered on-screen (used when ship.spawnTimer > 0)
function drawShipWithSpawn(x, y, angle) {
    // draw ship normally but with fade based on spawn progress
    if (ship.spawnTimer && ship.spawnTimer > 0) {
        const total = 60;
        const t = Math.max(0, Math.min(1, (total - ship.spawnTimer) / total));
        // draw spawn glow behind ship
        ctx.save();
        ctx.translate(x, y);
        ctx.globalAlpha = 0.9 * (1 - (ship.spawnTimer / total));
        ctx.drawImage(shipSpawnImg, -32, -32, 64, 64);
        ctx.globalAlpha = 1.0;
        ctx.restore();
        // draw the ship faded in
        ctx.save();
        ctx.globalAlpha = t;
        drawShip(x, y, angle);
        ctx.globalAlpha = 1.0;
        ctx.restore();
    } else {
        drawShip(x, y, angle);
    }
}

function drawStation(station) {
    ctx.save();
    ctx.translate(station.x - camera.x, station.y - camera.y);
    // Apply perpetual visual spin
    ctx.rotate(station.spinAngle || 0);
    // If station is currently spawning, draw a phase-in animation using stationSpawnImg
    if (station.spawnTimer && station.spawnTimer > 0) {
        const total = 60; // frames for the spawn animation
        const t = Math.max(0, Math.min(1, (total - station.spawnTimer) / total)); // 0..1 progress
        // draw the station faded in and slightly scaled
        ctx.globalAlpha = t;
        const scale = 0.6 + 0.4 * t;
        ctx.save();
        ctx.scale(scale, scale);
        ctx.drawImage(stationImg, -stationRadius, -stationRadius, stationRadius * 2, stationRadius * 2);
        ctx.restore();
        // draw spawn glow on top
        ctx.globalAlpha = 0.9 * (1 - (station.spawnTimer / total));
        ctx.drawImage(stationSpawnImg, -stationRadius, -stationRadius, stationRadius * 2, stationRadius * 2);
        ctx.globalAlpha = 1.0;
    } else {
        ctx.drawImage(stationImg, -stationRadius, -stationRadius, stationRadius * 2, stationRadius * 2);
    }
    ctx.restore();
}

function drawPlasma(ball) {
    ctx.save();
    ctx.translate(ball.x - camera.x, ball.y - camera.y);
    ctx.drawImage(plasmaImg, -plasmaRadius, -plasmaRadius, plasmaRadius * 2, plasmaRadius * 2);
    ctx.restore();
}

function drawStationShot(shot) {
    ctx.save();
    ctx.translate(shot.x - camera.x, shot.y - camera.y);
    ctx.drawImage(stationShotImg, -stationShotRadius, -stationShotRadius, stationShotRadius * 2, stationShotRadius * 2);
    ctx.restore();
}

// Draw an indicator at the edge of the screen pointing toward an offscreen station
function drawStationIndicator(station) {
    // screen coords
    const sx = station.x - camera.x;
    const sy = station.y - camera.y;
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    // vector from screen center to station
    let dx = sx - cx;
    let dy = sy - cy;
    // if somehow at center, skip
    if (dx === 0 && dy === 0) return;
    const angle = Math.atan2(dy, dx);
    // padding from edge so indicator is visible
    const pad = 18;
    // compute intersection with screen rect using parametric t from center
    const halfW = canvas.width / 2;
    const halfH = canvas.height / 2;
    const nx = Math.cos(angle);
    const ny = Math.sin(angle);
    // compute t for vertical sides
    let tX = Infinity;
    if (nx > 0) tX = (halfW - pad) / nx; else if (nx < 0) tX = (-halfW + pad) / nx;
    let tY = Infinity;
    if (ny > 0) tY = (halfH - pad) / ny; else if (ny < 0) tY = (-halfH + pad) / ny;
    // choose smallest positive t
    let t = Math.min(Math.abs(tX), Math.abs(tY));
    // indicator position in center-based coords
    let ix = cx + nx * t;
    let iy = cy + ny * t;

    // draw arrow pointing outward along angle
    ctx.save();
    ctx.translate(ix, iy);
    ctx.rotate(angle);
    // arrow triangle pointing right (local +X)
    ctx.beginPath();
    ctx.moveTo(12, 0);
    ctx.lineTo(-8, -8);
    ctx.lineTo(-8, 8);
    ctx.closePath();
    ctx.fillStyle = '#ffcc00';
    ctx.globalAlpha = 0.95;
    ctx.fill();
    // small circle behind arrow
    ctx.beginPath();
    ctx.arc(-2, 0, 4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fill();
    ctx.restore();
}

function drawExplosion(explosion) {
    ctx.save();
    ctx.translate(explosion.x - camera.x, explosion.y - camera.y);
    let size = stationRadius * 2 * explosion.scale;
    ctx.globalAlpha = explosion.alpha;
    ctx.drawImage(explosionImg, -size / 2, -size / 2, size, size);
    ctx.globalAlpha = 1.0;
    ctx.restore();
}

let shipDestroyed = false;
let shipRespawnTimer = 0;

function drawShipExplosion() {
    if (!shipExplosion) return;
    ctx.save();
    // draw ship explosion at the shipExplosion world position relative to camera
    ctx.translate(shipExplosion.x - camera.x, shipExplosion.y - camera.y);
    let size = ship.radius * 4 * shipExplosion.scale;
    ctx.globalAlpha = shipExplosion.alpha;
    ctx.drawImage(explosionImg, -size / 2, -size / 2, size, size);
    ctx.globalAlpha = 1.0;
    ctx.restore();
}

function updateShip() {
    if (keys.left) ship.angle -= 0.07;
    if (keys.right) ship.angle += 0.07;
    if (keys.up) {
        ship.vx += Math.cos(ship.angle) * ship.thrust;
        ship.vy += Math.sin(ship.angle) * ship.thrust;
    }
    // Friction
    ship.vx *= ship.friction;
    ship.vy *= ship.friction;
    // Clamp speed
    let speed = Math.sqrt(ship.vx * ship.vx + ship.vy * ship.vy);
    if (speed > ship.maxSpeed) {
        ship.vx *= ship.maxSpeed / speed;
        ship.vy *= ship.maxSpeed / speed;
    }
    // Move ship in world coordinates
    ship.x += ship.vx;
    ship.y += ship.vy;
    // Camera centers on ship
    camera.x = ship.x - canvas.width / 2;
    camera.y = ship.y - canvas.height / 2;
}

function shootPlasma() {
    // Plasma should originate from the ship's current location in world space
    plasma.push({
        x: ship.x,
        y: ship.y,
        vx: Math.cos(ship.angle) * plasmaSpeed + ship.vx,
        vy: Math.sin(ship.angle) * plasmaSpeed + ship.vy
    });
    // Play firing sound once. Use cloneNode or rewind to allow rapid firing.
    try {
        // If browser/autoplay policies block play, this will silently fail.
        // Clone to allow overlapping quick shots without cutting previous sound.
        const s = playerSound.cloneNode();
        s.play().catch(() => { });
    } catch (e) {
        try { playerSound.currentTime = 0; playerSound.play().catch(() => { }); } catch (e) { }
    }
}
let lastSpace = false;

function updatePlasma() {
    for (let ball of plasma) {
        ball.x += ball.vx;
        ball.y += ball.vy;
    }
    // Remove offscreen
    plasma = plasma.filter(ball =>
        ball.x > camera.x - 50 && ball.x < camera.x + canvas.width + 50 &&
        ball.y > camera.y - 50 && ball.y < camera.y + canvas.height + 50
    );
}

function updateStations() {
    for (let station of stations) {
    // advance visual spin regardless of behavior (slowed by 20%)
    station.spinAngle = (station.spinAngle || 0) + (station.spinSpeed || 0.02) * 0.5;
        // If station is currently spawning, decrement timer and apply minimal drift
        if (station.spawnTimer && station.spawnTimer > 0) {
            station.spawnTimer--;
            station.x += station.vx !== undefined ? station.vx * 0.2 : 0;
            station.y += station.vy !== undefined ? station.vy * 0.2 : 0;
            // while spawning, skip chasing/firing logic
            continue;
        }
        // compute vector to player (safe even if player dead)
        let dx = ship.x - station.x;
        let dy = ship.y - station.y;
        let dist = Math.sqrt(dx * dx + dy * dy);

        if (!shipDestroyed) {
            // Move station toward player with smooth turning
            if (dist > 1) {
                // desired velocity to point at player
                let desiredVx = (dx / dist) * station.speed;
                let desiredVy = (dy / dist) * station.speed;
                // per-station turn smoothing (smaller -> slower turning, larger radius)
                let turn = station.turnRate !== undefined ? station.turnRate : 0.12;
                // ensure vx/vy exist
                station.vx = station.vx !== undefined ? station.vx : desiredVx;
                station.vy = station.vy !== undefined ? station.vy : desiredVy;
                // smoothly approach desired velocity
                station.vx += (desiredVx - station.vx) * turn;
                station.vy += (desiredVy - station.vy) * turn;
                // move by current velocity (smoothed)
                station.x += station.vx;
                station.y += station.vy;
            }
        } else {
            // Player dead -> stations wander in their own velocity
            station.x += station.vx !== undefined ? station.vx : 0;
            station.y += station.vy !== undefined ? station.vy : 0;
        }

        // Decrement timers
        station.cooldown = (station.cooldown || 0) - 1;
        station.shotTimer = (station.shotTimer || 0) - 1;
        // Fire at player only if player is alive and visible on screen
        let shipScreenX = ship.x - camera.x;
        let shipScreenY = ship.y - camera.y;
        let shipVisible = shipScreenX >= -50 && shipScreenX <= canvas.width + 50 && shipScreenY >= -50 && shipScreenY <= canvas.height + 50;
        if (!shipDestroyed && shipVisible) {
            // Aim turret gradually toward the player
            let desiredGunAngle = Math.atan2(dy, dx);
            // normalize angle difference to -PI..PI
            let diff = desiredGunAngle - (station.gunAngle || 0);
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;
            // rotate gun toward desired angle with per-station turn speed
            let gunTurn = station.gunTurnRate !== undefined ? station.gunTurnRate : 0.15;
            station.gunAngle = (station.gunAngle || 0) + diff * Math.min(1, gunTurn);

            // Tactical firing logic: use bursts and distance gating to avoid constant streams
            const MAX_FIRE_DIST = 1000; // don't try to shoot from extreme range
            const AIM_TOLERANCE = 0.22; // radians
            const jitter = (Math.random() - 0.5) * 0.06;
            // Only consider firing when within effective range
            if (dist <= MAX_FIRE_DIST) {
                // If currently in a burst, fire shots at burst cadence
                if (station.burstRemaining > 0) {
                    if ((station.shotTimer || 0) <= 0) {
                        const spread = (Math.random() - 0.5) * 0.14;
                        let fireAngle = station.gunAngle + spread;
                        // create shot object then push
                        const shot = {
                            x: station.x,
                            y: station.y,
                            vx: Math.cos(fireAngle) * stationShotSpeed,
                            vy: Math.sin(fireAngle) * stationShotSpeed
                        };
                        stationShots.push(shot);
                        // Only play sound when the spawned shot is within the camera bounds
                        if (shot.x > camera.x - 50 && shot.x < camera.x + canvas.width + 50 &&
                            shot.y > camera.y - 50 && shot.y < camera.y + canvas.height + 50) {
                            try {
                                const s = stationSound.cloneNode();
                                s.play().catch(() => { });
                            } catch (e) {
                                try { stationSound.currentTime = 0; stationSound.play().catch(() => { }); } catch (e) { }
                            }
                        }
                        station.burstRemaining--;
                        // small delay between shots in a burst
                        station.shotTimer = 6 + Math.floor(Math.random() * 4);
                        // if burst finished, set a longer randomized cooldown
                        if (station.burstRemaining <= 0) {
                            const base = station.fireRate !== undefined ? station.fireRate : stationFireRate;
                            station.cooldown = Math.max(12, Math.floor(base * (1.2 + Math.random() * 0.8)));
                            station.state = 'idle';
                        }
                    }
                } else {
                    // Not currently bursting: decide whether to start a burst based on aim
                    if (Math.abs(diff + jitter) <= AIM_TOLERANCE && (station.cooldown || 0) <= 0) {
                        // begin a burst of 1-3 shots
                        station.burstRemaining = 1 + Math.floor(Math.random() * 3);
                        station.shotTimer = 0; // fire immediately on next update
                        station.state = 'burst';
                    }
                }
            }
        }
    }
}

function updateStationShots() {
    for (let shot of stationShots) {
        shot.x += shot.vx;
        shot.y += shot.vy;
    }
    // Remove offscreen
    stationShots = stationShots.filter(shot =>
        shot.x > camera.x - 50 && shot.x < camera.x + canvas.width + 50 &&
        shot.y > camera.y - 50 && shot.y < camera.y + canvas.height + 50
    );
}

function checkCollisions() {
    // Plasma vs Station
    for (let i = plasma.length - 1; i >= 0; i--) {
        for (let j = stations.length - 1; j >= 0; j--) {
            let dx = plasma[i].x - stations[j].x;
            let dy = plasma[i].y - stations[j].y;
            let dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < stationRadius + plasmaRadius) {
                // Create explosion
                explosions.push({
                    x: stations[j].x,
                    y: stations[j].y,
                    scale: 0.5,
                    alpha: 1.0,
                    frame: 0
                });
                // Play explosion sound once for station death
                try {
                    const s = explosionSound.cloneNode();
                    s.play().catch(() => { });
                } catch (e) {
                    try { explosionSound.currentTime = 0; explosionSound.play().catch(() => { }); } catch (e) { }
                }
                // Spawn a new station using current level-based scaling
                let newStation = randomStationPos();
                newStation.speed = globalStationBaseSpeed + 0.3 + Math.random() * 0.5;
                newStation.fireRate = Math.max(12, stationFireRate - Math.floor((level - 1) * 4));
                // begin spawn animation (60 frames ~= 1 second)
                newStation.spawnTimer = 60;
                stations.push(newStation);
                stations.splice(j, 1);
                plasma.splice(i, 1);
                // level up
                level++;
                applyLevelScaling();
                updateLevelDisplay();
                break;
            }
        }
    }
    // Station shot vs Ship
    // Shots should not damage the player while the player is in spawn phase
    if (!shipDestroyed && ship.spawnTimer <= 0) {
        for (let i = stationShots.length - 1; i >= 0; i--) {
            let dx = stationShots[i].x - ship.x;
            let dy = stationShots[i].y - ship.y;
            let dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < ship.radius + stationShotRadius) {
                // Ship explodes
                shipDestroyed = true;
                // Save the ship's world position so we can respawn at the same place
                savedShipPos = { x: ship.x, y: ship.y };
                shipRespawnTimer = 120; // 2 seconds at 60fps
                // Create a dedicated ship explosion so we can remove it when animation ends
                shipExplosion = {
                    x: ship.x,
                    y: ship.y,
                    scale: 0.5,
                    alpha: 1.0,
                    frame: 0
                };
                // Play explosion sound once for player death
                try {
                    const s2 = explosionSound.cloneNode();
                    s2.play().catch(() => { });
                } catch (e) {
                    try { explosionSound.currentTime = 0; explosionSound.play().catch(() => { }); } catch (e) { }
                }
                stationShots.splice(i, 1);
                // level down
                level = Math.max(1, level - 1);
                applyLevelScaling();
                updateLevelDisplay();
                // Give all stations a random velocity so they wander in different directions while the player is dead
                for (let s of stations) {
                    let a = Math.random() * Math.PI * 2;
                    let spd = s.speed || globalStationBaseSpeed;
                    s.vx = Math.cos(a) * spd * (0.8 + Math.random() * 0.6);
                    s.vy = Math.sin(a) * spd * (0.8 + Math.random() * 0.6);
                }
                break;
            }
        }
    }
}

function gameLoop() {
    drawBackground();
    if (!paused) {
        if (!shipDestroyed) updateShip();
        if (!shipDestroyed && keys.space && !lastSpace) shootPlasma();
        lastSpace = keys.space;
        updatePlasma();
        updateStations();
        updateStationShots();
        checkCollisions();
    } else {
        // keep input edge state consistent while paused
        lastSpace = keys.space;
    }
    // Draw stations (if offscreen, draw an edge indicator pointing to them)
    for (let station of stations) {
        let sx = station.x - camera.x;
        let sy = station.y - camera.y;
        let visible = sx >= -50 && sx <= canvas.width + 50 && sy >= -50 && sy <= canvas.height + 50;
        if (visible) {
            drawStation(station);
        } else {
            drawStationIndicator(station);
        }
    }
    // Draw station shots
    for (let shot of stationShots) drawStationShot(shot);
    // Draw plasma
    for (let ball of plasma) drawPlasma(ball);
    // Draw explosions
    for (let explosion of explosions) drawExplosion(explosion);
    // Draw ship (always center)
    if (!shipDestroyed) {
        if (ship.spawnTimer && ship.spawnTimer > 0) {
            drawShipWithSpawn(canvas.width / 2, canvas.height / 2, ship.angle);
        } else {
            drawShip(canvas.width / 2, canvas.height / 2, ship.angle);
        }
    } else {
        drawShipExplosion();
        shipRespawnTimer--;
        if (shipRespawnTimer <= 0) {
            // Respawn ship at the same world position it had when destroyed
            if (savedShipPos) {
                ship.x = savedShipPos.x;
                ship.y = savedShipPos.y;
            } else {
                // fallback to origin if for some reason we don't have a saved position
                ship.x = 0;
                ship.y = 0;
            }
            // clear motion but keep orientation/camera consistent with the world
            ship.vx = 0;
            ship.vy = 0;
            // Start ship spawn phase (1 second = 60 frames)
            ship.spawnTimer = 60;
            // Do NOT reset camera or recreate objects — keep everything active
            shipDestroyed = false;
            // clear saved position until next death
            savedShipPos = null;
        }
    }
    // Decrement ship spawn timer if active
    if (ship.spawnTimer && ship.spawnTimer > 0) ship.spawnTimer--;
    // Animate explosions
    if (!paused) {
        for (let i = explosions.length - 1; i >= 0; i--) {
            explosions[i].scale += 0.12;
            explosions[i].alpha -= 0.04;
            explosions[i].frame++;
            if (explosions[i].alpha <= 0) {
                explosions.splice(i, 1);
            }
        }
        // Animate and remove the ship explosion when it finishes
        if (shipExplosion) {
            shipExplosion.scale += 0.12;
            shipExplosion.alpha -= 0.04;
            shipExplosion.frame++;
            if (shipExplosion.alpha <= 0) {
                shipExplosion = null;
            }
        }
    }

    // If paused, draw translucent overlay and text
    if (paused) {
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#fff';
        ctx.font = '40px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('PAUSED', canvas.width / 2, canvas.height / 2);
        ctx.restore();
    }
    requestAnimationFrame(gameLoop);
}
// Initialize scaling for the starting level and update HUD
applyLevelScaling();
updateLevelDisplay();
gameLoop();
