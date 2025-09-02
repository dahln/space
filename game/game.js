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

// Plasma balls
let plasma = [];
const plasmaSpeed = 8;
const plasmaRadius = 4;
// Load SVG for plasma bolt
const plasmaImg = new Image();
plasmaImg.src = 'plasma.svg';

// Hostile stations
function randomStationPos() {
    // Place station randomly within a 2000x2000 area centered on the ship
    const range = 1000;
    return {
        x: ship.x + (Math.random() - 0.5) * 2 * range,
        y: ship.y + (Math.random() - 0.5) * 2 * range,
        cooldown: 0,
        speed: 1.5
    };
}
let stations = [randomStationPos()];

// Load SVG station image
const stationImg = new Image();
stationImg.src = 'station.svg';
const stationRadius = 30;
const stationFireRate = 60; // frames
let stationShots = [];
const stationShotSpeed = 5;
const stationShotRadius = 5;
// Load SVG for station shot
const stationShotImg = new Image();
stationShotImg.src = 'station-shot.svg';

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
        // Move station toward player
        let dx = ship.x - station.x;
        let dy = ship.y - station.y;
        let dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 1) {
            station.x += (dx / dist) * station.speed;
            station.y += (dy / dist) * station.speed;
        }
        station.cooldown--;
        // Fire at player
        if (station.cooldown <= 0) {
            let angle = Math.atan2(dy, dx);
            stationShots.push({
                x: station.x,
                y: station.y,
                vx: Math.cos(angle) * stationShotSpeed,
                vy: Math.sin(angle) * stationShotSpeed
            });
            station.cooldown = stationFireRate;
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
                // Spawn 2 new stations
                stations.push(randomStationPos());
                stations.push(randomStationPos());
                stations.splice(j, 1);
                plasma.splice(i, 1);
                break;
            }
        }
    }
}

function gameLoop() {
    drawBackground();
    updateShip();
    if (keys.space && !lastSpace) shootPlasma();
    lastSpace = keys.space;
    updatePlasma();
    updateStations();
    updateStationShots();
    checkCollisions();
    // Draw stations
    for (let station of stations) drawStation(station);
    // Draw station shots
    for (let shot of stationShots) drawStationShot(shot);
    // Draw plasma
    for (let ball of plasma) drawPlasma(ball);
    // Draw explosions
    for (let explosion of explosions) drawExplosion(explosion);
    // Draw ship (always center)
    drawShip(canvas.width / 2, canvas.height / 2, ship.angle);
    // Animate explosions
    for (let i = explosions.length - 1; i >= 0; i--) {
        explosions[i].scale += 0.12;
        explosions[i].alpha -= 0.04;
        explosions[i].frame++;
        if (explosions[i].alpha <= 0) {
            explosions.splice(i, 1);
        }
    }
    requestAnimationFrame(gameLoop);
}
gameLoop();
