// Warframe DPS Calculator v2 — Frontend
// ЗАМЕНИТЕ "ВАШ_ПРОЕКТ" на имя вашего проекта в Deno Deploy!

const DEFAULT_API = "https://dps.l33kr.deno.net";
let API_BASE = localStorage.getItem("wf_api_url") || DEFAULT_API;

let allWeapons = [];
let allMods = [];

const $ = (id) => document.getElementById(id);

// ---------- API URL ----------
const apiInput = $("apiUrl");
apiInput.value = API_BASE;
apiInput.addEventListener("change", () => {
  API_BASE = apiInput.value.trim().replace(/\/$/, "");
  localStorage.setItem("wf_api_url", API_BASE);
  loadData();
});

function setApiStatus(ok) {
  const el = $("apiStatus");
  el.className = "api-status " + (ok ? "ok" : "err");
}

// ---------- Загрузка данных ----------
async function loadData() {
  $("weaponSelect").innerHTML = '<option disabled>Загрузка...</option>';
  $("modSelect").innerHTML = '<option disabled>Загрузка...</option>';

  try {
    const [weaponsRes, modsRes] = await Promise.all([
      fetch(`${API_BASE}/api/weapons`),
      fetch(`${API_BASE}/api/mods`),
    ]);
    if (!weaponsRes.ok || !modsRes.ok) throw new Error("API недоступен");
    allWeapons = await weaponsRes.json();
    allMods = await modsRes.json();
    setApiStatus(true);
    renderWeapons();
    renderMods();
    calculate();
  } catch (err) {
    console.error(err);
    setApiStatus(false);
    $("weaponSelect").innerHTML = `<option>Ошибка: ${err.message}</option>`;
    $("modSelect").innerHTML = `<option>Проверьте API URL</option>`;
  }
}

// ---------- Рендер ----------
function renderWeapons(filter = "") {
  const sel = $("weaponSelect");
  sel.innerHTML = "";
  const q = filter.toLowerCase();
  const filtered = allWeapons.filter((w) => w.name.toLowerCase().includes(q));
  for (const w of filtered) {
    const opt = document.createElement("option");
    opt.value = w.name;
    opt.textContent = `${w.name}  ·  ${w.type}`;
    sel.appendChild(opt);
  }
  if (filtered.length === 0) sel.innerHTML = "<option>Ничего не найдено</option>";
}

function renderMods(filter = "") {
  const sel = $("modSelect");
  sel.innerHTML = "";
  const q = filter.toLowerCase();
  const filtered = allMods.filter((m) => m.name.toLowerCase().includes(q));
  for (const m of filtered) {
    const opt = document.createElement("option");
    opt.value = m.name;
    opt.textContent = `${m.name}  ·  ${m.compatName || m.type || ""}`;
    sel.appendChild(opt);
  }
}

// ---------- Выбор оружия ----------
$("weaponSelect").addEventListener("change", () => {
  const w = allWeapons.find((x) => x.name === $("weaponSelect").value);
  if (!w) return;
  $("weaponInfo").innerHTML = `
    <div><span>Тип:</span> ${w.type}</div>
    <div><span>Урон:</span> ${w.damage ?? "—"}</div>
    <div><span>Скорострельность:</span> ${w.fireRate ?? "—"}</div>
    <div><span>Крит. шанс:</span> ${((w.criticalChance ?? 0) * 100).toFixed(1)}%</div>
    <div><span>Крит. множитель:</span> ×${w.criticalMultiplier ?? "—"}</div>
    <div><span>Статус:</span> ${((w.procChance ?? 0) * 100).toFixed(1)}%</div>
  `;
  calculate();
});

// ---------- Слайдеры ----------
function bindSlider(id, displayId) {
  const slider = $(id);
  const display = $(displayId);
  slider.addEventListener("input", () => {
    display.textContent = slider.value;
    if (id === "enemyLevel") updateArmorPreview();
    calculate();
  });
}

["enemyLevel:enemyLevelDisplay",
 "enemyBaseArmor:enemyBaseArmorDisplay",
 "enemyBaseLevel:enemyBaseLevelDisplay",
 "viralStacks:viralStacksValue",
 "corrosiveStacks:corrosiveStacksValue",
 "heatSeconds:heatSecondsValue"
].forEach((pair) => {
  const [id, display] = pair.split(":");
  bindSlider(id, display);
});

// ---------- Превью брони ----------
function updateArmorPreview() {
  const baseArmor = parseFloat($("enemyBaseArmor").value);
  const baseLevel = parseFloat($("enemyBaseLevel").value);
  const currentLevel = parseFloat($("enemyLevel").value);

  if (baseArmor <= 0) {
    $("armorPreview").style.display = "none";
    return;
  }

  const diff = Math.max(0, currentLevel - baseLevel);
  const scaled = baseArmor * (1 + Math.pow(diff, 1.75) * 0.005);
  const dr = Math.min(0.9 * Math.sqrt(scaled / 2700), 0.999);

  $("armorPreview").style.display = "block";
  $("armorPreview").innerHTML = `
    <strong>Масштабированная броня:</strong> ${scaled.toFixed(0)} |
    <strong>Снижение урона:</strong> ${(dr * 100).toFixed(1)}% |
    <strong>Проходит урона:</strong> ${((1 - dr) * 100).toFixed(1)}%
  `;
}
updateArmorPreview();

// ---------- События ----------
$("weaponSearch").addEventListener("input", (e) => renderWeapons(e.target.value));
$("modSearch").addEventListener("input", (e) => renderMods(e.target.value));
$("modSelect").addEventListener("change", calculate);
$("enemyArmorType").addEventListener("change", calculate);
$("enemyHealthType").addEventListener("change", calculate);
["buffRoar", "buffEclipse", "buffShock", "buffHeadshot"].forEach((id) =>
  $(id).addEventListener("change", calculate)
);

// ---------- Расчет ----------
let calcTimer = null;
function calculate() {
  clearTimeout(calcTimer);
  calcTimer = setTimeout(doCalculate, 200);
}

async function doCalculate() {
  const weaponName = $("weaponSelect").value;
  const weapon = allWeapons.find((w) => w.name === weaponName);
  if (!weapon) return;

  const selectedModNames = Array.from($("modSelect").selectedOptions).map((o) => o.value);
  const mods = allMods.filter((m) => selectedModNames.includes(m.name));

  const body = {
    weapon,
    mods,
    buffs: {
      roar: $("buffRoar").checked,
      eclipse: $("buffEclipse").checked,
      shockTrooper: $("buffShock").checked,
      headshot: $("buffHeadshot").checked,
    },
    enemy: {
      armorType: $("enemyArmorType").value,
      healthType: $("enemyHealthType").value,
      baseArmor: parseFloat($("enemyBaseArmor").value),
      baseLevel: parseFloat($("enemyBaseLevel").value),
      currentLevel: parseFloat($("enemyLevel").value),
    },
    statusStacks: {
      viral: parseInt($("viralStacks").value),
      corrosive: parseInt($("corrosiveStacks").value),
      heatSeconds: parseFloat($("heatSeconds").value),
    },
  };

  try {
    const res = await fetch(`${API_BASE}/api/calculate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setApiStatus(true);
    renderResult(data);
  } catch (err) {
    $("dpsValue").textContent = "Ошибка";
    setApiStatus(false);
    console.error(err);
  }
}

function renderResult(data) {
  $("dpsValue").textContent = data.total_dps.toLocaleString("ru-RU", {
    maximumFractionDigits: 0,
  });

  const d = data.details;
  const rows = [
    ["Базовый урон", d.base_damage.toFixed(1)],
    ["Итоговый урон", d.final_damage.toFixed(1)],
    ["Моды на урон", `+${d.damage_mods_pct.toFixed(0)}%`],
    ["Стихийный урон", `+${d.elemental_mods_pct.toFixed(0)}%`],
    ["Крит. шанс", `${d.crit_chance_pct.toFixed(1)}%`],
    ["Ср. крит", `×${d.avg_crit_mult.toFixed(2)}`],
    ["Скорострельность", d.fire_rate.toFixed(2)],
    ["Мультивыстрел", `×${d.multishot.toFixed(2)}`],
    ["Статус", `${d.status_chance_pct.toFixed(1)}%`],
    ["DPS база", data.dps_no_status.toLocaleString("ru-RU", { maximumFractionDigits: 0 })],
    ["DPS кровотечения", data.bleed_dps.toLocaleString("ru-RU", { maximumFractionDigits: 0 })],
  ];

  const armorRows = d.scaled_armor > 0 ? [
    ["Масштаб. броня", d.scaled_armor.toFixed(0), "armor"],
    ["Эффект. броня", d.effective_armor.toFixed(0), "armor"],
    ["Снижение брони", `${d.armor_reduction_pct.toFixed(1)}%`, "armor"],
    ["Corrosive", `-${d.corrosive_reduction_pct.toFixed(0)}%`, "armor"],
    ["Heat", `-${d.heat_reduction_pct.toFixed(0)}%`, "armor"],
  ] : [];

  const statusRows = [
    ["Viral множитель", `×${d.viral_mult.toFixed(2)}`, "status"],
    ["Кровотечение/тик", d.bleed_per_tick.toFixed(1), "status"],
    ["Множитель типа", `×${d.damage_type_mult.toFixed(2)}`, "status"],
  ];

  const allRows = [...rows, ...armorRows, ...statusRows];

  $("breakdown").innerHTML = allRows
    .map(
      ([label, value, cls = ""]) =>
        `<div class="stat ${cls}"><div class="stat-label">${label}</div><div class="stat-value">${value}</div></div>`
    )
    .join("");
}

// ---------- Старт ----------
loadData();