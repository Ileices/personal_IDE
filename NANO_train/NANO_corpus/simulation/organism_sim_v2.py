import pygame
import random
import math
import time
from collections import deque
import os
import sys
import py_compile
import subprocess
import tempfile

"""
Real-time 2D simulation inspired by the AE / C-AE hypothesis.

This extended version can:
- Read its own source file.
- Generate a variant by minor edits and appended self-test harness.
- Show the generated code in a text field.
- Test the generated file (syntax + quick headless self-test).
- Attempt a simple fallback correction if the first generated variant fails.
Controls:
    G - generate variant from current source
    T - test current generated variant (syntax + headless self-test)
    W - write the generated variant to disk as "<original>.gen.py"
    SPACE - toggle alternator
    C - clear storage
    ESC / close - quit
"""

# Configuration
WIDTH, HEIGHT = 1200, 760
SIM_W = 820  # left simulation width
STORAGE_W = WIDTH - SIM_W  # right storage width
FPS = 60

# Simulation params
SPAWN_BASE_RATE = 0.6  # average new blobs per second
ALTERNATOR_BOOST = 3.0  # multiplier to instability/spawn when alternator active
STORAGE_GRID_COLS = 6
STORAGE_PADDING = 10
THRESHOLD_MIN = 0.85
THRESHOLD_MAX = 0.90
THRESHOLD = 0.9  # compression threshold

pygame.init()
FONT = pygame.font.SysFont("Consolas", 16)
BIGFONT = pygame.font.SysFont("Consolas", 20)

screen = pygame.display.set_mode((WIDTH, HEIGHT))
clock = pygame.time.Clock()
pygame.display.set_caption("AE / C-AE 2D Simulation (self-generating)")

# Utility RBY -> RGB mapping (simple)
def rby_to_rgb(rby):
    # rby values expected in [0,1]
    r, b, y = rby
    # interpret Y as intensity and mix R and B
    g = max(0.0, y - 0.2)
    r_col = int(255 * min(1.0, r + 0.2 * y))
    g_col = int(255 * min(1.0, g + 0.1 * r))
    b_col = int(255 * min(1.0, b + 0.1 * y))
    return (r_col, g_col, b_col)

class Blob:
    def __init__(self, pos, seed= None, generation=0):
        self.pos = pos
        self.generation = generation
        self.seed = seed if seed is not None else random.random()
        self.radius = 3 + random.random()*6
        self.growth = 20 + random.random()*40  # pixels per second
        self.age = 0.0
        self.alive = True
        # Each blob has RBY weights by simple rules (perception-cognition-execution)
        self.rby = [random.random(), random.random(), random.random()]
        self.normalize_rby()
        # peak threshold for deposit (Λ)
        self.lambda_radius = 50 + random.random()*150 * (1.0 + 0.5*self.generation)
        # instability counter to compute rough second derivative sign
        self.prev_radius = self.radius
        self.prev_growth = self.growth
        # internal affective metrics (danger/hunger/pain/pleasure) — simple scalar trackers
        self.danger = 0.0
        self.hunger = random.uniform(0.0, 1.0)
        self.pain = 0.0
        self.pleasure = 0.0

    def normalize_rby(self):
        s = sum(self.rby)
        if s <= 0:
            s = 1.0
        self.rby = [v/s for v in self.rby]

    def step(self, dt, alternator=False):
        # If alternator active, add noise and potential instability
        instability = 1.0 + (random.uniform(-0.6,0.6) * (2.0 if alternator else 0.3))
        self.prev_radius = self.radius
        self.prev_growth = self.growth
        self.radius += self.growth * dt * instability
        # small decay of growth simulating drag
        self.growth *= (1.0 - 0.08*dt*(1.0 if not alternator else 3.0))
        self.age += dt

        # update simple affective metrics
        # danger increases with abrupt shrinkage / negative second derivative
        d2 = (self.radius - 2*self.prev_radius + (self.prev_radius - (self.prev_radius - self.prev_growth*dt))) / (dt*dt + 1e-6)
        self.danger = max(0.0, self.danger + max(0.0, -d2)*0.001)
        # hunger increases slowly, reduced by deposits (external)
        self.hunger = min(1.0, self.hunger + 0.01*dt)
        # small random pleasure spikes when growth is strong
        self.pleasure = max(0.0, self.pleasure*0.95 + max(0.0, self.growth-30)*0.001)
        # pain increases on fragmentation (modeled as large instability)
        if instability > 1.8:
            self.pain += 0.02

        # if radius reached lambda or growth slowed significantly -> deposit
        if self.radius >= self.lambda_radius or self.growth < 2.0 or d2 < -50:
            self.alive = False
            # deposit reduces hunger and yields pleasure
            self.hunger = max(0.0, self.hunger - 0.3)
            self.pleasure = min(1.0, self.pleasure + 0.2)
            return "deposit"
        # random chance to recurse spawn (IC-AE)
        if self.age > 0.5 + random.random()*2.0 and random.random() < 0.01*max(1, 3-self.generation):
            # recursion costs some energy (pain)
            self.pain = min(1.0, self.pain + 0.05)
            return "recurse"
        return None

    def draw(self, surf):
        # color based on rby and generation plus affective overlay (slightly tinted by danger/pain)
        base = rby_to_rgb(self.rby)
        tint = int(80*min(1.0, self.danger + self.pain))
        col = (min(255, base[0]+tint), max(0, base[1]-tint//2), max(0, base[2]-tint//3))
        pygame.draw.circle(surf, col, (int(self.pos[0]), int(self.pos[1])), int(self.radius), 2)
        # small core
        pygame.draw.circle(surf, col, (int(self.pos[0]), int(self.pos[1])), max(2, int(self.radius*0.12)))

class Storage:
    def __init__(self, cols, area_rect, threshold=THRESHOLD):
        self.cols = cols
        self.area = pygame.Rect(area_rect)
        self.cells = []
        self.max_cells = 500  # cap to avoid memory blow
        self.threshold = threshold
        self.compressed = deque()  # store compressed glyphs
        self.reset()

    def reset(self):
        self.cells = []
        self.compressed = deque()

    def add_glyph(self, rby, metadata=None):
        # store glyph with timestamp and metadata
        cell = {
            "rby": rby,
            "rgb": rby_to_rgb(rby),
            "t": time.time(),
            "meta": metadata,
            "used": 0
        }
        self.cells.append(cell)
        # limit
        if len(self.cells) > self.max_cells:
            self.cells.pop(0)

    def occupancy(self):
        # approximate occupancy: number of glyphs vs capacity (grid can scroll)
        cap = self.capacity_estimate()
        return min(1.0, len(self.cells)/max(1, cap))

    def capacity_estimate(self):
        # number of small tiles that can fit in the area (visual)
        cols = self.cols
        w = (self.area.width - 2*STORAGE_PADDING) // cols
        rows = max(1, (self.area.height - 2*STORAGE_PADDING) // w)
        return cols * rows

    def compress_if_needed(self):
        occ = self.occupancy()
        if occ >= self.threshold:
            # compress oldest 15% into compressed pool (simulate jpg colors)
            n = max(1, int(len(self.cells)*0.15))
            for _ in range(n):
                old = self.cells.pop(0)
                # convert to compressed representation (reduce color precision)
                r,g,b = old["rgb"]
                cr = (r//16)*16
                cg = (g//16)*16
                cb = (b//16)*16
                self.compressed.append({"rgb": (cr,cg,cb), "t": time.time()})
            return True
        return False

    def reclaim_space(self):
        # simple LRU deletion if still over cap: delete some oldest compressed first then raw cells
        while self.occupancy() > 0.95 and (len(self.cells) > 0):
            self.cells.pop(0)

    def draw(self, surf):
        # draw area
        pygame.draw.rect(surf, (30,30,30), self.area)
        # draw grid of cells
        cols = self.cols
        x0 = self.area.left + STORAGE_PADDING
        y0 = self.area.top + STORAGE_PADDING
        w = (self.area.width - 2*STORAGE_PADDING) // cols
        if w < 6:
            return
        rows = max(1, (self.area.height - 2*STORAGE_PADDING) // w)
        cap = cols*rows
        # show latest cells in grid (most recent at start)
        to_show = self.cells[-cap:]
        # fill from top-left to bottom-right
        i = 0
        for r in range(rows):
            for c in range(cols):
                if i >= len(to_show):
                    break
                cell = to_show[i]
                rect = pygame.Rect(x0 + c*w, y0 + r*w, w-2, w-2)
                pygame.draw.rect(surf, cell["rgb"], rect)
                i += 1
        # show compressed pool as small row at bottom of storage area
        comp_h = 12
        cx = x0
        cy = self.area.bottom - comp_h - STORAGE_PADDING
        for idx, comp in enumerate(list(self.compressed)[-cols:]):
            rect = pygame.Rect(cx + idx*(w//2), cy, w//2-2, comp_h)
            pygame.draw.rect(surf, comp["rgb"], rect)
        # occupancy bar
        occ = self.occupancy()
        bar_h = 8
        bar_w = self.area.width - 2*STORAGE_PADDING
        bar_x = x0
        bar_y = self.area.bottom - comp_h - STORAGE_PADDING - 16
        pygame.draw.rect(surf, (50,50,50), (bar_x, bar_y, bar_w, bar_h))
        pygame.draw.rect(surf, (200,200,70), (bar_x, bar_y, int(bar_w*occ), bar_h))

# --- Self-generation utilities ------------------------------------------------

def read_own_source():
    try:
        path = os.path.abspath(__file__)
        with open(path, 'r', encoding='utf-8') as f:
            return f.read(), path
    except Exception:
        # fallback: try sys.argv[0]
        path = os.path.abspath(sys.argv[0])
        with open(path, 'r', encoding='utf-8') as f:
            return f.read(), path

def generate_variant(source):
    """
    Create a conservative variant of source by:
    - bumping SPAWN_BASE_RATE
    - adding a small set of constants for affective metrics
    - appending a headless self-test hook
    Returns variant_source (string).
    """
    variant = source
    # simple replacement: increase spawn rate
    variant = variant.replace("SPAWN_BASE_RATE = 0.6", "SPAWN_BASE_RATE = 0.85  # generator bumped rate")
    # inject extra config constants after THRESHOLD definition (if present)
    insert_marker = "THRESHOLD = 0.9  # compression threshold"
    if insert_marker in variant:
        injection = insert_marker + "\n\n# Auto-generated metrics scaling (injected by generator)\nDANGER_SCALE = 1.0\nHUNGER_RATE = 0.01\nPLEASURE_SCALE = 1.0\nPAIN_SENSITIVITY = 1.0\n"
        variant = variant.replace(insert_marker, injection)
    # append a lightweight self-test harness before the original final main invocation
    final_call = "if __name__ == \"__main__\":\n    main()\n"
    if final_call in variant:
        harness = (
            "if __name__ == \"__main__\":\n"
            "    import sys\n"
            "    if '--selftest' in sys.argv:\n"
            "        # quick headless checks: instantiate core classes and step them to detect runtime errors\n"
            "        def self_test():\n"
            "            try:\n"
            "                center=(SIM_W//2, HEIGHT//2)\n"
            "                b=Blob((center[0],center[1]))\n"
            "                for _ in range(8):\n"
            "                    b.step(0.016, alternator=False)\n"
            "                s=Storage(STORAGE_GRID_COLS,(SIM_W+5,5,STORAGE_W-10,HEIGHT-10))\n"
            "                s.add_glyph(b.rby)\n"
            "                s.compress_if_needed()\n"
            "            except Exception as e:\n"
            "                print('SELFTEST_ERROR', e)\n"
            "                sys.exit(2)\n"
            "            print('SELFTEST_OK')\n"
            "            sys.exit(0)\n"
            "        self_test()\n"
            "    else:\n"
            "        main()\n"
        )
        variant = variant.replace(final_call, harness)
    else:
        # if not found, just append harness
        variant += ("\n\n# appended self-test harness\n" + final_call)
    return variant

def write_variant_to_file(variant_text, original_path):
    out_path = original_path + ".gen.py"
    with open(out_path, 'w', encoding='utf-8') as f:
        f.write(variant_text)
    return out_path

def test_variant_file(path):
    """
    Test variant by compiling then running with --selftest flag.
    Returns (ok:bool, output:str).
    """
    try:
        py_compile.compile(path, doraise=True)
    except py_compile.PyCompileError as e:
        return False, "COMPILE_ERROR: " + str(e)
    # run headless self-test
    try:
        proc = subprocess.run([sys.executable, path, '--selftest'],
                              stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=6)
        out = proc.stdout.decode('utf-8', errors='replace')
        if proc.returncode == 0 and "SELFTEST_OK" in out:
            return True, out
        else:
            return False, out
    except subprocess.TimeoutExpired:
        return False, "TIMEOUT"
    except Exception as e:
        return False, "RUN_ERROR: " + str(e)

def attempt_auto_fix(original_source):
    """
    If the first generated variant fails, try a simpler variant (only bump spawn rate).
    """
    # fallback: only replace spawn rate, do not append harness
    fallback = original_source.replace("SPAWN_BASE_RATE = 0.6", "SPAWN_BASE_RATE = 0.7  # fallback bump")
    # ensure final main call present for normal runs
    if "if __name__ == \"__main__\":\n    main()\n" not in fallback:
        fallback += "\nif __name__ == \"__main__\":\n    main()\n"
    return fallback

# --- Main program UI + simulation (keeps most of your original runtime) ------------

def main():
    running = True
    alternator = False
    spawn_acc = 0.0
    blobs = []
    storage = Storage(STORAGE_GRID_COLS, (SIM_W+5, 5, STORAGE_W-10, HEIGHT-10))
    center = (SIM_W//2, HEIGHT//2)
    last_time = time.time()

    # generator state
    original_source, original_path = read_own_source()
    generated_source = None
    generated_path = None
    last_test_result = ("idle", "")
    metrics = {"danger": 0.0, "hunger": 0.0, "pain": 0.0, "pleasure": 0.0, "tests": 0, "fails": 0}

    # seed a few blobs
    for _ in range(6):
        b = Blob((center[0] + random.uniform(-40,40), center[1] + random.uniform(-40,40)))
        blobs.append(b)

    while running:
        dt = clock.tick(FPS) / 1000.0
        events = pygame.event.get()
        for e in events:
            if e.type == pygame.QUIT:
                running = False
            elif e.type == pygame.KEYDOWN:
                if e.key == pygame.K_SPACE:
                    alternator = not alternator
                elif e.key == pygame.K_c:
                    storage.reset()
                elif e.key == pygame.K_g:
                    # generate variant from current original source
                    generated_source = generate_variant(original_source)
                    # reset last test info
                    last_test_result = ("generated", "ready")
                elif e.key == pygame.K_t:
                    # test current generated variant (try generation if none)
                    if generated_source is None:
                        generated_source = generate_variant(original_source)
                    # write to temp file and test
                    with tempfile.NamedTemporaryFile('w', delete=False, suffix=".py", encoding='utf-8') as tf:
                        tf.write(generated_source)
                        tf.flush()
                        tmp_path = tf.name
                    ok, out = test_variant_file(tmp_path)
                    if not ok:
                        # attempt fallback auto-fix
                        fallback_src = attempt_auto_fix(original_source)
                        with tempfile.NamedTemporaryFile('w', delete=False, suffix=".py", encoding='utf-8') as tf2:
                            tf2.write(fallback_src)
                            tmp2 = tf2.name
                        ok2, out2 = test_variant_file(tmp2)
                        if ok2:
                            generated_source = fallback_src
                            out = "FALLBACK_OK\n" + out2
                            ok = True
                        else:
                            out = "PRIMARY_FAIL:\n" + out + "\nFALLBACK_FAIL:\n" + out2
                            ok = False
                    last_test_result = ("OK" if ok else "FAIL", out[:2000])
                    metrics["tests"] += 1
                    if not ok:
                        metrics["fails"] += 1
                    # cleanup temp files
                    try:
                        os.remove(tmp_path)
                    except Exception:
                        pass
                    try:
                        os.remove(tmp2)
                    except Exception:
                        pass
                elif e.key == pygame.K_w:
                    # write generated variant to disk
                    if generated_source:
                        generated_path = write_variant_to_file(generated_source, original_path)
                        last_test_result = ("written", generated_path)
                elif e.key == pygame.K_ESCAPE:
                    running = False

        # spawn logic with base rate, increased when alternator is on
        rate = SPAWN_BASE_RATE * (ALTERNATOR_BOOST if alternator else 1.0)
        spawn_acc += dt * rate
        while spawn_acc >= 1.0:
            spawn_acc -= 1.0
            # spawn near center with slight offset
            pos = (center[0] + random.uniform(-30,30), center[1] + random.uniform(-30,30))
            blobs.append(Blob(pos))

        # step blobs
        new_blobs = []
        for b in blobs:
            result = b.step(dt, alternator=alternator)
            if result == "deposit":
                # produce glyph into storage; metadata carries generation & age
                storage.add_glyph(b.rby, metadata={"generation": b.generation, "age": b.age})
                # slight chance to leave a residual micro-Λ shard (small blob)
                if random.random() < 0.25 and b.generation < 3:
                    shard = Blob((b.pos[0] + random.uniform(-8,8), b.pos[1] + random.uniform(-8,8)), generation=b.generation+1)
                    shard.radius = max(2, b.radius*0.08)
                    new_blobs.append(shard)
            elif result == "recurse":
                # spawn a child IC-AE
                if b.generation < 4:
                    child = Blob((b.pos[0] + random.uniform(-15,15), b.pos[1] + random.uniform(-15,15)), generation=b.generation+1)
                    new_blobs.append(child)
                # keep parent possibly shorter-lived
                b.growth *= 0.7
                new_blobs.append(b)
            elif b.alive:
                new_blobs.append(b)
        blobs = new_blobs

        # occasionally alternator-driven fragmentation: spawn many tiny blobs
        if alternator and random.random() < 0.03:
            for _ in range(3):
                blobs.append(Blob((center[0] + random.uniform(-80,80), center[1] + random.uniform(-80,80))))

        # Storage maintenance
        compressed = storage.compress_if_needed()
        if compressed:
            storage.reclaim_space()

        # compute simple aggregate metrics for display
        if blobs:
            metrics["danger"] = sum(b.danger for b in blobs)/len(blobs)
            metrics["hunger"] = sum(b.hunger for b in blobs)/len(blobs)
            metrics["pain"] = sum(b.pain for b in blobs)/len(blobs)
            metrics["pleasure"] = sum(b.pleasure for b in blobs)/len(blobs)
        else:
            metrics["danger"] = metrics["hunger"] = metrics["pain"] = metrics["pleasure"] = 0.0

        # Drawing
        screen.fill((10,10,16))
        # simulation area background and center
        sim_area = pygame.Rect(0,0,SIM_W,HEIGHT)
        pygame.draw.rect(screen, (14,14,22), sim_area)
        # draw central C-AE crystal-ish
        pygame.draw.circle(screen, (180,220,255), center, 36, 2)
        pygame.draw.circle(screen, (100,160,220), center, 8)
        # draw blobs
        for b in blobs:
            b.draw(screen)

        # overlay UI text (left)
        lines = [
            f"Blobs: {len(blobs)}",
            f"Storage glyphs: {len(storage.cells)}",
            f"Compressed pool: {len(storage.compressed)}",
            f"Occupancy: {storage.occupancy()*100:.1f}%",
            f"Alternator: {'ON' if alternator else 'off'} (press SPACE)",
            f"Spawn rate: {SPAWN_BASE_RATE:.2f}",
            "Press G to generate variant, T to test, W to write variant",
            "Press C to clear storage, ESC to quit"
        ]
        for i, line in enumerate(lines):
            txt = FONT.render(line, True, (200,200,200))
            screen.blit(txt, (8,8 + i*18))

        # draw storage area (right)
        storage.draw(screen)

        # draw generated code preview as simple scrollable text block
        text_x = SIM_W + 8
        text_y = HEIGHT//2 - 200
        preview_height = 380
        pygame.draw.rect(screen, (18,18,24), (text_x-4, text_y-4, STORAGE_W-16, preview_height+8))
        title = BIGFONT.render("Generated variant preview (G -> generate, T -> test, W -> write)", True, (220,220,120))
        screen.blit(title, (text_x, text_y))
        if generated_source:
            # show first N lines
            preview_lines = generated_source.splitlines()[:20]
            for i, pl in enumerate(preview_lines):
                t = FONT.render(pl[:110], True, (200,200,200))
                screen.blit(t, (text_x, text_y + 30 + i*16))
        else:
            note = FONT.render("<no generated variant yet>", True, (160,160,160))
            screen.blit(note, (text_x, text_y+30))

        # small diagnostics for generation/testing
        stat_y = HEIGHT - 120
        stat_lines = [
            f"Gen status: {last_test_result[0]}",
            f"Gen info: {str(last_test_result[1])[:120]}",
            f"Generated file: {generated_path if generated_path else '<none>'}",
            f"Tests: {metrics['tests']}  Fails: {metrics['fails']}",
            f"Avg danger:{metrics['danger']:.3f} hunger:{metrics['hunger']:.3f} pain:{metrics['pain']:.3f} pleasure:{metrics['pleasure']:.3f}"
        ]
        for i, sl in enumerate(stat_lines):
            t = FONT.render(sl, True, (200,200,200))
            screen.blit(t, (text_x, stat_y + i*18))

        pygame.display.flip()

    pygame.quit()

if __name__ == "__main__":
    main()