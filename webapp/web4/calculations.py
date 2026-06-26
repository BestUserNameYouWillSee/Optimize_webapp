"""
Calculations module — laadt modelconfig en bevat alle rekenfuncties.
"""

import json
from pathlib import Path

CONFIG_PATH = Path(__file__).parent / "models.json"


def _load_config() -> dict:
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


_config = _load_config()
MODEL_CONFIG = _config["models"]
GRID_CO2 = _config.get("_grid_carbon_intensity_g_per_kwh", 350)


def find_model(model_id: str) -> dict | None:
    """Zoek een model op id (bijv. 'gpt-5.5')."""
    for m in MODEL_CONFIG.values():
        if m.get("id") == model_id:
            return m
    return None


# ------------------------------------------------------------------ Token schattingen
def count_words(text: str) -> int:
    return len(text.split())


def estimate_input_tokens(word_count: int) -> int:
    """Woorden → tokens (ruw: 1 token ≈ 0,75 woorden)."""
    return max(1, round(word_count * 1.3))


def estimate_prompt_complexity(text: str, word_count: int) -> float:
    """Analyseer hoe complex een prompt is. Geeft multiplier tussen 1.0 en 3.0."""
    tl = text.lower()

    if word_count <= 8:       base = 1.0
    elif word_count <= 20:    base = 1.5
    elif word_count <= 40:    base = 2.0
    else:                     base = 2.5

    SIGNALS = [
        "leg uit", "hoe werkt", "wat is het verschil", "waarom",
        "vergelijken", "beschrijf", "analyseer", "uitgebreid",
        "gedetailleerd", "in detail", "stap voor stap", "voorbeelden",
        "uitleggen", "oorzaken", "gevolgen", "hoe komt het",
        "wat gebeurt er", "hoe maak je", "samenvatting",
        "verschil tussen", "overeenkomsten", "research",
    ]
    boost = sum(0.3 for kw in SIGNALS if kw in tl)
    boost += (tl.count(" en ") + tl.count(",") // 2) * 0.15
    return min(3.0, base + boost)


def estimate_output_tokens(input_tokens: int, prompt_text: str, word_count: int) -> int:
    """Schat het aantal tokens in het AI-antwoord."""
    c = estimate_prompt_complexity(prompt_text, word_count)
    floor = 100 + int(c * 50)
    return max(floor, round(input_tokens * c * 2.0))


# ------------------------------------------------------------------ Energie, CO2, water
def calculate_energy_wh(total_tokens: int, cfg: dict) -> float:
    """Energie in wattuur."""
    kwh = (total_tokens / 1000) * cfg["energy_kwh_per_1k_tokens"] * cfg["pue"]
    return round(kwh * 1000, 3)


def calculate_co2(energy_wh: float) -> float:
    """CO2 in gram."""
    return round((energy_wh / 1000) * GRID_CO2, 3)


def calculate_water_ml(energy_wh: float, cfg: dict) -> float | None:
    """Water in milliliter. Geeft None als waterdata onbekend is."""
    wl = cfg.get("water_l_per_kwh")
    return round((energy_wh / 1000) * wl * 1000, 1) if wl is not None else None


def calculate_time_seconds(output_tokens: int, cfg: dict) -> float:
    """Geschatte generatietijd in seconden."""
    return round(output_tokens / cfg["tokens_per_second"], 1)


def efficiency_label(cfg: dict) -> str:
    """Zet kWh/1k-tokens om in een leesbaar label."""
    k = cfg["energy_kwh_per_1k_tokens"]
    if k < 0.001:   return "Uitstekend"
    if k < 0.005:   return "Zeer goed"
    if k < 0.015:   return "Gemiddeld"
    return "Hoog verbruik"


# ------------------------------------------------------------------ Vergelijkingen
def _fmt_shower(sec: float) -> str:
    if sec < 0.05:         return "minder dan 0,1 seconde"
    if sec < 1:            return f"{sec:.2f} seconden"
    s = round(sec, 1)
    if s < 60:             return f"{s} seconden"
    m, rs = divmod(int(s), 60)
    return f"{m} min {rs} sec" if rs else f"{m} min"


def _fmt_drive(m: float) -> str:
    if m < 0.5:            return "minder dan 1 meter"
    mr = round(m)
    return f"{mr} meter" if mr < 1000 else f"{mr / 1000:.1f} km"


def _fmt_lamp(minutes: float) -> str:
    if minutes < 0.5:      return f"{round(minutes * 60)} seconden"
    mnt = round(minutes)
    if mnt < 60:           return f"{mnt} minuten"
    h, rm = divmod(mnt, 60)
    return f"{h} uur {rm} min" if rm else f"{h} uur"


def _fmt_charge(count: float) -> str:
    return "minder dan 0,01x" if count < 0.01 else f"{round(count, 2)}x"


def build_comparisons(co2: float) -> list[dict]:
    shower_sec = co2 / 3.33
    drive_m = co2 * 8.33
    lamp_min = co2 * 12
    charges = co2 / 10
    return [
        {"icon": "\U0001f6bf", "label": "Douchen",
         "text": f"Dit staat gelijk aan <strong>{_fmt_shower(shower_sec)} douchen</strong> (met gasboiler).",
         "barClass": "bar-shower", "pct": max(1, min(100, round(shower_sec / 6 * 100)))},
        {"icon": "\U0001f697", "label": "Autorijden",
         "text": f"Dit staat gelijk aan <strong>{_fmt_drive(drive_m)} autorijden</strong> (gemiddelde benzineauto).",
         "barClass": "bar-car", "pct": max(1, min(100, round(drive_m / 8.33 * 100)))},
        {"icon": "\U0001f4a1", "label": "LED lamp",
         "text": f"Hiermee laat je een LED-lamp <strong>{_fmt_lamp(lamp_min)} branden</strong> (10 watt, EU-stroommix).",
         "barClass": "bar-lamp", "pct": max(1, min(100, round(lamp_min / 2 * 100)))},
        {"icon": "\U0001f4f1", "label": "Telefoon laden",
         "text": f"Dit is evenveel als je telefoon <strong>{_fmt_charge(charges)} volledig opladen</strong> (0-100%).",
         "barClass": "bar-charge", "pct": max(1, min(100, round(charges * 100)))},
    ]


def build_total_comparisons(co2_ton: float) -> list[dict]:
    """Vergelijkingen op platform-schaal (ton CO2 ipv gram)."""
    # co2_ton = dagelijkse CO2 in ton voor alle gebruikers samen
    cars = round(co2_ton * 1000 / 3.9)              # 1 auto 30km/dag ≈ 3.9 kg CO2
    koffie = round(co2_ton * 1_000_000 / 21)        # 1 kop koffie ≈ 21g CO2
    flights = round(co2_ton / 2.0, 1)               # AMS→NY retour ≈ 2 ton CO2
    homes = round(co2_ton * 30 * 1000 / 70)          # huishouden ≈ 70 kg CO2/maand (200 kWh)

    return [
        {"icon": "\U0001f697", "label": "Autorijden",
         "text": f"Evenveel CO2 als <strong>{cars:,} auto's</strong> die een dag rijden (30 km).".replace(",", "."),
         "barClass": "bar-car", "pct": max(1, min(100, round(cars / 50000 * 100)))},
        {"icon": "\u2615", "label": "Koffie",
         "text": f"Evenveel CO2 als <strong>{koffie:,} koppen koffie</strong> zetten.".replace(",", "."),
         "barClass": "bar-shower", "pct": max(1, min(100, round(koffie / 500000 * 100)))},
        {"icon": "\U0001f6eb", "label": "Vliegreizen",
         "text": f"Evenveel CO2 als <strong>{flights} retourtjes</strong> Amsterdam–New York.".replace(",", "."),
         "barClass": "bar-lamp", "pct": max(1, min(100, round(flights / 500 * 100)))},
        {"icon": "\U0001f3e0", "label": "Huishoudens",
         "text": f"Evenveel stroom als <strong>{homes:,} huishoudens</strong> in een maand verbruiken.".replace(",", "."),
         "barClass": "bar-charge", "pct": max(1, min(100, round(homes / 50000 * 100)))},
    ]


# ------------------------------------------------------------------ Usage-impact
def build_usage_impact(energy_per_prompt_wh: float, co2_per_prompt: float, water_per_prompt_ml: float | None, water_available: bool, cfg: dict) -> dict:
    """Bereken impact per gebruiker en totale platform-impact per dag/week/maand."""
    prompts_per_day = cfg.get("avg_prompts_per_day", 5)
    daily_users_m = cfg.get("daily_users_millions", 10)

    # Per gebruiker
    daily_energy = round(energy_per_prompt_wh * prompts_per_day, 2)
    weekly_energy = round(daily_energy * 7, 2)
    monthly_energy = round(daily_energy * 30, 2)

    daily_co2 = round(co2_per_prompt * prompts_per_day, 2)
    weekly_co2 = round(daily_co2 * 7, 2)
    monthly_co2 = round(daily_co2 * 30, 2)

    daily_water = round(water_per_prompt_ml * prompts_per_day, 1) if water_available else None
    weekly_water = round(daily_water * 7, 1) if water_available else None
    monthly_water = round(daily_water * 30, 1) if water_available else None

    # Totaal platform (alle gebruikers × prompts)
    total_prompts_day = daily_users_m * 1_000_000 * prompts_per_day
    total_energy_day = round(energy_per_prompt_wh * total_prompts_day / 1_000_000, 1)  # MWh
    total_co2_day = round(co2_per_prompt * total_prompts_day / 1_000_000, 1)           # ton CO2
    total_water_day = round(water_per_prompt_ml * total_prompts_day / 1_000_000, 1) if water_available else None  # m3

    return {
        "prompts_per_day": prompts_per_day,
        "daily_users_millions": daily_users_m,
        "per_user": {
            "daily":   {"energy_wh": daily_energy, "co2_g": daily_co2, "water_ml": daily_water},
            "weekly":  {"energy_wh": weekly_energy, "co2_g": weekly_co2, "water_ml": weekly_water},
            "monthly": {"energy_wh": monthly_energy, "co2_g": monthly_co2, "water_ml": monthly_water},
        },
        "total_platform": {
            "daily":   {"energy_mwh": total_energy_day, "co2_ton": total_co2_day, "water_m3": total_water_day},
            "weekly":  {"energy_mwh": round(total_energy_day * 7, 1), "co2_ton": round(total_co2_day * 7, 1), "water_m3": round(total_water_day * 7, 1) if water_available else None},
            "monthly": {"energy_mwh": round(total_energy_day * 30, 1), "co2_ton": round(total_co2_day * 30, 1), "water_m3": round(total_water_day * 30, 1) if water_available else None},
        },
    }
