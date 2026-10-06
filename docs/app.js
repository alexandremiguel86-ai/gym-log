/* Gym Log - V0.1
 *
 * Principio: LOCAL PRIMEIRO. Cada exercicio e gravado no localStorage antes de
 * qualquer tentativa de rede, e so e marcado como sincronizado quando o Apps
 * Script confirma o id. A rede da academia e ruim; perder um treino seria o
 * pior defeito possivel.
 *
 * O treino so vai para o Sheets ao ser FINALIZADO. Enquanto esta aberto, editar
 * e excluir sao livres: o Apps Script so acrescenta linhas, entao uma correcao
 * depois do envio nao chegaria la.
 *
 * Nada aqui e apagado apos a sincronizacao: o historico local e o que alimenta
 * o "Last: 3x10 @ 56kg" e a tela Previous Workouts sem precisar de rede.
 *
 * Idioma: ingles ou portugues so muda o que aparece na tela. O que e gravado e
 * enviado ao Sheets e SEMPRE o nome em ingles (exercise/group0/1/2), porque
 * e ele que o ImportGymLog e o #06_TRAINING_LOG.md esperam.
 */

'use strict';

// ---------------------------------------------------------------- storage

var K_ENTRIES = 'gymlog.entries';
var K_SESSION = 'gymlog.session';
var K_SETTINGS = 'gymlog.settings';
var THEMES = ['dark', 'light', 'sand'];

function load(key, fallback) {
  try {
    var raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}

function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    // Modo privado do Safari ou cota estourada: avisar alto, porque o
    // registro acabou de NAO ser salvo.
    toast(t('saveError'));
    return false;
  }
}

var entries = load(K_ENTRIES, []);
var session = load(K_SESSION, null);
var settings = load(K_SETTINGS, { url: '', token: '' });
if (settings.lang !== 'pt') settings.lang = 'en';
if (THEMES.indexOf(settings.theme) === -1) settings.theme = 'dark';
var catalog = { groups: [] };

// ---------------------------------------------------------------- idioma

var STRINGS = {
  en: {
    saveError: 'ERROR: could not save on this device',
    catalogError: 'Exercise list unavailable',
    pending: '{n} pending',
    allSynced: 'All synced',
    needSettings: 'Set the URL and token first',
    syncFailed: 'Sync failed: {e}',
    synced: 'Synced ({n})',
    noConnection: 'No connection - kept in queue',
    lastWorkout: 'Last workout: {d}',
    firstWorkout: 'Log your first session',
    noneYet: 'None yet',
    pendingTag: '  (pending)',
    confirmEmpty: 'No exercises logged. Discard this workout?',
    confirmFinish: 'Finish workout? {n} will be sent to the spreadsheet.',
    confirmDiscardN: 'Discard this workout? Its {n} will be deleted. This cannot be undone.',
    confirmDiscard: 'Discard this workout?',
    discarded: 'Workout discarded',
    nothingFound: 'Nothing found.',
    newExercise: 'New exercise',
    last: 'Last: {s}',
    tapReuse: '{d} - tap to reuse',
    dragHint: 'Drag to reorder',
    needName: 'Enter the exercise name',
    needSetsReps: 'Enter at least sets or reps',
    confirmDelete: 'Delete "{x}"?',
    queueInfo: '{p} entry(ies) waiting to be sent. {t} in total on this device.',
    saved: 'Saved',
    saveUrlFirst: 'Save the URL first.',
    testing: 'Testing...',
    connOk: 'Connection OK.',
    rejected: 'Rejected: {e}',
    failed: 'Failed: {e} (check that the deployment access is "Anyone")',
    lastValues: 'Values from last workout',
    sets: 'sets',
    exercise: ['exercise', 'exercises'],
    workout: ['workout', 'workouts'],
    months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    't-home': 'Gym Log',
    't-session': 'Workout',
    't-history': 'Previous Workouts',
    't-workout': 'Workout',
    't-group': 'Group',
    't-library': 'Exercises',
    't-exercise': 'Exercise',
    't-form': 'Entry',
    't-settings': 'Settings',
    'start-label': 'Start Workout',
    'resume-label': 'Continue Workout',
    'open-history-label': 'Previous Workouts',
    'open-library-label': 'Exercises',
    'theme-dark-label': 'Dark',
    'theme-light-label': 'Light',
    'theme-sand-label': 'Sand',
    'open-settings': 'Settings',
    'entry-empty': 'No exercises logged yet.',
    'add-exercise': '+ ADD EXERCISE',
    finish: 'FINISH WORKOUT',
    discard: 'Discard workout',
    'history-empty': 'No finished workouts yet.',
    'custom-exercise': 'Other exercise (type it)',
    'l-name': 'Exercise name',
    'l-group': 'Group 1',
    'l-group2': 'Group 2',
    'l-group0': 'Group 0 (category)',
    'l-sets': 'Sets',
    'l-reps': 'Reps / Time',
    'l-weight': 'Weight / Load',
    'l-rpe': 'RPE',
    'l-notes': 'Notes',
    'save-entry': 'SAVE',
    'delete-entry': 'DELETE',
    'settings-intro': 'Paste the Apps Script Web App URL and the token here. They are stored only on this device and never go to the repository.',
    'l-lang': 'Language',
    'l-url': 'Apps Script URL (/exec)',
    'l-token': 'Token',
    'save-settings': 'SAVE',
    'test-sync': 'TEST CONNECTION',
    'force-sync': 'SYNC NOW',
    'export-json': 'Export backup (JSON)',
    'ph-search': 'Search exercise...',
    'ph-sets': 'e.g. 3',
    'ph-reps': 'e.g. 10 or 30s',
    'ph-weight': 'e.g. 10kg',
    'ph-rpe': 'e.g. 7',
    'ph-notes': 'e.g. last set felt easy'
  },
  pt: {
    saveError: 'ERRO: nao foi possivel salvar neste aparelho',
    catalogError: 'Lista de exercícios indisponível',
    pending: '{n} pendente(s)',
    allSynced: 'Tudo enviado',
    needSettings: 'Configure a URL e o token primeiro',
    syncFailed: 'Falha no envio: {e}',
    synced: 'Enviado ({n})',
    noConnection: 'Sem conexão - fica na fila',
    lastWorkout: 'Último treino: {d}',
    firstWorkout: 'Registre sua primeira sessão',
    noneYet: 'Nenhum ainda',
    pendingTag: '  (pendente)',
    confirmEmpty: 'Nenhum exercício registrado. Descartar este treino?',
    confirmFinish: 'Finalizar o treino? {n} serão enviados para a planilha.',
    confirmDiscardN: 'Descartar este treino? Seus {n} serão apagados. Não dá para desfazer.',
    confirmDiscard: 'Descartar este treino?',
    discarded: 'Treino descartado',
    nothingFound: 'Nada encontrado.',
    newExercise: 'Novo exercício',
    last: 'Último: {s}',
    tapReuse: '{d} - toque para reusar',
    dragHint: 'Arraste para mudar a ordem',
    needName: 'Informe o nome do exercício',
    needSetsReps: 'Informe ao menos séries ou reps',
    confirmDelete: 'Excluir "{x}"?',
    queueInfo: '{p} registro(s) aguardando envio. {t} no total neste aparelho.',
    saved: 'Salvo',
    saveUrlFirst: 'Salve a URL primeiro.',
    testing: 'Testando...',
    connOk: 'Conexão OK.',
    rejected: 'Recusado: {e}',
    failed: 'Falhou: {e} (confira se o acesso do deploy é "Anyone")',
    lastValues: 'Valores do último treino',
    sets: 'séries',
    exercise: ['exercício', 'exercícios'],
    workout: ['treino', 'treinos'],
    months: ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'],
    't-home': 'Gym Log',
    't-session': 'Treino',
    't-history': 'Treinos Anteriores',
    't-workout': 'Treino',
    't-group': 'Grupo',
    't-library': 'Exercícios',
    't-exercise': 'Exercício',
    't-form': 'Registro',
    't-settings': 'Configurações',
    'start-label': 'Iniciar Treino',
    'resume-label': 'Continuar Treino',
    'open-history-label': 'Treinos Anteriores',
    'open-library-label': 'Exercícios',
    'theme-dark-label': 'Escuro',
    'theme-light-label': 'Claro',
    'theme-sand-label': 'Areia',
    'open-settings': 'Configurações',
    'entry-empty': 'Nenhum exercício registrado ainda.',
    'add-exercise': '+ ADICIONAR EXERCÍCIO',
    finish: 'FINALIZAR TREINO',
    discard: 'Descartar treino',
    'history-empty': 'Nenhum treino finalizado ainda.',
    'custom-exercise': 'Outro exercício (digitar)',
    'l-name': 'Nome do exercício',
    'l-group': 'Grupo 1',
    'l-group2': 'Grupo 2',
    'l-group0': 'Grupo 0 (categoria)',
    'l-sets': 'Séries',
    'l-reps': 'Reps / Tempo',
    'l-weight': 'Peso / Carga',
    'l-rpe': 'RPE',
    'l-notes': 'Observação',
    'save-entry': 'SALVAR',
    'delete-entry': 'EXCLUIR',
    'settings-intro': 'Cole aqui a URL do Web App do Apps Script e o token. Ficam salvos só neste aparelho e nunca vão para o repositório.',
    'l-lang': 'Idioma',
    'l-url': 'URL do Apps Script (/exec)',
    'l-token': 'Token',
    'save-settings': 'SALVAR',
    'test-sync': 'TESTAR CONEXÃO',
    'force-sync': 'ENVIAR AGORA',
    'export-json': 'Exportar backup (JSON)',
    'ph-search': 'Buscar exercício...',
    'ph-sets': 'ex.: 3',
    'ph-reps': 'ex.: 10 ou 30s',
    'ph-weight': 'ex.: 10kg',
    'ph-rpe': 'ex.: 7',
    'ph-notes': 'ex.: última série fácil'
  }
};

/** Texto no idioma escolhido; {chave} e trocado por vars.chave. */
function t(key, vars) {
  var table = STRINGS[settings.lang] || STRINGS.en;
  var str = table[key] !== undefined ? table[key] : STRINGS.en[key];
  if (vars) {
    Object.keys(vars).forEach(function (k) { str = String(str).split('{' + k + '}').join(vars[k]); });
  }
  return str;
}

/** "3 exercises" / "3 exercícios". */
function plural(n, word) {
  var forms = t(word);
  return n + ' ' + forms[n === 1 ? 0 : 1];
}

// Textos fixos do index.html, por id do elemento. Rotulos com <input> dentro
// tem o texto num <span id="l-..."> para nao apagar o campo.
var STATIC_TEXT = ['theme-dark-label', 'theme-light-label', 'theme-sand-label', 'start-label', 'resume-label', 'open-history-label', 'open-library-label', 'open-settings', 'entry-empty', 'add-exercise',
  'finish', 'discard', 'history-empty', 'custom-exercise', 'l-name', 'l-group', 'l-group2', 'l-group0', 'l-sets',
  'l-reps', 'l-weight', 'l-rpe', 'l-notes', 'save-entry', 'delete-entry', 'settings-intro', 'l-lang',
  'l-url', 'l-token', 'save-settings', 'test-sync', 'force-sync', 'export-json'];
var STATIC_PLACEHOLDER = {
  search: 'ph-search', 'f-sets': 'ph-sets', 'f-reps': 'ph-reps',
  'f-weight': 'ph-weight', 'f-rpe': 'ph-rpe', 'f-notes': 'ph-notes'
};

function applyStaticText() {
  STATIC_TEXT.forEach(function (id) { $(id).textContent = t(id); });
  Object.keys(STATIC_PLACEHOLDER).forEach(function (id) {
    $(id).placeholder = t(STATIC_PLACEHOLDER[id]);
  });
  document.documentElement.lang = settings.lang === 'pt' ? 'pt-BR' : 'en';
  $('lang-pt').className = settings.lang === 'pt' ? 'active' : '';
  $('lang-en').className = settings.lang === 'en' ? 'active' : '';
}

// Nomes vindos da planilha: M (exercicio) e O:P (grupos). Sem traducao, ou
// exercicio digitado a mao, fica o ingles.
var ptNames = {};

function indexNames() {
  ptNames = {};
  catalog.groups.forEach(function (g) {
    g.exercises.forEach(function (e) { if (e.pt) ptNames[e.n] = e.pt; });
  });
}

function exLabel(name) {
  return settings.lang === 'pt' && ptNames[name] ? ptNames[name] : name;
}

function termLabel(term) {
  var terms = catalog.terms || {};
  return settings.lang === 'pt' && terms[term] ? terms[term] : term;
}

// ---------------------------------------------------------------- util

function uid() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

function todayISO() {
  var d = new Date();
  var m = String(d.getMonth() + 1).padStart(2, '0');
  var day = String(d.getDate()).padStart(2, '0');
  return d.getFullYear() + '-' + m + '-' + day;
}

function prettyDate(iso) {
  var p = String(iso).split('-');
  if (p.length !== 3) return iso;
  var m = t('months')[Number(p[1]) - 1];
  return settings.lang === 'pt'
    ? Number(p[2]) + ' ' + m + ' ' + p[0]
    : m + ' ' + Number(p[2]) + ', ' + p[0];
}

function shortDate(iso) {
  var p = String(iso).split('-');
  if (p.length !== 3) return iso;
  var m = t('months')[Number(p[1]) - 1];
  return settings.lang === 'pt' ? Number(p[2]) + ' ' + m : m + ' ' + Number(p[2]);
}

function $(id) { return document.getElementById(id); }

var toastTimer = null;
function toast(msg) {
  var el = $('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { el.hidden = true; }, 2600);
}

/** "3x10 @ 56kg" - mesma leitura do #06_TRAINING_LOG.md. */
function summarize(entry) {
  var parts = [];
  if (entry.sets && entry.reps) parts.push(entry.sets + 'x' + entry.reps);
  else if (entry.sets) parts.push(entry.sets + ' ' + t('sets'));
  else if (entry.reps) parts.push(entry.reps);
  if (entry.weight) parts.push('@ ' + entry.weight);
  if (entry.rpe) parts.push('RPE ' + entry.rpe);
  return parts.join(' ');
}

// ---------------------------------------------------------------- navegacao

var stack = [];
var TITLES = {
  'screen-home': 't-home',
  'screen-session': 't-session',
  'screen-history': 't-history',
  'screen-workout': 't-workout',
  'screen-group': 't-group',
  'screen-exercise': 't-exercise',
  'screen-form': 't-form',
  'screen-settings': 't-settings'
};

/** Troca a tela visivel. `stack` e o historico; o topo e sempre a tela atual. */
function render(id) {
  var screens = document.querySelectorAll('.screen');
  for (var i = 0; i < screens.length; i++) screens[i].classList.remove('active');
  $(id).classList.add('active');
  var key = id === 'screen-group' && browsing ? 't-library' : TITLES[id];
  $('title').textContent = key ? t(key) : 'Gym Log';
  $('back').hidden = stack.length <= 1;
  window.scrollTo(0, 0);
}

/** Avanca para uma tela nova. */
function show(id) {
  if (stack[stack.length - 1] !== id) stack.push(id);
  render(id);
}

/** Volta para a raiz (Inicio) e zera o historico. */
function reset(id) {
  stack = [id];
  render(id);
}

/** Volta do formulario para a lista do treino, descartando grupo/exercicio/form. */
function backToSession() {
  stack = ['screen-home', 'screen-session'];
  render('screen-session');
}

function goBack() {
  if (stack.length <= 1) return;
  stack.pop();
  var id = stack[stack.length - 1];
  if (id === 'screen-session' && !session) { reset('screen-home'); renderHome(); return; }
  if (id === 'screen-session') renderSession();
  if (id === 'screen-home') renderHome();
  if (id === 'screen-group') renderGroups();
  if (id === 'screen-history') renderHistory();
  render(id);
}

// ---------------------------------------------------------------- catalogo

function loadCatalog() {
  return fetch('exercises.json', { cache: 'no-cache' })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      catalog = data;
      indexNames();
      try { localStorage.setItem('gymlog.catalog', JSON.stringify(data)); } catch (e) {}
    })
    .catch(function () {
      // Offline e sem cache do service worker ainda: usa a ultima copia.
      catalog = load('gymlog.catalog', { groups: [] });
      indexNames();
      if (!catalog.groups.length) toast(t('catalogError'));
    });
}

function groupNames() {
  return catalog.groups.map(function (g) { return g.name; });
}

function catalogGroup(name) {
  return catalog.groups.filter(function (g) { return g.name === name; })[0] || null;
}

/** GROUP 2 que ja existem dentro de um GROUP 1, na ordem do catalogo. */
function subgroupNames(group1) {
  var g = catalogGroup(group1);
  var out = [];
  (g ? g.exercises : []).forEach(function (e) {
    if (out.indexOf(e.g2) === -1) out.push(e.g2);
  });
  return out.length ? out : [group1];
}

/** GROUP 0 conhecidos: os de CATEGORIES primeiro, depois os que so o catalogo tem. */
function categoryNames() {
  var out = CATEGORIES.map(function (c) { return c.name; });
  catalog.groups.forEach(function (g) {
    if (g.category && out.indexOf(g.category) === -1) out.push(g.category);
  });
  return out;
}

// ---------------------------------------------------------------- historico

/** Ultimo registro deste exercicio, de qualquer treino anterior. */
function lastEntryFor(name, excludeId) {
  for (var i = entries.length - 1; i >= 0; i--) {
    var e = entries[i];
    if (e.exercise === name && e.id !== excludeId) return e;
  }
  return null;
}

// ---------------------------------------------------------------- sync

/** Fila de envio. O treino aberto fica de fora ate ser finalizado. */
function pending() {
  var open = session ? session.id : null;
  return entries.filter(function (e) { return !e.synced && e.session_id !== open; });
}

function refreshBadge() {
  var badge = $('sync-badge');
  var n = pending().length;
  if (n) {
    badge.hidden = false;
    badge.className = 'badge pending';
    badge.textContent = t('pending', { n: n });
  } else if (!navigator.onLine) {
    badge.hidden = false;
    badge.className = 'badge';
    badge.textContent = 'offline';
  } else {
    badge.hidden = true;
  }
}

var syncing = false;

function sync(explicit) {
  var queue = pending();
  if (!queue.length) {
    if (explicit) toast(t('allSynced'));
    return Promise.resolve(true);
  }
  if (!settings.url || !settings.token) {
    if (explicit) toast(t('needSettings'));
    return Promise.resolve(false);
  }
  if (syncing) return Promise.resolve(false);
  syncing = true;

  return fetch(settings.url, {
    method: 'POST',
    // text/plain de proposito: o Apps Script nao responde ao preflight CORS
    // que application/json dispararia. O corpo continua sendo JSON.
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ token: settings.token, entries: queue })
  })
    .then(function (r) { return r.json(); })
    .then(function (res) {
      if (!res.ok) {
        toast(t('syncFailed', { e: res.error || 'error' }));
        return false;
      }
      var accepted = {};
      (res.accepted || []).forEach(function (id) { accepted[id] = true; });
      entries.forEach(function (e) { if (accepted[e.id]) e.synced = true; });
      save(K_ENTRIES, entries);
      refreshBadge();
      if (explicit) toast(t('synced', { n: (res.accepted || []).length }));
      return true;
    })
    .catch(function () {
      if (explicit) toast(t('noConnection'));
      return false;
    })
    .then(function (result) { syncing = false; return result; });
}

// ---------------------------------------------------------------- home

function renderHome() {
  var open = !!session;
  $('start').hidden = open;
  $('resume').hidden = !open;
  if (open) {
    var n = entries.filter(function (e) { return e.session_id === session.id; }).length;
    $('resume-sub').textContent = plural(n, 'exercise') + ' · ' + shortDate(session.date);
  }
  var done = finishedWorkouts();
  $('start-sub').textContent = done.length
    ? t('lastWorkout', { d: shortDate(done[0].date) })
    : t('firstWorkout');
  $('history-sub').textContent = done.length ? plural(done.length, 'workout') : t('noneYet');
  var nEx = 0;
  catalog.groups.forEach(function (g) { nEx += g.exercises.length; });
  $('library-sub').textContent = plural(nEx, 'exercise');
  refreshBadge();
}

// ---------------------------------------------------------------- historico

/** Treinos finalizados, do mais recente para o mais antigo. */
function finishedWorkouts() {
  var open = session ? session.id : null;
  var byId = {};
  var list = [];
  entries.forEach(function (e, i) {
    if (e.session_id === open) return;
    var w = byId[e.session_id];
    if (!w) {
      w = byId[e.session_id] = { id: e.session_id, date: e.date, order: i, entries: [] };
      list.push(w);
    }
    w.entries.push(e);
  });
  // Mesma data: o treino registrado depois vem primeiro.
  list.sort(function (a, b) {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return b.order - a.order;
  });
  return list;
}

function renderHistory() {
  var list = $('history-list');
  list.innerHTML = '';
  var workouts = finishedWorkouts();
  $('history-empty').hidden = workouts.length > 0;

  workouts.forEach(function (w) {
    var unsent = w.entries.filter(function (e) { return !e.synced; }).length;
    var li = document.createElement('li');
    var btn = document.createElement('button');
    btn.className = 'row-btn';
    var name = document.createElement('strong');
    name.textContent = prettyDate(w.date);
    var meta = document.createElement('span');
    meta.className = 'meta';
    meta.textContent = plural(w.entries.length, 'exercise') + (unsent ? t('pendingTag') : '');
    btn.appendChild(name);
    btn.appendChild(meta);
    btn.addEventListener('click', function () { openWorkout(w); });
    li.appendChild(btn);
    list.appendChild(li);
  });
}

var currentWorkout = null;

/** Treino antigo, so leitura: editar aqui nao chegaria ao Sheets. */
function openWorkout(w) {
  currentWorkout = w;
  $('workout-date').textContent = prettyDate(w.date);
  var list = $('workout-list');
  list.innerHTML = '';
  w.entries.forEach(function (e) {
    var li = document.createElement('li');
    li.className = 'row-btn';
    var name = document.createElement('strong');
    name.textContent = exLabel(e.exercise);
    var meta = document.createElement('span');
    meta.className = 'meta';
    meta.textContent = [termLabel(e.group1), summarize(e), e.notes].filter(Boolean).join(' - ');
    li.appendChild(name);
    li.appendChild(meta);
    paintCategory(li, e.group1);
    list.appendChild(li);
  });
  show('screen-workout');
}

// ---------------------------------------------------------------- sessao

function sessionEntries() {
  if (!session) return [];
  return entries.filter(function (e) { return e.session_id === session.id; });
}

function renderSession() {
  if (!session) { reset('screen-home'); renderHome(); return; }
  $('session-date').textContent = prettyDate(session.date);

  var list = $('entry-list');
  list.innerHTML = '';
  var rows = sessionEntries();
  $('entry-empty').hidden = rows.length > 0;

  rows.forEach(function (e) {
    var li = document.createElement('li');
    var btn = document.createElement('button');
    btn.className = 'row-btn';
    btn.innerHTML = '';
    var name = document.createElement('strong');
    name.textContent = exLabel(e.exercise);
    var meta = document.createElement('span');
    meta.className = 'meta';
    meta.textContent = [termLabel(e.group1), summarize(e), e.notes].filter(Boolean).join(' - ');
    btn.appendChild(name);
    btn.appendChild(meta);
    btn.addEventListener('click', function () { openForm(e); });
    paintCategory(btn, e.group1);
    li.appendChild(btn);
    if (rows.length > 1) addDragHandle(li, e.id);
    list.appendChild(li);
  });
  refreshBadge();
}

// ---------------------------------------------------------------- ordem

/** Move uma entry do treino aberto para a posicao `to` (0 = primeira).
    A ordem do array e a ordem em que as linhas chegam ao Sheets, e o treino
    aberto ainda nao foi enviado: por isso so da para reordenar ate o FINISH. */
function moveSessionEntry(id, to) {
  if (!session) return;
  var rows = sessionEntries();
  var from = -1;
  rows.forEach(function (e, i) { if (e.id === id) from = i; });
  if (from === -1) return;
  to = Math.max(0, Math.min(rows.length - 1, to));
  if (from === to) return;
  rows.splice(to, 0, rows.splice(from, 1)[0]);
  var open = session.id;
  entries = entries.filter(function (e) { return e.session_id !== open; }).concat(rows);
  save(K_ENTRIES, entries);
}

// Arrastar pela alca da direita, mas so depois de segurar um instante: sem a
// espera, rolar a tela com o dedo no lado direito pegava a alca e trocava a
// ordem. Dedo que se mexe antes do tempo esta rolando, e a rolagem segue
// normal. Touch events porque o drag-and-drop do HTML nao funciona no Safari
// do iPhone. A alca e irma do botao (nao filha), entao tocar no resto da linha
// continua abrindo a edicao.
var HOLD_MS = 350;      // um pouco mais que o toque de quem so esta rolando
var HOLD_SLOP = 8;      // px que o dedo pode mexer durante a espera
var hold = null;        // {timer, x, y}: segurando, esperando o tempo
var drag = null;        // {li, id, grab}: arrasto ativo

function addDragHandle(li, id) {
  li.classList.add('draggable');
  var handle = document.createElement('span');
  handle.className = 'drag';
  handle.textContent = '\u2630';
  handle.setAttribute('aria-label', t('dragHint'));
  handle.addEventListener('touchstart', function (ev) {
    var p = ev.touches[0];
    armDrag(li, id, p.clientX, p.clientY);
  }, { passive: true });
  handle.addEventListener('touchmove', function (ev) {
    var p = ev.touches[0];
    if (drag) { ev.preventDefault(); dragMove(p.clientY); return; }
    if (hold && (Math.abs(p.clientX - hold.x) > HOLD_SLOP ||
                 Math.abs(p.clientY - hold.y) > HOLD_SLOP)) cancelHold();
  }, { passive: false });   // passive:false para o preventDefault segurar a rolagem
  handle.addEventListener('touchend', finishTouch);
  handle.addEventListener('touchcancel', finishTouch);
  handle.addEventListener('contextmenu', function (ev) { ev.preventDefault(); });
  li.appendChild(handle);
}

function armDrag(li, id, x, y) {
  cancelHold();
  hold = {
    x: x,
    y: y,
    timer: setTimeout(function () {
      hold = null;
      drag = { li: li, id: id, grab: y - li.getBoundingClientRect().top };
      li.classList.add('dragging');     // a linha "levanta": sinal de que pode arrastar
    }, HOLD_MS)
  };
}

function cancelHold() {
  if (!hold) return;
  clearTimeout(hold.timer);
  hold = null;
}

function finishTouch() {
  cancelHold();
  endDrag();
}

function dragMove(y) {
  var li = drag.li;
  var list = li.parentNode;
  // Perto das bordas, rola a tela para alcancar linhas fora de vista.
  if (y > window.innerHeight - 60) window.scrollBy(0, 12);
  else if (y < 110) window.scrollBy(0, -12);

  li.style.transform = '';
  var before = null;
  var others = Array.prototype.filter.call(list.children, function (c) { return c !== li; });
  for (var i = 0; i < others.length; i++) {
    var r = others[i].getBoundingClientRect();
    if (y < r.top + r.height / 2) { before = others[i]; break; }
  }
  if (li.nextSibling !== before || (!before && list.lastChild !== li)) {
    list.insertBefore(li, before);
  }
  var top = li.getBoundingClientRect().top;
  li.style.transform = 'translateY(' + (y - drag.grab - top) + 'px)';
}

function endDrag() {
  if (!drag) return;
  var li = drag.li;
  var to = Array.prototype.indexOf.call(li.parentNode.children, li);
  var id = drag.id;
  drag = null;
  li.style.transform = '';
  li.classList.remove('dragging');
  moveSessionEntry(id, to);
  renderSession();
}

function startSession() {
  session = { id: uid(), date: todayISO() };
  save(K_SESSION, session);
  renderSession();
  show('screen-session');
}

function closeSession() {
  session = null;
  localStorage.removeItem(K_SESSION);
  renderHome();
  reset('screen-home');
}

function finishSession() {
  var n = sessionEntries().length;
  if (n === 0) {
    if (confirm(t('confirmEmpty'))) closeSession();
    return;
  }
  if (!confirm(t('confirmFinish', { n: plural(n, 'exercise') }))) return;
  closeSession();
  sync(true);
}

/** Apaga o treino aberto inteiro. Nada dele foi enviado, entao nada sobra no Sheets. */
function discardSession() {
  var n = sessionEntries().length;
  var msg = n
    ? t('confirmDiscardN', { n: plural(n, 'exercise') })
    : t('confirmDiscard');
  if (!confirm(msg)) return;
  var id = session.id;
  entries = entries.filter(function (e) { return e.session_id !== id; });
  save(K_ENTRIES, entries);
  closeSession();
  toast(t('discarded'));
}

// ---------------------------------------------------------------- grupo

// Lista de exercicios aberta pelo Inicio, so para consultar: mesmas telas de
// grupo e exercicio, mas tocar num exercicio nao abre o formulario e nao ha
// "outro exercicio". Pelo "+ ADD EXERCISE" do treino volta a ser false.
var browsing = false;

function openLibrary() {
  browsing = true;
  renderGroups();
  show('screen-group');
}

function openGroupPicker() {
  browsing = false;
  renderGroups();
  show('screen-group');
}

// Ordem e cor das secoes. A categoria de cada grupo vem da coluna K (GROUP 0)
// do Off_Court via exercises.json; uma categoria nova que nao esteja aqui
// aparece depois destas, em cinza.
var CATEGORIES = [
  { name: 'Gym', color: '#00ff00' },
  { name: 'Gym - Lower Body/Core', color: '#be29ec' },
  { name: 'Mobility & Recovery', color: '#4d9bff' },
  { name: 'Conditioning', color: '#ff9f43' }
];
var OTHER_COLOR = '#98a1b3';

/** Cor da categoria do grupo (coluna K), ou null se o grupo saiu do catalogo. */
function groupColor(groupName) {
  var g = catalog.groups.filter(function (x) { return x.name === groupName; })[0];
  if (!g) return null;
  var c = CATEGORIES.filter(function (x) { return x.name === g.category; })[0];
  return c ? c.color : OTHER_COLOR;
}

/** Borda esquerda do exercicio na cor da categoria, como na tela de grupos. */
function paintCategory(row, groupName) {
  var color = groupColor(groupName);
  if (!color) return;
  row.classList.add('cat');
  row.style.setProperty('--cat', color);
}

function groupsByCategory() {
  var order = CATEGORIES.map(function (c) { return c.name; });
  var sections = [];
  var byName = {};
  catalog.groups.forEach(function (g) {
    var cat = g.category || 'Other';
    if (!byName[cat]) {
      var known = order.indexOf(cat);
      byName[cat] = {
        name: cat,
        color: known === -1 ? OTHER_COLOR : CATEGORIES[known].color,
        rank: known === -1 ? order.length : known,
        groups: []
      };
      sections.push(byName[cat]);
    }
    byName[cat].groups.push(g);
  });
  sections.sort(function (a, b) {
    return a.rank - b.rank || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  });
  return sections;
}

function renderGroups() {
  var box = $('group-grid');
  box.innerHTML = '';
  groupsByCategory().forEach(function (sec) {
    var head = document.createElement('div');
    head.className = 'cat-head';
    head.style.setProperty('--cat', sec.color);
    head.textContent = termLabel(sec.name);
    box.appendChild(head);

    var grid = document.createElement('div');
    grid.className = 'grid';
    grid.style.setProperty('--cat', sec.color);
    sec.groups.forEach(function (g) {
      var btn = document.createElement('button');
      var label = document.createElement('span');
      label.textContent = termLabel(g.name);
      btn.appendChild(label);
      var count = document.createElement('small');
      count.textContent = plural(g.exercises.length, 'exercise');
      btn.appendChild(count);
      btn.addEventListener('click', function () { openExerciseList(g.name); });
      grid.appendChild(btn);
    });
    box.appendChild(grid);
  });
}

// ---------------------------------------------------------------- exercicio

var currentGroup = null;

function openExerciseList(groupName) {
  currentGroup = groupName;
  $('search').value = '';
  $('custom-exercise').hidden = browsing;
  renderExercises('');
  show('screen-exercise');
  $('title').textContent = termLabel(groupName);
}

function renderExercises(filter) {
  var box = $('exercise-list');
  box.innerHTML = '';
  var q = filter.trim().toLowerCase();

  // Busca vazia: so o grupo escolhido. Com texto: procura em todos os grupos,
  // porque na academia e mais rapido digitar tres letras do que lembrar o grupo.
  var pool = [];
  catalog.groups.forEach(function (g) {
    if (!q && g.name !== currentGroup) return;
    g.exercises.forEach(function (e) {
      pool.push({ n: e.n, pt: e.pt || '', g0: g.category || '', g1: g.name, g2: e.g2 });
    });
  });
  // Busca nos dois idiomas: quem usa em portugues ainda pode digitar "row".
  if (q) {
    pool = pool.filter(function (e) {
      return e.n.toLowerCase().indexOf(q) !== -1 || e.pt.toLowerCase().indexOf(q) !== -1;
    });
  }

  var lastSub = null;
  pool.forEach(function (e) {
    var sub = q ? e.g1 : e.g2;
    if (sub !== lastSub) {
      lastSub = sub;
      var h = document.createElement('div');
      h.className = 'sub';
      h.textContent = termLabel(sub);
      box.appendChild(h);
    }
    var btn = document.createElement(browsing ? 'div' : 'button');
    btn.className = browsing ? 'row-btn static' : 'row-btn';
    var name = document.createElement('strong');
    name.textContent = exLabel(e.n);
    btn.appendChild(name);
    var last = lastEntryFor(e.n);
    if (last) {
      var meta = document.createElement('span');
      meta.className = 'meta';
      meta.textContent = summarize(last) + '  -  ' + shortDate(last.date);
      btn.appendChild(meta);
    }
    if (!browsing) btn.addEventListener('click', function () {
      openForm({ exercise: e.n, group0: e.g0, group1: e.g1, group2: e.g2 });
    });
    box.appendChild(btn);
  });

  if (!pool.length) {
    var p = document.createElement('p');
    p.className = 'muted center';
    p.textContent = t('nothingFound');
    box.appendChild(p);
  }
}

// ---------------------------------------------------------------- formulario

var editing = null;   // entry existente sendo editada, ou null
var draft = null;     // {exercise, group0, group1, group2, custom}

function openForm(entry) {
  var isExisting = !!entry.id;
  editing = isExisting ? entry : null;
  draft = {
    exercise: entry.exercise || '',
    group0: entry.group0 || '',
    group1: entry.group1 || '',
    group2: entry.group2 || '',
    custom: !!entry.custom
  };

  $('custom-fields').hidden = !draft.custom;
  if (draft.custom) $('f-name').value = draft.exercise;
  formLabels(draft);

  $('delete-entry').hidden = !isExisting;

  if (isExisting) {
    $('f-sets').value = entry.sets || '';
    $('f-reps').value = entry.reps || '';
    $('f-weight').value = entry.weight || '';
    $('f-rpe').value = entry.rpe || '';
    $('f-notes').value = entry.notes || '';
    $('last-chip').hidden = true;
  } else {
    // Campos de hoje comecam vazios: valor ja escrito pareceria ja registrado.
    // O ultimo treino aparece so como referencia, no chip; tocar nele copia.
    var last = draft.exercise ? lastEntryFor(draft.exercise) : null;
    $('f-sets').value = '';
    $('f-reps').value = '';
    $('f-weight').value = '';
    $('f-rpe').value = '';
    $('f-notes').value = '';
    $('last-chip').hidden = !last;
    if (last) lastChipText(last);
  }
  markReused(false);

  show('screen-form');
}

// Campos preenchidos pelo "toque para reusar". Tocar num deles apaga o valor
// antigo, para escrever o novo sem ter que deletar: 2x10 virou 3x10, toca em
// sets e digita 3. So vale uma vez por campo; o que foi digitado fica.
var PREFILL_FIELDS = ['f-sets', 'f-reps', 'f-weight', 'f-rpe'];
var reused = {};

function markReused(on) {
  reused = {};
  if (!on) return;
  PREFILL_FIELDS.forEach(function (id) { if ($(id).value) reused[id] = true; });
}

/** Preenche um <select> com termos da planilha. O valor e o ingles (e o que e
    gravado); o texto segue o idioma. Um valor escolhido que nao esta na lista
    (registro antigo, grupo que saiu do catalogo) entra no fim em vez de sumir. */
function fillSelect(sel, names, selected) {
  if (selected && names.indexOf(selected) === -1) names = names.concat([selected]);
  sel.innerHTML = '';
  names.forEach(function (name) {
    var opt = document.createElement('option');
    opt.value = name;
    opt.textContent = termLabel(name);
    if (name === selected) opt.selected = true;
    sel.appendChild(opt);
  });
  sel.value = selected && names.indexOf(selected) !== -1 ? selected : names[0];
}

/** Os tres grupos do exercicio digitado, nas colunas J, K e L do Off_Court.
    GROUP 2 so oferece os subgrupos do GROUP 1 escolhido; GROUP 0 ja vem com a
    categoria dele, mas da para trocar. */
function fillGroupSelects(sel) {
  fillSelect($('f-group'), groupNames(), sel.group1);
  var g1 = $('f-group').value;
  fillSelect($('f-group2'), subgroupNames(g1), sel.group2);
  var g = catalogGroup(g1);
  fillSelect($('f-group0'), categoryNames(), sel.group0 || (g && g.category) || '');
}

/** Trocou o GROUP 1: subgrupo e categoria voltam aos dele. */
function onGroup1Change() {
  fillGroupSelects({ group1: $('f-group').value });
}

/** Textos do formulario que dependem do idioma. Nao toca nos campos digitados,
    para a troca de idioma no meio do preenchimento nao apagar nada. */
function formLabels(sel) {
  if (draft.custom) fillGroupSelects(sel);

  $('form-exercise').textContent = draft.exercise ? exLabel(draft.exercise) : t('newExercise');
  $('form-group').textContent = draft.group1
    ? (draft.group2 && draft.group2 !== draft.group1
        ? termLabel(draft.group1) + ' / ' + termLabel(draft.group2)
        : termLabel(draft.group1))
    : '';
}

function lastChipText(last) {
  var chip = $('last-chip');
  chip.innerHTML = '';
  var line = document.createElement('span');
  line.textContent = t('last', { s: summarize(last) });
  var sub = document.createElement('small');
  sub.textContent = t('tapReuse', { d: shortDate(last.date) });
  chip.appendChild(line);
  chip.appendChild(sub);
}

function openCustomForm() {
  openForm({ custom: true, group1: currentGroup || groupNames()[0] });
}

function saveEntry() {
  var name = draft.custom ? $('f-name').value.trim() : draft.exercise;
  if (!name) { toast(t('needName')); return; }

  // group0 so importa para exercicio digitado: o ImportGymLog o leva para a
  // coluna L quando acrescenta o exercicio novo a lista de referencia.
  var group1 = draft.custom ? $('f-group').value : draft.group1;
  var group2 = draft.custom ? $('f-group2').value : draft.group2;
  var group0 = draft.custom ? $('f-group0').value : draft.group0;

  var sets = $('f-sets').value.trim();
  var reps = $('f-reps').value.trim();
  if (!sets && !reps) { toast(t('needSetsReps')); return; }

  if (editing) {
    editing.exercise = name;
    editing.group0 = group0;
    editing.group1 = group1;
    editing.group2 = group2;
    editing.sets = sets;
    editing.reps = reps;
    editing.weight = $('f-weight').value.trim();
    editing.rpe = $('f-rpe').value.trim();
    editing.notes = $('f-notes').value.trim();
  } else {
    entries.push({
      id: uid(),
      session_id: session.id,
      date: session.date,
      exercise: name,
      group0: group0,
      group1: group1,
      group2: group2,
      sets: sets,
      reps: reps,
      weight: $('f-weight').value.trim(),
      rpe: $('f-rpe').value.trim(),
      // Vai para Off_Court!G (OBS) e dali para o #06, no fim do exercicio.
      notes: $('f-notes').value.trim(),
      custom: !!draft.custom,
      synced: false
    });
  }

  save(K_ENTRIES, entries);
  editing = null;
  draft = null;
  renderSession();
  backToSession();
}

function deleteEntry() {
  if (!editing) return;
  if (!confirm(t('confirmDelete', { x: exLabel(editing.exercise) }))) return;
  entries = entries.filter(function (e) { return e.id !== editing.id; });
  save(K_ENTRIES, entries);
  editing = null;
  renderSession();
  backToSession();
}

// ---------------------------------------------------------------- tema

// O <head> do index.html ja aplica o tema salvo antes de pintar; aqui ele so
// troca na hora quando o usuario escolhe outro no menu do topo.
var THEME_BG = { dark: '#0f1115', light: '#f2f3f6', sand: '#f1ebe0' };

function applyTheme() {
  var th = settings.theme;
  if (th === 'dark') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', th);
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = THEME_BG[th];
  THEMES.forEach(function (x) { $('theme-' + x).className = x === th ? 'active' : ''; });
}

function setTheme(th) {
  settings.theme = th;
  save(K_SETTINGS, settings);
  applyTheme();
  $('theme-menu').hidden = true;
}

// ---------------------------------------------------------------- settings

function openSettings() {
  $('s-url').value = settings.url || '';
  $('s-token').value = settings.token || '';
  $('s-lang').value = settings.lang;
  $('settings-status').textContent = '';
  $('queue-info').textContent = t('queueInfo', { p: pending().length, t: entries.length });
  show('screen-settings');
}

/** Seletor de idioma das Configuracoes. */
function changeLanguage() {
  setLanguage($('s-lang').value);
}

/** Troca o idioma na hora e redesenha a tela aberta, qualquer que seja.
    Chamado pelo botao PT/EN do topo e pelo seletor das Configuracoes. */
function setLanguage(lang) {
  settings.lang = lang === 'pt' ? 'pt' : 'en';
  save(K_SETTINGS, settings);
  $('s-lang').value = settings.lang;
  applyStaticText();
  refreshBadge();

  var id = stack[stack.length - 1];
  var y = window.scrollY;
  if (id === 'screen-home') renderHome();
  if (id === 'screen-session') renderSession();
  if (id === 'screen-history') renderHistory();
  if (id === 'screen-workout' && currentWorkout) openWorkout(currentWorkout);
  if (id === 'screen-group') renderGroups();
  if (id === 'screen-exercise') renderExercises($('search').value);
  if (id === 'screen-form') {
    formLabels({ group1: $('f-group').value, group2: $('f-group2').value, group0: $('f-group0').value });
    var last = !editing && draft.exercise ? lastEntryFor(draft.exercise) : null;
    if (last) lastChipText(last);
  }
  if (id === 'screen-settings') {
    $('queue-info').textContent = t('queueInfo', { p: pending().length, t: entries.length });
  }
  if (!id) return;                      // antes do catalogo carregar
  render(id);
  if (id === 'screen-exercise') $('title').textContent = termLabel(currentGroup);
  window.scrollTo(0, y);                // trocar o idioma nao deve pular para o topo
}

function saveSettings() {
  settings.url = $('s-url').value.trim();
  settings.token = $('s-token').value.trim();
  save(K_SETTINGS, settings);
  toast(t('saved'));
}

function testSync() {
  var status = $('settings-status');
  if (!settings.url) { status.textContent = t('saveUrlFirst'); return; }
  status.textContent = t('testing');
  fetch(settings.url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ token: settings.token, entries: [] })
  })
    .then(function (r) { return r.json(); })
    .then(function (res) {
      status.textContent = res.ok ? t('connOk') : t('rejected', { e: res.error });
    })
    .catch(function (err) {
      status.textContent = t('failed', { e: err.message });
    });
}

function exportJSON() {
  var blob = new Blob([JSON.stringify(entries, null, 1)], { type: 'application/json' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'gymlog-backup-' + todayISO() + '.json';
  a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
}

// ---------------------------------------------------------------- eventos

$('back').addEventListener('click', goBack);

$('start').addEventListener('click', startSession);
$('resume').addEventListener('click', function () { renderSession(); show('screen-session'); });
$('open-history').addEventListener('click', function () { renderHistory(); show('screen-history'); });
$('open-library').addEventListener('click', openLibrary);
$('open-settings').addEventListener('click', openSettings);
$('sync-badge').addEventListener('click', function () { sync(true); });

$('add-exercise').addEventListener('click', openGroupPicker);
$('finish').addEventListener('click', finishSession);
$('discard').addEventListener('click', discardSession);

$('search').addEventListener('input', function () { renderExercises(this.value); });
$('custom-exercise').addEventListener('click', openCustomForm);
$('f-group').addEventListener('change', onGroup1Change);

$('last-chip').addEventListener('click', function () {
  var last = lastEntryFor(draft.exercise);
  if (!last) return;
  $('f-sets').value = last.sets || '';
  $('f-reps').value = last.reps || '';
  $('f-weight').value = last.weight || '';
  $('f-rpe').value = last.rpe || '';
  markReused(true);
  toast(t('lastValues'));
});

PREFILL_FIELDS.forEach(function (id) {
  $(id).addEventListener('focus', function () {
    if (!reused[id]) return;
    delete reused[id];
    this.value = '';
  });
});

$('save-entry').addEventListener('click', saveEntry);
$('delete-entry').addEventListener('click', deleteEntry);

$('save-settings').addEventListener('click', saveSettings);
$('s-lang').addEventListener('change', changeLanguage);
$('lang-pt').addEventListener('click', function () { setLanguage('pt'); });
$('lang-en').addEventListener('click', function () { setLanguage('en'); });
$('theme-btn').addEventListener('click', function (ev) {
  ev.stopPropagation();       // senao o clique fora (abaixo) fecha na hora
  $('theme-menu').hidden = !$('theme-menu').hidden;
});
THEMES.forEach(function (th) {
  $('theme-' + th).addEventListener('click', function () { setTheme(th); });
});
document.addEventListener('click', function (ev) {
  var menu = $('theme-menu');
  if (!menu.hidden && !menu.contains(ev.target)) menu.hidden = true;
});
$('test-sync').addEventListener('click', testSync);
$('force-sync').addEventListener('click', function () { sync(true); });
$('export-json').addEventListener('click', exportJSON);

window.addEventListener('online', function () { refreshBadge(); sync(false); });
window.addEventListener('offline', refreshBadge);

// ---------------------------------------------------------------- boot

applyStaticText();
applyTheme();
loadCatalog().then(function () {
  renderHome();
  reset('screen-home');
  sync(false);
});

if ('serviceWorker' in navigator) {
  // Versao nova assumiu o controle: recarrega para ela aparecer ja nesta
  // abertura, e nao so na seguinte. So na tela inicial - no meio de um
  // formulario o reload apagaria o que esta sendo digitado.
  var hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', function () {
    if (!hadController) return;           // primeira instalacao, nada a trocar
    hadController = false;                // no maximo um reload
    if (stack.length === 1 && stack[0] === 'screen-home') location.reload();
  });
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  });
}
