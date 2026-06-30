# 3D Model Assets (GLB) — PLASMA EMPIRE

Drop your `.glb` models in **this folder** (`client/public/models/`).
The game auto-loads them at startup. **Use these EXACT filenames** (lowercase).
Any file that's missing simply keeps the current procedural robot mesh — so it's safe to add them one at a time.

After adding/replacing a file → just refresh the browser (`Cmd+Shift+R`).

## 🏛️ Buildings
| File | In-game name | size |
|------|--------------|------|
| `town_hall.glb`        | Command Core   | 4 (big) |
| `cannon.glb`           | Laser Turret   | 3 |
| `archer_tower.glb`     | Plasma Spire   | 3 |
| `mortar.glb`           | Rail Cannon    | 3 |
| `gold_mine.glb`        | Ore Extractor  | 3 |
| `elixir_collector.glb` | Plasma Reactor | 3 |
| `army_camp.glb`        | Mech Bay       | 4 (big) |
| `builders_hut.glb`     | Worker House   | 2 (small) |
| `wall.glb`             | Force Barrier  | 1 (tiny) |
| `gold_storage.glb`     | Ore Vault      | 3 |
| `elixir_storage.glb`   | Plasma Cell    | 3 |

## 🤖 Troops (army)
| File | In-game name |
|------|--------------|
| `troop_barbarian.glb` | Fighter (sword) |
| `troop_archer.glb`    | Archer (bow) |
| `troop_wizard.glb`    | Mage (staff/fire) |
| `troop_giant.glb`     | Titan (hammer) |
| `troop_dragon.glb`    | War Jet (space fighter) |

## 👷 Worker
| File | |
|------|-|
| `worker.glb` | Worker robot |

## Tips for the GLB export
- **Origin / pivot at the base** (feet for characters, bottom for buildings), **Y-up**.
- The game auto-scales each model to the right footprint and drops it to the ground, so exact scale isn't critical — but keep it reasonably proportioned.
- Characters facing **+Z** (toward the camera) look best.
- Lower poly + baked PBR materials = faster. Embedded textures are fine (single .glb).
