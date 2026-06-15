"""
AI Impact Check – Flask Backend
================================
Serves the frontend and provides API endpoints for calculating
the environmental impact of AI prompts.

Model config is loaded from models.json — edit that file to
add/update models without touching Python code.

Run with:
    python server.py

Then open http://127.0.0.1:5000 in your browser.
"""

import json
from pathlib import Path
from flask import Flask, render_template, request, jsonify

app = Flask(__name__)

# ─────────────────────────────────────────────────
#  Load configuration from models.json
# ─────────────────────────────────────────────────

CONFIG_PATH = Path(__file__).parent / "models.json"

def _load_config():
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        return json.load(f)

_config = _load_config()
MODEL_CONFIG   = _config["models"]
GRID_CARBON_INTENSITY = _config.get("_grid_carbon_intensity_g_per_kwh", 350)


def _find_model(model_id: str) -> dict | None:
    """Look up a model by its id field (e.g. 'chatgpt-5.5')."""
    for m in MODEL_CONFIG.values():
        if m.get("id") == model_id:
            return m
    return None


# ─────────────────────────────────────────────────
#  Calculation helpers
# ─────────────────────────────────────────────────

def count_words(text: str) -> int:
    """Count words in a string."""
    return len(text.split())


def estimate_input_tokens(word_count: int) -> int:
    """
    Words → tokens (rough: 1 token ≈ 0.75 words).
    English is ~1.3 tokens/word; Dutch is roughly similar.
    """
    return max(1, round(word_count * 1.3))


def estimate_prompt_complexity(text: str, word_count: int) -> float:
    """
    Analyse how complex/detailed a prompt is.
    Returns a multiplier between 1.0 (simple) and 3.0 (very complex).

    Factors:
      - Word count: longer prompts expect longer answers
      - Signal words: "leg uit", "hoe werkt", "verschil", etc.
    """
    text_lower = text.lower()

    if word_count <= 8:
        base = 1.0
    elif word_count <= 20:
        base = 1.5
    elif word_count <= 40:
        base = 2.0
    else:
        base = 2.5

    SIGNAL_WORDS = [
        "leg uit", "hoe werkt", "wat is het verschil", "waarom",
        "vergelijken", "beschrijf", "analyseer", "uitgebreid",
        "gedetailleerd", "in detail", "stap voor stap", "voorbeelden",
        "uitleggen", "oorzaken", "gevolgen", "hoe komt het",
        "wat gebeurt er", "hoe maak je", "samenvatting",
        "verschil tussen", "overeenkomsten", "research",
    ]

    boost = 0.0
    for kw in SIGNAL_WORDS:
        if kw in text_lower:
            boost += 0.3

    # "en" / commas suggest multiple sub-questions
    sub_questions = text_lower.count(" en ") + text_lower.count(",") // 2
    boost += sub_questions * 0.15

    return min(3.0, base + boost)


def estimate_output_tokens(input_tokens: int, prompt_text: str, word_count: int) -> int:
    """
    Estimate AI response length in tokens.
    Floor: 100–250 tokens (scales with complexity).
    """
    complexity = estimate_prompt_complexity(prompt_text, word_count)
    floor = 100 + int(complexity * 50)
    est = round(input_tokens * complexity * 2.0)
    return max(floor, est)


def calculate_energy_wh(total_tokens: int, cfg: dict) -> float:
    """Energy in watt-hours = (tokens/1000) × kWh_per_1k × PUE × 1000."""
    energy_kwh = (total_tokens / 1000) * cfg["energy_kwh_per_1k_tokens"] * cfg["pue"]
    return round(energy_kwh * 1000, 3)


def calculate_co2(energy_wh: float) -> float:
    """CO₂ in grams = kWh × grid_intensity (g/kWh)."""
    return round((energy_wh / 1000) * GRID_CARBON_INTENSITY, 3)


def calculate_water_ml(energy_wh: float, cfg: dict) -> float | None:
    """Water in millilitres. Returns None if water data is unknown."""
    wl = cfg.get("water_l_per_kwh")
    if wl is None:
        return None
    return round((energy_wh / 1000) * wl * 1000, 1)


def calculate_time_seconds(output_tokens: int, cfg: dict) -> float:
    """Estimated generation time in seconds."""
    return round(output_tokens / cfg["tokens_per_second"], 1)


# ─── Comparisons ────────────────────────────────

def _fmt_shower(seconds: float) -> str:
    if seconds < 0.05:
        return "minder dan 0,1 seconde"
    if seconds < 1:
        return f"{seconds:.2f} seconden"
    sec = round(seconds, 1)
    if sec < 60:
        return f"{sec} seconden"
    mins = int(sec // 60)
    s = round(sec % 60)
    if s == 0:
        return f"{mins} min"
    return f"{mins} min {s} sec"


def _fmt_drive(metres: float) -> str:
    if metres < 0.5:
        return "minder dan 1 meter"
    m = round(metres)
    if m < 1000:
        return f"{m} meter"
    return f"{m / 1000:.1f} km"


def _fmt_lamp(minutes: float) -> str:
    if minutes < 0.5:
        sec = round(minutes * 60)
        return f"{sec} seconden"
    mnt = round(minutes)
    if mnt < 60:
        return f"{mnt} minuten"
    hrs = mnt // 60
    m = mnt % 60
    if m == 0:
        return f"{hrs} uur"
    return f"{hrs} uur {m} min"


def _fmt_charge(count: float) -> str:
    if count < 0.01:
        return "minder dan 0,01×"
    return f"{round(count, 2)}×"


def build_comparisons(co2: float) -> list[dict]:
    shower_sec   = co2 / 3.33
    drive_metres = co2 * 8.33
    lamp_min     = co2 * 12
    charges      = co2 / 10

    return [
        {
            "icon": "🚿", "label": "Douchen",
            "text": f"Dit staat gelijk aan <strong>{_fmt_shower(shower_sec)} douchen</strong> (met gasboiler).",
            "barClass": "bar-shower",
            "pct": max(1, min(100, round(shower_sec / 6 * 100))),
        },
        {
            "icon": "🚗", "label": "Autorijden",
            "text": f"Dit staat gelijk aan <strong>{_fmt_drive(drive_metres)} autorijden</strong> (gemiddelde benzineauto).",
            "barClass": "bar-car",
            "pct": max(1, min(100, round(drive_metres / 8.33 * 100))),
        },
        {
            "icon": "💡", "label": "LED lamp",
            "text": f"Hiermee laat je een LED-lamp <strong>{_fmt_lamp(lamp_min)} branden</strong> (10 watt, EU-stroommix).",
            "barClass": "bar-lamp",
            "pct": max(1, min(100, round(lamp_min / 2 * 100))),
        },
        {
            "icon": "📱", "label": "Telefoon opladen",
            "text": f"Dit is evenveel als je telefoon <strong>{_fmt_charge(charges)} volledig opladen</strong> (0-100%).",
            "barClass": "bar-charge",
            "pct": max(1, min(100, round(charges * 100))),
        },
    ]


# ─────────────────────────────────────────────────
#  Routes
# ─────────────────────────────────────────────────

@app.route("/")
def index():
    """Serve the main HTML page."""
    return render_template("index.html")


@app.route("/api/models")
def api_models():
    """
    Return all available model metadata.
    Frontend uses this to render model tabs dynamically.
    """
    return jsonify({
        "grid_intensity": GRID_CARBON_INTENSITY,
        "models": [
            {
                "id":                        m["id"],
                "name":                      m["name"],
                "provider":                  m["provider"],
                "hardware":                  m["hardware"],
                "color":                     m["color"],
                "description":               m["description"],
                "pue":                       m["pue"],
                "tokens_per_second":         m["tokens_per_second"],
                "energy_kwh_per_1k":         m["energy_kwh_per_1k_tokens"],
                "water_l_per_kwh":           m["water_l_per_kwh"],
            }
            for m in MODEL_CONFIG.values()
        ]
    })


@app.route("/api/calculate", methods=["POST"])
def api_calculate():
    """
    Calculate environmental impact for a given prompt.

    Request JSON:
        { "model": "chatgpt|deepseek|gemini", "prompt_text": "..." }

    Response JSON:
        { co2, energy_wh, water_ml, input_tokens, output_tokens,
          total_tokens, time_seconds, model_name, hardware,
          pue, grid_intensity, comparisons, ... }
    """
    data = request.get_json(silent=True)

    if not data:
        return jsonify({"error": "Ongeldige invoer. Stuur JSON met 'model' en 'prompt_text'."}), 400

    model = data.get("model", "").strip().lower()
    prompt_text = data.get("prompt_text", "").strip()

    cfg = _find_model(model)
    if cfg is None:
        valid_ids = [m.get("id", "?") for m in MODEL_CONFIG.values()]
        return jsonify({
            "error": f"Onbekend model '{model}'. Kies uit: {', '.join(valid_ids)}."
        }), 400

    if len(prompt_text) < 3:
        return jsonify({"error": "Je prompt moet minimaal 3 tekens bevatten."}), 400

    wc = count_words(prompt_text)
    input_tok = estimate_input_tokens(wc)
    output_tok = estimate_output_tokens(input_tok, prompt_text, wc)
    total_tok = input_tok + output_tok

    energy_wh = calculate_energy_wh(total_tok, cfg)
    co2 = calculate_co2(energy_wh)
    water_ml = calculate_water_ml(energy_wh, cfg)
    water_available = cfg.get("water_l_per_kwh") is not None
    time_sec = calculate_time_seconds(output_tok, cfg)
    comparisons = build_comparisons(co2)

    return jsonify({
        "co2": co2,
        "energy_wh": energy_wh,
        "water_ml": water_ml,
        "water_available": water_available,
        "word_count": wc,
        "input_tokens": input_tok,
        "output_tokens": output_tok,
        "total_tokens": total_tok,
        "time_seconds": time_sec,
        "model_name": cfg["name"],
        "model_id": cfg["id"],
        "model_description": cfg.get("description", ""),
        "hardware": cfg["hardware"],
        "pue": cfg["pue"],
        "tokens_per_second": cfg["tokens_per_second"],
        "energy_kwh_per_1k": cfg["energy_kwh_per_1k_tokens"],
        "water_l_per_kwh": cfg.get("water_l_per_kwh"),
        "grid_intensity": GRID_CARBON_INTENSITY,
        "comparisons": comparisons,
    })


# ─────────────────────────────────────────────────
#  Entry point
# ─────────────────────────────────────────────────

if __name__ == "__main__":
    print("🌱 AI Impact Check – server start op http://127.0.0.1:5000")
    print(f"   📋 {len(MODEL_CONFIG)} modellen geladen uit models.json")
    app.run(debug=True, host="127.0.0.1", port=5000)
