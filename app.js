/* DEINE WAHL — рушій тренажера.
   Сценарії — у data/stsenarii/*.json у форматі організаторів (+ необовʼязкове розширення podacha),
   норми — у data/normy.json (перелік організаторів). Код їх лише відтворює.
   Режими: «Тиск часу» (мовчання — теж вибір) і «Заняття з групою» (анонімне голосування, лише лічильники).
   Висновки ухвалюють явні правила: бал за вісь = сума оцінок обраних варіантів, заданих авторами сценарію.
   Нічого не надсилається. Локально зберігається лише перелік пройдених справ (без виборів і балів). */
(() => {
'use strict';

const app = document.querySelector('#app');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
// Три відповіді — три кольори скла. Шлях гравця тягнеться цими кольорами.
const HUE = ['var(--a)', 'var(--b)', 'var(--c)', 'var(--d)'];
const HEX = ['#ffb35c', '#b794ff', '#5fe3c8', '#ff8fb1'];
const LETTER = ['А', 'Б', 'В', 'Г'];
const KEYS = { '1': 0, '2': 1, '3': 2, '4': 3, a: 0, b: 1, c: 2, d: 3, 'а': 0, 'б': 1, 'в': 2, 'г': 3 };
const AXES = [
 { key: 'integrity', name: 'Доброчесність', hint: 'чесність, неупередженість, дотримання правил' },
 { key: 'effectiveness', name: 'Ефективність', hint: 'завдання виконано, людині допомогли вчасно' },
 { key: 'trust', name: 'Довіра', hint: 'репутація пункту й довіра людей та колег' }
];
const REVIEW_LABEL = { 'проведено': 'переглянуто фахівцем ДЗПК', 'проведено із зауваженнями': 'переглянуто фахівцем ДЗПК із зауваженнями', 'не проведено': 'перегляд фахівцем ДЗПК ще не проведено' };
const REVIEW_DOT = { 'проведено': 'reviewed', 'проведено із зауваженнями': 'reviewed', 'не проведено': 'pending' };
const ZV = { 'zvireno': 'звірено з першоджерелом', 'zvireno-rekomendatsiinyi': 'звірено; рекомендаційний акт', 'zvireno-vtorynne': 'звірено за вторинними джерелами; редакцію уточнити', 'ne-zvireno': 'не звірено — не наводиться як певна норма' };
const TEMA = { 'podarunok': 'Подарунок', 'konflikt-interesiv': 'Конфлікт інтересів', 'vykryvach': 'Повідомлення про порушення', 'akademichna-dobrochesnist': 'Академічна доброчесність',
 'sluzhbove-maino': 'Службове майно', 'kadrovi-rishennia': 'Кадрові рішення', 'neformalnyi-tysk': 'Неформальний тиск', 'rozpodil-resursiv': 'Розподіл ресурсів', 'pravdyvist-zvitiv': 'Правдивість звітів', 'inshe': 'Інше' };
// «Тест із пʼяти перевірок» — Посібник CIDS (2025), розділ 4.2. Короткий переказ.
const CIDS_TEST = [
 ['Юридична перевірка', 'Чи не порушує цей варіант закону?'],
 ['Професійні стандарти', 'Чи відповідає він прийнятим стандартам служби?'],
 ['Інтуїтивне відчуття', 'Чи не здається він неправильним, навіть якщо формально дозволений?'],
 ['«Перша шпальта»', 'Як би ти почувався, якби про це рішення написали в новинах?'],
 ['«Рольова модель»', 'Як вчинила б людина, на яку ти рівняєшся?']
];

const ICONS = {
 phone: '<path d="M4 3h4l2 5-3 2c2 4 4 6 7 7l2-3 5 2v4c0 2-2 2-4 2C9 20 3 13 2 6c0-2 0-3 2-3Z"/>',
 box: '<path d="M3 8l9-5 9 5v8l-9 5-9-5Z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
 play: '<path d="M7 4v16l13-8Z"/>'
};
const CLOCK = '<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M9 2h6"/></svg>';
const REPLAY = '<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>';

let NORMS = {}, SCHEMA = null, CASES = [];
const state = {
 caseIndex: 0, showExamples: false,
 path: [],          // [{ node, choice }]
 timedOut: [],      // рішення ухвалила «інерція» (вийшов час)
 votes: [],         // голоси групи на кожному кроці: [А, Б, В]
 previousRun: null,
 busy: false, pressure: false, group: false,
 timer: 0, ticker: 0
};
const S = () => CASES[state.caseIndex];
const seconds = () => state.group ? 60 : 20;

/* ——— Допоміжне ——— */
const h = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sign = n => (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n);
function say(text) {
 return h(text).split(' ').map((w, i) => `<span class="w" style="--i:${i}">${w}</span>`).join(' ');
}
function moveFocus() {
 const el = app.querySelector('h2, h1');
 if (el) el.focus({ preventScroll: true });
 window.scrollTo(0, 0);
}
function stopTimer() {
 clearTimeout(state.timer); clearInterval(state.ticker);
 state.timer = state.ticker = 0;
}
// Перехід: кадр одразу їде далі, поточний екран відлітає, потім малюється новий.
function advance(nextStep, action) {
 if (state.busy) return;
 stopTimer();
 const leaving = app.firstElementChild;
 document.body.dataset.step = nextStep;
 if (reduced.matches || !leaving) { action(); return; }
 state.busy = true;
 leaving.classList.add('leaving');
 setTimeout(() => { state.busy = false; action(); }, 360);
}
function resetRun() { state.path.length = 0; state.timedOut.length = 0; state.votes.length = 0; }
function cameraStep(n) { return String(Math.min(3, n)); } // три пози камери для фону
const normShort = id => { const n = NORMS[id]; return n ? n.punkt.split(' — ')[0].split(' «')[0] : id; };

/* ——— Адаптер: формат організаторів (+ розширення podacha) → модель програвача ———
   Без podacha сценарій теж відтворюється: заголовок кроку — запитання вузла,
   «інерція» в режимі тиску — явне правило: найвища ефективність, за рівності — найнижча доброчесність. */
function inertiaRule(vs) {
 let best = 0;
 vs.forEach((x, i) => {
  const b = vs[best].baly;
  if (x.baly.efektyvnist > b.efektyvnist || (x.baly.efektyvnist === b.efektyvnist && x.baly.dobrochesnist < b.dobrochesnist)) best = i;
 });
 return best;
}
function splitTitle(t) {
 const w = t.split(' ');
 if (w.length < 3) return [t];
 const cut = Math.ceil(w.length / 2);
 return [w.slice(0, cut).join(' '), w.slice(cut).join(' ')];
}
function normalize(s, kind) {
 const pd = s.podacha || {};
 const nodes = {};
 s.vuzly.forEach(v => {
  const p = v.podacha || {};
  const pi = p.inertsiia ? v.varianty.findIndex(x => x.id === p.inertsiia) : -1;
  nodes[v.id] = {
   title: p.zagolovok || v.zapytannia,
   ask: p.zagolovok ? v.zapytannia : null,
   context: v.tekst || (v.id === s.pochatkovyi_vuzol ? s.sytuatsiia : ''),
   speaker: p.khto || null, quote: p.replika || null,
   rush: pi >= 0 ? pi : inertiaRule(v.varianty), rushByRule: pi < 0,
   rushNote: p.inertsiia_tekst || null, reflection: p.rozdum || null,
   dovidka: p.dovidka || null,
   options: v.varianty.map(x => ({
    id: x.id, text: x.tekst, effect: x.naslidky.odrazu, later: x.naslidky.vidkladeni,
    scores: { integrity: x.baly.dobrochesnist, effectiveness: x.baly.efektyvnist, trust: x.baly.dovira },
    why: x.chomu_taki_baly, feedback: x.zvorotnyi_zviazok, norms: x.normy, next: x.nastupnyi_vuzol
   }))
  };
 });
 const player = s.diiovi_osoby.find(r => r.hravets) || s.diiovi_osoby[0];
 return {
  raw: s, id: s.id, kind, nodes, start: s.pochatkovyi_vuzol,
  num: pd.nomer || s.id, topic: pd.tema_korotko || TEMA[s.tema] || s.tema,
  headline: pd.zagolovok || splitTitle(s.nazva), premise: s.kontekst,
  accept: pd.knopka || 'Почати', icon: pd.ikonka || 'play',
  place: pd.mistse || [kind === 'example' ? 'Приклад організаторів' : 'Службова дилема', TEMA[s.tema] || s.tema],
  role: player.rol
 };
}

/* ——— Граф ——— */
const memo = new WeakMap();
function longestFrom(s, id) {
 let m = memo.get(s); if (!m) memo.set(s, m = {});
 if (m[id] !== undefined) return m[id];
 const n = s.nodes[id];
 return (m[id] = 1 + Math.max(0, ...n.options.map(o => o.next ? longestFrom(s, o.next) : 0)));
}
function stats(s) {
 let paths = 0, min = Infinity, max = 0;
 (function walk(id, d) {
  s.nodes[id].options.forEach(o => { if (o.next) walk(o.next, d + 1); else { paths++; min = Math.min(min, d); max = Math.max(max, d); } });
 })(s.start, 1);
 return { paths, min, max };
}
function currentId() {
 const s = S(), p = state.path;
 if (!p.length) return s.start;
 return s.nodes[p[p.length - 1].node].options[p[p.length - 1].choice].next;
}
function chosen(step) { const s = S(), p = state.path[step]; return s.nodes[p.node].options[p.choice]; }

// «Віяло» маршрутів на обкладинці малюється з графа справи.
function fanSVG(s) {
 const levels = [];
 let leaves = 0;
 (function grow(id, depth, branch, parent) {
  s.nodes[id].options.forEach((o, i) => {
   const b = depth === 0 ? i : branch;
   const item = { depth, branch: b, parent, kids: [] };
   (levels[depth] = levels[depth] || []).push(item);
   if (parent) parent.kids.push(item);
   if (o.next && leaves < 60) grow(o.next, depth + 1, b, item); else { item.leaf = leaves++; }
  });
 })(s.start, 0, 0, null);
 const D = levels.length, top = 4, bottom = 56;
 const X = k => 6 + (198 * (k + 1)) / D;
 const placeY = it => it.kids.length ? (it.y = it.kids.map(placeY).reduce((a, b) => a + b, 0) / it.kids.length) : (it.y = leaves > 1 ? top + (bottom - top) * it.leaf / (leaves - 1) : 30);
 const roots = levels[0];
 roots.forEach(placeY);
 const rootY = roots.reduce((a, r) => a + r.y, 0) / roots.length;
 const op = ['.95', '.65', '.42'];
 let paths = '', dots = '';
 const counters = {};
 levels.forEach((lvl, k) => lvl.forEach(it => {
  const x0 = k ? X(k - 1) : 6, y0 = it.parent ? it.parent.y : rootY, x1 = X(k), mx = (x0 + x1) / 2;
  const i = counters[k] = (counters[k] ?? -1) + 1;
  paths += `<path pathLength="1" class="e${Math.min(3, k + 1)}" style="--i:${i}" stroke="${HEX[it.branch]}" stroke-opacity="${op[Math.min(2, k)]}" d="M${x0.toFixed(1)} ${y0.toFixed(1)}C${mx.toFixed(1)} ${y0.toFixed(1)} ${mx.toFixed(1)} ${it.y.toFixed(1)} ${x1.toFixed(1)} ${it.y.toFixed(1)}"/>`;
  dots += `<circle cx="${x1.toFixed(1)}" cy="${it.y.toFixed(1)}" r="${[2.4, 1.9, 1.5][Math.min(2, k)]}" fill="${HEX[it.branch]}"/>`;
 }));
 return `<svg class="fan" viewBox="0 0 210 60" width="210" height="60" aria-hidden="true" fill="none" stroke-width="1.1" stroke-linecap="round">${paths}<circle cx="6" cy="${rootY.toFixed(1)}" r="3.2" fill="#eef1f4"/>${dots}</svg>`;
}

/* ——— Локальний прогрес: лише ідентифікатори пройдених справ ——— */
const store = {
 get() { try { return JSON.parse(localStorage.getItem('dw-done') || '[]'); } catch (e) { return []; } },
 add(id) { try { const d = new Set(store.get()); d.add(id); localStorage.setItem('dw-done', JSON.stringify([...d])); } catch (e) { /* приватний режим */ } }
};

/* ——— Обкладинка: вибір справи, режимів, імпорт сценарію ——— */
function cover(report) {
 stopTimer();
 const c = S();
 if (c.kind === 'example') state.showExamples = true;
 document.body.dataset.step = 'cover';
 const st = stats(c);
 const team = CASES.filter(k => k.kind !== 'example');
 const total = team.reduce((a, k) => a + stats(k).paths, 0);
 const exN = CASES.filter(k => k.kind === 'example').length;
 const done = new Set(store.get());
 const tab = (k, i) => `<button class="case-tab${k.kind === 'example' ? ' ex' : ''}" data-i="${i}" aria-pressed="${i === state.caseIndex}"><b>${h(k.num)}</b><span>${h(k.topic)}</span>${done.has(k.id) ? '<i class="done-mark" title="Пройдено на цьому пристрої" aria-label="пройдено">✓</i>' : ''}${k.kind === 'imported' ? '<i class="imp-mark">імпорт</i>' : ''}</button>`;
 const tabs = CASES.map((k, i) => (k.kind !== 'example' ? tab(k, i) : '')).join('');
 const exTabs = state.showExamples ? CASES.map((k, i) => (k.kind === 'example' ? tab(k, i) : '')).join('') : '';
 const longest = Math.max(...c.headline.join(' ').split(' ').map(w => w.length));
 let wi = 0;
 const h1 = c.headline.map((line, li) => `<span class="line${li ? ' l2' : ''}">${h(line).split(' ').map(w => `<span class="w" style="--i:${wi++}">${w}</span>`).join(' ')}</span>`).join('');
 const rev = c.raw.perevirka_zmistu.fakhivets_dzpk;
 app.innerHTML = `
 <section class="cover" aria-labelledby="cover-title">
  <div class="intro">
   <nav class="cases" aria-label="Оберіть справу">${tabs}
    <button class="case-tab add" id="import-btn" title="Завантажити сценарій у форматі JSON (формат організаторів)"><b>+</b><span>Свій сценарій</span></button><input type="file" id="import-file" accept=".json,application/json" hidden>
    ${exN ? `<button class="case-tab more" id="ex-btn" aria-expanded="${state.showExamples}"><span>${state.showExamples ? 'Сховати приклади' : `Приклади організаторів (${exN})`}</span></button>` : ''}
    ${exTabs ? `<span class="ex-row">${exTabs}</span>` : ''}
   </nav>
   ${report || ''}
   <p class="place">${c.place.map(p => `<span>${h(p)}</span>`).join('')}</p>
   <h1 id="cover-title" tabindex="-1"${longest > 11 || c.headline.join(' ').length > 26 ? ' class="long"' : ''}>${h1}</h1>
   <div class="brief">
    <p class="premise">${h(c.premise)}</p>
    <p class="role">Твоя роль: <b>${h(c.role)}</b></p>
    <button class="accept" id="accept"><svg class="ph${c.icon === 'phone' ? '' : ' still'}" aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round">${ICONS[c.icon] || ICONS.play}</svg><span>${h(c.accept)}</span></button>
    <div class="modes" role="group" aria-label="Режим проходження">
     <button class="mode" id="m-pressure" role="switch" aria-checked="${state.pressure}"><i aria-hidden="true"></i><span><b>Тиск часу</b><small>${seconds()} с на рішення. Мовчання — теж вибір</small></span></button>
     <button class="mode" id="m-group" role="switch" aria-checked="${state.group}"><i aria-hidden="true"></i><span><b>Заняття з групою</b><small>Ведучий показує, аудиторія голосує анонімно · ≈${h(c.raw.tryvalist_khv)} хв</small></span></button>
    </div>
    <p class="case-meta"><span class="dot ${REVIEW_DOT[rev]}"></span>${REVIEW_LABEL[rev]} · ${c.raw.shi.vykorystano ? 'створено за участі ШІ' : 'без ШІ'} · ${c.raw.normy.length} норм із редакціями</p>
   </div>
  </div>
  <div class="case-foot">${fanSVG(c)}<p><b>${st.min === st.max ? st.max : st.min + '–' + st.max}</b> ${st.max < 5 ? 'рішення' : 'рішень'}<br><b>${st.paths}</b> можливих маршрутів</p><p class="foot-total"><b>${team.length}</b> ${team.length < 5 ? 'сценарії' : 'сценаріїв'} команди<br><b>${total}</b> маршрутів загалом</p></div>
 </section>`;

 app.querySelectorAll('.case-tab[data-i]').forEach(btn => {
  btn.onclick = () => {
   const i = +btn.dataset.i;
   if (i === state.caseIndex) return;
   state.caseIndex = i; state.previousRun = null; resetRun();
   advance('cover', () => cover());
  };
 });
 const ex = app.querySelector('#ex-btn');
 if (ex) ex.onclick = () => {
  state.showExamples = !state.showExamples;
  if (!state.showExamples && S().kind === 'example') state.caseIndex = 0;
  cover();
 };
 app.querySelector('#accept').onclick = () => advance('1', () => { resetRun(); render(); moveFocus(); });
 const toggle = (id, key) => {
  const b = app.querySelector(id);
  b.onclick = () => {
   state[key] = !state[key];
   b.setAttribute('aria-checked', state[key]);
   app.querySelector('#m-pressure small').textContent = `${seconds()} с на рішення. Мовчання — теж вибір`;
   document.body.classList.toggle('is-group', state.group);
  };
 };
 toggle('#m-pressure', 'pressure');
 toggle('#m-group', 'group');

 // Імпорт сценарію викладачем: ті самі правила, що й у tools/build.mjs.
 const input = app.querySelector('#import-file');
 app.querySelector('#import-btn').onclick = () => input.click();
 input.onchange = async () => {
  const file = input.files[0];
  if (!file) return;
  let s, res;
  try {
   s = JSON.parse(await file.text());
   delete s.$schema;
   res = window.DWValidate.validateScenario(s, { normy: NORMS, schema: SCHEMA, minDepth: 0 });
   if (!res.errors.length && res.depth < 3) res.warnings.unshift(`Маршрути мають ${res.depth} етап(и); завдання вимагає від сценаріїв команди щонайменше 3.`);
  } catch (e) { res = { errors: ['Файл не є коректним JSON: ' + e.message], warnings: [] }; }
  if (res.errors.length) { cover(importReport(file.name, res, false)); return; }
  const k = normalize(s, 'imported');
  const existing = CASES.findIndex(x => x.id === k.id);
  if (existing >= 0) CASES[existing] = k; else CASES.splice(CASES.filter(x => x.kind !== 'example').length, 0, k);
  state.caseIndex = CASES.findIndex(x => x === k);
  resetRun(); state.previousRun = null;
  cover(importReport(file.name, res, true));
 };
}
function importReport(name, res, ok) {
 const list = [...res.errors.slice(0, 12).map(e => `<li class="e">${h(e)}</li>`), ...res.warnings.map(w => `<li class="w">${h(w)}</li>`)].join('');
 return `<div class="import-report ${ok ? 'ok' : 'bad'}" role="status"><b>${ok ? `«${h(name)}» додано на цей сеанс` : `«${h(name)}» не додано`}</b>${ok ? ` — ${res.paths} маршрутів. Файл не зберігається; щоб сценарій був в усіх, покладіть його в data/stsenarii/.` : ` — ${res.errors.length} помилок. Виправте й спробуйте ще раз.`}${list ? `<ul>${list}</ul>` : ''}</div>`;
}

/* ——— Сцена рішення ——— */
// Стежка: пройдені рішення — літери з кольорами, поточне — кільце, попереду — порожні вузли.
function trail(total) {
 const p = state.path;
 let html = '';
 for (let i = 0; i < total; i++) {
  const done = i < p.length, now = i === p.length;
  html += `<i class="n${done ? ' done' : now ? ' now' : ''}"${done ? ` style="--h:${HUE[p[i].choice]}"` : ''}>${done ? LETTER[p[i].choice] : ''}</i>`;
  if (i < total - 1) {
   const reached = i + 1 <= p.length;
   const from = i < p.length ? HUE[p[i].choice] : 'var(--faint)';
   const to = reached ? (i + 1 < p.length ? HUE[p[i + 1].choice] : 'var(--ink)') : 'var(--faint)';
   const fresh = reached && i + 1 === p.length;
   html += `<b class="seg${reached ? ' done' : ''}${fresh ? ' fresh' : ''}" style="--h1:${from};--h2:${to}"></b>`;
  }
 }
 return html;
}

function render() {
 const id = currentId();
 if (!id) { review(); return; }
 const s = S(), node = s.nodes[id];
 const step = state.path.length + 1;
 const total = state.path.length + longestFrom(s, id);
 document.body.dataset.step = cameraStep(step);
 const quote = node.quote ? '«' + node.quote + '»' : '';
 // Варіанти відповіді з’являються, коли репліку вже прочитано.
 const words = quote ? quote.split(' ').length : Math.min(40, node.context.split(' ').length / 2);
 const cd = Math.min(1900, 520 + words * 34 + 260);
 const n = node.options.length;
 const prev = state.path.length ? chosen(state.path.length - 1) : null;
 app.innerHTML = `
  <section class="stage" aria-labelledby="scene-title">
   <div class="reading">
    <p class="progress"><span class="trail" aria-hidden="true">${trail(total)}</span>Рішення ${step} із ${total}<span class="case-mark">${s.kind === 'example' ? 'Приклад ' : 'Справа '}${h(s.num)}</span></p>
    ${prev ? `<p class="aftermath"><span>Наслідок</span>${h(prev.effect)}</p>` : ''}
    <h2 class="sceneTitle${node.quote ? '' : ' q'}" id="scene-title" tabindex="-1">${h(node.title)}</h2>
    ${node.context ? `<p class="context${node.quote ? '' : ' long'}">${h(node.context)}</p>` : ''}
    ${node.quote ? `<figure class="dialogue"><figcaption class="speaker">${h(node.speaker || '')}</figcaption><blockquote class="speech">${say(quote)}</blockquote></figure>` : ''}
    ${node.dovidka ? `<aside class="dovidka" aria-label="Правова довідка"><p class="dv-head"><span class="dv-tag">Довідка</span>${h(node.dovidka.zagolovok)}</p><p>${h(node.dovidka.tekst)}</p><p class="dv-norms">${node.dovidka.normy.map(n => `<span title="${h(NORMS[n] ? NORMS[n].akt : '')}">${h(NORMS[n] ? NORMS[n].akt.split(' від ')[0].replace('Закон України ', 'ЗУ ') + ', ' + normShort(n) : n)}</span>`).join('')}</p></aside>` : ''}
    <section class="responses${node.quote ? '' : ' plain'}" style="--cd:${cd}ms" aria-labelledby="choice-heading">
     <h3 id="choice-heading">${h(state.group ? 'Голосування аудиторії' : node.ask || 'Твоя відповідь')}<span class="keys" aria-hidden="true">клавіші 1–${n}</span><button class="cids-btn" aria-expanded="false" aria-controls="cids">Тест із 5 перевірок</button></h3>
     <ol class="cids" id="cids" hidden>${CIDS_TEST.map(([t, q]) => `<li><b>${t}.</b> ${q}</li>`).join('')}<li class="src">Посібник з вирішення дилем на робочому місці у державному секторі (CIDS, 2025), розділ 4.2.</li></ol>
     ${state.pressure ? `<div class="clock" role="timer" aria-live="off"><span class="clock-bar"><i></i></span><span class="clock-s">${CLOCK}<b>${seconds()}</b> с</span></div>` : ''}
     <div class="tree"></div>
     ${state.group ? tallyHTML(n) : ''}
    </section>
   </div>
  </section>`;
 const responses = app.querySelector('.responses');
 const tree = app.querySelector('.tree');
 const cb = app.querySelector('.cids-btn'), cl = app.querySelector('.cids');
 cb.onclick = () => { cl.hidden = !cl.hidden; cb.setAttribute('aria-expanded', !cl.hidden); };
 node.options.forEach((o, index) => {
  const button = document.createElement('button');
  button.className = 'choice';
  button.style.setProperty('--h', HUE[index]);
  button.style.setProperty('--k', index);
  const marker = document.createElement('span');
  marker.className = 'choice-marker';
  marker.setAttribute('aria-hidden', 'true');
  marker.textContent = LETTER[index];
  const reply = document.createElement('span');
  reply.textContent = o.text;
  button.append(marker, reply);
  button.onclick = () => pick(index, false);
  tree.append(button);
 });

 function pick(index, rushed) {
  if (state.busy || responses.classList.contains('has-pick')) return;
  stopTimer();
  tree.children[index].classList.add('picked');
  responses.classList.add('has-pick');
  if (rushed) responses.classList.add('rushed');
  state.timedOut[step - 1] = rushed;
  if (state.group) state.votes[step - 1] = readVotes();
  const isEnd = node.options[index].next === null;
  const go = () => advance(isEnd ? 'review' : cameraStep(step + 1), () => { state.path.push({ node: id, choice: index }); render(); moveFocus(); });
  rushed && !reduced.matches ? setTimeout(go, 1500) : go();
 }
 responses._pick = pick;

 if (state.group) bindTally(n);
 if (state.pressure) startClock(cd, node, pick);
}

/* ——— Тиск часу: якщо не встиг — рішення ухвалює інерція ——— */
function startClock(delay, node, pick) {
 const total = seconds();
 const clock = app.querySelector('.clock');
 const bar = clock.querySelector('.clock-bar i');
 const out = clock.querySelector('.clock-s b');
 state.timer = setTimeout(() => {
  const end = Date.now() + total * 1000;
  clock.classList.add('running');
  const tick = () => {
   const left = Math.max(0, end - Date.now());
   bar.style.transform = `scaleX(${(left / (total * 1000)).toFixed(4)})`;
   out.textContent = Math.ceil(left / 1000);
   clock.classList.toggle('low', left < 6000);
   if (left <= 0) {
    clearInterval(state.ticker); state.ticker = 0;
    clock.classList.add('over');
    clock.querySelector('.clock-s').innerHTML = CLOCK + 'Час вийшов';
    pick(node.rush, true);
   }
  };
  tick();
  state.ticker = setInterval(tick, 250);
 }, delay + 400);
}

/* ——— Заняття: анонімний підрахунок голосів (лише лічильники, без імен і пристроїв) ——— */
function tallyHTML(n) {
 let rows = '';
 for (let i = 0; i < n; i++) {
  rows += `<div class="t-row" style="--h:${HUE[i]}"><span class="t-l">${LETTER[i]}</span>
   <button class="t-btn" data-i="${i}" data-d="-1" aria-label="Мінус голос за ${LETTER[i]}">–</button>
   <output class="t-n" data-i="${i}">0</output>
   <button class="t-btn" data-i="${i}" data-d="1" aria-label="Плюс голос за ${LETTER[i]}">+</button>
   <span class="t-bar"><i></i></span><span class="t-p">0%</span></div>`;
 }
 return `<div class="tally" aria-label="Голоси аудиторії"><p class="t-head">Голоси аудиторії <small>підняті руки або картки А/Б/В — ведучий рахує, імен не записуємо</small></p>
  <div class="t-rows hidden-votes">${rows}</div>
  <div class="t-actions"><button class="t-reveal" aria-pressed="false">Показати розподіл</button><button class="t-major" disabled>Перейти за більшістю</button></div>
  <p class="t-note">Розподіл приховано, поки ведучий рахує, — щоб він не впливав на тих, хто ще не проголосував.</p></div>`;
}
function readVotes() { return [...app.querySelectorAll('.t-n')].map(o => +o.textContent); }
function bindTally() {
 const box = app.querySelector('.tally');
 const rows = box.querySelector('.t-rows');
 const reveal = box.querySelector('.t-reveal');
 const update = () => {
  const v = readVotes(), sum = v.reduce((a, b) => a + b, 0), max = Math.max(...v);
  box.querySelectorAll('.t-row').forEach((row, i) => {
   row.querySelector('.t-bar i').style.transform = `scaleX(${sum ? v[i] / sum : 0})`;
   row.querySelector('.t-p').textContent = (sum ? Math.round(v[i] / sum * 100) : 0) + '%';
   row.classList.toggle('lead', sum > 0 && v[i] === max);
  });
  const leaders = v.filter(x => x === max).length;
  const major = box.querySelector('.t-major');
  major.disabled = !sum || leaders > 1;
  major.textContent = !sum ? 'Перейти за більшістю' : leaders > 1 ? 'Нічия — обговоріть і оберіть варіант' : `Перейти за більшістю (${LETTER[v.indexOf(max)]})`;
 };
 box.querySelectorAll('.t-btn').forEach(b => {
  b.onclick = () => {
   const o = box.querySelector(`.t-n[data-i="${b.dataset.i}"]`);
   o.textContent = Math.max(0, +o.textContent + +b.dataset.d);
   update();
  };
 });
 reveal.onclick = () => {
  const on = rows.classList.toggle('hidden-votes') === false;
  reveal.setAttribute('aria-pressed', on);
  reveal.textContent = on ? 'Приховати розподіл' : 'Показати розподіл';
 };
 box.querySelector('.t-major').onclick = () => {
  const v = readVotes();
  app.querySelector('.responses')._pick(v.indexOf(Math.max(...v)), false);
 };
}

/* ——— Розбір ——— */
function describeRun() {
 const s = S();
 return {
  caseId: s.id,
  steps: state.path.map(p => {
   const o = s.nodes[p.node].options[p.choice];
   const nx = o.next ? s.nodes[o.next] : null;
   return { node: p.node, choice: p.choice, text: o.text, effect: o.effect, nextQuote: nx ? nx.quote || nx.context : null, nextSpeaker: nx ? nx.speaker || 'Далі' : null };
  })
 };
}
function compareRuns(previous, current) {
 const changed = current.steps.findIndex((st, i) => !previous.steps[i] || st.node !== previous.steps[i].node || st.choice !== previous.steps[i].choice);
 if (changed < 0) return '<p class="comparison-note">Обидва проходження збігаються. Щоб дослідити інший наслідок, переграй одне з рішень.</p>';
 const versions = [previous, current].map((run, index) => {
  const st = run.steps[changed];
  if (!st) return '';
  const next = st.nextQuote ? `<dt>Що було далі (${h(st.nextSpeaker)})</dt><dd>«${h(st.nextQuote)}»</dd>` : '';
  return `<section><h4>${index === 0 ? 'Попереднього разу' : 'Цього разу'}</h4>
   <dl><dt>Твоя відповідь</dt><dd>${h(st.text)}</dd>
   <dt>Безпосередній наслідок</dt><dd>${h(st.effect)}</dd>${next}</dl></section>`;
 }).join('');
 return `<section class="comparison"><h3>Де розійшлися проходження</h3>
  <p>Перша відмінність — рішення ${changed + 1}.</p>
  <div class="versions">${versions}</div></section>`;
}
function chips(sc) {
 return `<span class="chips">${AXES.map(a => `<span class="chip ${sc[a.key] > 0 ? 'pos' : sc[a.key] < 0 ? 'neg' : 'zero'}">${a.name} ${sign(sc[a.key]) || '0'}</span>`).join('')}</span>`;
}
function votesHTML(v) {
 if (!v) return '';
 const sum = v.reduce((a, b) => a + b, 0);
 if (!sum) return '';
 return `<div class="rv-votes" aria-label="Голоси аудиторії">${v.map((x, i) => `<span style="--h:${HUE[i]};--p:${x / sum}"><b>${LETTER[i]}</b> ${x}</span>`).join('')}</div>`;
}
function balanceHTML(opts) {
 const max = opts.length * 2;
 const rows = AXES.map(a => {
  const parts = opts.map(o => o.scores[a.key]);
  const sum = parts.reduce((x, y) => x + y, 0);
  const w = Math.abs(sum) / max * 50;
  return `<div class="bal-row"><span class="bal-name">${a.name}<small>${a.hint}</small></span>
   <span class="bal-track" aria-hidden="true"><i class="${sum < 0 ? 'neg' : 'pos'}" style="${sum < 0 ? `right:50%;width:${w}%` : `left:50%;width:${w}%`}"></i></span>
   <span class="bal-sum ${sum > 0 ? 'pos' : sum < 0 ? 'neg' : ''}">${sign(sum) || '0'}</span>
   <span class="bal-parts">${parts.map((x, i) => `р.${i + 1}: ${sign(x) || '0'}`).join(' · ')}</span></div>`;
 }).join('');
 return `<section class="balance" aria-labelledby="bal-title"><div class="sec-head"><h3 id="bal-title">Баланс рішень</h3>
  <p>Три виміри не додаються в один бал: у справжній дилемі виграш за одним майже завжди коштує іншого. <b>Правило:</b> бал за вимір — сума балів обраних варіантів (від −2 до +2 за кожне рішення), заданих авторами сценарію з поясненням «чому такі бали». Діапазон тут: від −${max} до +${max}.</p></div>${rows}</section>`;
}
function groupHTML() {
 const steps = state.votes.map((v, i) => v && v.reduce((a, b) => a + b, 0) ? { i, v, sum: v.reduce((a, b) => a + b, 0) } : null).filter(Boolean);
 if (!steps.length) return '';
 steps.forEach(x => { x.split = 1 - Math.max(...x.v) / x.sum; });
 const top = steps.slice().sort((a, b) => b.split - a.split)[0];
 const pct = top.v.map((x, i) => `${LETTER[i]} ${Math.round(x / top.sum * 100)}%`).join(' / ');
 return `<section class="group-sum"><div class="sec-head"><h3>Для обговорення з групою</h3>
  <p>Найбільше розходження — <b>рішення ${top.i + 1}</b> (${pct}). Почніть розбір із нього: запитайте прихильників кожного варіанта, яку цінність вони захищали. Голоси знеособлені й зникнуть після закриття сторінки.</p></div></section>`;
}

function review() {
 stopTimer();
 document.body.dataset.step = 'review';
 const s = S(), raw = s.raw, p = state.path;
 const result = describeRun();
 const opts = p.map((_, i) => chosen(i));
 const lastNode = s.nodes[p[p.length - 1].node];
 const prev = state.previousRun && state.previousRun.caseId === s.id ? state.previousRun : null;
 const comparison = prev ? compareRuns(prev, result) : '';
 const rushed = state.timedOut.filter(Boolean).length;
 const later = opts.map((o, i) => o.later ? `<li style="--h:${HUE[p[i].choice]}"><span>через рішення ${i + 1}</span>${h(o.later)}</li>` : '').join('');
 const used = new Set(opts.flatMap(o => o.norms));
 const law = raw.normy.slice().sort((a, b) => used.has(b.id) - used.has(a.id)).map((n, i) => {
  const N = NORMS[n.id] || { punkt: n.id, akt: '', korotko: '', tsytaty: [], redaktsiia: '', posylannia: '#', status_zvirky: 'ne-zvireno' };
  return `<li style="--k:${i}" class="${used.has(n.id) ? 'hit' : ''} st-${h(N.status_zvirky)}"><span class="lw-ref">${h(n.id)}</span>${used.has(n.id) ? '<span class="lw-hit">у твоєму маршруті</span>' : ''}<strong>${h(N.punkt.split(' — ')[0])}</strong><p>${h(n.yak_zastosovuietsia)}</p>
   <details><summary>Цитата і зміст</summary>${N.tsytaty.filter(Boolean).map(q => `<blockquote class="lw-q">«${h(q)}»</blockquote>`).join('')}<p>${h(N.korotko)}</p></details>
   <p class="lw-ed">${h(N.akt)} · ${h(N.redaktsiia)} · <span class="${N.status_zvirky === 'ne-zvireno' ? 'warn' : ''}">${ZV[N.status_zvirky] || h(N.status_zvirky)}${N.data_zvirky ? ' ' + h(N.data_zvirky) : ''}</span> · <a href="${h(N.posylannia)}" target="_blank" rel="noopener">першоджерело</a></p></li>`;
 }).join('');
 const pz = raw.perevirka_zmistu, ai = raw.shi, src = raw.dzherelo_vypadku;
 const questions = raw.pytannia_dlia_obhovorennia.filter(q => q !== lastNode.reflection);
 const reflection = lastNode.reflection || raw.pytannia_dlia_obhovorennia[0];

 app.innerHTML = `<section class="review" aria-labelledby="review-title">
  <div class="rv-head"><h2 id="review-title" tabindex="-1">Що змінив твій вибір</h2><p class="rv-sub">Розбір проходження · ${s.kind === 'example' ? 'Приклад' : 'Справа'} ${h(s.num)} · ${h(raw.nazva)}${state.group ? ' · заняття з групою' : ''}</p></div>
  <ol class="route" style="--n:${p.length};--grad-x:linear-gradient(90deg,${p.map((x, i) => `${HUE[x.choice]} ${Math.round(i / p.length * 100)}%`).join(',')},transparent);--grad-y:linear-gradient(180deg,${p.map((x, i) => `${HUE[x.choice]} ${Math.round(i / Math.max(1, p.length - 1) * 100)}%`).join(',')})"></ol>
  ${rushed ? `<p class="rv-rush">${CLOCK}<span>${rushed === 1 ? 'Одне рішення' : rushed + ' рішення'} ухвалила інерція: час вийшов раніше, ніж ти відповів. Під тиском найлегше обрати шлях найменшого опору — саме тому його варто відпрацювати заздалегідь.</span></p>` : ''}
  ${balanceHTML(opts)}
  ${later ? `<section class="later"><div class="sec-head"><h3>Що сталося згодом</h3><p>Відкладені наслідки: рішення, вигідне в моменті, може дати результат через кілька кроків.</p></div><ul>${later}</ul></section>` : ''}
  ${groupHTML()}
  ${comparison}
  <section class="conflict"><div class="sec-head"><h3>Які цінності конфліктували</h3><p>Зворотний звʼязок описує рішення і наслідки, а не людину.</p></div>
   <div class="cf-body">${raw.tsinnosti_v_konflikti.map(c => `<div class="cf-pair"><p class="cf-values"><span>${h(c.tsinnist_a)}</span><span>${h(c.tsinnist_b)}</span></p><p>${h(c.poiasnennia)}</p></div>`).join('')}</div></section>
  <div class="rv-ask"><h3>Питання до тебе</h3><blockquote>${h(reflection)}</blockquote></div>
  ${questions.length ? `<section class="questions"><div class="sec-head"><h3>Ще для обговорення</h3><p>Питання для групи або самоперевірки.</p></div><ul>${questions.map(q => `<li>${h(q)}</li>`).join('')}</ul></section>` : ''}
  <section class="procedure"><div class="sec-head"><h3>Поради і типові процедури</h3><p>Як подібні ситуації врегульовують за нормою.</p></div><ol>${raw.porady.map(x => `<li>${h(x)}</li>`).join('')}</ol></section>
  <section class="law" aria-labelledby="law-title">
   <div class="sec-head"><h3 id="law-title">Норми і джерела</h3><p>Дослівні цитати, редакція і статус звірки — з переліку норм організаторів. Норми, застосовані в твоєму маршруті, — першими.</p></div>
   <ol class="law-list">${law}</ol>
   <div class="applies"><b>На кого поширюються норми.</b> ${h(raw.zastosovnist)}</div>
  </section>
  <section class="provenance"><div class="sec-head"><h3>Перевірка змісту</h3></div>
   <dl><dt>Фахівець з питань запобігання корупції</dt><dd><span class="dot ${REVIEW_DOT[pz.fakhivets_dzpk]}"></span>${h(pz.fakhivets_dzpk)}${pz.khto ? ` — ${h(pz.khto)}` : ''}${pz.data ? `, ${h(pz.data)}` : ''}. ${h(pz.prymitka)}</dd>
   <dt>Штучний інтелект</dt><dd>${ai.vykorystano ? `використано${ai.instrument ? ' — ' + h(ai.instrument) : ''}. ${h(ai.shcho_zrobleno)} Перевірка людиною: ${h(ai.perevirka_liudynoiu)}` : 'не використовувався.'}</dd>
   <dt>Джерело випадку</dt><dd>${h(src.typ)}. ${h(src.opys)}</dd>
   <dt>Версія сценарію</dt><dd>${h(raw.id)} v${h(raw.versiia)} від ${h(raw.data_stvorennia)}</dd></dl></section>
  <p class="privacy">Цей розбір бачиш лише ти. Він ніде не зберігається і нікому не передається — ні викладачу, ні командиру. Бали описують рішення в навчальній ситуації, а не людину, тому не придатні для оцінювання чи відбору.</p>
  <div class="rv-actions">
   <button class="act" id="act-cases">${REPLAY}Інша справа</button>
   <button class="act" id="act-again">Пройти справу заново</button>
   <button class="act ghost" id="act-print">Зберегти розбір у PDF</button>
  </div>
 </section>`;

 opts.forEach((o, i) => {
  const li = document.createElement('li');
  li.style.setProperty('--h', HUE[p[i].choice]);
  li.style.setProperty('--k', i);
  const nd = s.nodes[p[i].node];
  const rush = state.timedOut[i]
   ? `<p class="rush-note">${CLOCK}<span>${h(nd.rushNote || (nd.rushByRule ? 'Час вийшов — спрацював варіант найменшого опору (найвища ефективність, найнижча доброчесність).' : 'Час вийшов — рішення ухвалила інерція.'))}</span></p>` : '';
  li.innerHTML = `<i class="node" aria-hidden="true">${LETTER[p[i].choice]}</i><span class="step">Рішення ${i + 1} · ${h(nd.title)}</span><strong>${h(o.text)}</strong>${rush}<p>${h(o.effect)}</p>${chips(o.scores)}<p class="fb">${h(o.feedback)}</p><details class="why"><summary>Чому такі бали</summary><p>${h(o.why)}</p></details>${o.norms.length ? `<p class="o-norms">${o.norms.map(n => `<span title="${h(NORMS[n] ? NORMS[n].korotko : '')}">${h(normShort(n))}</span>`).join('')}</p>` : ''}${votesHTML(state.votes[i])}`;
  const btn = document.createElement('button');
  btn.className = 'replay';
  btn.innerHTML = REPLAY + 'Переграти рішення ' + (i + 1);
  btn.onclick = () => {
   state.previousRun = result;
   advance(cameraStep(i + 1), () => { state.path.length = i; state.timedOut.length = i; state.votes.length = i; render(); moveFocus(); });
  };
  li.append(btn);
  app.querySelector('.route').append(li);
 });
 app.querySelector('#act-cases').onclick = () => advance('cover', () => { state.previousRun = null; resetRun(); cover(); moveFocus(); });
 app.querySelector('#act-again').onclick = () => { state.previousRun = result; advance('1', () => { resetRun(); render(); moveFocus(); }); };
 app.querySelector('#act-print').onclick = () => window.print();
 store.add(s.id);
 if (window.DWScorm) window.DWScorm.complete();
}

/* ——— Клавіатура: 1–4 або А–Г обирають варіант ——— */
addEventListener('keydown', e => {
 if (e.ctrlKey || e.metaKey || e.altKey) return;
 const t = e.target;
 if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SUMMARY')) return;
 const responses = app.querySelector('.responses');
 if (!responses || !responses._pick) return;
 const i = KEYS[e.key.toLowerCase()];
 const choices = responses.querySelectorAll('.choice');
 if (i === undefined || i >= choices.length) return;
 if (getComputedStyle(choices[i]).opacity < .5 && !responses.classList.contains('has-pick')) return;
 e.preventDefault();
 responses._pick(i, false);
});

// Логотип повертає до вибору справи.
document.querySelector('.brand').addEventListener('click', () => {
 if (document.body.dataset.step === 'cover') return;
 advance('cover', () => { state.previousRun = null; resetRun(); cover(); moveFocus(); });
});

/* ——— Завантаження даних ———
   Через http(s) читаємо JSON-файли напряму: викладач змінив файл — зміна одразу в застосунку.
   Через file://, Electron і SCORM браузер не дає читати файли, тому є data/bundle.js (tools/build.mjs). */
async function load() {
 const base = window.DW_DATA || { normy: { normy: [] }, schema: null, stsenarii: [], pryklady: [] };
 let normy = base.normy, schema = base.schema, team = base.stsenarii, examples = base.pryklady;
 if (/^https?:$/.test(location.protocol) && !(window.DWScorm && window.DWScorm.active)) {
  try {
   const get = u => fetch(u, { cache: 'no-cache' }).then(r => r.ok ? r.json() : Promise.reject(new Error(u)));
   const [n, sc, ti, ei] = await Promise.all([get('data/normy.json'), get('data/schema/stsenarii.schema.json'), get('data/stsenarii/index.json'), get('data/pryklady/index.json')]);
   const nmap = Object.fromEntries(n.normy.map(x => [x.id, x]));
   const ok = (list, minDepth) => list.filter(x => {
    delete x.$schema;
    const r = window.DWValidate.validateScenario(x, { normy: nmap, schema: sc, minDepth });
    if (r.errors.length) console.warn(`Сценарій ${x && x.id} пропущено:`, r.errors);
    return !r.errors.length;
   });
   const t = ok(await Promise.all(ti.stsenarii.map(f => get('data/stsenarii/' + f))), 3);
   const e = ok(await Promise.all(ei.stsenarii.map(f => get('data/pryklady/' + f))), 0);
   if (t.length) { normy = n; schema = sc; team = t; examples = e; }
  } catch (err) { /* лишаємо bundle */ }
 }
 NORMS = Object.fromEntries(normy.normy.map(x => [x.id, x]));
 SCHEMA = schema;
 CASES = [...team.map(x => normalize(x, 'team')), ...examples.map(x => normalize(x, 'example'))];
 if (!CASES.length) {
  app.innerHTML = '<section class="cover"><div class="intro"><h1 tabindex="-1">Сценарії не знайдено.</h1><p class="premise">Запустіть <code>node tools/build.mjs</code>, щоб зібрати data/bundle.js, або відкрийте застосунок через локальний сервер.</p></div></section>';
  return;
 }
 cover();
}
load();
})();
