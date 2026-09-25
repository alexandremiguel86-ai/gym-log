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
 */

'use strict';

// ---------------------------------------------------------------- storage

var K_ENTRIES = 'gymlog.entries';
var K_SESSION = 'gymlog.session';
var K_SETTINGS = 'gymlog.settings';

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
    toast('ERROR: could not save on this device');
    return false;
  }
}

var entries = load(K_ENTRIES, []);
var session = load(K_SESSION, null);
var settings = load(K_SETTINGS, { url: '', token: '' });
var catalog = { groups: [] };

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

var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
              'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function prettyDate(iso) {
  var p = String(iso).split('-');
  if (p.length !== 3) return iso;
  return MONTHS[Number(p[1]) - 1] + ' ' + Number(p[2]) + ', ' + p[0];
}

function shortDate(iso) {
  var p = String(iso).split('-');
  if (p.length !== 3) return iso;
  return MONTHS[Number(p[1]) - 1] + ' ' + Number(p[2]);
}

function plural(n, word) { return n + ' ' + word + (n === 1 ? '' : 's'); }

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
  else if (entry.sets) parts.push(entry.sets + ' sets');
  else if (entry.reps) parts.push(entry.reps);
  if (entry.weight) parts.push('@ ' + entry.weight);
  if (entry.rpe) parts.push('RPE ' + entry.rpe);
  return parts.join(' ');
}

// ---------------------------------------------------------------- navegacao

var stack = [];
var TITLES = {
  'screen-home': 'Gym Log',
  'screen-session': 'Workout',
  'screen-history': 'Previous Workouts',
  'screen-workout': 'Workout',
  'screen-group': 'Group',
  'screen-exercise': 'Exercise',
  'screen-form': 'Entry',
  'screen-settings': 'Settings'
};

/** Troca a tela visivel. `stack` e o historico; o topo e sempre a tela atual. */
function render(id) {
  var screens = document.querySelectorAll('.screen');
  for (var i = 0; i < screens.length; i++) screens[i].classList.remove('active');
  $(id).classList.add('active');
  $('title').textContent = TITLES[id] || 'Gym Log';
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
      try { localStorage.setItem('gymlog.catalog', JSON.stringify(data)); } catch (e) {}
    })
    .catch(function () {
      // Offline e sem cache do service worker ainda: usa a ultima copia.
      catalog = load('gymlog.catalog', { groups: [] });
      if (!catalog.groups.length) toast('Exercise list unavailable');
    });
}

function groupNames() {
  return catalog.groups.map(function (g) { return g.name; });
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
    badge.textContent = n + ' pending';
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
    if (explicit) toast('All synced');
    return Promise.resolve(true);
  }
  if (!settings.url || !settings.token) {
    if (explicit) toast('Set the URL and token first');
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
        toast('Sync failed: ' + (res.error || 'error'));
        return false;
      }
      var accepted = {};
      (res.accepted || []).forEach(function (id) { accepted[id] = true; });
      entries.forEach(function (e) { if (accepted[e.id]) e.synced = true; });
      save(K_ENTRIES, entries);
      refreshBadge();
      if (explicit) toast('Synced (' + (res.accepted || []).length + ')');
      return true;
    })
    .catch(function () {
      if (explicit) toast('No connection - kept in queue');
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
    $('resume').textContent = 'CONTINUE (' + plural(n, 'exercise') + ')';
  }
  var total = finishedWorkouts().length;
  $('home-stats').textContent = total
    ? plural(total, 'workout') + ' logged on this device'
    : 'No workouts logged yet.';
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
    meta.textContent = plural(w.entries.length, 'exercise') + (unsent ? '  (pending)' : '');
    btn.appendChild(name);
    btn.appendChild(meta);
    btn.addEventListener('click', function () { openWorkout(w); });
    li.appendChild(btn);
    list.appendChild(li);
  });
}

/** Treino antigo, so leitura: editar aqui nao chegaria ao Sheets. */
function openWorkout(w) {
  $('workout-date').textContent = prettyDate(w.date);
  var list = $('workout-list');
  list.innerHTML = '';
  w.entries.forEach(function (e) {
    var li = document.createElement('li');
    li.className = 'row-btn';
    var name = document.createElement('strong');
    name.textContent = e.exercise;
    var meta = document.createElement('span');
    meta.className = 'meta';
    meta.textContent = [e.group1, summarize(e)].filter(Boolean).join(' - ');
    li.appendChild(name);
    li.appendChild(meta);
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
    name.textContent = e.exercise;
    var meta = document.createElement('span');
    meta.className = 'meta';
    meta.textContent = [e.group1, summarize(e)].filter(Boolean).join(' - ');
    btn.appendChild(name);
    btn.appendChild(meta);
    btn.addEventListener('click', function () { openForm(e); });
    li.appendChild(btn);
    list.appendChild(li);
  });
  refreshBadge();
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
    if (confirm('No exercises logged. Discard this workout?')) closeSession();
    return;
  }
  if (!confirm('Finish workout? ' + plural(n, 'exercise') + ' will be sent to the spreadsheet.')) return;
  closeSession();
  sync(true);
}

/** Apaga o treino aberto inteiro. Nada dele foi enviado, entao nada sobra no Sheets. */
function discardSession() {
  var n = sessionEntries().length;
  var msg = n
    ? 'Discard this workout? Its ' + plural(n, 'exercise') + ' will be deleted. This cannot be undone.'
    : 'Discard this workout?';
  if (!confirm(msg)) return;
  var id = session.id;
  entries = entries.filter(function (e) { return e.session_id !== id; });
  save(K_ENTRIES, entries);
  closeSession();
  toast('Workout discarded');
}

// ---------------------------------------------------------------- grupo

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
    head.textContent = sec.name;
    box.appendChild(head);

    var grid = document.createElement('div');
    grid.className = 'grid';
    grid.style.setProperty('--cat', sec.color);
    sec.groups.forEach(function (g) {
      var btn = document.createElement('button');
      var label = document.createElement('span');
      label.textContent = g.name;
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
  renderExercises('');
  show('screen-exercise');
  $('title').textContent = groupName;
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
      pool.push({ n: e.n, g1: g.name, g2: e.g2 });
    });
  });
  if (q) pool = pool.filter(function (e) { return e.n.toLowerCase().indexOf(q) !== -1; });

  var lastSub = null;
  pool.forEach(function (e) {
    var sub = q ? e.g1 : e.g2;
    if (sub !== lastSub) {
      lastSub = sub;
      var h = document.createElement('div');
      h.className = 'sub';
      h.textContent = sub;
      box.appendChild(h);
    }
    var btn = document.createElement('button');
    btn.className = 'row-btn';
    var name = document.createElement('strong');
    name.textContent = e.n;
    btn.appendChild(name);
    var last = lastEntryFor(e.n);
    if (last) {
      var meta = document.createElement('span');
      meta.className = 'meta';
      meta.textContent = summarize(last) + '  -  ' + shortDate(last.date);
      btn.appendChild(meta);
    }
    btn.addEventListener('click', function () {
      openForm({ exercise: e.n, group1: e.g1, group2: e.g2 });
    });
    box.appendChild(btn);
  });

  if (!pool.length) {
    var p = document.createElement('p');
    p.className = 'muted center';
    p.textContent = 'Nothing found.';
    box.appendChild(p);
  }
}

// ---------------------------------------------------------------- formulario

var editing = null;   // entry existente sendo editada, ou null
var draft = null;     // {exercise, group1, group2, custom}

function openForm(entry) {
  var isExisting = !!entry.id;
  editing = isExisting ? entry : null;
  draft = {
    exercise: entry.exercise || '',
    group1: entry.group1 || '',
    group2: entry.group2 || '',
    custom: !!entry.custom
  };

  $('custom-fields').hidden = !draft.custom;
  if (draft.custom) {
    var sel = $('f-group');
    sel.innerHTML = '';
    groupNames().forEach(function (name) {
      var opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      if (name === draft.group1) opt.selected = true;
      sel.appendChild(opt);
    });
    $('f-name').value = draft.exercise;
  }

  $('form-exercise').textContent = draft.exercise || 'New exercise';
  $('form-group').textContent = draft.group1
    ? (draft.group2 && draft.group2 !== draft.group1
        ? draft.group1 + ' / ' + draft.group2
        : draft.group1)
    : '';

  $('delete-entry').hidden = !isExisting;

  if (isExisting) {
    $('f-sets').value = entry.sets || '';
    $('f-reps').value = entry.reps || '';
    $('f-weight').value = entry.weight || '';
    $('f-rpe').value = entry.rpe || '';
    $('last-chip').hidden = true;
  } else {
    // Prefill do ultimo treino deste exercicio: o app abre ja preenchido e
    // voce so ajusta o que mudou.
    var last = draft.exercise ? lastEntryFor(draft.exercise) : null;
    $('f-sets').value = last ? (last.sets || '') : '';
    $('f-reps').value = last ? (last.reps || '') : '';
    $('f-weight').value = last ? (last.weight || '') : '';
    $('f-rpe').value = last ? (last.rpe || '') : '';
    var chip = $('last-chip');
    if (last) {
      chip.hidden = false;
      chip.innerHTML = '';
      var line = document.createElement('span');
      line.textContent = 'Last: ' + summarize(last);
      var sub = document.createElement('small');
      sub.textContent = shortDate(last.date) + ' - tap to reuse';
      chip.appendChild(line);
      chip.appendChild(sub);
    } else {
      chip.hidden = true;
    }
  }

  show('screen-form');
}

function openCustomForm() {
  openForm({ custom: true, group1: currentGroup || groupNames()[0] });
}

function saveEntry() {
  var name = draft.custom ? $('f-name').value.trim() : draft.exercise;
  if (!name) { toast('Enter the exercise name'); return; }

  var group1 = draft.custom ? $('f-group').value : draft.group1;
  var group2 = draft.custom ? group1 : draft.group2;

  var sets = $('f-sets').value.trim();
  var reps = $('f-reps').value.trim();
  if (!sets && !reps) { toast('Enter at least sets or reps'); return; }

  if (editing) {
    editing.exercise = name;
    editing.group1 = group1;
    editing.group2 = group2;
    editing.sets = sets;
    editing.reps = reps;
    editing.weight = $('f-weight').value.trim();
    editing.rpe = $('f-rpe').value.trim();
  } else {
    entries.push({
      id: uid(),
      session_id: session.id,
      date: session.date,
      exercise: name,
      group1: group1,
      group2: group2,
      sets: sets,
      reps: reps,
      weight: $('f-weight').value.trim(),
      rpe: $('f-rpe').value.trim(),
      // Sem campo na tela; a coluna continua no Sheets porque o import do
      // Excel le as colunas do CSV por posicao.
      notes: '',
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
  if (!confirm('Delete "' + editing.exercise + '"?')) return;
  entries = entries.filter(function (e) { return e.id !== editing.id; });
  save(K_ENTRIES, entries);
  editing = null;
  renderSession();
  backToSession();
}

// ---------------------------------------------------------------- settings

function openSettings() {
  $('s-url').value = settings.url || '';
  $('s-token').value = settings.token || '';
  $('settings-status').textContent = '';
  $('queue-info').textContent = pending().length + ' entry(ies) waiting to be sent. '
    + entries.length + ' in total on this device.';
  show('screen-settings');
}

function saveSettings() {
  settings.url = $('s-url').value.trim();
  settings.token = $('s-token').value.trim();
  save(K_SETTINGS, settings);
  toast('Saved');
}

function testSync() {
  var status = $('settings-status');
  if (!settings.url) { status.textContent = 'Save the URL first.'; return; }
  status.textContent = 'Testing...';
  fetch(settings.url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ token: settings.token, entries: [] })
  })
    .then(function (r) { return r.json(); })
    .then(function (res) {
      status.textContent = res.ok ? 'Connection OK.' : 'Rejected: ' + res.error;
    })
    .catch(function (err) {
      status.textContent = 'Failed: ' + err.message
        + ' (check that the deployment access is "Anyone")';
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
$('open-settings').addEventListener('click', openSettings);
$('sync-badge').addEventListener('click', function () { sync(true); });

$('add-exercise').addEventListener('click', function () { renderGroups(); show('screen-group'); });
$('finish').addEventListener('click', finishSession);
$('discard').addEventListener('click', discardSession);

$('search').addEventListener('input', function () { renderExercises(this.value); });
$('custom-exercise').addEventListener('click', openCustomForm);

$('last-chip').addEventListener('click', function () {
  var last = lastEntryFor(draft.exercise);
  if (!last) return;
  $('f-sets').value = last.sets || '';
  $('f-reps').value = last.reps || '';
  $('f-weight').value = last.weight || '';
  $('f-rpe').value = last.rpe || '';
  toast('Values from last workout');
});

$('save-entry').addEventListener('click', saveEntry);
$('delete-entry').addEventListener('click', deleteEntry);

$('save-settings').addEventListener('click', saveSettings);
$('test-sync').addEventListener('click', testSync);
$('force-sync').addEventListener('click', function () { sync(true); });
$('export-json').addEventListener('click', exportJSON);

window.addEventListener('online', function () { refreshBadge(); sync(false); });
window.addEventListener('offline', refreshBadge);

// ---------------------------------------------------------------- boot

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
