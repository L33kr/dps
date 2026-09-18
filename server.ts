// Warframe DPS Calculator — Deno Backend v2
// Деплой: https://dash.deno.com → entrypoint: backend/server.ts

const WARFRAME_API = "https://api.warframestat.us";
const CACHE_TTL = 1000 * 60 * 60 * 6;

type CacheEntry = { data: unknown; timestamp: number };
const cache = new Map<string, CacheEntry>();

async function fetchCached(path: string): Promise<unknown> {
  const cached = cache.get(path);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) return cached.data;
  const res = await fetch(`${WARFRAME_API}${path}`);
  if (!res.ok) throw new Error(`API ${path} → ${res.status}`);
  const data = await res.json();
  cache.set(path, { data, timestamp: Date.now() });
  return data;
}

// ---------- Типы ----------
interface WeaponData {
  name: string;
  type: string;
  damage?: number;
  fireRate?: number;
  criticalChance?: number;
  criticalMultiplier?: number;
  procChance?: number;
  multishot?: number;
}

interface ModData {
  name: string;
  type: string;
  rarity?: string;
  compatName?: string;
  levelStats?: { stats: string[] }[];
}

interface ModBonuses {
  damage: number;
  critChance: number;
  critDamage: number;
  fireRate: number;
  multishot: number;
  status: number;
  faction: number;
  elemental: number;
}

type EnemyArmorType = "ferrite" | "alloy" | "none";
type EnemyHealthType = "cloned_flesh" | "flesh" | "robotic" | "infested" | "none";

const DAMAGE_TYPE_MULTIPLIERS: Record<string, Record<string, number>> = {
  impact:      { ferrite: 1.0,  alloy: 1.0,  cloned_flesh: 1.0,  flesh: 1.0,  robotic: 1.0  },
  puncture:    { ferrite: 1.5,  alloy: 1.0,  cloned_flesh: 1.0,  flesh: 1.0,  robotic: 1.25 },
  slash:       { ferrite: 1.0,  alloy: 1.0,  cloned_flesh: 1.25, flesh: 1.25, robotic: 1.0  },
  heat:        { ferrite: 1.25, alloy: 1.0,  cloned_flesh: 1.25, flesh: 1.25, robotic: 1.0  },
  cold:        { ferrite: 1.0,  alloy: 1.25, cloned_flesh: 1.0,  flesh: 1.0,  robotic: 1.0  },
  electricity: { ferrite: 1.0,  alloy: 1.0,  cloned_flesh: 1.0,  flesh: 1.0,  robotic: 1.5  },
  toxin:       { ferrite: 1.0,  alloy: 1.0,  cloned_flesh: 1.0,  flesh: 1.0,  robotic: 1.0  },
  corrosive:   { ferrite: 1.75, alloy: 1.0,  cloned_flesh: 1.0,  flesh: 1.0,  robotic: 1.0  },
  viral:       { ferrite: 1.0,  alloy: 1.0,  cloned_flesh: 1.0,  flesh: 1.0,  robotic: 1.0  },
  radiation:   { ferrite: 1.0,  alloy: 1.75, cloned_flesh: 1.0,  flesh: 1.0,  robotic: 1.0  },
  magnetic:    { ferrite: 1.0,  alloy: 1.0,  cloned_flesh: 1.0,  flesh: 1.0,  robotic: 1.0  },
  gas:         { ferrite: 1.0,  alloy: 1.0,  cloned_flesh: 1.0,  flesh: 1.0,  robotic: 1.0  },
  blast:       { ferrite: 1.0,  alloy: 1.0,  cloned_flesh: 1.0,  flesh: 1.0,  robotic: 1.0  },
};

// ---------- Парсер модов ----------
function parseModBonuses(mod: ModData): ModBonuses {
  const bonuses: ModBonuses = {
    damage: 0, critChance: 0, critDamage: 0,
    fireRate: 0, multishot: 0, status: 0,
    faction: 0, elemental: 0,
  };

  const maxRankStats = mod.levelStats?.[mod.levelStats.length - 1]?.stats;
  if (!maxRankStats) return bonuses;

  for (const line of maxRankStats) {
    const m = line.match(/([+-]?\d+(?:\.\d+)?)%\s+(.+)/);
    if (!m) continue;
    const value = parseFloat(m[1]) / 100;
    const label = m[2].toLowerCase();

    if (label === "damage") bonuses.damage += value;
    else if (label.includes("damage to")) bonuses.faction += value;
    else if (label.includes("critical chance")) bonuses.critChance += value;
    else if (label.includes("critical damage")) bonuses.critDamage += value;
    else if (label.includes("fire rate")) bonuses.fireRate += value;
    else if (label.includes("multishot")) bonuses.multishot += value;
    else if (label.includes("status chance")) bonuses.status += value;
    else if (
      ["heat", "cold", "electricity", "toxin", "blast", "corrosive",
       "gas", "magnetic", "radiation", "viral", "slash", "puncture", "impact"]
        .some((el) => label.includes(el))
    ) {
      bonuses.elemental += value;
    }
  }
  return bonuses;
}

function isModCompatible(mod: ModData, weaponType: string): boolean {
  const compat = (mod.compatName || mod.type || "").toLowerCase();
  const w = weaponType.toLowerCase();
  if (w === "primary") return ["rifle", "shotgun", "bow", "sniper", "primary"].includes(compat);
  if (w === "secondary") return ["pistol", "secondary"].includes(compat);
  if (w === "melee") return ["melee", "stance"].includes(compat);
  if (w.startsWith("arch")) return compat.includes("arch");
  return false;
}

// ---------- Формулы ----------
function scaleArmor(baseArmor: number, currentLevel: number, baseLevel: number): number {
  if (baseArmor <= 0) return 0;
  const levelDiff = currentLevel - baseLevel;
  if (levelDiff <= 0) return baseArmor;
  return baseArmor * (1 + Math.pow(levelDiff, 1.75) * 0.005);
}

function enemyArmorDamageReduction(netArmor: number): number {
  if (netArmor <= 0) return 0;
  return Math.min(0.9 * Math.sqrt(netArmor / 2700), 0.999);
}

function corrosiveArmorReduction(stacks: number): number {
  if (stacks <= 0) return 0;
  const clamped = Math.min(stacks, 10);
  if (clamped === 1) return 0.26;
  return Math.min(0.26 + (clamped - 1) * 0.06, 0.80);
}

function heatArmorReduction(seconds: number): number {
  if (seconds < 0.5) return 0;
  if (seconds < 1.0) return 0.15;
  if (seconds < 1.5) return 0.30;
  if (seconds < 2.0) return 0.40;
  return 0.50;
}

function viralHealthMultiplier(stacks: number): number {
  if (stacks <= 0) return 1.0;
  const clamped = Math.min(stacks, 10);
  const bonus = clamped === 1 ? 1.0 : Math.min(1.0 + (clamped - 1) * 0.25, 3.25);
  return 1 + bonus;
}

function slashBleedPerTick(moddedBaseDamage: number, factionBonus: number): number {
  return 0.35 * moddedBaseDamage * (1 + factionBonus);
}

// ---------- Расчет ----------
interface CalcRequest {
  weapon: WeaponData;
  mods: ModData[];
  buffs: {
    roar: boolean;
    eclipse: boolean;
    shockTrooper: boolean;
    headshot: boolean;
  };
  enemy: {
    armorType: EnemyArmorType;
    healthType: EnemyHealthType;
    baseArmor: number;
    baseLevel: number;
    currentLevel: number;
  };
  statusStacks: {
    viral: number;
    corrosive: number;
    heatSeconds: number;
  };
}

function calculateDPS(req: CalcRequest) {
  const w = req.weapon;
  const baseDamage = w.damage ?? 0;
  const baseFireRate = w.fireRate ?? 1;
  const baseCritChance = w.criticalChance ?? 0;
  const baseCritMult = w.criticalMultiplier ?? 1;
  const baseStatus = w.procChance ?? 0;

  const total: ModBonuses = {
    damage: 0, critChance: 0, critDamage: 0,
    fireRate: 0, multishot: 0, status: 0,
    faction: 0, elemental: 0,
  };

  for (const mod of req.mods) {
    if (!isModCompatible(mod, w.type)) continue;
    const b = parseModBonuses(mod);
    total.damage += b.damage;
    total.critChance += b.critChance;
    total.critDamage += b.critDamage;
    total.fireRate += b.fireRate;
    total.multishot += b.multishot;
    total.status += b.status;
    total.faction += b.faction;
    total.elemental += b.elemental;
  }

  let buffDamage = 0;
  if (req.buffs.roar) buffDamage += 0.5;
  if (req.buffs.eclipse) buffDamage += 2.0;
  if (req.buffs.shockTrooper) buffDamage += 1.0;
  const headshotMult = req.buffs.headshot ? 2.0 : 1.0;

  const finalDamage =
    baseDamage * (1 + total.damage + buffDamage) * (1 + total.elemental);
  const finalCritChance = baseCritChance * (1 + total.critChance);
  const finalCritMult = baseCritMult * (1 + total.critDamage);
  const finalFireRate = baseFireRate * (1 + total.fireRate);
  const finalMultishot = 1 + total.multishot;
  const finalStatus = baseStatus * (1 + total.status);
  const factionMult = 1 + total.faction;

  const avgCritMult = 1 + finalCritChance * (finalCritMult - 1);

  const armorType = req.enemy.armorType;
  const healthType = req.enemy.healthType;
  let damageTypeMult = 1.0;
  if (armorType !== "none") {
    damageTypeMult = DAMAGE_TYPE_MULTIPLIERS.corrosive?.[armorType] ?? 1.0;
  } else if (healthType !== "none") {
    damageTypeMult = DAMAGE_TYPE_MULTIPLIERS.slash?.[healthType] ?? 1.0;
  }

  const scaledArmor = scaleArmor(
    req.enemy.baseArmor,
    req.enemy.currentLevel,
    req.enemy.baseLevel
  );

  const corrReduction = corrosiveArmorReduction(req.statusStacks.corrosive);
  const heatReduction = heatArmorReduction(req.statusStacks.heatSeconds);
  const totalArmorReduction = 1 - (1 - corrReduction) * (1 - heatReduction);
  const effectiveArmor = scaledArmor * (1 - totalArmorReduction);

  const armorDR = enemyArmorDamageReduction(effectiveArmor);

  const dpsNoStatus =
    finalDamage * avgCritMult * finalMultishot *
    finalFireRate * factionMult * headshotMult * damageTypeMult;

  const viralMult = viralHealthMultiplier(req.statusStacks.viral);

  const bleedPerTick = slashBleedPerTick(
    baseDamage * (1 + total.damage + buffDamage),
    total.faction
  );
  const bleedDps = bleedPerTick * 7 * finalStatus * finalFireRate * finalMultishot / 6;

  const dpsAfterArmor = dpsNoStatus * (1 - armorDR);
  const dpsWithViral = dpsAfterArmor * viralMult;

  const totalDps = dpsWithViral + bleedDps;

  return {
    total_dps: totalDps,
    dps_no_status: dpsWithViral,
    bleed_dps: bleedDps,
    details: {
      base_damage: baseDamage,
      final_damage: finalDamage,
      damage_mods_pct: (total.damage + buffDamage) * 100,
      elemental_mods_pct: total.elemental * 100,
      crit_chance_pct: finalCritChance * 100,
      crit_mult: finalCritMult,
      avg_crit_mult: avgCritMult,
      fire_rate: finalFireRate,
      multishot: finalMultishot,
      status_chance_pct: finalStatus * 100,
      faction_pct: total.faction * 100,
      headshot_mult: headshotMult,
      scaled_armor: scaledArmor,
      effective_armor: effectiveArmor,
      armor_reduction_pct: armorDR * 100,
      corrosive_reduction_pct: corrReduction * 100,
      heat_reduction_pct: heatReduction * 100,
      viral_mult: viralMult,
      bleed_per_tick: bleedPerTick,
      damage_type_mult: damageTypeMult,
    },
  };
}

// ---------- HTTP Handler ----------
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  try {
    if (url.pathname === "/" || url.pathname === "") {
      return json({ status: "ok", service: "warframe-dps-api", version: 2 });
    }

    if (url.pathname === "/api/weapons") {
      const items = (await fetchCached("/items/")) as WeaponData[];
      const weaponTypes = ["Primary", "Secondary", "Melee", "Arch-Gun", "Arch-Melee"];
      const weapons = items
        .filter((i) => weaponTypes.includes(i.type))
        .sort((a, b) => a.name.localeCompare(b.name));
      return json(weapons);
    }

    if (url.pathname === "/api/mods") {
      const items = (await fetchCached("/items/")) as ModData[];
      const weaponCompat = [
        "Rifle", "Pistol", "Shotgun", "Melee", "Bow", "Sniper",
        "Arch-Gun", "Arch-Melee",
      ];
      const mods = items
        .filter((i) =>
          i.levelStats &&
          i.compatName &&
          weaponCompat.some((c) => i.compatName!.includes(c))
        )
        .sort((a, b) => a.name.localeCompare(b.name));
      return json(mods);
    }

    if (url.pathname === "/api/calculate" && req.method === "POST") {
      const body = (await req.json()) as CalcRequest;
      if (!body.weapon) return json({ error: "weapon required" }, 400);
      const result = calculateDPS(body);
      return json(result);
    }

    return json({ error: "Not found", path: url.pathname }, 404);
  } catch (err) {
    console.error("Handler error:", err);
    return json({ error: String(err) }, 500);
  }
}

console.log("🎮 Warframe DPS API v2 запущен");
Deno.serve(handler);