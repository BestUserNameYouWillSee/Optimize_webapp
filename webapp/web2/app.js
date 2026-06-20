// ===========================
// STATE
// ===========================
let currentAI = null;
let currentPrompt = '';

const costData = {
  chatgpt: {
    elektriciteit: { num: '0,001 Wh', eq: 'Genoeg voor ~1 sec. een LED-lamp te branden' },
    water:         { num: '~3 ml',    eq: 'Vergelijkbaar met een halve theelepel water' },
    co2:           { num: '~0,3 g',   eq: '≈ 1,5 km rijden (bij 200g CO₂/km)' },
  },
  gemini: {
    elektriciteit: { num: '0,0009 Wh', eq: 'Iets minder dan ChatGPT door Google-infra' },
    water:         { num: '~2 ml',     eq: 'Vergelijkbaar met een paar druppels water' },
    co2:           { num: '~0,2 g',    eq: '≈ 1 km rijden (bij 200g CO₂/km)' },
  },
  deepseek: {
    elektriciteit: { num: '0,0005 Wh', eq: 'Efficiënter model, minder rekenkracht nodig' },
    water:         { num: '~1 ml',     eq: 'Vergelijkbaar met één grote druppel water' },
    co2:           { num: '~0,1 g',    eq: '≈ 0,5 km rijden (bij 200g CO₂/km)' },
  },
};

const brandBadge = {
  chatgpt: `<div class="ai-brand-pill chatgpt-pill" style="font-size:13px;padding:5px 12px 5px 10px;"><svg width="16" height="16" viewBox="0 0 41 41" fill="none"><path d="M37.532 16.87a9.963 9.963 0 0 0-.856-8.184 10.078 10.078 0 0 0-10.855-4.835A9.964 9.964 0 0 0 18.306.5a10.079 10.079 0 0 0-9.614 6.977 9.967 9.967 0 0 0-6.664 4.834 10.08 10.08 0 0 0 1.24 11.817 9.965 9.965 0 0 0 .856 8.185 10.079 10.079 0 0 0 10.855 4.835 9.965 9.965 0 0 0 7.516 3.35 10.078 10.078 0 0 0 9.617-6.981 9.967 9.967 0 0 0 6.663-4.834 10.079 10.079 0 0 0-1.243-11.813zM22.498 37.886a7.474 7.474 0 0 1-4.799-1.735c.061-.033.168-.091.237-.134l7.964-4.6a1.294 1.294 0 0 0 .655-1.134V19.054l3.366 1.944a.12.12 0 0 1 .066.092v9.299a7.505 7.505 0 0 1-7.49 7.496z" fill="white"/></svg> ChatGPT</div>`,
  gemini: `<div class="ai-brand-pill gemini-pill" style="font-size:13px;padding:5px 12px 5px 10px;"><svg width="14" height="14" viewBox="0 0 28 28" fill="none"><path d="M14 28C14 26.0633 13.6267 24.2433 12.88 22.54C12.1567 20.8367 11.165 19.355 9.905 18.095C8.645 16.835 7.16333 15.8433 5.46 15.12C3.75667 14.3733 1.93667 14 0 14C1.93667 14 3.75667 13.6383 5.46 12.915C7.16333 12.1683 8.645 11.165 9.905 9.905C11.165 8.645 12.1567 7.16333 12.88 5.46C13.6267 3.75667 14 1.93667 14 0C14 1.93667 14.3617 3.75667 15.085 5.46C15.8317 7.16333 16.835 8.645 18.095 9.905C19.355 11.165 20.8367 12.1683 22.54 12.915C24.2433 13.6383 26.0633 14 28 14C26.0633 14 24.2433 14.3733 22.54 15.12C20.8367 15.8433 19.355 16.835 18.095 18.095C16.835 19.355 15.8317 20.8367 15.085 22.54C14.3617 24.2433 14 26.0633 14 28Z" fill="white"/></svg> Gemini</div>`,
  deepseek: `<div class="ai-brand-pill deepseek-pill" style="font-size:13px;padding:5px 12px;">🐋 DeepSeek</div>`,
};

// ===========================
// NAVIGATION
// ===========================
function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const page = document.getElementById('page-' + id);
  if (page) page.classList.add('active');

  // Update sidebar active state
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  const navEl = document.getElementById('nav-' + id);
  if (navEl) navEl.classList.add('active');
  if (['chatgpt','gemini','deepseek','chat','kosten','ontdek','quiz'].includes(id)) {
    document.getElementById('nav-home')?.classList.add('active');
  }
}

function navTo(id) {
  showPage(id);
}

function showAI(ai) {
  currentAI = ai;
  showPage(ai);
}

function goBackFromChat() {
  showPage(currentAI || 'home');
}

function goBackFromCost() {
  // Show chat page briefly but skip animation — just go back to AI page
  showPage(currentAI || 'home');
}

// ===========================
// PROMPT INTERACTION
// ===========================
function usePrompt(ai, text) {
  const el = document.getElementById(ai + '-input');
  if (el) { el.value = text; el.focus(); }
}

function sendPrompt(ai) {
  const el = document.getElementById(ai + '-input');
  const text = el ? el.value.trim() : '';
  if (!text) return;

  currentAI = ai;
  currentPrompt = text;

  // Set chat UI
  document.getElementById('chat-user-msg').textContent = text;
  document.getElementById('chat-brand-bar').innerHTML = brandBadge[ai] || ai;

  showPage('chat');

  setTimeout(() => {
    populateKosten(ai, text);
    showPage('kosten');
  }, 2400);
}

function populateKosten(ai, prompt) {
  const d = costData[ai];

  // Truncate long prompts for display
  const display = prompt.length > 40 ? prompt.slice(0, 38) + '…' : prompt;
  document.getElementById('kosten-prompt-text').textContent = display;
  document.getElementById('kosten-brand-logo').innerHTML = brandBadge[ai] || '';

  document.getElementById('cost-elektriciteit-num').textContent = d.elektriciteit.num;
  document.getElementById('cost-elektriciteit-eq').textContent  = d.elektriciteit.eq;
  document.getElementById('cost-water-num').textContent = d.water.num;
  document.getElementById('cost-water-eq').textContent  = d.water.eq;
  document.getElementById('cost-co2-num').textContent = d.co2.num;
  document.getElementById('cost-co2-eq').textContent  = d.co2.eq;
}

// ===========================
// QUIZ
// ===========================
const questions = [
  {
    q: 'Hoeveel water verbruikt een groot AI-datacentrum per dag?',
    options: ['Ongeveer 100 liter', 'Miljoenen liters', 'Gelijk aan één zwembad'],
    correct: 1,
    feedback: 'Grote datacentra verbruiken miljoenen liters water per dag voor koeling — vergelijkbaar met kleine steden.',
  },
  {
    q: 'Wat is de grootste energieverbruiker in een AI-datacentrum?',
    options: ['De servers zelf', 'De koelinstallaties', 'De verlichting en kantoren'],
    correct: 1,
    feedback: 'Koeling vertegenwoordigt tot 40% van het totale energieverbruik in een datacentrum.',
  },
  {
    q: 'Hoeveel meer water gebruikt een ChatGPT-vraag dan een Google-zoekopdracht?',
    options: ['Evenveel', 'Zo\'n 5 tot 10 keer meer', 'Meer dan 100 keer meer'],
    correct: 1,
    feedback: 'Onderzoek van UC Riverside (2023) schat dat ChatGPT zo\'n 10x meer water verbruikt per vraag dan een Google-zoekopdracht.',
  },
];

let currentQ = 0;
let answered = false;

function renderQuestion() {
  const q = questions[currentQ];
  document.getElementById('quiz-question').textContent = q.q;
  document.getElementById('quiz-feedback').textContent = '';
  document.getElementById('quiz-next-btn').style.display = 'none';
  document.getElementById('quiz-finish-btn').style.display = 'none';

  // Progress
  const pct = ((currentQ) / questions.length) * 100;
  document.getElementById('quiz-progress-fill').style.width = pct + '%';
  document.getElementById('quiz-progress-label').textContent = `Vraag ${currentQ + 1} van ${questions.length}`;

  const opts = document.getElementById('quiz-options');
  opts.innerHTML = '';
  q.options.forEach((opt, i) => {
    const btn = document.createElement('button');
    btn.className = 'quiz-option';
    btn.innerHTML = `<span class="quiz-radio"></span>${opt}`;
    btn.addEventListener('click', () => answerQuestion(i, q, opts.querySelectorAll('.quiz-option')));
    opts.appendChild(btn);
  });
  answered = false;
}

function answerQuestion(chosen, q, btns) {
  if (answered) return;
  answered = true;

  btns.forEach((btn, i) => {
    if (i === q.correct) btn.classList.add('correct');
    else if (i === chosen && chosen !== q.correct) btn.classList.add('wrong');
    btn.style.pointerEvents = 'none';
  });

  document.getElementById('quiz-feedback').textContent = q.feedback;

  const isLast = currentQ === questions.length - 1;
  if (isLast) {
    document.getElementById('quiz-progress-fill').style.width = '100%';
    document.getElementById('quiz-finish-btn').style.display = 'inline-flex';
  } else {
    document.getElementById('quiz-next-btn').style.display = 'block';
  }
}

function nextQuestion() {
  if (currentQ < questions.length - 1) {
    currentQ++;
    renderQuestion();
  }
}

// Init
renderQuestion();
