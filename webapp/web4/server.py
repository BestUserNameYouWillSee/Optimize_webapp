"""
Prompt Impact — Flask Backend (web4)
=====================================
API-endpoints voor modeldata, impactberekening en quiz-resultaten.

Afhankelijkheden:
    database.py     — SQLite setup
    calculations.py — modelconfig + rekenfuncties
    models.json     — modeldefinities (handmatig aanpasbaar)

Run:  python server.py
Open: http://127.0.0.1:5001
"""

import json
from datetime import datetime, timezone

from flask import Flask, render_template, request, jsonify

from database import get_db, close_db, init_db, DB_PATH
from calculations import (
    MODEL_CONFIG, GRID_CO2,
    find_model,
    count_words, estimate_input_tokens, estimate_output_tokens,
    calculate_energy_wh, calculate_co2, calculate_water_ml,
    calculate_time_seconds, efficiency_label,
    build_comparisons, build_total_comparisons, build_usage_impact,
)

app = Flask(__name__)
app.teardown_appcontext(close_db)


# ------------------------------------------------------------------ Routes
@app.route("/")
def index():
    return render_template("index.html")


@app.route("/ai-impact")
def ai_impact():
    return render_template("index.html")


@app.route("/api/models")
def api_models():
    return jsonify({
        "grid_intensity": GRID_CO2,
        "models": [
            {
                "id": m["id"], "name": m["name"], "provider": m["provider"],
                "family": m.get("family", ""), "version": m.get("version", ""),
                "size": m.get("size", ""), "hardware": m["hardware"],
                "color": m["color"], "description": m["description"],
                "pue": m["pue"], "tokens_per_second": m["tokens_per_second"],
                "energy_kwh_per_1k": m["energy_kwh_per_1k_tokens"],
                "water_l_per_kwh": m["water_l_per_kwh"],
            }
            for m in MODEL_CONFIG.values()
        ]
    })


@app.route("/api/calculate", methods=["POST"])
def api_calculate():
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Ongeldige invoer."}), 400

    model_id = data.get("model", "").strip().lower()
    prompt_text = data.get("prompt_text", "").strip()

    cfg = find_model(model_id)
    if cfg is None:
        ids = [m.get("id", "?") for m in MODEL_CONFIG.values()]
        return jsonify({"error": f"Onbekend model '{model_id}'. Kies uit: {', '.join(ids)}."}), 400

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

    # Total daily platform CO2 for comparisons
    total_daily_co2_ton = round(
        co2 * cfg.get("avg_prompts_per_day", 5) * cfg.get("daily_users_millions", 10), 1
    )

    return jsonify({
        "co2": co2, "energy_wh": energy_wh, "water_ml": water_ml,
        "water_available": water_available, "word_count": wc,
        "input_tokens": input_tok, "output_tokens": output_tok,
        "total_tokens": total_tok, "time_seconds": time_sec,
        "model_name": cfg["name"], "model_id": cfg["id"],
        "model_description": cfg.get("description", ""),
        "model_size": cfg.get("size", ""), "model_family": cfg.get("family", ""),
        "hardware": cfg["hardware"], "pue": cfg["pue"],
        "tokens_per_second": cfg["tokens_per_second"],
        "energy_kwh_per_1k": cfg["energy_kwh_per_1k_tokens"],
        "water_l_per_kwh": cfg.get("water_l_per_kwh"),
        "grid_intensity": GRID_CO2,
        "efficiency": efficiency_label(cfg),
        "comparisons": build_comparisons(co2),
        "total_comparisons": build_total_comparisons(total_daily_co2_ton),
        "usage": build_usage_impact(energy_wh, co2, water_ml, water_available, cfg),
    })


@app.route("/api/quiz/submit", methods=["POST"])
def api_quiz_submit():
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Ongeldige invoer."}), 400

    name = (data.get("name") or "").strip()
    answers = data.get("answers", [])
    score = data.get("score", 0)
    total = data.get("total", 0)
    created_at = datetime.now(timezone.utc).isoformat()

    db = get_db()
    db.execute(
        "INSERT INTO quiz_answers (name, answers, score, total, created_at) VALUES (?, ?, ?, ?, ?)",
        (name, json.dumps(answers, ensure_ascii=False), score, total, created_at),
    )
    db.commit()
    return jsonify({"ok": True, "id": db.execute("SELECT last_insert_rowid()").fetchone()[0]})


@app.route("/api/quiz/results")
def api_quiz_results():
    db = get_db()
    rows = db.execute(
        "SELECT id, name, answers, score, total, created_at FROM quiz_answers ORDER BY id DESC"
    ).fetchall()
    return jsonify({
        "results": [
            {
                "id": r["id"], "name": r["name"],
                "answers": json.loads(r["answers"]),
                "score": r["score"], "total": r["total"],
                "created_at": r["created_at"],
            }
            for r in rows
        ]
    })


# ------------------------------------------------------------------ Main
if __name__ == "__main__":
    init_db()
    families = len({m.get("family", "") for m in MODEL_CONFIG.values()})
    print(f"Prompt Impact (web4) — http://127.0.0.1:5002")
    print(f"   {len(MODEL_CONFIG)} modellen ({families} families)")
    print(f"   Database: {DB_PATH}")
    app.run(debug=False, host="127.0.0.1", port=5002)
