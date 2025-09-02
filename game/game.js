// Space Game
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const WIDTH = canvas.width;
const HEIGHT = canvas.height;

// Ship pixel art (16x16)
// Load SVG ship image
const shipImg = new Image();
shipImg.src = 'ship.svg';

// Ship state
let ship = {
    x: WIDTH / 2,
    y: HEIGHT / 2,
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
let stations = [
    { x: 200, y: 100, cooldown: 0 },
    { x: 600, y: 400, cooldown: 0 },
    { x: 400, y: 200, cooldown: 0 }
];

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

// Camera offset
let camera = { x: 0, y: 0 };

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
    // Camera follows ship
    camera.x += ship.vx;
    camera.y += ship.vy;
}

function shootPlasma() {
    // Plasma should originate from the ship's current location in world space
    plasma.push({
        x: camera.x + ship.x,
        y: camera.y + ship.y,
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
        ball.x > camera.x - 50 && ball.x < camera.x + WIDTH + 50 &&
        ball.y > camera.y - 50 && ball.y < camera.y + HEIGHT + 50
    );
}

function updateStations() {
    for (let station of stations) {
        station.cooldown--;
        // Fire at player
        if (station.cooldown <= 0) {
            let dx = (ship.x + camera.x) - station.x;
            let dy = (ship.y + camera.y) - station.y;
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
        shot.x > camera.x - 50 && shot.x < camera.x + WIDTH + 50 &&
        shot.y > camera.y - 50 && shot.y < camera.y + HEIGHT + 50
    );
}

function checkCollisions() {
    // TODO: Add collision logic for ship/station shots, plasma/stations
}

function gameLoop() {
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
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
    // Draw ship (always center)
    drawShip(WIDTH / 2, HEIGHT / 2, ship.angle);
    requestAnimationFrame(gameLoop);
}
gameLoop();
