// ============================================
// Project Factory Routes
// The intelligence layer for The Project Factory:
//
//   POST /scaffold          — generate starter project skeleton
//   POST /analyze-import    — deep-analyze an imported codebase
//   GET  /milestones/:projectId  — milestone tree for latest run
//   GET  /quality/:projectId     — quality snapshot history
//   GET  /templates         — available project type templates
//
// Design principles:
// - scaffold + analyze are sync (fast), loop setup is async
// - import analysis infers workflow mode + strategy template
// - results are persisted to DB so the loop can consume them
// ============================================
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { randomUUID } from 'crypto';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { MemoryService } from '../services/memory/index.js';
import { listAllFiles } from '../services/filesystem/index.js';

type Db = import('better-sqlite3').Database;

type BootstrapStepResult = {
  step: 'install' | 'build' | 'test';
  command: string;
  success: boolean;
  exitCode: number;
  durationMs: number;
  output: string;
};

function chooseNodePackageManager(root: string): 'pnpm' | 'yarn' | 'npm' {
  if (fs.existsSync(path.join(root, 'pnpm-lock.yaml'))) return 'pnpm';
  if (fs.existsSync(path.join(root, 'yarn.lock'))) return 'yarn';
  return 'npm';
}

function buildNodeScriptCommand(pm: 'pnpm' | 'yarn' | 'npm', script: string): string {
  if (pm === 'pnpm') return `pnpm ${script}`;
  if (pm === 'yarn') return `yarn ${script}`;
  return `npm run ${script}`;
}

function execCommand(command: string, cwd: string, timeoutMs = 120_000): Promise<BootstrapStepResult> {
  const start = Date.now();
  return new Promise((resolve) => {
    const isWindows = process.platform === 'win32';
    const proc = spawn(isWindows ? 'cmd' : 'sh', isWindows ? ['/c', command] : ['-c', command], {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, CI: '1' },
    });

    let output = '';
    proc.stdout.on('data', (d: Buffer) => { output += d.toString(); });
    proc.stderr.on('data', (d: Buffer) => { output += d.toString(); });

    const timer = setTimeout(() => {
      try { proc.kill('SIGKILL'); } catch { /* ignore */ }
    }, timeoutMs);

    proc.on('close', (code) => {
      clearTimeout(timer);
      resolve({
        step: 'build', // overwritten by caller
        command,
        success: (code ?? 1) === 0,
        exitCode: code ?? 1,
        durationMs: Date.now() - start,
        output: output.slice(-6000),
      });
    });

    proc.on('error', (err: any) => {
      clearTimeout(timer);
      resolve({
        step: 'build',
        command,
        success: false,
        exitCode: 1,
        durationMs: Date.now() - start,
        output: String(err?.message || 'Unknown command execution error'),
      });
    });
  });
}

async function bootstrapScaffold(root: string): Promise<{
  detectedStack: string;
  results: BootstrapStepResult[];
  recommendedPreviewCommand: string | null;
}> {
  const pkgPath = path.join(root, 'package.json');
  const requirementsPath = path.join(root, 'requirements.txt');

  if (fs.existsSync(pkgPath)) {
    let pkg: any = {};
    try {
      pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    } catch {
      pkg = {};
    }

    const scripts = pkg?.scripts || {};
    const pm = chooseNodePackageManager(root);
    const results: BootstrapStepResult[] = [];

    const installCmd = pm === 'yarn' ? 'yarn install' : `${pm} install`;
    const install = await execCommand(installCmd, root, 180_000);
    results.push({ ...install, step: 'install' });
    if (!install.success) {
      return { detectedStack: `node:${pm}`, results, recommendedPreviewCommand: scripts.dev ? buildNodeScriptCommand(pm, 'dev') : null };
    }

    if (scripts.build) {
      const build = await execCommand(buildNodeScriptCommand(pm, 'build'), root, 150_000);
      results.push({ ...build, step: 'build' });
    }
    if (scripts.test) {
      const test = await execCommand(buildNodeScriptCommand(pm, 'test'), root, 150_000);
      results.push({ ...test, step: 'test' });
    }

    const previewCmd = scripts.dev
      ? buildNodeScriptCommand(pm, 'dev')
      : scripts.start
        ? buildNodeScriptCommand(pm, 'start')
        : null;

    return {
      detectedStack: `node:${pm}`,
      results,
      recommendedPreviewCommand: previewCmd,
    };
  }

  if (fs.existsSync(requirementsPath)) {
    const results: BootstrapStepResult[] = [];
    const install = await execCommand('python -m pip install -r requirements.txt', root, 240_000);
    results.push({ ...install, step: 'install' });
    if (fs.existsSync(path.join(root, 'main.py'))) {
      const build = await execCommand('python -m py_compile main.py', root, 60_000);
      results.push({ ...build, step: 'build' });
    }
    return { detectedStack: 'python', results, recommendedPreviewCommand: fs.existsSync(path.join(root, 'main.py')) ? 'python main.py' : null };
  }

  return { detectedStack: 'unknown', results: [], recommendedPreviewCommand: null };
}

// ── Supported project templates ───────────────────────────────────────────────
const SCAFFOLD_TEMPLATES = [
  {
    id: 'game-2d-web',
    name: '2D Web Game',
    description: 'HTML5 Canvas 2D game with game loop, input, physics basics (Phaser or vanilla JS)',
    stack: ['javascript', 'canvas', 'html'],
    recommended_workflow: 'build_new',
    recommended_strategy: 'fullstack-balanced',
    starter_files: [
      { path: 'index.html', content: `<!DOCTYPE html>\n<html lang="en">\n<head><meta charset="UTF-8"><title>My Game</title><style>body{margin:0;background:#000}canvas{display:block;margin:auto}</style></head>\n<body><canvas id="gameCanvas" width="800" height="600"></canvas><script src="src/main.js"></script></body>\n</html>` },
      { path: 'src/main.js', content: `// Game entry point\nconst canvas = document.getElementById('gameCanvas');\nconst ctx = canvas.getContext('2d');\n\nlet lastTime = 0;\nfunction gameLoop(timestamp) {\n  const dt = timestamp - lastTime;\n  lastTime = timestamp;\n  update(dt);\n  render();\n  requestAnimationFrame(gameLoop);\n}\n\nfunction update(dt) {\n  // TODO: implement game logic\n}\n\nfunction render() {\n  ctx.clearRect(0, 0, canvas.width, canvas.height);\n  // TODO: draw game objects\n}\n\nrequestAnimationFrame(gameLoop);\n` },
      { path: 'src/player.js', content: `export class Player {\n  constructor(x, y) {\n    this.x = x;\n    this.y = y;\n    this.width = 32;\n    this.height = 32;\n    this.speed = 200;\n    this.vx = 0;\n    this.vy = 0;\n  }\n\n  update(dt, input) {\n    // TODO: implement movement\n  }\n\n  draw(ctx) {\n    ctx.fillStyle = '#4af';\n    ctx.fillRect(this.x, this.y, this.width, this.height);\n  }\n}\n` },
      { path: 'README.md', content: `# My Game\n\nA 2D web game built with The Project Factory.\n\n## How to run\n\nOpen \`index.html\` in a browser, or:\n\n\`\`\`bash\nnpx serve .\n\`\`\`\n\n## Structure\n\n- \`src/main.js\` — game loop entry point\n- \`src/player.js\` — player entity\n` },
    ],
  },
  {
    id: 'game-topdown-rpg',
    name: 'Top-Down Open World RPG',
    description: 'Open-world top-down RPG with tile maps, player movement, NPCs, quests, inventory, and save/load. No dependencies — pure HTML5 Canvas. Launch with a single click.',
    stack: ['javascript', 'canvas', 'html'],
    recommended_workflow: 'build_new',
    recommended_strategy: 'fullstack-balanced',
    starter_files: [
      {
        path: 'index.html',
        content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Open World RPG</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #111; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; font-family: monospace; color: #eee; }
    #gameCanvas { display: block; border: 2px solid #333; image-rendering: pixelated; }
    #hud { width: 800px; display: flex; justify-content: space-between; padding: 4px 8px; background: #1a1a2e; font-size: 13px; }
    #log { width: 800px; height: 64px; background: #0d0d1a; overflow-y: auto; padding: 4px 8px; font-size: 11px; color: #aaa; }
  </style>
</head>
<body>
  <div id="hud">
    <span id="hudHp">HP: 100/100</span>
    <span id="hudGold">Gold: 0</span>
    <span id="hudLevel">Level 1</span>
    <span id="hudPos">0,0</span>
  </div>
  <canvas id="gameCanvas" width="800" height="560"></canvas>
  <div id="log"></div>
  <script type="module" src="src/main.js"></script>
</body>
</html>`,
      },
      {
        path: 'src/main.js',
        content: `import { World } from './world.js';
import { Player } from './player.js';
import { InputHandler } from './input.js';
import { Renderer } from './renderer.js';
import { UIManager } from './ui.js';
import { SaveSystem } from './save.js';

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const input = new InputHandler();
const world = new World(64, 64);        // 64x64 tile world
const player = new Player(world);
const renderer = new Renderer(canvas, ctx, world);
const ui = new UIManager();
const save = new SaveSystem(player, world);

// Auto-load save if exists
save.load();

let lastTime = performance.now();
let accumulated = 0;
const FIXED_STEP = 1000 / 60;

function loop(now) {
  const dt = now - lastTime;
  lastTime = now;
  accumulated += dt;

  while (accumulated >= FIXED_STEP) {
    player.update(FIXED_STEP, input, world);
    world.updateNPCs(FIXED_STEP, player);
    accumulated -= FIXED_STEP;
  }

  renderer.render(player);
  ui.update(player);
  requestAnimationFrame(loop);
}

// Auto-save every 30 seconds
setInterval(() => save.save(), 30_000);

requestAnimationFrame(loop);
window._rpgGame = { player, world, save };
console.log('RPG Engine started. Access window._rpgGame for debugging.');
`,
      },
      {
        path: 'src/world.js',
        content: `// Tile types
export const TILES = {
  GRASS: 0, WATER: 1, SAND: 2, FOREST: 3, STONE: 4,
  WALL: 5, FLOOR: 6, PATH: 7, TOWN: 8,
};

export const TILE_COLORS = {
  [TILES.GRASS]:  '#3a7d44',
  [TILES.WATER]:  '#1a5276',
  [TILES.SAND]:   '#c9a84c',
  [TILES.FOREST]: '#1e5631',
  [TILES.STONE]:  '#6b7280',
  [TILES.WALL]:   '#374151',
  [TILES.FLOOR]:  '#7c6f5e',
  [TILES.PATH]:   '#b8a99a',
  [TILES.TOWN]:   '#6b5e4e',
};

export const TILE_SOLID = {
  [TILES.WALL]: true, [TILES.WATER]: true, [TILES.FOREST]: false,
};

export class World {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.tiles = this._generate(width, height);
    this.npcs = this._spawnNPCs();
    this.items = this._spawnItems();
    this.chests = this._spawnChests();
    this.quests = this._buildQuests();
    this.log = [];
  }

  _generate(w, h) {
    const tiles = new Uint8Array(w * h).fill(TILES.GRASS);
    // Simple noise-based generation
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const n = Math.sin(x * 0.3 + y * 0.13) + Math.cos(x * 0.11 - y * 0.27);
        if (n > 1.2) tiles[y * w + x] = TILES.WATER;
        else if (n > 0.8) tiles[y * w + x] = TILES.SAND;
        else if (n < -1.0) tiles[y * w + x] = TILES.FOREST;
        else if (n < -1.4) tiles[y * w + x] = TILES.STONE;
      }
    }
    // Place town at center
    const cx = Math.floor(w / 2), cy = Math.floor(h / 2);
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        if (Math.abs(dx) === 3 || Math.abs(dy) === 3) tiles[(cy + dy) * w + (cx + dx)] = TILES.WALL;
        else tiles[(cy + dy) * w + (cx + dx)] = TILES.FLOOR;
      }
    }
    // Entrance
    tiles[(cy + 3) * w + cx] = TILES.PATH;
    return tiles;
  }

  _spawnNPCs() {
    const cx = Math.floor(this.width / 2);
    const cy = Math.floor(this.height / 2);
    return [
      { id: 'elder', name: 'Village Elder', x: cx, y: cy - 1, color: '#e0c080', dialog: ['Welcome, traveler.', 'The dungeon to the north holds great treasure.', 'Beware the slimes.'], questGiver: 'slay_slimes', w: 1, h: 1 },
      { id: 'merchant', name: 'Merchant', x: cx + 2, y: cy, color: '#80c0e0', dialog: ['Buy something?', 'I sell potions.', 'Come back anytime.'], shop: [{ name: 'Health Potion', cost: 10, heal: 30 }], w: 1, h: 1 },
      { id: 'knight', name: 'Guard', x: cx - 2, y: cy, color: '#c0c0c0', dialog: ['Halt!', 'The town is safe under my watch.'], w: 1, h: 1 },
    ];
  }

  _spawnItems() {
    return [
      { id: 'sword1', name: 'Iron Sword', x: 10, y: 10, color: '#c0c0c0', collected: false, stat: { attack: 5 } },
      { id: 'shield1', name: 'Wooden Shield', x: 50, y: 20, color: '#8b6914', collected: false, stat: { defense: 3 } },
      { id: 'potion1', name: 'Health Potion', x: 20, y: 40, color: '#e00060', collected: false, heal: 25 },
      { id: 'potion2', name: 'Health Potion', x: 35, y: 55, color: '#e00060', collected: false, heal: 25 },
      { id: 'gold1', name: 'Gold Pile', x: 15, y: 30, color: '#ffd700', collected: false, gold: 15 },
    ];
  }

  _spawnChests() {
    return [
      { id: 'chest1', x: 8, y: 8, opened: false, contents: [{ name: 'Ruby', gold: 50 }], color: '#8b4513' },
      { id: 'chest2', x: 55, y: 45, opened: false, contents: [{ name: 'Magic Scroll', gold: 30 }], color: '#8b4513' },
    ];
  }

  _buildQuests() {
    return {
      slay_slimes: { id: 'slay_slimes', title: 'Slay 3 Slimes', active: false, complete: false, progress: 0, goal: 3, reward: { gold: 20, xp: 50 } },
    };
  }

  getTile(x, y) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return TILES.WALL;
    return this.tiles[y * this.width + x];
  }

  isSolid(x, y) {
    return !!TILE_SOLID[this.getTile(x, y)];
  }

  updateNPCs(dt, player) {
    // Simple NPC wander AI (non-hostile)
    for (const npc of this.npcs) {
      if (Math.random() < 0.003) {
        const dirs = [{dx:1,dy:0},{dx:-1,dy:0},{dx:0,dy:1},{dx:0,dy:-1}];
        const d = dirs[Math.floor(Math.random() * dirs.length)];
        const nx = npc.x + d.dx, ny = npc.y + d.dy;
        if (!this.isSolid(nx, ny)) { npc.x = nx; npc.y = ny; }
      }
    }
  }

  addLog(msg) {
    this.log.unshift(msg);
    if (this.log.length > 50) this.log.pop();
  }
}
`,
      },
      {
        path: 'src/player.js',
        content: `import { TILES } from './world.js';

export class Player {
  constructor(world) {
    this.world = world;
    this.x = Math.floor(world.width / 2);
    this.y = Math.floor(world.height / 2) + 5;
    this.hp = 100; this.maxHp = 100;
    this.gold = 0; this.xp = 0; this.level = 1;
    this.attack = 5; this.defense = 2;
    this.inventory = [];
    this.completedQuests = [];
    this.moveTimer = 0;
    this.moveCooldown = 120;  // ms between tile moves
    this.facing = 'down';
    this.color = '#4af';
  }

  update(dt, input, world) {
    this.moveTimer -= dt;
    if (this.moveTimer > 0) return;

    let dx = 0, dy = 0;
    if (input.keys['ArrowUp']    || input.keys['w'] || input.keys['W']) { dy = -1; this.facing = 'up'; }
    if (input.keys['ArrowDown']  || input.keys['s'] || input.keys['S']) { dy = +1; this.facing = 'down'; }
    if (input.keys['ArrowLeft']  || input.keys['a'] || input.keys['A']) { dx = -1; this.facing = 'left'; }
    if (input.keys['ArrowRight'] || input.keys['d'] || input.keys['D']) { dx = +1; this.facing = 'right'; }
    if (input.keys['e'] || input.keys['E']) { this._interact(world); this.moveTimer = this.moveCooldown; return; }

    if (dx !== 0 || dy !== 0) {
      const nx = this.x + dx, ny = this.y + dy;
      if (!world.isSolid(nx, ny)) {
        this.x = nx; this.y = ny;
        this._checkPickups(world);
        this.moveTimer = this.moveCooldown;
      }
    }
  }

  _checkPickups(world) {
    // Items
    for (const item of world.items) {
      if (!item.collected && item.x === this.x && item.y === this.y) {
        item.collected = true;
        if (item.heal) { this.hp = Math.min(this.maxHp, this.hp + item.heal); world.addLog(\`Picked up \${item.name} (+\${item.heal} HP)\`); }
        else if (item.gold) { this.gold += item.gold; world.addLog(\`Found \${item.gold} gold!\`); }
        else { this.inventory.push(item); world.addLog(\`Picked up \${item.name}\`); }
      }
    }
    // Chests
    for (const chest of world.chests) {
      if (!chest.opened && chest.x === this.x && chest.y === this.y) {
        chest.opened = true;
        for (const c of chest.contents) {
          this.gold += (c.gold || 0);
          world.addLog(\`Chest: \${c.name} (+\${c.gold || 0} gold)\`);
        }
      }
    }
  }

  _interact(world) {
    // Check adjacent NPCs
    const dirs = [{dx:0,dy:-1},{dx:0,dy:1},{dx:-1,dy:0},{dx:1,dy:0}];
    for (const { dx, dy } of dirs) {
      const nx = this.x + dx, ny = this.y + dy;
      const npc = world.npcs.find(n => n.x === nx && n.y === ny);
      if (npc) {
        const line = npc.dialog[Math.floor(Math.random() * npc.dialog.length)];
        world.addLog(\`\${npc.name}: "\${line}"\`);
        if (npc.questGiver && world.quests[npc.questGiver]) {
          const q = world.quests[npc.questGiver];
          if (!q.active && !q.complete) { q.active = true; world.addLog(\`Quest started: \${q.title}\`); }
          if (q.complete && !this.completedQuests.includes(q.id)) {
            this.completedQuests.push(q.id);
            this.gold += q.reward.gold;
            this.xp += q.reward.xp;
            world.addLog(\`Quest complete! +\${q.reward.gold} gold, +\${q.reward.xp} XP\`);
          }
        }
        return;
      }
    }
    world.addLog('Nothing nearby.');
  }

  gainXP(amount) {
    this.xp += amount;
    const needed = this.level * 100;
    if (this.xp >= needed) { this.level++; this.maxHp += 10; this.hp = this.maxHp; this.attack++; this.world.addLog(\`Level up! Now level \${this.level}\`); }
  }
}
`,
      },
      {
        path: 'src/input.js',
        content: `export class InputHandler {
  constructor() {
    this.keys = {};
    window.addEventListener('keydown', e => { this.keys[e.key] = true; });
    window.addEventListener('keyup', e => { delete this.keys[e.key]; });
  }
}
`,
      },
      {
        path: 'src/renderer.js',
        content: `import { TILE_COLORS } from './world.js';

const TILE_SIZE = 32;
const VIEWPORT_W = 25;  // tiles visible
const VIEWPORT_H = 17;

export class Renderer {
  constructor(canvas, ctx, world) {
    this.canvas = canvas;
    this.ctx = ctx;
    this.world = world;
  }

  render(player) {
    const ctx = this.ctx;
    const w = this.world;

    // Camera: center on player
    const camX = player.x - Math.floor(VIEWPORT_W / 2);
    const camY = player.y - Math.floor(VIEWPORT_H / 2);

    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Draw tiles
    for (let ty = 0; ty < VIEWPORT_H; ty++) {
      for (let tx = 0; tx < VIEWPORT_W; tx++) {
        const wx = camX + tx, wy = camY + ty;
        const tile = w.getTile(wx, wy);
        ctx.fillStyle = TILE_COLORS[tile] || '#222';
        ctx.fillRect(tx * TILE_SIZE, ty * TILE_SIZE, TILE_SIZE, TILE_SIZE);
      }
    }

    // Draw items
    for (const item of w.items) {
      if (item.collected) continue;
      const sx = (item.x - camX) * TILE_SIZE, sy = (item.y - camY) * TILE_SIZE;
      if (sx < 0 || sy < 0 || sx >= this.canvas.width || sy >= this.canvas.height) continue;
      ctx.fillStyle = item.color;
      ctx.beginPath(); ctx.arc(sx + 16, sy + 16, 6, 0, Math.PI * 2); ctx.fill();
    }

    // Draw chests
    for (const chest of w.chests) {
      const sx = (chest.x - camX) * TILE_SIZE, sy = (chest.y - camY) * TILE_SIZE;
      if (sx < 0 || sy < 0) continue;
      ctx.fillStyle = chest.opened ? '#5a3010' : chest.color;
      ctx.fillRect(sx + 4, sy + 8, 24, 16);
      ctx.fillStyle = '#ffd700';
      ctx.fillRect(sx + 12, sy + 12, 8, 6);
    }

    // Draw NPCs
    for (const npc of w.npcs) {
      const sx = (npc.x - camX) * TILE_SIZE, sy = (npc.y - camY) * TILE_SIZE;
      if (sx < 0 || sy < 0 || sx >= this.canvas.width || sy >= this.canvas.height) continue;
      ctx.fillStyle = npc.color;
      ctx.fillRect(sx + 4, sy + 4, 24, 24);
      ctx.fillStyle = '#000';
      ctx.font = '9px monospace';
      ctx.fillText(npc.name.slice(0, 8), sx, sy + 30);
    }

    // Draw player
    const px = (player.x - camX) * TILE_SIZE;
    const py = (player.y - camY) * TILE_SIZE;
    ctx.fillStyle = player.color;
    ctx.fillRect(px + 6, py + 6, 20, 20);
    // Draw direction indicator
    ctx.fillStyle = '#fff';
    const dirOffsets = { up:[10,8,4,2], down:[10,22,4,2], left:[8,12,2,8], right:[22,12,2,8] };
    const [ox,oy,ow,oh] = dirOffsets[player.facing] || [10,22,4,2];
    ctx.fillRect(px + ox, py + oy, ow, oh);

    // HP bar
    const hpFrac = player.hp / player.maxHp;
    ctx.fillStyle = '#300';
    ctx.fillRect(px + 2, py + 2, 28, 4);
    ctx.fillStyle = hpFrac > 0.5 ? '#0a0' : hpFrac > 0.25 ? '#aa0' : '#a00';
    ctx.fillRect(px + 2, py + 2, Math.floor(28 * hpFrac), 4);
  }
}
`,
      },
      {
        path: 'src/ui.js',
        content: `export class UIManager {
  constructor() {
    this.hudHp   = document.getElementById('hudHp');
    this.hudGold = document.getElementById('hudGold');
    this.hudLvl  = document.getElementById('hudLevel');
    this.hudPos  = document.getElementById('hudPos');
    this.logEl   = document.getElementById('log');
    this._lastLogLen = 0;
  }

  update(player) {
    if (this.hudHp)   this.hudHp.textContent   = \`HP: \${player.hp}/\${player.maxHp}\`;
    if (this.hudGold) this.hudGold.textContent  = \`Gold: \${player.gold}\`;
    if (this.hudLvl)  this.hudLvl.textContent   = \`Level \${player.level} (XP:\${player.xp})\`;
    if (this.hudPos)  this.hudPos.textContent   = \`\${player.x},\${player.y}\`;

    const log = player.world.log;
    if (log.length !== this._lastLogLen && this.logEl) {
      this.logEl.innerHTML = log.slice(0, 20).map(l => \`<div>\${l}</div>\`).join('');
      this._lastLogLen = log.length;
    }
  }
}
`,
      },
      {
        path: 'src/save.js',
        content: `const SAVE_KEY = 'rpg_save_v1';

export class SaveSystem {
  constructor(player, world) {
    this.player = player;
    this.world = world;
  }

  save() {
    const data = {
      player: { x: this.player.x, y: this.player.y, hp: this.player.hp, maxHp: this.player.maxHp, gold: this.player.gold, xp: this.player.xp, level: this.player.level, attack: this.player.attack, defense: this.player.defense, completedQuests: this.player.completedQuests },
      items: this.world.items.map(i => ({ id: i.id, collected: i.collected })),
      chests: this.world.chests.map(c => ({ id: c.id, opened: c.opened })),
      quests: Object.values(this.world.quests).map(q => ({ id: q.id, active: q.active, complete: q.complete, progress: q.progress })),
      savedAt: new Date().toISOString(),
    };
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch { /* localStorage unavailable */ }
  }

  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      Object.assign(this.player, data.player);
      for (const s of (data.items || [])) {
        const item = this.world.items.find(i => i.id === s.id);
        if (item) item.collected = s.collected;
      }
      for (const s of (data.chests || [])) {
        const chest = this.world.chests.find(c => c.id === s.id);
        if (chest) chest.opened = s.opened;
      }
      for (const s of (data.quests || [])) {
        const q = this.world.quests[s.id];
        if (q) Object.assign(q, s);
      }
      return true;
    } catch { return false; }
  }
}
`,
      },
      {
        path: 'README.md',
        content: `# Open World RPG

A browser-based top-down open-world RPG game built with **The Project Factory**.

## How to Play

**Launch instantly** — just open \`index.html\` in any modern browser. No install needed.

\`\`\`bash
# Option 1: Direct open
start index.html        # Windows
open index.html         # macOS
xdg-open index.html     # Linux

# Option 2: Local dev server
npx serve .
\`\`\`

## Controls

| Key | Action |
|-----|--------|
| WASD / Arrow Keys | Move |
| E | Interact (talk to NPCs, open chests) |

## Features

- **Open world** — 64x64 tile procedurally generated world
- **Player progression** — XP, leveling, attack/defense stats
- **Inventory** — pick up items, weapons, shields
- **NPCs** — quest givers, merchants, guards with dialog
- **Quests** — kill quests, reward system
- **Chests** — hidden treasure across the world
- **Auto-save** — saves to localStorage every 30 seconds
- **HUD** — HP bar, gold, level, coordinates

## Architecture

\`\`\`
src/
  main.js      — game entry point, loop
  world.js     — tile map generation, NPC AI, items, quests
  player.js    — player entity, movement, interaction
  input.js     — keyboard input handler
  renderer.js  — tile/entity rendering (Canvas 2D)
  ui.js        — HUD and event log
  save.js      — save/load via localStorage
\`\`\`

## Extending

The Project Factory agent can extend this game. Example prompts:
- "Add enemy slimes that roam the world"
- "Add a dungeon area in the north"
- "Add combat system with attack/block"
- "Add item shop to the merchant NPC"
- "Add weather effects (rain, night cycle)"
`,
      },
    ],
  },
  {
    id: 'game-3d-three',
    name: '3D Game / Scene (Three.js)',
    description: '3D scene with Three.js, orbit controls, lighting, and a game loop',
    stack: ['javascript', 'three.js', 'webgl'],
    recommended_workflow: 'build_new',
    recommended_strategy: 'fullstack-balanced',
    starter_files: [
      { path: 'package.json', content: JSON.stringify({ name: 'my-3d-game', version: '0.1.0', scripts: { dev: 'vite', build: 'vite build' }, dependencies: { three: '^0.160.0' }, devDependencies: { vite: '^5.0.0' } }, null, 2) },
      { path: 'index.html', content: `<!DOCTYPE html>\n<html lang="en">\n<head><meta charset="UTF-8"><title>3D Game</title><style>*{margin:0}canvas{display:block}</style></head>\n<body><script type="module" src="src/main.js"></script></body>\n</html>` },
      { path: 'src/main.js', content: `import * as THREE from 'three';\nimport { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';\n\nconst renderer = new THREE.WebGLRenderer({ antialias: true });\nrenderer.setSize(window.innerWidth, window.innerHeight);\ndocument.body.appendChild(renderer.domElement);\n\nconst scene = new THREE.Scene();\nconst camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);\ncamera.position.set(0, 5, 10);\n\nconst controls = new OrbitControls(camera, renderer.domElement);\n\n// Lighting\nscene.add(new THREE.AmbientLight(0xffffff, 0.5));\nconst dirLight = new THREE.DirectionalLight(0xffffff, 1);\ndirLight.position.set(5, 10, 7);\nscene.add(dirLight);\n\n// Ground plane\nconst ground = new THREE.Mesh(\n  new THREE.PlaneGeometry(20, 20),\n  new THREE.MeshLambertMaterial({ color: 0x336633 })\n);\nground.rotation.x = -Math.PI / 2;\nscene.add(ground);\n\n// Player placeholder\nconst player = new THREE.Mesh(\n  new THREE.BoxGeometry(1, 2, 1),\n  new THREE.MeshLambertMaterial({ color: 0x4488ff })\n);\nplayer.position.y = 1;\nscene.add(player);\n\nwindow.addEventListener('resize', () => {\n  camera.aspect = window.innerWidth / window.innerHeight;\n  camera.updateProjectionMatrix();\n  renderer.setSize(window.innerWidth, window.innerHeight);\n});\n\nfunction animate() {\n  requestAnimationFrame(animate);\n  controls.update();\n  renderer.render(scene, camera);\n}\nanimate();\n` },
      { path: 'README.md', content: `# 3D Game\n\nBuilt with Three.js + The Project Factory.\n\n\`\`\`bash\nnpm install\nnpm run dev\n\`\`\`\n` },
    ],
  },
  {
    id: 'web-app-react',
    name: 'React Web App',
    description: 'React + Vite + Tailwind CSS full-stack web application',
    stack: ['react', 'typescript', 'tailwind', 'vite'],
    recommended_workflow: 'build_new',
    recommended_strategy: 'fullstack-balanced',
    starter_files: [
      { path: 'package.json', content: JSON.stringify({ name: 'my-app', version: '0.1.0', scripts: { dev: 'vite', build: 'vite build', test: 'vitest' }, dependencies: { react: '^18', 'react-dom': '^18' }, devDependencies: { vite: '^5', '@vitejs/plugin-react': '^4', typescript: '^5', vitest: '^1', tailwindcss: '^3', autoprefixer: '^10' } }, null, 2) },
      { path: 'src/App.tsx', content: `import React from 'react';\n\nexport default function App() {\n  return (\n    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">\n      <div className="text-center">\n        <h1 className="text-4xl font-bold mb-4">My App</h1>\n        <p className="text-gray-400">Built with The Project Factory</p>\n      </div>\n    </div>\n  );\n}\n` },
      { path: 'src/main.tsx', content: `import React from 'react';\nimport ReactDOM from 'react-dom/client';\nimport App from './App';\nimport './index.css';\n\nReactDOM.createRoot(document.getElementById('root')!).render(<App />);\n` },
      { path: 'src/index.css', content: `@tailwind base;\n@tailwind components;\n@tailwind utilities;\n` },
      { path: 'index.html', content: `<!DOCTYPE html>\n<html lang="en">\n<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>My App</title></head>\n<body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body>\n</html>` },
      { path: 'README.md', content: `# My App\n\n\`\`\`bash\nnpm install\nnpm run dev\n\`\`\`\n` },
    ],
  },
  {
    id: 'data-science-python',
    name: 'Data Science / HPC Project',
    description: 'Python data science project with notebooks, ML utilities, distributed processing hooks',
    stack: ['python', 'jupyter', 'numpy', 'pandas', 'scikit-learn'],
    recommended_workflow: 'scale_research',
    recommended_strategy: 'reasoning-first',
    starter_files: [
      { path: 'requirements.txt', content: `numpy>=1.26\npandas>=2.1\nscikit-learn>=1.3\nmatplotlib>=3.8\njupyter>=1.0\ntorch>=2.1\ntqdm>=4.66\n` },
      { path: 'main.py', content: `#!/usr/bin/env python3\n"""Entry point for the data pipeline."""\nimport argparse\nfrom src.pipeline import run_pipeline\n\ndef main():\n    parser = argparse.ArgumentParser(description='Data Science Pipeline')\n    parser.add_argument('--config', default='config.yaml')\n    parser.add_argument('--stage', default='all', choices=['all', 'ingest', 'train', 'eval'])\n    args = parser.parse_args()\n    run_pipeline(args)\n\nif __name__ == '__main__':\n    main()\n` },
      { path: 'src/__init__.py', content: '' },
      { path: 'src/pipeline.py', content: `"""Main pipeline orchestrator."""\nimport logging\nfrom pathlib import Path\n\nlogger = logging.getLogger(__name__)\n\ndef run_pipeline(args):\n    logger.info(f"Running pipeline stage: {args.stage}")\n    data_dir = Path("data")\n    data_dir.mkdir(exist_ok=True)\n\n    if args.stage in ('all', 'ingest'):\n        ingest(data_dir)\n    if args.stage in ('all', 'train'):\n        train(data_dir)\n    if args.stage in ('all', 'eval'):\n        evaluate(data_dir)\n\ndef ingest(data_dir):\n    \"\"\"Load and preprocess raw data.\"\"\"\n    # TODO: implement data ingestion\n    logger.info("Ingesting data...")\n\ndef train(data_dir):\n    \"\"\"Train or fine-tune the model.\"\"\"\n    # TODO: implement training loop\n    logger.info("Training model...")\n\ndef evaluate(data_dir):\n    \"\"\"Evaluate model on held-out set.\"\"\"\n    # TODO: implement evaluation\n    logger.info("Evaluating model...")\n` },
      { path: 'notebooks/exploration.ipynb', content: JSON.stringify({ nbformat: 4, nbformat_minor: 5, metadata: { kernelspec: { display_name: 'Python 3', language: 'python', name: 'python3' } }, cells: [{ cell_type: 'markdown', metadata: {}, source: ['# Exploration Notebook\n', '\n', 'Built with The Project Factory.'] }, { cell_type: 'code', execution_count: null, metadata: {}, outputs: [], source: ['import numpy as np\nimport pandas as pd\nimport matplotlib.pyplot as plt\n\nprint("Environment ready")'] }] }, null, 2) },
      { path: 'README.md', content: `# Data Science Project\n\n\`\`\`bash\npip install -r requirements.txt\npython main.py --stage all\n\`\`\`\n` },
    ],
  },
  {
    id: 'api-backend',
    name: 'REST API Backend',
    description: 'TypeScript + Fastify REST API with SQLite, migrations, and tests',
    stack: ['typescript', 'fastify', 'sqlite', 'vitest'],
    recommended_workflow: 'build_new',
    recommended_strategy: 'fullstack-balanced',
    starter_files: [
      { path: 'package.json', content: JSON.stringify({ name: 'my-api', version: '0.1.0', type: 'module', scripts: { dev: 'tsx watch src/index.ts', build: 'tsc', start: 'node dist/index.js', test: 'vitest' }, dependencies: { fastify: '^4', 'better-sqlite3': '^9' }, devDependencies: { typescript: '^5', tsx: '^4', vitest: '^1', '@types/better-sqlite3': '^7' } }, null, 2) },
      { path: 'src/index.ts', content: `import Fastify from 'fastify';\n\nconst app = Fastify({ logger: true });\n\napp.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));\n\napp.listen({ port: 3000, host: '0.0.0.0' }, (err) => {\n  if (err) { app.log.error(err); process.exit(1); }\n  app.log.info('Server running on :3000');\n});\n` },
      { path: 'README.md', content: `# API Backend\n\n\`\`\`bash\nnpm install\nnpm run dev\n\`\`\`\n` },
    ],
  },
  {
    id: 'code-review',
    name: 'Code Review / Audit',
    description: 'Review and harden an existing codebase — bug hunting, test gaps, security review',
    stack: [],
    recommended_workflow: 'code_review',
    recommended_strategy: 'reasoning-first',
    starter_files: [],
  },
];

// ── Language detection helpers ────────────────────────────────────────────────
const EXT_TO_LANG: Record<string, string> = {
  ts: 'TypeScript', tsx: 'TypeScript', js: 'JavaScript', jsx: 'JavaScript',
  mjs: 'JavaScript', cjs: 'JavaScript',
  py: 'Python', rs: 'Rust', go: 'Go', java: 'Java',
  c: 'C', cpp: 'C++', h: 'C', hpp: 'C++',
  cs: 'C#', swift: 'Swift', kt: 'Kotlin', rb: 'Ruby',
  php: 'PHP', scala: 'Scala', lua: 'Lua', r: 'R',
  sh: 'Shell', ps1: 'PowerShell', bat: 'Batch',
  html: 'HTML', css: 'CSS', scss: 'SCSS', sass: 'SASS',
  sql: 'SQL', md: 'Markdown', json: 'JSON',
  yaml: 'YAML', yml: 'YAML', toml: 'TOML', xml: 'XML',
  vue: 'Vue', svelte: 'Svelte', astro: 'Astro',
  dart: 'Dart', ex: 'Elixir', exs: 'Elixir',
  hs: 'Haskell', clj: 'Clojure', lisp: 'Lisp',
  zig: 'Zig', nim: 'Nim', v: 'V', odin: 'Odin',
};

const DEP_MANAGER_FILES = [
  'package.json', 'yarn.lock', 'pnpm-lock.yaml',
  'requirements.txt', 'Pipfile', 'pyproject.toml', 'setup.py',
  'Cargo.toml', 'go.mod', 'build.gradle', 'pom.xml',
  'Gemfile', 'composer.json', 'pubspec.yaml', 'Package.swift',
  'mix.exs', 'cabal.project', '.csproj', '.sln',
];

const FRAMEWORK_SIGNALS: Array<{ pattern: string; name: string }> = [
  { pattern: '"react"', name: 'React' },
  { pattern: '"vue"', name: 'Vue' },
  { pattern: '"svelte"', name: 'Svelte' },
  { pattern: '"next"', name: 'Next.js' },
  { pattern: '"nuxt"', name: 'Nuxt' },
  { pattern: '"fastify"', name: 'Fastify' },
  { pattern: '"express"', name: 'Express' },
  { pattern: '"nestjs"', name: 'NestJS' },
  { pattern: '"django"', name: 'Django' },
  { pattern: '"flask"', name: 'Flask' },
  { pattern: '"fastapi"', name: 'FastAPI' },
  { pattern: '"pytorch"', name: 'PyTorch' },
  { pattern: '"tensorflow"', name: 'TensorFlow' },
  { pattern: '"scikit-learn"', name: 'scikit-learn' },
  { pattern: '"three"', name: 'Three.js' },
  { pattern: '"phaser"', name: 'Phaser (game)' },
  { pattern: '"unity"', name: 'Unity' },
  { pattern: '"tokio"', name: 'Tokio (Rust)' },
  { pattern: '"actix-web"', name: 'Actix-Web (Rust)' },
];

function simpleHash(str: string): string {
  let h = 0;
  for (let i = 0; i < Math.min(str.length, 2000); i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) >>> 0;
  }
  return h.toString(16);
}

// ── Import analysis implementation ────────────────────────────────────────────
async function analyzeImport(folderPath: string, projectId: string, db: Db): Promise<Record<string, unknown>> {
  const files = listAllFiles(folderPath, { maxFiles: 10_000, maxMs: 8_000 });

  // Language breakdown
  const langCounts: Record<string, number> = {};
  let testFileCount = 0;
  let todoCount = 0;
  let fixmeCount = 0;
  let estimatedLoc = 0;
  let contentSample = '';
  let contentSampleLen = 0;
  const MAX_SAMPLE_BYTES = 60_000;

  const TEXT_EXTS = new Set([
    'ts','tsx','js','jsx','py','rs','go','java','c','cpp','cs','rb','swift','kt',
    'html','css','scss','md','json','yaml','yml','toml','sh','php','lua','sql',
  ]);

  const TODO_REGEX = /\b(TODO|FIXME|HACK|XXX|BUG)\b/gi;
  const TEST_PATTERNS = /\.(test|spec)\.(ts|tsx|js|jsx|py|go|rs)$|(__tests__|tests?\/)|test_\w+\.py$/;

  for (const rel of files) {
    const ext = (rel.split('.').pop() ?? '').toLowerCase();
    const lang = EXT_TO_LANG[ext];
    if (lang) langCounts[lang] = (langCounts[lang] ?? 0) + 1;

    if (TEST_PATTERNS.test(rel)) testFileCount++;

    if (!TEXT_EXTS.has(ext)) continue;

    try {
      const absPath = path.join(folderPath, rel);
      const stat = fs.statSync(absPath);
      if (stat.size > 200_000) continue; // skip huge files
      const content = fs.readFileSync(absPath, 'utf-8');
      const lines = content.split('\n').length;
      estimatedLoc += lines;

      const todos = content.match(TODO_REGEX);
      if (todos) todoCount += todos.length;
      const fixmes = content.match(/\bFIXME\b/gi);
      if (fixmes) fixmeCount += fixmes.length;

      if (contentSampleLen < MAX_SAMPLE_BYTES) {
        const snippet = `\n\n### ${rel}\n\`\`\`${ext}\n${content.slice(0, 800)}\n\`\`\``;
        contentSample += snippet;
        contentSampleLen += snippet.length;
      }
    } catch { /* skip unreadable files */ }
  }

  // Detect dependency managers and frameworks
  const dependencyManagers: string[] = [];
  const techStack: string[] = [];

  for (const dmFile of DEP_MANAGER_FILES) {
    const abs = path.join(folderPath, dmFile);
    if (fs.existsSync(abs)) {
      dependencyManagers.push(dmFile);
      try {
        const content = fs.readFileSync(abs, 'utf-8').toLowerCase();
        for (const fw of FRAMEWORK_SIGNALS) {
          if (content.includes(fw.pattern) && !techStack.includes(fw.name)) {
            techStack.push(fw.name);
          }
        }
      } catch { /* skip */ }
    }
  }

  // Health score heuristics (0–100):
  // - High test coverage => +points
  // - Many TODOs/FIXMEs => -points
  // - Has dep managers => +points
  const sourceFiles = files.length - testFileCount;
  const testRatio = sourceFiles > 0 ? testFileCount / sourceFiles : 0;
  let healthScore = 50;
  healthScore += Math.min(30, Math.round(testRatio * 100));
  healthScore -= Math.min(20, Math.round((todoCount + fixmeCount * 2) / Math.max(1, files.length) * 50));
  healthScore += dependencyManagers.length > 0 ? 10 : 0;
  healthScore += estimatedLoc > 10_000 ? 5 : 0; // non-trivial project
  healthScore = Math.max(10, Math.min(100, healthScore));

  // Issues summary
  const issues: string[] = [];
  if (testRatio < 0.05 && sourceFiles > 10) issues.push(`Low test coverage: ${testFileCount} test files for ${sourceFiles} source files`);
  if (todoCount > 20) issues.push(`${todoCount} TODO comments need attention`);
  if (fixmeCount > 5) issues.push(`${fixmeCount} FIXME markers indicate known bugs`);
  if (dependencyManagers.length === 0) issues.push('No recognized dependency manager found — manual setup may be required');

  // Recommended workflow + strategy
  const topLangs = Object.entries(langCounts).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const isDataScience = topLangs.some(([l]) => l === 'Python') && techStack.some(t => /torch|tensorflow|scikit/i.test(t));
  const recommended_workflow_mode = isDataScience ? 'scale_research' : 'import_refactor';
  const recommended_strategy_template = isDataScience ? 'reasoning-first' : 'fullstack-balanced';

  // Compose analysis report (this becomes the corpus manifesto)
  const report = [
    '# Import Analysis Report',
    '',
    `**Project path:** ${folderPath}`,
    `**Files scanned:** ${files.length}`,
    `**Estimated lines of code:** ${estimatedLoc.toLocaleString()}`,
    `**Health score:** ${healthScore}/100`,
    '',
    '## Language Breakdown',
    ...topLangs.map(([lang, count]) => `- ${lang}: ${count} files`),
    '',
    '## Tech Stack Detected',
    techStack.length > 0 ? techStack.map(t => `- ${t}`).join('\n') : '- (none detected)',
    '',
    '## Dependency Managers',
    dependencyManagers.length > 0 ? dependencyManagers.map(d => `- ${d}`).join('\n') : '- (none found)',
    '',
    '## Test Coverage',
    `- ${testFileCount} test files / ${sourceFiles} source files (${Math.round(testRatio * 100)}%)`,
    '',
    '## Code Hygiene',
    `- TODO comments: ${todoCount}`,
    `- FIXME markers: ${fixmeCount}`,
    '',
    issues.length > 0 ? '## Issues Found\n' + issues.map(i => `- ⚠️  ${i}`).join('\n') : '## Issues Found\n- No critical issues detected',
    '',
    '## Recommended Approach',
    `- **Workflow mode:** ${recommended_workflow_mode}`,
    `- **Strategy template:** ${recommended_strategy_template}`,
    '',
    '## File Sample (for context)',
    contentSample.slice(0, 20_000),
  ].join('\n');

  const folderHash = simpleHash(folderPath + files.length.toString());

  // Persist to DB
  try {
    const id = randomUUID();
    db.prepare(`
      INSERT INTO import_analyses
        (id, project_id, folder_path, folder_hash, file_count, language_breakdown,
         tech_stack, dependency_managers, todo_count, fixme_count, test_file_count,
         estimated_loc, health_score, issues, recommended_workflow_mode,
         recommended_strategy_template, analysis_report, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      id, projectId, folderPath, folderHash, files.length,
      JSON.stringify(langCounts),
      JSON.stringify(techStack),
      JSON.stringify(dependencyManagers),
      todoCount, fixmeCount, testFileCount,
      estimatedLoc, healthScore,
      JSON.stringify(issues),
      recommended_workflow_mode,
      recommended_strategy_template,
      report,
    );
  } catch { /* best-effort */ }

  return {
    fileCount: files.length,
    estimatedLoc,
    healthScore,
    languageBreakdown: langCounts,
    techStack,
    dependencyManagers,
    todoCount,
    fixmeCount,
    testFileCount,
    issues,
    recommendedWorkflowMode: recommended_workflow_mode,
    recommendedStrategyTemplate: recommended_strategy_template,
    analysisReport: report,
  };
}

// ── Route handler ─────────────────────────────────────────────────────────────
export async function projectFactoryRoutes(app: FastifyInstance) {
  const db = (app as any).db as Db;
  const memory = new MemoryService(db);

  // GET /api/project-factory/templates
  app.get('/templates', async (_req, reply: FastifyReply) => {
    return reply.send({
      templates: SCAFFOLD_TEMPLATES.map(t => ({
        id: t.id,
        name: t.name,
        description: t.description,
        stack: t.stack,
        recommended_workflow: t.recommended_workflow,
        recommended_strategy: t.recommended_strategy,
      })),
    });
  });

  // POST /api/project-factory/scaffold
  // Body: { projectId, templateId, targetPath? }
  app.post('/scaffold', async (req: FastifyRequest, reply: FastifyReply) => {
    const { projectId, templateId, targetPath, bootstrap = true } = req.body as {
      projectId: string;
      templateId: string;
      targetPath?: string;
      bootstrap?: boolean;
    };

    const project = memory.getProject(projectId);
    if (!project) return reply.status(404).send({ error: 'Project not found' });

    const template = SCAFFOLD_TEMPLATES.find(t => t.id === templateId);
    if (!template) return reply.status(404).send({ error: 'Template not found' });

    const root = targetPath?.trim() || project.rootPath;
    const written: string[] = [];

    for (const file of template.starter_files) {
      try {
        const fullPath = path.join(root, file.path);
        const dir = path.dirname(fullPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        if (!fs.existsSync(fullPath)) {
          fs.writeFileSync(fullPath, file.content, 'utf-8');
          written.push(file.path);
        }
      } catch { /* skip files that fail */ }
    }

    let bootstrapInfo: {
      enabled: boolean;
      detectedStack?: string;
      recommendedPreviewCommand?: string | null;
      results?: BootstrapStepResult[];
      allPassed?: boolean;
    } = { enabled: false };

    if (bootstrap) {
      try {
        const b = await bootstrapScaffold(root);
        const allPassed = b.results.length === 0 || b.results.every((r) => r.success);
        bootstrapInfo = {
          enabled: true,
          detectedStack: b.detectedStack,
          recommendedPreviewCommand: b.recommendedPreviewCommand,
          results: b.results,
          allPassed,
        };
      } catch {
        bootstrapInfo = {
          enabled: true,
          detectedStack: 'unknown',
          recommendedPreviewCommand: null,
          results: [{
            step: 'build',
            command: 'bootstrap',
            success: false,
            exitCode: 1,
            durationMs: 0,
            output: 'Bootstrap failed unexpectedly.',
          }],
          allPassed: false,
        };
      }
    }

    return reply.send({
      success: true,
      templateId,
      written,
      totalFiles: template.starter_files.length,
      bootstrap: bootstrapInfo,
      recommendedWorkflowMode: template.recommended_workflow,
      recommendedStrategyTemplate: template.recommended_strategy,
      message: `Scaffolded ${written.length}/${template.starter_files.length} files.${bootstrapInfo.enabled ? ' Bootstrap checks completed.' : ''} Start The Project Factory loop to continue.`,
    });
  });

  // POST /api/project-factory/analyze-import
  // Body: { projectId, folderPath }
  app.post('/analyze-import', async (req: FastifyRequest, reply: FastifyReply) => {
    const { projectId, folderPath } = req.body as { projectId: string; folderPath: string };

    const project = memory.getProject(projectId);
    if (!project) return reply.status(404).send({ error: 'Project not found' });
    const scanPath = folderPath?.trim() || project.rootPath;
    if (!fs.existsSync(scanPath)) return reply.status(400).send({ error: 'Folder not found: ' + scanPath });

    let analysis: Record<string, unknown>;
    try {
      analysis = await analyzeImport(scanPath, projectId, db);
    } catch (err: any) {
      return reply.status(500).send({ error: 'Analysis failed: ' + err.message });
    }

    // Also write analysis as the corpus manifesto so the loop can use it
    try {
      db.prepare(`
        INSERT INTO project_corpus (id, project_id, manifesto, file_count, total_tokens, ingest_path, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(id) DO UPDATE SET
          manifesto = excluded.manifesto,
          file_count = excluded.file_count,
          total_tokens = excluded.total_tokens,
          ingest_path = excluded.ingest_path,
          updated_at = datetime('now')
      `).run(
        projectId, projectId,
        String(analysis.analysisReport).slice(0, 100_000),
        Number(analysis.fileCount),
        Math.ceil(String(analysis.analysisReport).length / 4),
        scanPath,
      );
    } catch { /* best-effort */ }

    return reply.send({ success: true, ...analysis });
  });

  // GET /api/project-factory/milestones/:projectId
  // Returns the milestone tree for the most recent run.
  app.get('/milestones/:projectId', async (req: FastifyRequest, reply: FastifyReply) => {
    const { projectId } = req.params as { projectId: string };
    const { runId, limit = '200' } = req.query as { runId?: string; limit?: string };

    let effectiveRunId = runId;
    if (!effectiveRunId) {
      // Look up most recent run from agent_runs
      const row = db.prepare(
        'SELECT id FROM agent_runs WHERE project_id = ? ORDER BY started_at DESC LIMIT 1'
      ).get(projectId) as { id?: string } | undefined;
      effectiveRunId = row?.id;
    }

    if (!effectiveRunId) return reply.send({ milestones: [], runId: null });

    const rows = db.prepare(`
      SELECT id, parent_id, title, detail, status, source, iteration, files_changed,
             created_at, updated_at
      FROM loop_milestones
      WHERE project_id = ? AND run_id = ?
      ORDER BY created_at ASC
      LIMIT ?
    `).all(projectId, effectiveRunId, parseInt(limit, 10)) as any[];

    return reply.send({ milestones: rows, runId: effectiveRunId });
  });

  // GET /api/project-factory/quality/:projectId
  // Returns quality snapshots for the most recent (or specified) run.
  app.get('/quality/:projectId', async (req: FastifyRequest, reply: FastifyReply) => {
    const { projectId } = req.params as { projectId: string };
    const { runId, limit = '100' } = req.query as { runId?: string; limit?: string };

    let effectiveRunId = runId;
    if (!effectiveRunId) {
      const row = db.prepare(
        'SELECT id FROM agent_runs WHERE project_id = ? ORDER BY started_at DESC LIMIT 1'
      ).get(projectId) as { id?: string } | undefined;
      effectiveRunId = row?.id;
    }

    if (!effectiveRunId) return reply.send({ snapshots: [], runId: null });

    const rows = db.prepare(`
      SELECT id, iteration, build_ok, tests_ok, lint_ok,
             error_count, test_pass_count, test_fail_count,
             files_changed, tokens_used, summary, created_at
      FROM loop_quality_snapshots
      WHERE project_id = ? AND run_id = ?
      ORDER BY iteration ASC
      LIMIT ?
    `).all(projectId, effectiveRunId, parseInt(limit, 10)) as any[];

    // Compute aggregate stats
    const total = rows.length;
    const buildsOk = rows.filter((r: any) => r.build_ok).length;
    const testsOk = rows.filter((r: any) => r.tests_ok).length;
    const lintOk = rows.filter((r: any) => r.lint_ok).length;

    return reply.send({
      snapshots: rows,
      runId: effectiveRunId,
      stats: { total, buildsOk, testsOk, lintOk },
    });
  });

  // GET /api/project-factory/import-analyses/:projectId
  app.get('/import-analyses/:projectId', async (req: FastifyRequest, reply: FastifyReply) => {
    const { projectId } = req.params as { projectId: string };
    const rows = db.prepare(`
      SELECT id, folder_path, file_count, estimated_loc, health_score,
             language_breakdown, tech_stack, todo_count, fixme_count, test_file_count,
             recommended_workflow_mode, recommended_strategy_template, created_at
      FROM import_analyses
      WHERE project_id = ?
      ORDER BY created_at DESC
      LIMIT 10
    `).all(projectId) as any[];

    return reply.send({
      analyses: rows.map((r: any) => ({
        ...r,
        language_breakdown: JSON.parse(r.language_breakdown || '{}'),
        tech_stack: JSON.parse(r.tech_stack || '[]'),
      })),
    });
  });

  // POST /api/project-factory/settings — persist governance settings (model cycling, etc.)
  app.post('/settings', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as Record<string, unknown>;
    if (body.modelCyclingEnabled !== undefined) {
      const val = Boolean(body.modelCyclingEnabled);
      db.prepare(`INSERT OR REPLACE INTO app_kv (key, value, updated_at) VALUES ('project_factory:model_cycling_enabled', ?, datetime('now'))`).run(val ? '1' : '0');
    }
    return reply.send({ ok: true });
  });

  // GET /api/project-factory/settings — read governance settings
  app.get('/settings', async (_req, reply: FastifyReply) => {
    const cyclingRow = db.prepare(`SELECT value FROM app_kv WHERE key = 'project_factory:model_cycling_enabled'`).get() as { value: string } | undefined;
    return reply.send({
      modelCyclingEnabled: cyclingRow ? cyclingRow.value === '1' : true,
    });
  });
}
