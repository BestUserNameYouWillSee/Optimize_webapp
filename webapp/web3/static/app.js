// ===========================
// PROMPT IMPACT (web3) — Frontend
// ===========================

let modelList = [];
let currentModel = null;
let currentPrompt = '';
let lastCostData = null;
let quizCurrentQ = 0;
let quizAnswered = 0;
let quizCorrect = 0;
let quizAnswers = [];

// --- Navigation ---
function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const page = document.getElementById('page-' + id);
  if (page) page.classList.add('active');
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  const navEl = document.getElementById('nav-' + id);
  if (navEl) navEl.classList.add('active');
  if (['ai','chat','kosten','ontdek','quiz'].includes(id)) {
    document.getElementById('nav-home')?.classList.add('active');
  }
  if (id === 'quiz') resetQuiz();
  document.querySelector('.main').scrollTop = 0;
}

function navTo(id) { showPage(id); }

// --- Model loading ---
async function loadModels() {
  try {
    const resp = await fetch('/api/models');
    const data = await resp.json();
    modelList = data.models;
    renderHomeCards();
    if (modelList.length > 0) currentModel = modelList[0];
  } catch (err) {
    console.error('Modellen laden mislukt:', err);
    document.getElementById('aiCards').innerHTML =
      '<div class="ai-card-placeholder">Modellen konden niet geladen worden.</div>';
  }
}

// --- Brand SVG logos (kleur per modelversie) ---
function getBrandSVG(model) {
  const family = (model.family || '').toLowerCase();
  const id = (model.id || '').toLowerCase();
  const c = model.color || '#9CA3AF';

  // GPT / OpenAI — groen vlak met witte cirkel + stip
  if (family === 'chatgpt' || id.includes('gpt') || id.includes('chatgpt')) {
    return `<svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <rect width="24" height="24" rx="5" fill="${c}"/>
      <circle cx="12" cy="12" r="6" fill="none" stroke="#fff" stroke-width="1.5"/>
      <circle cx="12" cy="12" r="1.8" fill="#fff"/>
    </svg>`;
  }
  // Gemini — blauw vlak met geroteerd vierkant
  if (family === 'gemini' || id.includes('gemini')) {
    return `<svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <rect width="24" height="24" rx="5" fill="${c}"/>
      <rect x="6" y="6" width="12" height="12" rx="2.5" fill="none" stroke="#fff" stroke-width="1.5" transform="rotate(45 12 12)"/>
    </svg>`;
  }
  // DeepSeek — blauw vlak met witte diamant
  if (family === 'deepseek' || id.includes('deepseek')) {
    return `<svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <rect width="24" height="24" rx="5" fill="${c}"/>
      <polygon points="12,5 19,12 12,19 5,12" fill="none" stroke="#fff" stroke-width="1.5"/>
    </svg>`;
  }
  // Claude — zandkleurig vlak met wit afgerond vierkant
  if (family === 'claude' || id.includes('claude')) {
    return `<svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <rect width="24" height="24" rx="5" fill="${c}"/>
      <rect x="6.5" y="6.5" width="11" height="11" rx="3" fill="none" stroke="#fff" stroke-width="1.5"/>
    </svg>`;
  }
  // Default
  return `<svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <rect width="24" height="24" rx="5" fill="${c}"/>
    <circle cx="12" cy="12" r="5" fill="none" stroke="#fff" stroke-width="1.5"/>
  </svg>`;
}

// --- Render home cards grouped by family ---
function renderHomeCards() {
  const container = document.getElementById('aiCards');
  if (!modelList.length) {
    container.innerHTML = '<div class="ai-card-placeholder">Geen modellen beschikbaar</div>';
    return;
  }

  // Group by family
  const families = {};
  modelList.forEach(m => {
    const f = m.family || m.provider || 'Overig';
    if (!families[f]) families[f] = [];
    families[f].push(m);
  });

  let html = '';
  for (const [family, models] of Object.entries(families)) {
    html += '<div class="ai-family-group">';
    html += '<p class="ai-family-label">' + escHtml(family) + '</p>';
    html += '<div class="ai-cards">';
    models.forEach(m => {
      html += `
        <button class="ai-card" onclick="showAI('${m.id}')">
          <div class="ai-card-icon" style="background:${m.color}">
            ${getBrandSVG(m)}
          </div>
          <span class="ai-card-name">${escHtml(m.name)}</span>
          <span class="ai-card-sub">${escHtml(m.provider)}</span>
          <span class="ai-card-version">${escHtml(m.version || '')}</span>
        </button>
      `;
    });
    html += '</div></div>';
  }
  container.innerHTML = html;
}

// --- Build small pill for top bars ---
function buildBrandPill(model) {
  const svgSmall = getBrandSVG(model)
    .replace(/width="2[24]"/g, 'width="16"')
    .replace(/height="2[24]"/g, 'height="16"');
  return `<div class="ai-brand-pill" style="background:${model.color};font-size:13px;padding:5px 14px 5px 10px;">
    ${svgSmall} ${escHtml(model.name)}
  </div>`;
}

// --- Show AI prompt page ---
function showAI(modelId) {
  const model = modelList.find(m => m.id === modelId);
  if (!model) return;
  currentModel = model;

  const pill = document.getElementById('ai-brand-pill');
  pill.style.background = model.color;
  const iconSmall = getBrandSVG(model)
    .replace(/width="2[24]"/g, 'width="16"')
    .replace(/height="2[24]"/g, 'height="16"');
  pill.innerHTML = iconSmall + ' ' + escHtml(model.name);

  document.getElementById('ai-tagline').textContent = getTagline(model);
  document.getElementById('ai-model-info').textContent =
    escHtml(model.version) + ' | ' + escHtml(model.size) + ' | ' + escHtml(model.hardware);
  document.getElementById('ai-prompt-input').value = '';
  document.getElementById('ai-prompt-input').placeholder = 'Stel een vraag aan ' + model.name + '...';

  showPage('ai');
}

function getTagline(model) {
  const f = (model.family || '').toLowerCase();
  if (f === 'chatgpt') return 'Wat kan ik vandaag voor je doen?';
  if (f === 'gemini') return 'Waar wil je meer over weten?';
  if (f === 'deepseek') return 'Hoe kan ik je helpen vandaag?';
  if (f === 'claude') return 'Ik denk graag met je mee. Wat wil je bespreken?';
  return 'Stel je vraag...';
}

// --- Chips click ---
document.addEventListener('click', function(e) {
  if (e.target.classList.contains('chip')) {
    const prompt = e.target.dataset.prompt;
    if (prompt) {
      document.getElementById('ai-prompt-input').value = prompt;
      document.getElementById('ai-prompt-input').focus();
    }
  }
});

// --- Send prompt ---
function sendPrompt() {
  const input = document.getElementById('ai-prompt-input');
  const text = input ? input.value.trim() : '';
  if (!text || !currentModel) return;
  currentPrompt = text;

  document.getElementById('chat-user-msg').textContent = text;
  document.getElementById('chat-brand-bar').innerHTML = buildBrandPill(currentModel);
  showPage('chat');

  setTimeout(async () => {
    try {
      const resp = await fetch('/api/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: currentModel.id, prompt_text: text })
      });
      const data = await resp.json();
      if (!resp.ok) { console.error(data.error); showPage('ai'); return; }
      lastCostData = data;
      populateKosten(currentModel, text, data);
      showPage('kosten');
    } catch (err) {
      console.error('API error:', err);
      showPage('ai');
    }
  }, 2400);
}

// --- Populate kosten ---
function populateKosten(model, prompt, data) {
  const display = prompt.length > 50 ? prompt.slice(0, 48) + '...' : prompt;
  document.getElementById('kosten-prompt-text').textContent = display;
  document.getElementById('kosten-brand-logo').innerHTML = buildBrandPill(model);

  // Summary
  document.getElementById('kosten-summary').textContent =
    'Je stelde "' + escHtml(prompt.slice(0, 60)) + (prompt.length > 60 ? '...' : '') +
    '" aan ' + model.name + '. Dit is de geschatte impact:';

  // Efficiency badge
  const eff = data.efficiency || 'Gemiddeld';
  const effClass = 'efficiency-' + eff.toLowerCase().replace(/\s+/g, '-');
  document.getElementById('efficiency-badge').innerHTML =
    'Energie-efficientie: <strong>' + eff + '</strong>';
  document.getElementById('efficiency-badge').className = 'efficiency-badge ' + effClass;

  // Energy
  const ewh = data.energy_wh;
  let energyStr;
  if (ewh < 0.001) energyStr = '<0.001 Wh';
  else if (ewh < 1) energyStr = (ewh * 1000).toFixed(1) + ' mWh';
  else energyStr = ewh.toFixed(3) + ' Wh';
  document.getElementById('cost-elektriciteit-num').textContent = energyStr;
  document.getElementById('cost-elektriciteit-eq').textContent =
    'Vergelijkbaar met een LED-lamp van 10W die ' + Math.max(0.1, (ewh * 3600 / 10).toFixed(1)) + ' seconden brandt';

  // Water
  if (data.water_available) {
    const wml = data.water_ml;
    let waterStr;
    if (wml < 0.01) waterStr = '<0.01 ml';
    else if (wml < 1) waterStr = wml.toFixed(2) + ' ml';
    else waterStr = wml.toFixed(1) + ' ml';
    document.getElementById('cost-water-num').textContent = waterStr;
    document.getElementById('cost-water-eq').textContent =
      wml < 0.5 ? 'Minder dan een druppel water' :
      wml < 5 ? 'Vergelijkbaar met ' + Math.round(wml / 0.05) + ' druppels water' :
      'Vergelijkbaar met ~' + Math.round(wml / 5) + ' theelepels water';
  } else {
    document.getElementById('cost-water-num').textContent = '~0 ml';
    document.getElementById('cost-water-eq').textContent = 'Dit model gebruikt zeewaterkoeling — vrijwel geen drinkwater';
  }

  // CO2
  const co2 = data.co2;
  let co2Str;
  if (co2 < 0.01) co2Str = '<0.01 g CO2';
  else if (co2 < 1) co2Str = co2.toFixed(3) + ' g CO2';
  else co2Str = co2.toFixed(1) + ' g CO2';
  document.getElementById('cost-co2-num').textContent = co2Str;
  document.getElementById('cost-co2-eq').textContent =
    co2 < 0.05 ? 'Minder dan 1 meter autorijden' :
    'Vergelijkbaar met ~' + Math.round(co2 * 8.33) + ' meter autorijden (benzineauto)';

  // Calculation details
  document.getElementById('calc-detail-grid').innerHTML = [
    ['Prompt (input tokens)', data.input_tokens + ' tokens'],
    ['Geschat antwoord (output)', data.output_tokens + ' tokens'],
    ['Totaal tokens', data.total_tokens + ' tokens'],
    ['Energie per 1000 tokens', data.energy_kwh_per_1k.toFixed(5) + ' kWh'],
    ['Datacenter PUE', data.pue.toFixed(2) + ' (koelingsoverhead)'],
    ['Hardware', escHtml(data.hardware || 'Onbekend')],
    ['Geschatte antwoordtijd', data.time_seconds + ' seconden'],
    ['CO2-intensiteit stroom', data.grid_intensity + ' g/kWh (NL/EU)'],
    ['Waterverbruik', data.water_available ? (data.water_l_per_kwh != null ? data.water_l_per_kwh + ' L/kWh' : 'Zeewaterkoeling') : 'Onbekend'],
  ].map(([label, val]) =>
    '<div class="calc-detail-item"><span class="calc-detail-label">' + label + '</span><span class="calc-detail-value">' + val + '</span></div>'
  ).join('');

  // Usage impact (compatible met oud en nieuw API-formaat)
  if (data.usage) {
    var u = data.usage;
    document.getElementById('usage-prompts').textContent = u.prompts_per_day;

    // Bepaal welk formaat de API teruggeeft
    var isNewFormat = u.per_user !== undefined;
    var perUser, total;

    if (isNewFormat) {
      perUser = u.per_user;
      total = u.total_platform;
    } else {
      perUser = { daily: u.daily, weekly: u.weekly, monthly: u.monthly };
      total = null;
    }

    // Per-user cards
    var userHtml = [
      { period: 'Dagelijks', co2: perUser.daily.co2_g, energy: perUser.daily.energy_wh, water: perUser.daily.water_ml },
      { period: 'Wekelijks', co2: perUser.weekly.co2_g, energy: perUser.weekly.energy_wh, water: perUser.weekly.water_ml },
      { period: 'Maandelijks', co2: perUser.monthly.co2_g, energy: perUser.monthly.energy_wh, water: perUser.monthly.water_ml },
    ].map(function(p) {
      var co2Str = p.co2 < 1 ? p.co2.toFixed(2) + ' g' : p.co2.toFixed(1) + ' g';
      var energyStr = p.energy < 1 ? (p.energy * 1000).toFixed(0) + ' mWh' : p.energy.toFixed(1) + ' Wh';
      var waterStr = data.water_available ? (p.water < 1 ? p.water.toFixed(1) + ' ml' : Math.round(p.water) + ' ml') : '-';
      return '<div class="usage-card co2-card"><div class="usage-period">' + p.period + '</div><div class="usage-val">' + co2Str + ' CO2</div><div class="usage-label">' + energyStr + ' | ' + waterStr + ' water</div></div>';
    }).join('');

    // Total platform cards (alleen in nieuw formaat)
    var totalHtml = '';
    if (total) {
      function fmtTon(t) { return t >= 1000 ? (t/1000).toFixed(1) + ' kton' : t.toFixed(1) + ' ton'; }
      function fmtWaterM3(m3) { return m3 >= 1000 ? (m3/1000).toFixed(1) + 'k m3' : m3.toFixed(0) + ' m3'; }
      totalHtml = [
        { period: 'Dagelijks totaal', co2: total.daily.co2_ton, energy: total.daily.energy_mwh, water: total.daily.water_m3 },
        { period: 'Wekelijks totaal', co2: total.weekly.co2_ton, energy: total.weekly.energy_mwh, water: total.weekly.water_m3 },
        { period: 'Maandelijks totaal', co2: total.monthly.co2_ton, energy: total.monthly.energy_mwh, water: total.monthly.water_m3 },
      ].map(function(p) {
        var waterStr2 = data.water_available && p.water != null ? fmtWaterM3(p.water) + ' water' : '';
        return '<div class="usage-card elec-card"><div class="usage-period">' + p.period + ' (' + u.daily_users_millions + 'M gebruikers)</div><div class="usage-val">' + fmtTon(p.co2) + ' CO2</div><div class="usage-label">' + p.energy.toFixed(0) + ' MWh | ' + waterStr2 + '</div></div>';
      }).join('');
    }

    // Store both views globally for toggle
    window._usageUserHtml = userHtml;
    window._usageTotalHtml = totalHtml;
    window._usageHasTotal = (total !== null);

    // Show toggle if total data is available
    var toggleEl = document.getElementById('usage-toggle');
    if (total) {
      toggleEl.style.display = 'inline-flex';
      switchUsageView('user');
    } else {
      toggleEl.style.display = 'none';
      document.getElementById('usage-grid').innerHTML = userHtml;
    }
  }

// Comparisons
  buildComparisons(data.comparisons);
  window._userComparisons = data.comparisons;
  window._totalComparisons = data.total_comparisons || null;
}

// --- Usage toggle (global) ---
function switchUsageView(view) {
  var isTotal = view === 'total' && window._usageHasTotal;
  document.getElementById('usage-btn-user').classList.toggle('active', !isTotal);
  document.getElementById('usage-btn-total').classList.toggle('active', isTotal);
  document.getElementById('usage-grid').innerHTML =
    isTotal ? window._usageTotalHtml : window._usageUserHtml;
  if (window._totalComparisons) {
    buildComparisons(isTotal ? window._totalComparisons : window._userComparisons);
  }
}

function buildComparisons(comparisons) {
  const container = document.getElementById('comparison-list');
  container.innerHTML = comparisons.map(c => `
    <div class="comparison-item">
      <span class="c-icon">${c.icon}</span>
      <div style="flex:1;">
        <div class="c-text">${c.text}</div>
        <div class="comparison-bar-wrap">
          <div class="comparison-bar-fill ${c.barClass}" style="width:0%;" data-width="${c.pct}%"></div>
        </div>
      </div>
    </div>
  `).join('');
  setTimeout(() => {
    container.querySelectorAll('.comparison-bar-fill').forEach(bar => {
      bar.style.width = bar.dataset.width;
    });
  }, 150);
}

// --- Back nav ---
function goBackFromChat() { showPage('ai'); }
function goBackFromCost() { showPage('ai'); }

// --- Enter key ---
document.addEventListener('keydown', function(e) {
  if (e.key === 'Enter' && document.activeElement === document.getElementById('ai-prompt-input')) {
    sendPrompt();
  }
});

// =========================== QUIZ ===========================
const QUIZ_QUESTIONS = [
  {
    q: 'Hoeveel water verbruikt een groot AI-datacentrum per dag?',
    options: ['Ongeveer 100 liter', 'Miljoenen liters', 'Gelijk aan een zwembad'],
    correct: 1,
    feedback: 'Grote datacentra verbruiken miljoenen liters water per dag voor koeling — vergelijkbaar met kleine steden.',
  },
  {
    q: 'Wat is de grootste energieverbruiker in een AI-datacentrum?',
    options: ['De servers zelf', 'De koelinstallaties', 'De verlichting'],
    correct: 1,
    feedback: 'Koeling vertegenwoordigt tot 40% van het totale energieverbruik in een datacentrum. Serverwarmte moet continu worden afgevoerd.',
  },
  {
    q: 'Welk type AI-model is het zuinigst voor een simpele vraag?',
    options: ['Het grootste vlaggenschipmodel', 'Een kleiner, gespecialiseerd model', 'Dat maakt geen verschil'],
    correct: 1,
    feedback: 'Kleinere modellen (zoals Flash, Mini of Haiku) zijn vaak 5-20x zuiniger dan de volledige versies. Kies het model dat past bij je taak — niet elke vraag heeft het zwaarste model nodig.',
  },
];

function resetQuiz() {
  quizCurrentQ = 0; quizAnswered = 0; quizCorrect = 0; quizAnswers = [];
  document.getElementById('quiz-name-wrap').style.display = 'flex';
  document.getElementById('quiz-body').style.display = 'none';
  document.getElementById('quiz-end').style.display = 'none';
  document.getElementById('quiz-name-input').value = '';
}

function startQuiz() {
  document.getElementById('quiz-name-wrap').style.display = 'none';
  document.getElementById('quiz-body').style.display = 'block';
  document.getElementById('quiz-end').style.display = 'none';
  quizCurrentQ = 0; quizAnswered = 0; quizCorrect = 0; quizAnswers = [];
  renderQuestion();
}

function renderQuestion() {
  const q = QUIZ_QUESTIONS[quizCurrentQ];
  document.getElementById('quiz-question').textContent = q.q;
  document.getElementById('quiz-feedback').textContent = '';
  document.getElementById('quiz-next-btn').style.display = 'none';
  const pct = (quizCurrentQ / QUIZ_QUESTIONS.length) * 100;
  document.getElementById('quiz-progress-fill').style.width = pct + '%';
  document.getElementById('quiz-progress-label').textContent = 'Vraag ' + (quizCurrentQ + 1) + ' van ' + QUIZ_QUESTIONS.length;
  const opts = document.getElementById('quiz-options');
  opts.innerHTML = '';
  q.options.forEach((opt, i) => {
    const btn = document.createElement('button');
    btn.className = 'quiz-option';
    btn.innerHTML = '<span class="quiz-radio"></span>' + escHtml(opt);
    btn.addEventListener('click', () => answerQuestion(i, q, opts.querySelectorAll('.quiz-option')));
    opts.appendChild(btn);
  });
}

function answerQuestion(chosen, q, btns) {
  btns.forEach((btn, i) => {
    if (i === q.correct) btn.classList.add('correct');
    else if (i === chosen && chosen !== q.correct) btn.classList.add('wrong');
    btn.style.pointerEvents = 'none';
  });
  const isCorrect = chosen === q.correct;
  quizAnswers.push({ question: q.q, chosen, correct: q.correct, chosen_label: q.options[chosen], correct_label: q.options[q.correct] });
  quizAnswered++;
  if (isCorrect) quizCorrect++;
  document.getElementById('quiz-feedback').textContent = q.feedback;
  if (quizCurrentQ === QUIZ_QUESTIONS.length - 1) {
    document.getElementById('quiz-progress-fill').style.width = '100%';
    finishQuiz();
  } else {
    document.getElementById('quiz-next-btn').style.display = 'block';
  }
}

function nextQuestion() {
  if (quizCurrentQ < QUIZ_QUESTIONS.length - 1) {
    quizCurrentQ++;
    renderQuestion();
  }
}

async function finishQuiz() {
  document.getElementById('quiz-next-btn').style.display = 'none';
  const scoreCard = document.getElementById('quiz-score-card');
  let msg, sub;
  if (quizCorrect === QUIZ_QUESTIONS.length) {
    sub = 'Perfect!';
    msg = 'Alle vragen goed. Je hebt de stof uitstekend begrepen.';
  } else if (quizCorrect >= QUIZ_QUESTIONS.length / 2) {
    sub = 'Goed gedaan!';
    msg = quizCorrect + ' van de ' + QUIZ_QUESTIONS.length + ' goed. Je bent goed op weg.';
  } else {
    sub = 'Blijf leren!';
    msg = quizCorrect + ' van de ' + QUIZ_QUESTIONS.length + ' goed. Bekijk de tips nog eens rustig door.';
  }

  // Build dots for each question
  var dots = '';
  for (var i = 0; i < QUIZ_QUESTIONS.length; i++) {
    dots += '<span class="score-dot ' + (quizAnswers[i] && quizAnswers[i].chosen === quizAnswers[i].correct ? 'good' : 'bad') + '"></span>';
  }

  scoreCard.innerHTML =
    '<div class="score-ring"><div class="score-ring-inner"><span class="score-big">' + quizCorrect + '/' + QUIZ_QUESTIONS.length + '</span></div></div>' +
    '<div class="score-sub">' + sub + '</div>' +
    '<div class="score-detail">' + msg + '</div>' +
    '<div class="score-breakdown">' + dots + '</div>';

  document.getElementById('quiz-body').style.display = 'none';
  document.getElementById('quiz-end').style.display = 'flex';

  const name = document.getElementById('quiz-name-input').value.trim();
  try {
    await fetch('/api/quiz/submit', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name || '', answers: quizAnswers, score: quizCorrect, total: QUIZ_QUESTIONS.length }),
    });
  } catch (err) { console.error('Quiz opslaan mislukt:', err); }
}

// --- Utils ---
function escHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// =========================== CHART ===========================
let impactChartData = null;
let impactChart = null;
let currentChartCategory = null;

async function loadImpactChartData() {
  if (impactChartData) return impactChartData;
  try {
    const resp = await fetch('/static/ai_impact_data.json');
    impactChartData = await resp.json();
    return impactChartData;
  } catch (err) {
    console.error('Impact chart data laden mislukt:', err);
    return null;
  }
}

function initImpactChart() {
  loadImpactChartData().then(function(data) {
    if (!data || !data.categories || !data.categories.length) return;
    renderChartTabs(data.categories);
    selectChartCategory(data.categories[0].id);
  });
}

function renderChartTabs(categories) {
  var tabs = document.getElementById('chart-tabs');
  if (!tabs) return;
  tabs.innerHTML = '';
  categories.forEach(function(cat) {
    var btn = document.createElement('button');
    btn.className = 'chart-tab';
    btn.textContent = cat.label;
    btn.dataset.catId = cat.id;
    btn.addEventListener('click', function() { selectChartCategory(cat.id); });
    tabs.appendChild(btn);
  });
}

function selectChartCategory(catId) {
  if (!impactChartData) return;
  var cat = impactChartData.categories.find(function(c) { return c.id === catId; });
  if (!cat) return;

  currentChartCategory = catId;

  // Update tabs
  document.querySelectorAll('.chart-tab').forEach(function(btn) {
    btn.classList.toggle('active', btn.dataset.catId === catId);
  });

  // Update description
  var subEl = document.getElementById('impact-chart-sub');
  if (subEl) subEl.textContent = cat.description;

  // Update source
  var sourceEl = document.getElementById('impact-chart-source');
  if (sourceEl) sourceEl.textContent = 'Bron: ' + cat.source;

  // Render chart
  renderChart(cat);
}

function renderChart(cat) {
  if (impactChart) {
    impactChart.destroy();
    impactChart = null;
  }

  var ctx = document.getElementById('impactChart');
  if (!ctx) return;

  var labels = cat.data.map(function(d) { return d.label || d.year; });
  var values = cat.data.map(function(d) { return d.value; });
  var isProjected = cat.data.map(function(d) { return d.projected === true; });

  // Determine if we need line or bar
  var hasProjection = isProjected.some(function(p) { return p; });
  var useBar = cat.data.length <= 10;

  var pointColors = cat.data.map(function(d, i) {
    return isProjected[i] ? '#9CA3AF' : cat.color;
  });

  var datasets = [{
    label: cat.label + ' (' + cat.unit + ')',
    data: values,
    backgroundColor: useBar
      ? cat.data.map(function(d, i) { return isProjected[i] ? 'rgba(156,163,175,0.4)' : cat.bgColor; })
      : cat.bgColor,
    borderColor: cat.color,
    borderWidth: 2.5,
    pointBackgroundColor: pointColors,
    pointBorderColor: pointColors,
    pointRadius: 5,
    pointHoverRadius: 8,
    tension: 0.3,
    fill: !useBar,
    // Use dashed line for projected segment
    segment: hasProjection ? {
      borderDash: function(ctx) {
        var idx = ctx.p0DataIndex;
        return isProjected[idx] || isProjected[idx + 1] ? [6, 3] : [];
      }
    } : undefined
  }];

  impactChart = new Chart(ctx, {
    type: useBar ? 'bar' : 'line',
    data: { labels: labels, datasets: datasets },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      animation: { duration: 600, easing: 'easeInOutQuart' },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#111827',
          titleFont: { family: 'Inter', size: 13, weight: '600' },
          bodyFont: { family: 'Inter', size: 13 },
          padding: 12,
          cornerRadius: 8,
          callbacks: {
            label: function(ctx) {
              var raw = ctx.raw;
              if (cat.id === 'users' && raw >= 1) return raw + ' miljoen/week';
              if (cat.id === 'water' && raw >= 100) return (raw / 1000).toFixed(1) + ' mld liter/jaar';
              return raw + ' ' + cat.unit;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { font: { family: 'Inter', size: 11 }, color: '#6B7280' }
        },
        y: {
          beginAtZero: true,
          grid: { color: '#F3F4F6' },
          ticks: {
            font: { family: 'Inter', size: 11 },
            color: '#6B7280',
            callback: function(val) {
              if (cat.id === 'users' && val >= 1000) return (val / 1000) + ' mln';
              if (cat.id === 'market') return '$' + val + ' mld';
              if (cat.id === 'water') return (val / 1000).toFixed(1) + ' mld';
              return val + ' ' + cat.unit;
            }
          }
        }
      }
    }
  });
}

// --- Init ---
document.addEventListener('DOMContentLoaded', () => {
  loadModels();
  showPage('home');
  initImpactChart();
});
