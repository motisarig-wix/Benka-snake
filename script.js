const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const scoreEl = document.getElementById('score');
const overlay = document.getElementById('overlay');
const restartBtn = document.getElementById('restartBtn');

const eatSound = document.getElementById('eatSound');
const crashSound = document.getElementById('crashSound');
const wrapEl = document.querySelector('.wrap');

// Grid config
const tileSize = 12;
const gridSize = canvas.width / tileSize;
const RESERVED_TOP_ROWS = 3; // keep top rows free for HUD text

// Colors
const COLOR_BG = '#203b15';
const COLOR_SNAKE = '#c8fda0';
const COLOR_FOOD = '#d2aa34';

let snake, dir, food, score, isDead;
let pendingDir = null;
let restartUnlockAt = 0; // timestamp after which restart is allowed

// Dynamic speed management
const BASE_TICK_MS = 150; // start 50% slower than previous 100ms
const MIN_TICK_MS = 70;   // safety cap
let tickMs = BASE_TICK_MS;
let tickTimer = null;

function startLoop() { if (tickTimer) clearInterval(tickTimer); tickTimer = setInterval(() => { applyPendingDir(); tick(); }, tickMs); }

function initGame() {
	snake = [ {x: 8, y: 10}, {x: 7, y: 10}, {x: 6, y: 10} ];
	dir = {x: 1, y: 0};
	food = spawnFood();
	score = 0; isDead = false; pendingDir = null;
	restartUnlockAt = 0;
	tickMs = BASE_TICK_MS; // reset speed
	scoreEl.textContent = `Score: ${score}`;
	// Reset overlay state
	overlay.classList.add('hidden');
	overlay.classList.remove('matrix');
	const h2 = overlay.querySelector('h2');
	if (h2) h2.textContent = 'Game Over';
	startLoop();
	draw();
}

function spawnFood() {
	let f;
	do {
		const x = Math.floor(Math.random() * gridSize);
		const y = Math.floor(RESERVED_TOP_ROWS + Math.random() * (gridSize - RESERVED_TOP_ROWS));
		f = { x, y };
	} while (snake.some(seg => seg.x === f.x && seg.y === f.y));
	return f;
}

function tick() {
	if (isDead) return;
	const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
	if (head.x < 0 || head.y < 0 || head.x >= gridSize || head.y >= gridSize) return gameOver();
	if (snake.some(seg => seg.x === head.x && seg.y === head.y)) return gameOver();
	snake.unshift(head);
	if (head.x === food.x && head.y === food.y) {
		score += 1; scoreEl.textContent = `Score: ${score}`;
		playEat();
		flashEat();
		food = spawnFood();
		// Increase speed by 5% (reduce interval), apply immediately
		tickMs = Math.max(MIN_TICK_MS, Math.round(tickMs * 0.95));
		startLoop();
	} else { snake.pop(); }
	draw();
}

function draw() { ctx.fillStyle = COLOR_BG; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.strokeStyle = '#2f4d1f'; ctx.lineWidth = 2; ctx.strokeRect(1, 1, canvas.width - 2, canvas.height - 2); drawCell(food.x, food.y, COLOR_FOOD); snake.forEach(seg => drawCell(seg.x, seg.y, COLOR_SNAKE)); }
function drawCell(x, y, color) { ctx.fillStyle = color; ctx.fillRect(x * tileSize, y * tileSize, tileSize - 1, tileSize - 1); }

// Controls & audio unlock
window.addEventListener('keydown', onKeyDown);
['pointerdown','touchstart','mousedown'].forEach(evt => window.addEventListener(evt, resumeAudioContext, { once: true }));

function onKeyDown(e){
	resumeAudioContext();
	if (isDead) { if (Date.now() >= restartUnlockAt) initGame(); return; }
	switch (e.key) {
		case 'ArrowUp': if (dir.y !== 1) pendingDir = {x:0,y:-1}; break;
		case 'ArrowDown': if (dir.y !== -1) pendingDir = {x:0,y:1}; break;
		case 'ArrowLeft': if (dir.x !== 1) pendingDir = {x:-1,y:0}; break;
		case 'ArrowRight': if (dir.x !== -1) pendingDir = {x:1,y:0}; break;
	}
}

// Map numeric keypad buttons
const dirMap = { up: {x:0,y:-1}, down:{x:0,y:1}, left:{x:-1,y:0}, right:{x:1,y:0} };
document.querySelectorAll('.dir-btn').forEach(btn => { btn.addEventListener('click', () => { resumeAudioContext(); if (isDead) { if (Date.now() >= restartUnlockAt) initGame(); return; } const d = dirMap[btn.dataset.dir]; if (!d) return; if ((d.x === 0 && dir.y !== -d.y) || (d.y === 0 && dir.x !== -d.x)) pendingDir = d; }); });

function applyPendingDir() { if (pendingDir) { dir = pendingDir; pendingDir = null; } }
function gameOver() {
	isDead = true;
	restartUnlockAt = Date.now() + 1000; // 1s cooldown
	// Inject matrix span animation for heading
	const title = 'Game Over';
	const h2 = overlay.querySelector('h2');
	if (h2) {
		const spans = Array.from(title).map((ch, i) => `<span style=\"--i:${i}\">${ch}</span>`).join('');
		h2.innerHTML = spans;
	}
	overlay.classList.add('matrix');
	overlay.classList.remove('hidden');
	flashCrash();
	playCrash();
}

restartBtn.addEventListener('click', () => { resumeAudioContext(); if (isDead && Date.now() >= restartUnlockAt) initGame(); });

// ---------- Sound helpers & SFX pools ----------
let audioCtx;
function resumeAudioContext(){ try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); if (audioCtx.state === 'suspended') audioCtx.resume(); } catch {} }
function beep(freq = 640, dur = 0.08, gainValue = 0.08) { resumeAudioContext(); if (!audioCtx) return; const o = audioCtx.createOscillator(); const g = audioCtx.createGain(); const now = audioCtx.currentTime; o.type = 'square'; o.frequency.setValueAtTime(freq, now); g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(gainValue, now + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, now + dur); o.connect(g); g.connect(audioCtx.destination); o.start(now); o.stop(now + dur); }
function tryPlay(el, vol = 0.95){ return new Promise(resolve => { try { if (!el) return resolve(false); const a = el.cloneNode(true); a.currentTime = 0; a.volume = vol; const p = a.play(); if (p && p.then) { p.then(()=>resolve(true)).catch(()=>resolve(false)); } else { resolve(true); } } catch { resolve(false); } }); }

// Helpers to create pools from base names + extensions
function buildBases(prefix){ const arr=[prefix]; for(let i=1;i<=20;i++) arr.push(`${prefix}${i}`); return arr; }
function buildSources(baseNames) { const exts = ['m4a','mp3','wav','ogg']; const list = []; for (const base of baseNames) { for (const ext of exts) list.push(`./sfx/${base}.${ext}`); } return list; }
async function buildPool(sources){ const pool=[]; await Promise.all(sources.map(src=>new Promise(res=>{ const a=new Audio(); a.preload='auto'; a.src=src; const done=ok=>{ a.oncanplaythrough=a.onloadeddata=a.onerror=null; if(ok) pool.push(a); res(); }; a.oncanplaythrough=()=>done(true); a.onloadeddata=()=>done(true); a.onerror=()=>done(false); // fallback timeout
 setTimeout(()=>done(a.readyState>0),1200); }))); return pool; }

// Build SFX pools (eat/crash)
const EAT_BASES = buildBases('eat');
const CRASH_BASES = buildBases('crash');
let eatPool = [], crashPool = [];
(async function preloadSfx(){ eatPool = await buildPool(buildSources(EAT_BASES)); crashPool = await buildPool(buildSources(CRASH_BASES)); })();

let lastEatIdx = -1, lastEatCount = 0;
let lastCrashIdx = -1, lastCrashCount = 0;
function pickIdx(poolLen, lastIdx, lastCount){ let idx; do { idx = Math.floor(Math.random()*Math.max(1,poolLen)); } while (poolLen > 1 && lastCount >= 2 && idx === lastIdx); return idx; }

async function playEat(){
	resumeAudioContext();
	let ok=false;
	if (eatPool.length){ const idx = pickIdx(eatPool.length, lastEatIdx, lastEatCount); if (idx === lastEatIdx) lastEatCount++; else { lastEatIdx = idx; lastEatCount = 1; } ok = await tryPlay(eatPool[idx], 1.0); }
	if (!ok && eatSound && eatSound.src) ok = await tryPlay(eatSound, 1.0);
	beep(880, 0.06, 0.03); // always layer a soft retro beep
}

async function playCrash(){
	resumeAudioContext();
	let ok=false;
	if (crashPool.length){ const idx = pickIdx(crashPool.length, lastCrashIdx, lastCrashCount); if (idx === lastCrashIdx) lastCrashCount++; else { lastCrashIdx = idx; lastCrashCount = 1; } ok = await tryPlay(crashPool[idx], 1.0); }
	if (!ok && crashSound && crashSound.src) ok = await tryPlay(crashSound, 1.0);
	beep(180, 0.18, 0.04); // subtle retro layer
}

function flashEat(){ if (!wrapEl) return; wrapEl.classList.remove('eat-flash'); void wrapEl.offsetWidth; wrapEl.classList.add('eat-flash'); setTimeout(()=>wrapEl.classList.remove('eat-flash'), 500); }
function flashCrash(){ if (!wrapEl) return; wrapEl.classList.remove('crash-flash'); void wrapEl.offsetWidth; wrapEl.classList.add('crash-flash'); setTimeout(()=>wrapEl.classList.remove('crash-flash'), 500); }

// Start
initGame(); startLoop(); 