import sys
import time
import uuid
import pygame
import numpy as np

# water_sim_v2.py
# Extended from original: adds an RBY singularity organism and "viable feeding matter"
# Requires: pygame, numpy
# Run: python water_sim_v2.py

# Config
SCREEN_W, SCREEN_H = 900, 600
GRID_W, GRID_H = 240, 160         # grid resolution (lower = faster)
G = 9.8                           # gravity-like constant
DT = 0.12                         # time step
DAMP = 0.998                      # velocity damping
HEIGHT_BASE = 1.0                 # resting height
FORCE_RADIUS = 6                  # mouse disturbance radius (grid cells)
FORCE_STRENGTH = 2.5              # mouse disturbance amplitude
COLOR_SCALE = 120.0               # how strongly heights map to color

# Organism / particle config
N_PARTICLES = 400
PARTICLE_LIFE = 600               # frames
PARTICLE_SPEED_CLAMP = 2.5
ORGANISM_RADIUS = 6               # grid cells
ORGANISM_CONSUME_THRESHOLD = 0.15 # RBY similarity threshold
ORGANISM_CAPACITY = 12            # how many particles to consume before deposit
PARTICLE_FEED_GAIN = 0.02         # how much height is reduced on consumption

pygame.init()
screen = pygame.display.set_mode((SCREEN_W, SCREEN_H))
pygame.display.set_caption("2D Field / Water-like Simulation + RBY organism")
clock = pygame.time.Clock()

# Grid arrays (ny, nx)
nx, ny = GRID_W, GRID_H
h = np.full((ny, nx), HEIGHT_BASE, dtype=np.float32)   # height (water depth)
u = np.zeros_like(h)                                   # x-velocity
v = np.zeros_like(h)                                   # y-velocity

# optional bottom/topography (adds obstacles): keep flat now
bottom = np.zeros_like(h)

# Helpers
def add_perturb(xg, yg, strength):
    gx = np.arange(nx)
    gy = np.arange(ny)[:, None]
    dx = gx - xg
    dy = gy - yg
    r2 = dx*dx + dy*dy
    mask = r2 <= FORCE_RADIUS*FORCE_RADIUS
    h[mask] += strength * np.exp(-r2[mask]/(FORCE_RADIUS*FORCE_RADIUS))

def step():
    global h, u, v
    h_right = np.roll(h, -1, axis=1)
    h_left  = np.roll(h,  1, axis=1)
    h_up    = np.roll(h, -1, axis=0)
    h_down  = np.roll(h,  1, axis=0)

    dhdx = (h_right - h_left) * 0.5
    dhdy = (h_up - h_down) * 0.5

    u += -G * dhdx * DT
    v += -G * dhdy * DT

    u *= DAMP
    v *= DAMP

    u_right = np.roll(u, -1, axis=1)
    u_left  = np.roll(u,  1, axis=1)
    v_up    = np.roll(v, -1, axis=0)
    v_down  = np.roll(v,  1, axis=0)

    div = (u_right - u_left) * 0.5 + (v_up - v_down) * 0.5
    h += -div * DT

    mask = h < 0.01
    if np.any(mask):
        h[mask] = 0.01
        u[mask] *= -0.3
        v[mask] *= -0.3

    mean_h = np.mean(h)
    h += (HEIGHT_BASE - mean_h) * 0.0005

def height_to_surface():
    diff = (h - HEIGHT_BASE) * COLOR_SCALE
    blue = np.clip(120 + diff, 0, 255).astype(np.uint8)
    green = np.clip(80 + diff * 0.3, 0, 255).astype(np.uint8)
    red = np.clip(30 + diff * 0.15, 0, 255).astype(np.uint8)
    rgb = np.dstack([red, green, blue])
    surf = pygame.surfarray.make_surface(np.transpose(rgb, (1, 0, 2)))
    return pygame.transform.smoothscale(surf, (SCREEN_W, SCREEN_H))

# Initial random noise for visual interest
rng = np.random.default_rng(12345)
h += (rng.random(h.shape) - 0.5) * 0.02

# --- RBY particle + organism implementation ---

def rby_to_rgb_tuple(rby):
    # RBY expected normalized array-like [r,b,y] sum~1
    r, b, y = np.clip(rby, 0.0, 1.0)
    # Map to RGB sensibly: R->R, B->B, Y -> mix of R+G
    rr = int(255 * r + 80 * y)
    gg = int(255 * (y * 0.7) + 30 * b)
    bb = int(255 * b + 30 * r)
    rr = max(0, min(255, rr))
    gg = max(0, min(255, gg))
    bb = max(0, min(255, bb))
    return (rr, gg, bb)

class Particle:
    def __init__(self, gx, gy, rby, life):
        self.gx = float(gx)  # grid coordinates (0..nx)
        self.gy = float(gy)
        self.rby = np.array(rby, dtype=np.float32)
        self.life = life
        self.id = uuid.uuid4().hex[:8]

    def is_alive(self):
        return self.life > 0

class SingularityOrganism:
    def __init__(self, gx, gy):
        self.gx = gx
        self.gy = gy
        # RBY internal store (sum of consumed)
        self.store = np.zeros(3, dtype=np.float32)
        self.count = 0
        self.deposits = []  # list of deposit artifacts
        self.id = uuid.uuid4().hex[:8]

    def consume_if_viable(self, p: Particle):
        # similarity by L2 between normalized RBYs
        if p.life <= 0:
            return False
        rby_p = p.rby / (np.sum(p.rby) + 1e-12)
        if np.sum(self.store) == 0:
            rby_org = rby_p  # no prior bias
        else:
            rby_org = (self.store / (np.sum(self.store) + 1e-12))
        similarity = 1.0 - np.linalg.norm(rby_org - rby_p)
        if similarity >= ORGANISM_CONSUME_THRESHOLD:
            # consume: accumulate, kill particle, and reduce local water height
            self.store += p.rby
            self.count += 1
            p.life = 0
            # decrease local height slightly (feeding matter drained)
            ix = int(np.clip(self.gx, 0, nx-1))
            iy = int(np.clip(self.gy, 0, ny-1))
            h[iy, ix] = max(0.01, h[iy, ix] - PARTICLE_FEED_GAIN)
            # deposit when capacity reached
            if self.count >= ORGANISM_CAPACITY:
                self.make_deposit()
            return True
        return False

    def make_deposit(self):
        # create a simple deposit artifact (color glyph + stats)
        total = np.sum(self.store)
        if total <= 0:
            return
        rby_norm = (self.store / total).tolist()
        glyph = {
            'deposit_id': f"dep_{int(time.time())}_{uuid.uuid4().hex[:6]}",
            'rby': rby_norm,
            'rgb': rby_to_rgb_tuple(rby_norm),
            'timestamp': time.time(),
            'source': self.id
        }
        self.deposits.append(glyph)
        # reset store and count
        self.store[:] = 0.0
        self.count = 0

# Initialize particles with random positions and RBY values
def spawn_particles(n):
    parts = []
    for _ in range(n):
        gx = rng.random() * (nx - 1)
        gy = rng.random() * (ny - 1)
        # sample an RBY triplet biased around some modes
        modes = np.array([[0.8,0.05,0.15],[0.1,0.8,0.1],[0.2,0.2,0.6]])
        m = modes[rng.integers(0,3)]
        rby = m + (rng.random(3)-0.5)*0.2
        rby = np.clip(rby, 0.01, 0.9)
        parts.append(Particle(gx, gy, rby, life=PARTICLE_LIFE))
    return parts

particles = spawn_particles(N_PARTICLES)
# Put organism at center grid coords (does not move by itself)
organism = SingularityOrganism(nx//2, ny//2)

def bilinear_velocity_at(px, py):
    # px,py in grid coords (float). sample u,v with bilinear interpolation and periodic wrap
    x0 = int(np.floor(px)) % nx
    x1 = (x0 + 1) % nx
    y0 = int(np.floor(py)) % ny
    y1 = (y0 + 1) % ny
    sx = px - np.floor(px)
    sy = py - np.floor(py)
    u00 = u[y0, x0]; u10 = u[y0, x1]; u01 = u[y1, x0]; u11 = u[y1, x1]
    v00 = v[y0, x0]; v10 = v[y0, x1]; v01 = v[y1, x0]; v11 = v[y1, x1]
    ux0 = u00*(1-sx) + u10*sx
    ux1 = u01*(1-sx) + u11*sx
    uy = ux0*(1-sy) + ux1*sy
    vx0 = v00*(1-sx) + v10*sx
    vx1 = v01*(1-sx) + v11*sx
    vy = vx0*(1-sy) + vx1*sy
    return uy, vy

def update_particles():
    for p in particles:
        if not p.is_alive():
            continue
        # advect by local velocity
        velx, vely = bilinear_velocity_at(p.gx, p.gy)
        # small damping / clamp
        velx = np.clip(velx, -PARTICLE_SPEED_CLAMP, PARTICLE_SPEED_CLAMP)
        vely = np.clip(vely, -PARTICLE_SPEED_CLAMP, PARTICLE_SPEED_CLAMP)
        # convert dt to grid movement scale (a heuristic)
        p.gx += velx * 0.5 * DT * nx
        p.gy += vely * 0.5 * DT * ny
        # wrap around
        p.gx %= nx
        p.gy %= ny
        # slowly fade life
        p.life -= 1
        # if near organism, attempt consume
        dx = p.gx - organism.gx
        dy = p.gy - organism.gy
        if dx*dx + dy*dy <= ORGANISM_RADIUS*ORGANISM_RADIUS:
            organism.consume_if_viable(p)

# --- End organism / particle implementation ---

running = True
mouse_down = False
while running:
    for ev in pygame.event.get():
        if ev.type == pygame.QUIT:
            running = False
        elif ev.type == pygame.KEYDOWN and ev.key == pygame.K_ESCAPE:
            running = False
        elif ev.type == pygame.MOUSEBUTTONDOWN:
            mouse_down = True
            mx, my = pygame.mouse.get_pos()
            gx = int(mx / SCREEN_W * nx)
            gy = int(my / SCREEN_H * ny)
            add_perturb(gx, gy, FORCE_STRENGTH * 2.0)
        elif ev.type == pygame.MOUSEBUTTONUP:
            mouse_down = False

    if mouse_down:
        mx, my = pygame.mouse.get_pos()
        gx = int(mx / SCREEN_W * nx)
        gy = int(my / SCREEN_H * ny)
        add_perturb(gx, gy, FORCE_STRENGTH)

    # multiple small substeps for stability
    for _ in range(2):
        step()

    # update particles (advect and possible consumption)
    update_particles()

    surf = height_to_surface()
    screen.blit(surf, (0, 0))

    # render particles (sparse)
    for p in particles:
        if not p.is_alive():
            continue
        sx = int(p.gx / nx * SCREEN_W)
        sy = int(p.gy / ny * SCREEN_H)
        color = rby_to_rgb_tuple(p.rby / (np.sum(p.rby) + 1e-12))
        pygame.draw.circle(screen, color, (sx, sy), 2)

    # render organism
    ox = int(organism.gx / nx * SCREEN_W)
    oy = int(organism.gy / ny * SCREEN_H)
    # organism visible color = average of stored RBY or white if empty
    if np.sum(organism.store) > 0:
        col = rby_to_rgb_tuple((organism.store / (np.sum(organism.store) + 1e-12)))
    else:
        col = (200, 200, 200)
    pygame.draw.circle(screen, col, (ox, oy), int(ORGANISM_RADIUS / nx * SCREEN_W) + 6)
    pygame.draw.circle(screen, (0,0,0), (ox, oy), int(ORGANISM_RADIUS / nx * SCREEN_W) + 6, 1)

    # deposits overlay (small colored boxes at top-left)
    for i, d in enumerate(organism.deposits[-10:]):
        bx = 8 + i * 22
        by = 8
        pygame.draw.rect(screen, d['rgb'], (bx, by, 18, 18))
        # slight border
        pygame.draw.rect(screen, (0,0,0), (bx, by, 18, 18), 1)

    # small HUD: counts
    font = pygame.font.get_default_font()
    f = pygame.font.Font(font, 14)
    text_surf = f.render(f"Particles alive: {sum(1 for p in particles if p.is_alive())}   Deposits: {len(organism.deposits)}", True, (255,255,255))
    screen.blit(text_surf, (8, SCREEN_H - 24))

    # optional overlay: velocity vectors (sparse)
    if True:
        step_x = max(1, nx // 24)
        step_y = max(1, ny // 16)
        scale = 12.0
        for gy in range(0, ny, step_y):
            for gx in range(0, nx, step_x):
                sx = int(gx / nx * SCREEN_W)
                sy = int(gy / ny * SCREEN_H)
                vx = u[gy, gx]
                vy = v[gy, gx]
                ex = int(sx + vx * scale)
                ey = int(sy + vy * scale)
                pygame.draw.line(screen, (255, 255, 255, 50), (sx, sy), (ex, ey), 1)
                pygame.draw.circle(screen, (255,255,255), (sx, sy), 1)

    pygame.display.flip()
    clock.tick(60)

pygame.quit()
sys.exit()
