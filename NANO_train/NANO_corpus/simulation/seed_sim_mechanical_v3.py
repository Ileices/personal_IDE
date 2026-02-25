# NOTE something must be missing from their world or the entities logic must be incomplete. 
# we must be missing something since everything goes extinct relatively quick.. 
# what can we do to strengthen our species? not handwave or hardcode survival but where does our logic need to 
# enhance to ensure survival to death isnt skued poorly
# Enhanced seed-bot simulation: integrates magnet intake, oven/recipes, mass-shift locomotion,
# healing, budding, liquid-memory and multiple resource classes into the original pygame sim.
# Save as: seed_sim_mechanical_v3_enhanced.py
# Requires pygame: pip install pygame

import pygame
import random
import math
import sys
from collections import deque, defaultdict

# --- Config ---
WIDTH, HEIGHT = 1000, 700
FPS = 60

NUM_INITIAL_AGENTS = 8
NUM_INITIAL_RESOURCES = 1200
RESOURCE_SPAWN_PER_SEC = 5.8

AGENT_SIZE = 8
AGENT_MAX_ENERGY = 220.0
AGENT_MAX_HEALTH = 100.0

# movement base
AGENT_BASE_SPEED = 80.0
AGENT_ROT_SPEED = 0.01

# intake/oven/harvest
HARVEST_RATE = 70.0
REPRODUCTION_COST = 1.0
REPRODUCTION_THRESHOLD = 2.0

RESOURCE_TYPES = ("FeSand", "FuelF", "C", "A_micro", "Xtoxic")
RESOURCE_SIZE = 3

# colors
BG_COLOR = (18, 18, 28)
AGENT_COLOR = (160, 210, 255)
AGENT_LOW_EN_COLOR = (255, 130, 120)
RESOURCE_COLORS = {
    "FeSand": (200,160,80),
    "FuelF": (255,200,80),
    "C": (200,200,200),
    "A_micro": (150,230,150),
    "Xtoxic": (180,60,140),
}
TEXT_COLOR = (220,220,220)

# --- Utilities ---
def clamp(x, a, b): return max(a, min(b, x))
def angle_diff(a, b):
    d = (b - a + math.pi) % (2*math.pi) - math.pi
    return d
def dist(a, b): return math.hypot(a[0]-b[0], a[1]-b[1])

# --- Recipes (oven) ---
class Recipe:
    def __init__(self, need, product, prod_yield, T_req=800.0, t_ticks=10, energy_cost=1.0, magnetic=False):
        self.need = need
        self.product = product
        self.prod_yield = prod_yield
        self.T_req = T_req
        self.t_ticks = t_ticks
        self.energy_cost = energy_cost
        self.magnetic = magnetic

RECIPE_A = Recipe(need={"A_micro":1.0, "C":0.5}, product="A", prod_yield=1.0, T_req=900.0, t_ticks=12, energy_cost=3.0)
RECIPE_REPAIR = Recipe(need={"FeSand":1.0}, product="RepairSlurry", prod_yield=1.0, T_req=1100.0, t_ticks=8, energy_cost=2.0, magnetic=True)
RECIPE_FUEL = Recipe(need={"FuelF":1.0}, product="EnergyPack", prod_yield=5.0, T_req=700.0, t_ticks=6, energy_cost=0.5)
RECIPE_BUD = Recipe(need={"A":1.0, "FeSand":1.0}, product="BudCasing", prod_yield=1.0, T_req=1000.0, t_ticks=10, energy_cost=4.0, magnetic=True)

# --- World & Resource ---
class Resource:
    def __init__(self, pos, rtype, amount=1.0, mag=0.0):
        self.x, self.y = pos
        self.type = rtype
        self.amount = amount
        # intrinsic magnetic bias (FeSand stronger)
        self.mag = mag

    def draw(self, surf):
        col = RESOURCE_COLORS.get(self.type, (200,200,200))
        pygame.draw.circle(surf, col, (int(self.x), int(self.y)), RESOURCE_SIZE)

class World:
    def __init__(self):
        self.agents = []
        self.resources = []
        self.resource_spawn_acc = 0.0
        self.resource_rate = RESOURCE_SPAWN_PER_SEC

    def add_agent(self, a): self.agents.append(a)
    def remove_agent(self, a):
        if a in self.agents: self.agents.remove(a)
    def add_resource(self, r): self.resources.append(r)

    def spawn_random_resource(self):
        pos = (random.uniform(0, WIDTH), random.uniform(0, HEIGHT))
        rtype = random.choices(RESOURCE_TYPES, weights=[3,2,2,3,1])[0]
        mag = 0.0
        if rtype == "FeSand": mag = random.uniform(0.1, 0.4)
        amt = random.uniform(0.6, 1.6)
        self.add_resource(Resource(pos, rtype, amt, mag))

    def reset(self):
        self.agents.clear()
        self.resources.clear()
        Agent.next_id = 1
        for _ in range(NUM_INITIAL_AGENTS):
            pos = (random.uniform(0, WIDTH), random.uniform(0, HEIGHT))
            self.add_agent(Agent(pos))
        for _ in range(NUM_INITIAL_RESOURCES):
            self.spawn_random_resource()
        self.resource_spawn_acc = 0.0
        self.resource_rate = RESOURCE_SPAWN_PER_SEC

    def update(self, dt):
        # spawn resources over time
        self.resource_spawn_acc += dt * self.resource_rate
        while self.resource_spawn_acc >= 1.0:
            self.resource_spawn_acc -= 1.0
            self.spawn_random_resource()

        # update agents (copy for safe mutation)
        for a in list(self.agents):
            a.update(dt, self)

        # simple mutual avoidance
        n = len(self.agents)
        for i in range(n):
            a = self.agents[i]
            for j in range(i+1, n):
                b = self.agents[j]
                dx = b.x - a.x
                dy = b.y - a.y
                # wrap-around shortest
                if dx > WIDTH/2: dx -= WIDTH
                if dx < -WIDTH/2: dx += WIDTH
                if dy > HEIGHT/2: dy -= HEIGHT
                if dy < -HEIGHT/2: dy += HEIGHT
                d2 = dx*dx + dy*dy
                minr = AGENT_SIZE*2
                if d2 > 0 and d2 < minr*minr:
                    d = math.sqrt(d2)
                    overlap = (minr - d) * 0.5
                    if d == 0:
                        ux, uy = random.uniform(-1,1), random.uniform(-1,1)
                    else:
                        ux, uy = dx/d, dy/d
                    a.x -= ux * overlap
                    a.y -= uy * overlap
                    b.x += ux * overlap
                    b.y += uy * overlap

# --- Agent (SeedBot-like) ---
class Agent:
    next_id = 1
    def __init__(self, pos):
        self.id = Agent.next_id; Agent.next_id += 1
        self.x, self.y = pos
        self.angle = random.uniform(0, 2*math.pi)
        self.energy = random.uniform(40.0, 120.0)
        self.health = random.uniform(70.0, AGENT_MAX_HEALTH)
        # inventories
        self.pores = defaultdict(float)
        self.sponge = defaultdict(float)
        self.liquid = defaultdict(float)
        self.metal = defaultdict(float)
        self.core = defaultdict(float)
        # oven
        self.oven_q = deque()
        self.oven_job = None
        self.temp = 300.0
        self.trail = deque(maxlen=30)
        # morphology: magnetic ring strength and mass-shift effectiveness
        self.magnet = clamp(random.gauss(0.5,0.15), 0.0, 1.2)
        self.mass_eff = clamp(random.gauss(1.0,0.2), 0.4, 1.6)
        self.target = None
        self.age = 0
        self.buds = 0

    def sense(self, world, scan_radius=80):
        # sense nearby resources, return vector weighted by FeSand & A_micro and toxicity
        vx, vy = 0.0, 0.0
        tox = 0.0
        mag_field = 0.0
        best = None
        best_d = 1e9
        for r in world.resources:
            dx = r.x - self.x
            dy = r.y - self.y
            # wrap-around minimal displacement
            if dx > WIDTH/2: dx -= WIDTH
            if dx < -WIDTH/2: dx += WIDTH
            if dy > HEIGHT/2: dy -= HEIGHT
            if dy < -HEIGHT/2: dy += HEIGHT
            d = math.hypot(dx, dy)
            if d > scan_radius: continue
            w = 1.0/(1.0 + d)
            if r.type == "FeSand":
                vx += w * dx
                vy += w * dy
                mag_field += w * r.mag
            elif r.type == "A_micro":
                vx += 0.8*w * dx
                vy += 0.8*w * dy
            elif r.type == "Xtoxic":
                tox += w * r.amount
                # repellant
                vx -= 0.6*w * dx
                vy -= 0.6*w * dy
            # nearest resource for harvesting
            if d < best_d:
                best_d = d; best = r
        return (vx, vy), tox, mag_field, best

    def intake(self, world, r):
        # intake when overlapping a resource; magnet increases capture chance for metal
        if r is None: return
        if dist((self.x,self.y), (r.x,r.y)) > (AGENT_SIZE + RESOURCE_SIZE + 4): return
        # capture amount scaled by agent magnet and recipe type
        base_take = 0.5
        if r.type == "FeSand":
            take = base_take * (0.6 + 0.8*self.magnet)
        elif r.type == "FuelF":
            take = base_take * 0.7
        elif r.type == "A_micro":
            take = base_take * 0.6
        elif r.type == "C":
            take = base_take * 0.5
        elif r.type == "Xtoxic":
            take = base_take * 0.4
        take = min(take, r.amount)
        if take <= 0: return
        r.amount -= take
        # route to pores and memory liquid
        self.pores[r.type] += take
        self.liquid[r.type] += 0.1 * take
        # magnet also pulls some metal to metal store directly
        if r.type == "FeSand":
            self.metal["FeSand"] += 0.5 * take
        # when resource depleted, remove
        if r.amount <= 1e-3:
            try:
                world.resources.remove(r)
            except ValueError:
                pass
        self.energy -= 0.02 * take

    def route(self):
        # stage pores -> metal/core/liquid
        for k, v in list(self.pores.items()):
            if v <= 0: continue
            if k in ("FeSand", "A_micro", "C"):
                self.metal[k] += v
            elif k == "FuelF":
                self.core["FuelF"] += v
            else:
                self.liquid[k] += v
            self.pores[k] = 0.0

    def decide(self, sensed_vec, tox, mag_field):
        # mass-shift locomotion desire: move toward FeSand/A_micro unless toxic
        vx, vy = sensed_vec
        # bias toward positive vx if any, but scale with mass_eff
        mvx = clamp(vx * 0.01 * self.mass_eff + (0.2 * mag_field * self.magnet), -1.0, 1.0)
        mvy = clamp(vy * 0.01 * self.mass_eff, -0.6, 0.6)
        # convert to desired angle
        if abs(mvx) > 1e-3 or abs(mvy) > 1e-3:
            desired = math.atan2(mvy, mvx)
            self.target_angle = desired
        else:
            # wander
            self.target_angle = self.angle + math.sin(self.x*0.01 + self.age*0.02)*0.3

        # oven queue strategy (simple)
        # consume stored FuelF into energy recipe
        if self.core["FuelF"] >= 1.0:
            self.core["FuelF"] -= 1.0
            self.oven_q.append(RECIPE_FUEL)
        # build 'A' if materials available
        if self.metal["A_micro"] >= 1.0 and self.metal["C"] >= 0.5:
            self.metal["A_micro"] -= 1.0
            self.metal["C"] -= 0.5
            self.oven_q.append(RECIPE_A)
        # repair if health low
        if self.health < 90.0 and self.metal["FeSand"] >= 1.0:
            self.metal["FeSand"] -= 1.0
            self.oven_q.append(RECIPE_REPAIR)
        # prepare bud
        if self.energy > 80.0 and self.core["A"] >= 1.0 and self.metal["FeSand"] >= 1.0:
            self.core["A"] -= 1.0
            self.metal["FeSand"] -= 1.0
            self.oven_q.append(RECIPE_BUD)

    def run_oven(self):
        if not self.oven_job and self.oven_q:
            r = self.oven_q.popleft()
            if self.energy >= r.energy_cost:
                self.energy -= r.energy_cost
                self.oven_job = [r, r.t_ticks]
        if self.oven_job:
            r, t = self.oven_job
            self.temp = max(self.temp, r.T_req)
            self.oven_job[1] -= 1
            if self.oven_job[1] <= 0:
                self.core[r.product] += r.prod_yield
                # byproducts
                if r is RECIPE_FUEL:
                    self.core["Waste"] += 0.5
                    self.energy += r.prod_yield  # energy gained
                if r is RECIPE_BUD:
                    self.sponge["BudCasing"] += 1.0
                self.oven_job = None

    def heal(self):
        if self.core.get("RepairSlurry", 0.0) >= 1.0 and self.health < AGENT_MAX_HEALTH:
            use = min(1.0, self.core["RepairSlurry"])
            self.core["RepairSlurry"] -= use
            self.health = min(AGENT_MAX_HEALTH, self.health + 12.0 * use)
            self.energy -= 0.5 * use

    def mass_shift_move(self, dt):
        # adjust angular velocity toward target_angle
        if hasattr(self, "target_angle"):
            da = angle_diff(self.angle, self.target_angle)
            max_turn = AGENT_ROT_SPEED * dt
            da_clamped = clamp(da, -max_turn, max_turn)
            self.angle += da_clamped
        # speed depends on energy and mass_eff
        speed = AGENT_BASE_SPEED * (0.4 + 0.6 * (self.energy / AGENT_MAX_ENERGY)) * self.mass_eff
        # mass-shift adds small spontaneous bias (simulate magnet pulling metal)
        bias = (0.5 * self.magnet)
        vx = math.cos(self.angle) * speed * (1.0 - bias) + bias * math.cos(self.angle) * speed * 0.2
        vy = math.sin(self.angle) * speed * (1.0 - bias) + bias * math.sin(self.angle) * speed * 0.2
        self.x += vx * dt
        self.y += vy * dt
        # wrap
        self.x %= WIDTH
        self.y %= HEIGHT
        # energy cost scales with movement and mass_eff
        move_cost = 0.15 * (abs(speed) / AGENT_BASE_SPEED) * (1.0 + 0.5*(self.mass_eff-1.0))*dt
        self.energy -= move_cost

    def reproduce_bud(self, world):
        if self.sponge.get("BudCasing",0.0) >= 1.0 and self.core.get("A",0.0) >= 1.0 and self.energy > REPRODUCTION_THRESHOLD:
            self.sponge["BudCasing"] -= 1.0
            self.core["A"] -= 1.0
            self.energy -= REPRODUCTION_COST
            # spawn child nearby
            nx = (self.x + random.uniform(-20,20)) % WIDTH
            ny = (self.y + random.uniform(-20,20)) % HEIGHT
            child = Agent((nx, ny))
            # seed child's internal state
            child.energy = 10.0 + 0.2 * self.energy
            child.health = AGENT_MAX_HEALTH * 0.6
            # copy small fraction of liquid memory
            for k,v in self.liquid.items():
                child.liquid[k] = 0.1 * v
            world.add_agent(child)
            self.buds += 1

    def excrete(self, world):
        # release some liquid memory as waste if overcrowded
        total = sum(self.liquid.values())
        if total > 6.0:
            for k in list(self.liquid.keys()):
                drop = self.liquid[k] * 0.25
                self.liquid[k] -= drop
                # spawn a small resource patch
                rx = (self.x + random.uniform(-6,6)) % WIDTH
                ry = (self.y + random.uniform(-6,6)) % HEIGHT
                r = Resource((rx, ry), k, amount=drop*0.5, mag=0.0)
                world.add_resource(r)

    def update(self, dt, world):
        # sensing
        sensed_vec, tox, mag_field, nearest = self.sense(world)
        # intake if overlapping nearest
        self.intake(world, nearest)
        # route internal stores
        self.route()
        # decide & queue ovens
        self.decide(sensed_vec, tox, mag_field)
        # oven tick
        self.run_oven()
        # heal
        self.heal()
        # move using mass shifting
        self.mass_shift_move(dt)
        # reproduce by budding
        self.reproduce_bud(world)
        # excrete waste when necessary
        self.excrete(world)
        # baseline energy drain & toxicity effect
        self.energy -= 0.03 * dt * 60.0
        if nearest and nearest.type == "Xtoxic": self.health -= 0.02 * dt * 60.0
        self.health = clamp(self.health, 0.0, AGENT_MAX_HEALTH)
        if self.energy <= 0 or self.health <= 0:
            try:
                world.remove_agent(self)
            except ValueError:
                pass
        # record trail
        self.trail.append((self.x, self.y))
        self.age += 1

    def draw(self, surf):
        # color by energy/health
        t = clamp(self.energy / AGENT_MAX_ENERGY, 0.0, 1.0)
        col = (
            int(AGENT_LOW_EN_COLOR[0] * (1-t) + AGENT_COLOR[0] * t),
            int(AGENT_LOW_EN_COLOR[1] * (1-t) + AGENT_COLOR[1] * t),
            int(AGENT_LOW_EN_COLOR[2] * (1-t) + AGENT_COLOR[2] * t),
        )
        # trail
        if len(self.trail) >= 2:
            pts = [(int(x), int(y)) for (x, y) in self.trail]
            pygame.draw.lines(surf, (40,60,80), False, pts, 1)
        # body triangle
        p1 = (int(self.x + math.cos(self.angle) * (AGENT_SIZE+2)),
              int(self.y + math.sin(self.angle) * (AGENT_SIZE+2)))
        p2 = (int(self.x + math.cos(self.angle + 2.4) * AGENT_SIZE),
              int(self.y + math.sin(self.angle + 2.4) * AGENT_SIZE))
        p3 = (int(self.x + math.cos(self.angle - 2.4) * AGENT_SIZE),
              int(self.y + math.sin(self.angle - 2.4) * AGENT_SIZE))
        pygame.draw.polygon(surf, col, [p1,p2,p3])
        # energy/health bars
        bw = 18; bh = 3
        bx = int(self.x - bw/2); by = int(self.y + AGENT_SIZE + 6)
        pygame.draw.rect(surf, (50,50,50), (bx,by,bw,bh))
        pygame.draw.rect(surf, (100,255,120), (bx,by,int(bw*(self.energy/AGENT_MAX_ENERGY)),bh))
        # small health bar
        bpy = by + bh + 2
        pygame.draw.rect(surf, (50,50,50), (bx,bpy,bw,bh))
        pygame.draw.rect(surf, (255,100,100), (bx,bpy,int(bw*(self.health/AGENT_MAX_HEALTH)),bh))

# --- Main loop ---
def main():
    pygame.init()
    screen = pygame.display.set_mode((WIDTH, HEIGHT))
    pygame.display.set_caption("Seed-bot enhanced sim")
    clock = pygame.time.Clock()
    font = pygame.font.SysFont("Consolas", 16)

    world = World()
    world.reset()
    paused = False
    running = True

    while running:
        dt = clock.tick(FPS) / 1000.0
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False
            elif event.type == pygame.KEYDOWN:
                if event.key == pygame.K_SPACE:
                    paused = not paused
                elif event.key == pygame.K_r:
                    world.reset()
                elif event.key == pygame.K_PLUS or event.key == pygame.K_EQUALS:
                    world.resource_rate = min(10.0, world.resource_rate + 0.2)
                elif event.key == pygame.K_MINUS:
                    world.resource_rate = max(0.0, world.resource_rate - 0.2)
            elif event.type == pygame.MOUSEBUTTONDOWN:
                mx, my = pygame.mouse.get_pos()
                # spawn a random resource type at click
                rtype = random.choice(RESOURCE_TYPES)
                mag = 0.3 if rtype == "FeSand" else 0.0
                world.add_resource(Resource((mx,my), rtype, amount=1.2, mag=mag))

        if not paused:
            world.update(dt)

        # draw
        screen.fill(BG_COLOR)
        # resources
        for r in world.resources:
            r.draw(screen)
        # agents
        for a in world.agents:
            a.draw(screen)

        # HUD
        lines = [
            f"Agents: {len(world.agents)}",
            f"Resources: {len(world.resources)}",
            f"Resource spawn/sec: {world.resource_rate:.2f}  (+/- to change)",
            "Space: pause, R: reset, Click: add resource"
        ]
        y = 6
        for ln in lines:
            surf = font.render(ln, True, TEXT_COLOR)
            screen.blit(surf, (8, y)); y += 18

        pygame.display.flip()

    pygame.quit()
    sys.exit()

if __name__ == "__main__":
    main()
