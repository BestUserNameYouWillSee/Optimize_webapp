/* ═══════════════════════════════════════════════════════════════
   AI Impact Check – Frontend JavaScript
   ═══════════════════════════════════════════════════════════════

   Handles screen navigation, model/prompt selection, and
   communicates with the Flask backend via /api/calculate.
   Quiz logic stays client-side (no data storage needed).
   ═══════════════════════════════════════════════════════════════ */

/* ─── State ─────────────────────────────────── */
let selectedModel = null;
let selectedPrompt = '';
let lastResult = null;
let modelList = [];      // populated from /api/models

/* ─── Screen Navigation ─────────────────────── */
function goToScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const target = document.getElementById(screenId);
    if (target) {
        target.classList.add('active');
        // Retrigger CSS animation
        target.style.animation = 'none';
        target.offsetHeight;   // force reflow
        target.style.animation = '';
    }
    document.getElementById('app').scrollIntoView({ behavior: 'smooth' });

    if (screenId === 'screenQuiz') {
        initQuiz();
    }
}

/* ─── Model Loading ──────────────────────────── */
async function loadModels() {
    try {
        const resp = await fetch('/api/models');
        const data = await resp.json();
        modelList = data.models;

        // Select first model by default
        if (modelList.length > 0) {
            selectedModel = modelList[0].id;
        }

        renderModelTabs();
    } catch (err) {
        console.error('Kon modellen niet laden:', err);
        // Fallback: show error in tab bar
        document.getElementById('modelTabs').innerHTML =
            '<div class="model-tab active" style="pointer-events:none;color:var(--red-500);">⚠️ Laden mislukt</div>';
    }
}

function renderModelTabs() {
    const container = document.getElementById('modelTabs');
    container.innerHTML = modelList.map(m => `
        <button class="model-tab${m.id === selectedModel ? ' active' : ''}"
                data-model="${m.id}"
                onclick="selectModel('${m.id}', this)">
            <span class="dot" style="background:${m.color};"></span>
            ${m.name}
        </button>
    `).join('');

    // Show description of initially-selected model
    showModelDescription(selectedModel);
}

/* ─── Model Selection ───────────────────────── */
function selectModel(modelId, el) {
    selectedModel = modelId;
    document.querySelectorAll('#modelTabs .model-tab').forEach(t => t.classList.remove('active'));
    el.classList.add('active');
    showModelDescription(modelId);
}

function showModelDescription(modelId) {
    const desc = document.getElementById('modelDescription');
    const m = modelList.find(x => x.id === modelId);
    if (m && m.description) {
        desc.textContent = '💬 ' + m.description;
        desc.style.display = 'block';
    } else {
        desc.style.display = 'none';
    }
}

/* ─── Prompt Selection ──────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
    // Load models from server first
    loadModels();

    // Prompt card clicks
    document.querySelectorAll('#promptCards .prompt-card').forEach(card => {
        card.addEventListener('click', function () {
            document.querySelectorAll('#promptCards .prompt-card').forEach(c => c.classList.remove('selected'));
            this.classList.add('selected');
            selectedPrompt = this.dataset.prompt;
            document.getElementById('customPrompt').value = '';
            updateCharCount();
            hideError();
        });
    });

    // Custom prompt → deselect cards
    document.getElementById('customPrompt').addEventListener('input', function () {
        if (this.value.trim().length > 0) {
            document.querySelectorAll('#promptCards .prompt-card').forEach(c => c.classList.remove('selected'));
            selectedPrompt = '';
        }
        hideError();
    });

    // Initialise
    goToScreen('screenHome');
    updateCharCount();
});

function updateCharCount() {
    const len = document.getElementById('customPrompt').value.length;
    document.getElementById('charCount').textContent = len + ' / 300';
}

/* ─── Error UI ──────────────────────────────── */
function showError(msg) {
    const el = document.getElementById('promptError');
    el.textContent = '⚠️ ' + msg;
    el.classList.add('visible');
}

function hideError() {
    const el = document.getElementById('promptError');
    el.classList.remove('visible');
}

/* ─── API Call ──────────────────────────────── */
async function calculateImpact() {
    // Determine prompt text
    let promptText = selectedPrompt;
    const customVal = document.getElementById('customPrompt').value.trim();
    if (customVal.length > 0) {
        promptText = customVal;
    }

    // Client-side validation
    if (!promptText || promptText.length < 3) {
        showError('Kies een voorbeeldvraag of schrijf minimaal 3 tekens.');
        return;
    }
    hideError();

    // Show loading state
    const btn = document.getElementById('btnCalculate');
    const originalHTML = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Berekenen...';

    try {
        const response = await fetch('/api/calculate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: selectedModel,
                prompt_text: promptText
            })
        });

        const data = await response.json();

        if (!response.ok) {
            showError(data.error || 'Er ging iets mis bij het berekenen.');
            btn.disabled = false;
            btn.innerHTML = originalHTML;
            return;
        }

        // Store result
        lastResult = data;

        // Populate results screen
        document.getElementById('resultCO2').innerHTML = fmtCO2(data.co2);
        document.getElementById('resultModel').textContent =
            data.model_name + ' · ' + data.word_count + ' woorden';
        document.getElementById('resultEnergy').textContent = fmtEnergy(data.energy_wh);
        document.getElementById('resultWater').textContent = fmtWater(data.water_ml, data.water_available);
        document.getElementById('resultTokens').textContent = data.total_tokens;
        document.getElementById('resultTime').textContent = data.time_seconds + ' sec';

        // Populate calculation breakdown
        document.getElementById('bdInputTokens').textContent  = data.input_tokens + ' tokens';
        document.getElementById('bdOutputTokens').textContent = data.output_tokens + ' tokens';
        document.getElementById('bdTotalTokens').innerHTML    = '<strong>' + data.total_tokens + '</strong>';
        document.getElementById('bdModelEnergy').textContent  = data.energy_kwh_per_1k.toFixed(4);
        document.getElementById('bdRawEnergy').textContent    = fmtEnergy(data.energy_wh);
        document.getElementById('bdPUE').textContent          = data.pue.toFixed(2) + '×';
        document.getElementById('bdHardware').textContent     = data.hardware;
        document.getElementById('bdGrid').textContent         = data.grid_intensity + ' g/kWh';
        document.getElementById('bdTotalCO2').innerHTML       = '<strong>' + fmtCO2(data.co2) + '</strong>';

        // Build comparisons from API data
        buildComparisons(data.comparisons);

        // Navigate
        goToScreen('screenResults');

    } catch (err) {
        showError('Kan geen verbinding maken met de server. Controleer of de server draait.');
        console.error('API error:', err);
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalHTML;
    }
}

/* ─── Comparison Rendering ──────────────────── */
function buildComparisons(comparisons) {
    const container = document.getElementById('comparisonList');

    container.innerHTML = comparisons.map((c, i) => `
        <div class="comparison-item" style="animation-delay:${i * 0.08}s;animation: fadeSlideIn .4s cubic-bezier(.22,.61,.36,1) both;">
            <span class="c-icon">${c.icon}</span>
            <div style="flex:1;">
                <div class="c-text">${c.text}</div>
                <div class="comparison-bar-wrap">
                    <div class="comparison-bar-fill ${c.barClass}" style="width:0%;" data-width="${c.pct}%"></div>
                </div>
            </div>
        </div>
    `).join('');

    // Animate bars after DOM paint
    setTimeout(() => {
        container.querySelectorAll('.comparison-bar-fill').forEach(bar => {
            bar.style.width = bar.dataset.width;
        });
    }, 150);
}

/* ─── Quiz ───────────────────────────────────── */
const QUIZ_QUESTIONS = [
    {
        q: 'Waarom gebruikt AI energie?',
        options: [
            'Omdat de computer moet nadenken zoals een mens',
            'Omdat AI draait in datacenters met servers die stroom nodig hebben',
            'Omdat AI altijd met zonnepanelen werkt'
        ],
        correct: 1,
        explanation: 'AI draait op servers in datacenters. Die servers gebruiken stroom om berekeningen te maken en moeten gekoeld worden met water.'
    },
    {
        q: 'Wat kun jij doen om AI zuiniger te gebruiken?',
        options: [
            'Alleen AI gebruiken op zonnige dagen',
            'Je vragen kort houden en niet steeds opnieuw laten genereren',
            'Je laptop uitzetten na elk AI-antwoord'
        ],
        correct: 1,
        explanation: 'Kortere prompts en minder regeneraties zijn de makkelijkste manieren om energie te besparen bij AI-gebruik.'
    },
    {
        q: 'Wat verbruikt méér energie bij AI?',
        options: [
            'Een korte simpele vraag van 5 woorden',
            'Een lange uitgebreide vraag van 50 woorden',
            'Dat maakt geen verschil'
        ],
        correct: 1,
        explanation: 'Langere prompts kosten meer rekenkracht. Elk extra woord telt mee in de berekening.'
    }
];

let quizAnswered = 0;
let quizCorrect = 0;

function initQuiz() {
    quizAnswered = 0;
    quizCorrect = 0;
    const container = document.getElementById('quizContainer');
    document.getElementById('quizScore').style.display = 'none';

    container.innerHTML = QUIZ_QUESTIONS.map((q, qi) => `
        <div class="quiz-question" id="qq${qi}">
            <div class="q-text">${qi + 1}. ${q.q}</div>
            ${q.options.map((opt, oi) => `
                <button class="quiz-option" onclick="answerQuiz(${qi}, ${oi}, this)" data-correct="${oi === q.correct}">
                    ${String.fromCharCode(65 + oi)}. ${opt}
                </button>
            `).join('')}
            <div class="quiz-feedback" id="qf${qi}"></div>
        </div>
    `).join('');
}

function answerQuiz(qi, oi, btnEl) {
    const q = QUIZ_QUESTIONS[qi];
    const isCorrect = (oi === q.correct);

    // Disable all options for this question
    const parent = document.getElementById('qq' + qi);
    parent.querySelectorAll('.quiz-option').forEach(o => {
        o.disabled = true;
        if (parseInt(o.dataset.correct)) o.classList.add('correct');
    });
    if (!isCorrect) {
        btnEl.classList.add('wrong');
    }

    // Show feedback
    const fb = document.getElementById('qf' + qi);
    fb.textContent = (isCorrect ? '✅ ' : '❌ ') + q.explanation;
    fb.className = 'quiz-feedback show ' + (isCorrect ? 'good' : '');
    if (!isCorrect) { fb.style.background = '#fef2f2'; fb.style.color = '#dc2626'; }

    quizAnswered++;
    if (isCorrect) quizCorrect++;

    if (quizAnswered === QUIZ_QUESTIONS.length) {
        const scoreEl = document.getElementById('quizScore');
        scoreEl.style.display = 'block';
        const scoreText = document.getElementById('quizScoreText');
        if (quizCorrect === 3) {
            scoreText.textContent = 'Perfect! 3 van de 3 goed. Jij snapt het helemaal! 🌟';
        } else if (quizCorrect === 2) {
            scoreText.textContent = 'Goed gedaan! 2 van de 3 goed. Bijna perfect! 👏';
        } else if (quizCorrect === 1) {
            scoreText.textContent = '1 van de 3 goed. Lees de uitleg nog eens rustig door! 📖';
        } else {
            scoreText.textContent = '0 van de 3 goed. Geen zorgen, je leert elke keer bij! 💪';
        }
        scoreEl.scrollIntoView({ behavior: 'smooth' });
    }
}

/* ─── Formatters ────────────────────────────────── */
function fmtCO2(grams) {
    if (grams === null || grams === undefined) return '—';
    if (grams < 0.01) return '<0.01<span class="unit">g CO₂</span>';
    if (grams < 1) return grams.toFixed(3) + '<span class="unit">g CO₂</span>';
    return grams.toFixed(1) + '<span class="unit">g CO₂</span>';
}

function fmtEnergy(wh) {
    if (wh === null || wh === undefined) return '—';
    if (wh < 0.001) return '<0.001 Wh';
    if (wh < 1) return (wh * 1000).toFixed(1) + ' mWh';
    return wh.toFixed(1) + ' Wh';
}

function fmtWater(ml, available) {
    if (!available || ml === null || ml === undefined) return 'Onbekend';
    if (ml < 0.01) return '<0.01 ml';
    if (ml < 1) return ml.toFixed(2) + ' ml';
    return ml.toFixed(1) + ' ml';
}

/* ─── Toast ──────────────────────────────────── */
let toastTimer;
function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2000);
}
