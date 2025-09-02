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
    maxSpeed: 6
};

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

// Load SVG station image and station-related constants (moved up so functions that run at load can use them)
const stationImg = new Image();
stationImg.src = 'station.svg';
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
    // Place station randomly within a large world area (absolute coords)
    const WORLD_HALF = 2500;
    let speed = globalStationBaseSpeed + Math.random() * 0.5;
    // initial random direction
    let ang = Math.random() * Math.PI * 2;
    return {
        x: (Math.random() - 0.5) * 2 * WORLD_HALF,
        y: (Math.random() - 0.5) * 2 * WORLD_HALF,
        cooldown: 0,
        // base speed scales with level; add a small random variance
        speed: speed,
        // per-station velocity (used for wandering when player is dead)
        vx: Math.cos(ang) * speed * 0.6,
        vy: Math.sin(ang) * speed * 0.6,
        // Fire rate decreases (faster firing) with level, clamped
        fireRate: Math.max(20, stationFireRate - Math.floor((level - 1) * 3))
    };
}
let stations = [randomStationPos()];

// Load SVG explosion image
const explosionImg = new Image();
explosionImg.src = 'explosion.svg';

let explosions = [];

// Camera offset
let camera = { x: 0, y: 0 };

// Generate star field for background
const STAR_COUNT = 1000;
const STAR_COLORS = ['#fff', '#bbf', '#88f', '#eef', '#ccf'];
let stars = [];
function generateStars() {
    stars = [];
    for (let i = 0; i < STAR_COUNT; i++) {
        stars.push({
            x: Math.random() * 5000 - 2500,
            y: Math.random() * 5000 - 2500,
            r: Math.random() * 1.5 + 0.5,
            color: STAR_COLORS[Math.floor(Math.random() * STAR_COLORS.length)]
        });
    }
}
generateStars();

function drawBackground() {
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let star of stars) {
        let sx = star.x - camera.x + canvas.width / 2;
        let sy = star.y - camera.y + canvas.height / 2;
        if (sx >= 0 && sx < canvas.width && sy >= 0 && sy < canvas.height) {
            ctx.beginPath();
            ctx.arc(sx, sy, star.r, 0, Math.PI * 2);
            ctx.fillStyle = star.color;
            ctx.globalAlpha = 0.7;
            ctx.fill();
            ctx.globalAlpha = 1.0;
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

function drawStation(station) {
    ctx.save();
    ctx.translate(station.x - camera.x, station.y - camera.y);
    ctx.drawImage(stationImg, -stationRadius, -stationRadius, stationRadius * 2, stationRadius * 2);
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

function drawExplosion(explosion) {
    ctx.save();
    ctx.translate(explosion.x - camera.x, explosion.y - camera.y);
    let size = stationRadius * 2 * explosion.scale;
    ctx.globalAlpha = explosion.alpha;
    ctx.drawImage(explosionImg, -size/2, -size/2, size, size);
    ctx.globalAlpha = 1.0;
    ctx.restore();
}

let shipDestroyed = false;
let shipRespawnTimer = 0;

function drawShipExplosion() {
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    let size = ship.radius * 4;
    ctx.globalAlpha = 0.8;
    ctx.drawImage(explosionImg, -size/2, -size/2, size, size);
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

        station.cooldown--;
        // Fire at player only if player is alive and visible on screen
        let shipScreenX = ship.x - camera.x;
        let shipScreenY = ship.y - camera.y;
        let shipVisible = shipScreenX >= -50 && shipScreenX <= canvas.width + 50 && shipScreenY >= -50 && shipScreenY <= canvas.height + 50;
        if (!shipDestroyed && shipVisible && station.cooldown <= 0) {
            let angle = Math.atan2(dy, dx);
            stationShots.push({
                x: station.x,
                y: station.y,
                vx: Math.cos(angle) * stationShotSpeed,
                vy: Math.sin(angle) * stationShotSpeed
            });
            station.cooldown = station.fireRate !== undefined ? station.fireRate : stationFireRate;
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
                // Spawn a new station using current level-based scaling
                let newStation = randomStationPos();
                newStation.speed = globalStationBaseSpeed + 0.3 + Math.random() * 0.5;
                newStation.fireRate = Math.max(12, stationFireRate - Math.floor((level - 1) * 4));
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
    if (!shipDestroyed) {
        for (let i = stationShots.length - 1; i >= 0; i--) {
            let dx = stationShots[i].x - ship.x;
            let dy = stationShots[i].y - ship.y;
            let dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < ship.radius + stationShotRadius) {
                // Ship explodes
                shipDestroyed = true;
                shipRespawnTimer = 120; // 2 seconds at 60fps
                explosions.push({
                    x: ship.x,
                    y: ship.y,
                    scale: 0.5,
                    alpha: 1.0,
                    frame: 0
                });
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
    // Draw stations
    for (let station of stations) drawStation(station);
    // Draw station shots
    for (let shot of stationShots) drawStationShot(shot);
    // Draw plasma
    for (let ball of plasma) drawPlasma(ball);
    // Draw explosions
    for (let explosion of explosions) drawExplosion(explosion);
    // Draw ship (always center)
    if (!shipDestroyed) {
        drawShip(canvas.width / 2, canvas.height / 2, ship.angle);
    } else {
        drawShipExplosion();
        shipRespawnTimer--;
        if (shipRespawnTimer <= 0) {
            // Respawn ship at center
            ship.x = 0;
            ship.y = 0;
            ship.vx = 0;
            ship.vy = 0;
            ship.angle = 0;
            camera.x = 0;
            camera.y = 0;
            shipDestroyed = false;
        }
    }
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
