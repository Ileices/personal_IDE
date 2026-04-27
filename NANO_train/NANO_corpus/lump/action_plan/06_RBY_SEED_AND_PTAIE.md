# 06 — RBY Seed and PTAIE

## Color Encoding, Seed Mechanics, and the Periodic Table of AI Elements

---

## The RBY Simplex

Every entity in the system — every nano, every absoleice, every data chunk, every 
query — has an RBY coordinate on the 3-simplex where R + B + Y = 1.

```
             R (1,0,0)
            /\
           /  \
          /    \
         / Perception \
        /    zone    \
       /──────────────\
      /   Balanced     \
     /     zone (0.33   \
    /      each)         \
   /──────────────────────\
  B (0,1,0)            Y (0,0,1)
  Cognition             Execution
```

### RBY → RGB Display Mapping

For visualization, RBY maps to display RGB:
- R (Red/Perception) → Red channel
- B (Blue/Cognition) → Blue channel  
- Y (Yellow/Execution) → Green channel (monitors use RGB, yellow = R+G in additive)

```python
def rby_to_rgb(r: float, b: float, y: float) -> Tuple[int, int, int]:
    """Convert RBY simplex coordinates to display RGB."""
    return (
        int(r * 255),      # Red channel
        int(y * 255),      # Green channel (Yellow → Green for display)
        int(b * 255),      # Blue channel
    )

def rgb_to_rby(red: int, green: int, blue: int) -> Tuple[float, float, float]:
    """Convert display RGB back to RBY simplex."""
    total = red + green + blue
    if total == 0:
        return (0.333, 0.333, 0.333)
    return (red / total, blue / total, green / total)
```

---

## The Seed

The seed is the specific RBY triplet that determines HOW an expansion unfolds.

### Primordial Seed (Cycle 0)

Derived from AE=C=1 using the framework's equations:

```python
# From the Theory of Absolute Existence
# The first seed derives from unity through golden ratio decomposition
PHI = 1.618033988749895

# R = sqrt(2)/2 ≈ 0.707 (perception of self)
# B = 1/2 = 0.500 (cognition of self)
# Y = sqrt(PHI)/sqrt(2) ≈ 0.793 (execution of self-awareness)
raw = np.array([0.707, 0.500, 0.793])
PRIMORDIAL_SEED = raw / raw.sum()
# Result: approximately (0.3535, 0.2500, 0.3965)
```

This seed is slightly Y-dominant: the first expansion biases toward DOING over 
thinking or perceiving. This matches the framework's intuition — the first cycle 
must generate artifacts (nanos, data, collisions) before it can think about them.

### Seed Mutation After Each Cycle

See [01_CORE_PRINCIPLES.md](01_CORE_PRINCIPLES.md) for the UF/IO equations. The key:

- **High error** → seed shifts toward B (more cognition/analysis)
- **High success** → seed shifts toward Y (more execution/production)
- **Novel data** → seed shifts toward R (more perception/scanning)

```python
class SeedManager:
    """Manages the RBY seed across cycles."""
    
    def __init__(self, initial_rby: np.ndarray = None):
        self.current = initial_rby if initial_rby is not None else PRIMORDIAL_SEED.copy()
        self.history: List[np.ndarray] = [self.current.copy()]
    
    def advance(self, success: float, error: float, complexity: float,
                deposits: List[MacroAbsoleice]) -> np.ndarray:
        """Compute the next cycle's seed."""
        
        # Step 1: UF/IO from observables
        UF, IO = compute_uf_io(success, error, complexity)
        
        # Step 2: RBY update from tension
        new_rby = update_rby(self.current, UF, IO, success, error)
        
        # Step 3: Deposit influence (light leaking in)
        if deposits:
            deposit_target = mutate_seed_from_deposits(new_rby, deposits)
            # Blend: 80% from UF/IO dynamics, 20% from deposit guidance
            new_rby = 0.8 * new_rby + 0.2 * deposit_target
            new_rby = new_rby / new_rby.sum()
        
        self.current = new_rby
        self.history.append(self.current.copy())
        return self.current
```

---

## PTAIE: Periodic Table of AI Elements

PTAIE is the mapping function that converts ANY data into an RBY triplet.
Everything that enters the system gets an RBY encoding.

### Design Principle

Just as the periodic table organizes elements by their properties (atomic number, 
valence, etc.), PTAIE organizes all possible data units by their intelligence 
properties (perception load, cognition load, execution load).

### Character-Level PTAIE

Every byte/character gets an RBY value:

```python
class PTAIE:
    """Periodic Table of AI Elements — maps any data to RBY."""
    
    # Base mappings for ASCII categories
    CATEGORY_RBY = {
        'lowercase':   (0.40, 0.30, 0.30),   # Text = balanced, slight perception
        'uppercase':   (0.35, 0.35, 0.30),   # Emphasis = more cognition
        'digit':       (0.25, 0.40, 0.35),   # Numbers = cognition-heavy
        'whitespace':  (0.50, 0.25, 0.25),   # Structure = perception
        'punctuation': (0.30, 0.40, 0.30),   # Logic markers = cognition
        'bracket':     (0.25, 0.45, 0.30),   # Nesting = high cognition
        'operator':    (0.20, 0.30, 0.50),   # Operations = execution
        'special':     (0.33, 0.33, 0.34),   # Unknown = balanced
    }
    
    def encode_char(self, c: str) -> Tuple[float, float, float]:
        """Map a single character to RBY."""
        code = ord(c) if c else 0
        
        if c.islower():
            base = self.CATEGORY_RBY['lowercase']
        elif c.isupper():
            base = self.CATEGORY_RBY['uppercase']
        elif c.isdigit():
            base = self.CATEGORY_RBY['digit']
        elif c.isspace():
            base = self.CATEGORY_RBY['whitespace']
        elif c in '()[]{}':
            base = self.CATEGORY_RBY['bracket']
        elif c in '+-*/%=<>&|^~':
            base = self.CATEGORY_RBY['operator']
        elif c in '.,;:!?\'"':
            base = self.CATEGORY_RBY['punctuation']
        else:
            base = self.CATEGORY_RBY['special']
        
        # Fine-tune by character code position (gradient within category)
        offset = (code % 26) / 26.0 * 0.05  # ±2.5% variation
        r = base[0] + offset - 0.025
        b = base[1] - offset + 0.025
        y = 1.0 - r - b
        
        return (max(0.01, r), max(0.01, b), max(0.01, y))
    
    def encode_sequence(self, text: str) -> Tuple[float, float, float]:
        """Map a text sequence to a single RBY by averaging characters."""
        if not text:
            return (0.333, 0.333, 0.334)
        
        r_sum, b_sum, y_sum = 0.0, 0.0, 0.0
        for c in text:
            r, b, y = self.encode_char(c)
            r_sum += r
            b_sum += b
            y_sum += y
        
        n = len(text)
        total = r_sum + b_sum + y_sum
        return (r_sum / total, b_sum / total, y_sum / total)
    
    def encode_file(self, file_path: Path) -> Tuple[float, float, float]:
        """Map an entire file to RBY based on content analysis."""
        ext = file_path.suffix.lower()
        
        # File type gives a strong RBY prior
        file_type_rby = self.FILE_TYPE_RBY.get(ext, (0.33, 0.33, 0.34))
        
        # Content analysis gives the specific RBY
        try:
            content = file_path.read_text(errors='ignore')[:10000]
            content_rby = self.encode_sequence(content)
        except:
            content_rby = (0.33, 0.33, 0.34)
        
        # Blend: 40% file type, 60% content
        r = 0.4 * file_type_rby[0] + 0.6 * content_rby[0]
        b = 0.4 * file_type_rby[1] + 0.6 * content_rby[1]
        y = 0.4 * file_type_rby[2] + 0.6 * content_rby[2]
        total = r + b + y
        return (r / total, b / total, y / total)
    
    # File extension → RBY priors
    FILE_TYPE_RBY = {
        '.txt':   (0.45, 0.30, 0.25),   # Text = perception
        '.md':    (0.40, 0.35, 0.25),   # Markdown = perception + structure
        '.py':    (0.20, 0.35, 0.45),   # Python = execution
        '.js':    (0.20, 0.35, 0.45),   # JavaScript = execution
        '.cpp':   (0.15, 0.40, 0.45),   # C++ = high cognition + execution
        '.json':  (0.30, 0.45, 0.25),   # JSON = structured cognition
        '.csv':   (0.35, 0.40, 0.25),   # CSV = data perception + struct
        '.jpg':   (0.55, 0.25, 0.20),   # Image = high perception
        '.png':   (0.55, 0.25, 0.20),   # Image
        '.mp4':   (0.50, 0.25, 0.25),   # Video = perception + sequence
        '.mp3':   (0.50, 0.20, 0.30),   # Audio = perception
        '.html':  (0.30, 0.30, 0.40),   # HTML = balanced toward execution
        '.sql':   (0.25, 0.50, 0.25),   # SQL = high cognition
        '.yaml':  (0.30, 0.45, 0.25),   # Config = cognition
        '.log':   (0.50, 0.30, 0.20),   # Logs = perception (time series)
        '.exe':   (0.15, 0.25, 0.60),   # Binary = pure execution
        '.dll':   (0.15, 0.25, 0.60),   # Library = execution
        '.pt':    (0.10, 0.50, 0.40),   # PyTorch model = cognition + exec
        '.h5':    (0.10, 0.50, 0.40),   # Model weights
    }
```

---

## Fractal Binning (Color → Spatial Layout)

When absoleices or nanos are stored as glyphs (RBY images), their spatial layout 
follows fractal binning:

### Bucket Size

For N data units, the canvas size is the next power of 3:

```python
import math

def bucket_size(n_units: int) -> int:
    """Next power of 3 above n_units."""
    if n_units <= 0:
        return 3
    return 3 ** math.ceil(math.log(max(n_units, 1), 3))

# Examples:
# 5 units → 9 (3²)
# 10 units → 27 (3³)
# 100 units → 243 (3⁵)
# 1000 units → 2187 (3⁷)
```

### Spatial Layout Options

1. **Linear**: Sequential fill, left-to-right, top-to-bottom
2. **Hilbert curve**: Space-filling curve that preserves locality (recommended)
3. **RBY-sorted**: Sorted by RBY distance from seed

```python
from hilbertcurve.hilbertcurve import HilbertCurve

def layout_pixels(rby_values: List[Tuple[float, float, float]], 
                  canvas_side: int) -> np.ndarray:
    """Lay out RBY values on a square canvas using Hilbert curve."""
    n = len(rby_values)
    bucket = bucket_size(n)
    side = int(math.ceil(math.sqrt(bucket)))
    
    # Create canvas
    canvas = np.ones((side, side, 3), dtype=np.uint8) * 255  # White fill (unfilled = potential)
    
    # Hilbert curve for locality-preserving mapping
    p = math.ceil(math.log2(side))
    hc = HilbertCurve(p, 2)
    
    for i, (r, b, y) in enumerate(rby_values):
        coords = hc.point_from_distance(i)
        x, y_coord = coords[0] % side, coords[1] % side
        canvas[y_coord, x] = rby_to_rgb(r, b, y)
    
    return canvas
```

### White/Black Fill Semantics

- **White pixels** (255, 255, 255): Unfilled potential — space for expansion
- **Black pixels** (0, 0, 0): Saturated/compressed — no room left
- **Early expansion**: Mostly white fill → room to grow
- **Near Absularity**: Mostly black fill → saturated

```python
def fill_color(epoch: int, max_epochs: int) -> Tuple[int, int, int]:
    """Determine fill color based on how close to Absularity we are."""
    progress = epoch / max_epochs if max_epochs > 0 else 0
    grey = int(255 * (1 - progress))  # White → Black as progress → 1
    return (grey, grey, grey)
```

---

## Session 3 Patch — [DATE: 2025-07-XX]

### Experimental Findings: S-06 — Efficiency Ratchet Floor/Ceiling/Stall-Reset

**Source:** test_15 finding S-06. Cross-ref: [11_EVOLUTION_AND_GENERATIONS.md](11_EVOLUTION_AND_GENERATIONS.md) §Efficiency Ratchet.

**Problem:** The original `EfficiencyRatchet` (defined in 11_EVOLUTION_AND_GENERATIONS.md)
uses a fixed `target_ratio = 0.80`, meaning each cycle's nano budget is 80% of the
previous cycle. This is a **geometric decay** that converges to zero:

```
Cycle 0: 100 nanos
Cycle 5: 100 × 0.8^5 = 33 nanos
Cycle 10: 100 × 0.8^10 = 11 nanos
Cycle 20: 100 × 0.8^20 = 1 nano   ← system is functionally dead
Cycle 30: 100 × 0.8^30 ≈ 0       ← mathematically zero
```

The ratchet was designed to improve efficiency, but unchecked geometric decay
kills the sea by starving it of compute resources.

**Fix — EfficiencyRatchet with floor, ceiling, and stall reset:**

```python
class EfficiencyRatchet:
    """
    PATCHED VERSION — Session 3, test_15 S-06.
    
    Additions over original:
    - floor=0.3: nano budget never drops below 30% of cycle-0 population
    - ceiling=0.95: nano budget never exceeds 95% of cycle-0 population
    - stall_reset: if efficiency hasn't improved for 5 consecutive cycles,
      reset the budget to ceiling (allow re-exploration)
    
    The floor prevents the geometric decay death spiral.
    The ceiling prevents unbounded growth after a stall reset.
    The stall reset prevents permanent stagnation.
    """
    
    def __init__(self, target_ratio: float = 0.80,
                 floor: float = 0.30, ceiling: float = 0.95,
                 stall_window: int = 5):
        self.target_ratio = target_ratio
        self.floor = floor          # Minimum fraction of initial population
        self.ceiling = ceiling      # Maximum fraction of initial population
        self.stall_window = stall_window
        self.initial_population = None
        self.history: list = []
        self.stall_cycles = 0
    
    def record_cycle(self, cycle, nano_count, queries, accuracy, total_compute):
        if self.initial_population is None:
            self.initial_population = nano_count
        efficiency = accuracy / max(nano_count, 1) * 1000
        self.history.append({
            'cycle': cycle, 'nano_count': nano_count,
            'queries': queries, 'accuracy': accuracy,
            'total_compute': total_compute, 'efficiency': efficiency,
        })
        # Track stall
        if len(self.history) >= 2:
            if efficiency <= self.history[-2]['efficiency'] * 1.01:
                self.stall_cycles += 1
            else:
                self.stall_cycles = 0
    
    def get_nano_budget(self) -> int | None:
        if not self.history or self.initial_population is None:
            return None
        
        # Stall reset: if stalled for stall_window cycles, reset to ceiling
        if self.stall_cycles >= self.stall_window:
            self.stall_cycles = 0
            return int(self.initial_population * self.ceiling)
        
        # Normal ratchet with floor/ceiling
        raw_budget = int(self.history[-1]['nano_count'] * self.target_ratio)
        floor_count = int(self.initial_population * self.floor)
        ceiling_count = int(self.initial_population * self.ceiling)
        return max(floor_count, min(raw_budget, ceiling_count))
```

**Impact:** With floor=0.3 and initial population of 100:
- Cycle 20 budget: max(30, 100×0.8^20) = max(30, 1) = **30** (not 1)
- After 5 stalled cycles: budget resets to **95** (re-exploration)
- The sea can never die from ratchet starvation

**Action required:** Replace the `EfficiencyRatchet` class in
[11_EVOLUTION_AND_GENERATIONS.md](11_EVOLUTION_AND_GENERATIONS.md) with this patched
version. The `SwarmEvolution` class should pass `initial_population` from the
first cycle's peak population.
