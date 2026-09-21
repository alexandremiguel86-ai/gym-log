/* Gym Log - V0.1
 *
 * Principio: LOCAL PRIMEIRO. Cada exercicio e gravado no localStorage antes de
 * qualquer tentativa de rede, e so e marcado como sincronizado quando o Apps
 * Script confirma o id. A rede da academia e ruim; perder um treino seria o
 * pior defeito possivel.
 *
 * Nada aqui e apagado apos a sincronizacao: o historico local e o que alimenta
 * o "Ultimo: 3x10 @ 56kg" sem precisar de rede.
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
    toast('ERRO: nao consegui salvar no aparelho');
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

var MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
              'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function prettyDate(iso) {
  var p = String(iso).split('-');
  if (p.length !== 3) return iso;
  return Number(p[2]) + '/' + MONTHS[Number(p[1]) - 1] + '/' + p[0];
}

function shortDate(iso) {
  var p = String(iso).split('-');
  if (p.length !== 3) return iso;
  return Number(p[2]) + '/' + MONTHS[Number(p[1]) - 1];
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
  else if (entry.sets) parts.push(entry.sets + ' series');
  else if (entry.reps) parts.push(entry.reps);
  if (entry.weight) parts.push('@ ' + entry.weight);
  if (entry.rpe) parts.push('RPE ' + entry.rpe);
  return parts.join(' ');
}

// ---------------------------------------------------------------- navegacao

var stack = [];
var TITLES = {
  'screen-home': 'Gym Log',
  'screen-session': 'Treino',
  'screen-group': 'Grupo',
  'screen-exercise': 'Exercicio',
  'screen-form': 'Registro',
  'screen-settings': 'Configuracoes'
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
      if (!catalog.groups.length) toast('Lista de exercicios indisponivel');
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

function pending() {
  return entries.filter(function (e) { return !e.synced; });
}

function refreshBadge() {
  var badge = $('sync-badge');
  var n = pending().length;
  if (n) {
    badge.hidden = false;
    badge.className = 'badge pending';
    badge.textContent = n + ' pendente' + (n > 1 ? 's' : '');
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
    if (explicit) toast('Tudo sincronizado');
    return Promise.resolve(true);
  }
  if (!settings.url || !settings.token) {
    if (explicit) toast('Configure a URL e o token primeiro');
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
        toast('Sync falhou: ' + (res.error || 'erro'));
        return false;
      }
      var accepted = {};
      (res.accepted || []).forEach(function (id) { accepted[id] = true; });
      entries.forEach(function (e) { if (accepted[e.id]) e.synced = true; });
      save(K_ENTRIES, entries);
      refreshBadge();
      if (explicit) toast('Sincronizado (' + (res.accepted || []).length + ')');
      return true;
    })
    .catch(function () {
      if (explicit) toast('Sem conexao - fica na fila');
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
    $('resume').textContent = 'CONTINUAR (' + n + ' exerc.)';
  }
  var days = {};
  entries.forEach(function (e) { days[e.date] = true; });
  var total = Object.keys(days).length;
  $('home-stats').textContent = entries.length
    ? entries.length + ' registros em ' + total + ' treinos'
    : 'Nenhum treino registrado ainda.';
  refreshBadge();
}

// ---------------------------------------------------------------- sessao

function sessionEntries() {
  if (!session) return [];
  return entries.filter(function (e) { return e.session_id === session.id; });
}

function renderSession() {
  if (!session) { reset('screen-home'); renderHome(); return; }
  $('session-date').textContent = 'Treino de ' + prettyDate(session.date);

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
    meta.textContent = [e.group1, summarize(e)].filter(Boolean).join(' - ')
      + (e.synced ? '' : '  (pendente)');
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

function finishSession() {
  var n = sessionEntries().length;
  if (n === 0 && !confirm('Treino sem exercicios. Descartar?')) return;
  session = null;
  localStorage.removeItem(K_SESSION);
  renderHome();
  reset('screen-home');
  sync(true);
}

// ---------------------------------------------------------------- grupo

function renderGroups() {
  var grid = $('group-grid');
  grid.innerHTML = '';
  catalog.groups.forEach(function (g) {
    var btn = document.createElement('button');
    btn.textContent = g.name;
    var count = document.createElement('small');
    count.textContent = g.exercises.length + ' exerc.';
    btn.appendChild(count);
    btn.addEventListener('click', function () { openExerciseList(g.name); });
    grid.appendChild(btn);
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
    p.textContent = 'Nada encontrado.';
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

  $('form-exercise').textContent = draft.exercise || 'Novo exercicio';
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
    $('f-notes').value = entry.notes || '';
    $('last-chip').hidden = true;
  } else {
    // Prefill do ultimo treino deste exercicio: o app abre ja preenchido e
    // voce so ajusta o que mudou.
    var last = draft.exercise ? lastEntryFor(draft.exercise) : null;
    $('f-sets').value = last ? (last.sets || '') : '';
    $('f-reps').value = last ? (last.reps || '') : '';
    $('f-weight').value = last ? (last.weight || '') : '';
    $('f-rpe').value = last ? (last.rpe || '') : '';
    $('f-notes').value = '';
    var chip = $('last-chip');
    if (last) {
      chip.hidden = false;
      chip.innerHTML = '';
      var line = document.createElement('span');
      line.textContent = 'Ultimo: ' + summarize(last);
      var sub = document.createElement('small');
      sub.textContent = shortDate(last.date) + ' - toque para reusar';
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
  if (!name) { toast('Informe o nome do exercicio'); return; }

  var group1 = draft.custom ? $('f-group').value : draft.group1;
  var group2 = draft.custom ? group1 : draft.group2;

  var sets = $('f-sets').value.trim();
  var reps = $('f-reps').value.trim();
  if (!sets && !reps) { toast('Informe ao menos series ou reps'); return; }

  if (editing) {
    editing.exercise = name;
    editing.group1 = group1;
    editing.group2 = group2;
    editing.sets = sets;
    editing.reps = reps;
    editing.weight = $('f-weight').value.trim();
    editing.rpe = $('f-rpe').value.trim();
    editing.notes = $('f-notes').value.trim();
    // Editar apos a sincronizacao criaria uma linha nova no Sheets com id
    // diferente. Mantemos o id e marcamos como pendente: o Apps Script vai
    // reconhecer o id e ignorar, entao a correcao e feita a mao na planilha.
    if (editing.synced) toast('Ja sincronizado - corrija tambem no Sheets');
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
  sync(false);
}

function deleteEntry() {
  if (!editing) return;
  if (!confirm('Excluir "' + editing.exercise + '"?')) return;
  if (editing.synced) toast('Ja sincronizado - apague tambem no Sheets');
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
  $('queue-info').textContent = pending().length + ' registro(s) aguardando envio. '
    + entries.length + ' no total neste aparelho.';
  show('screen-settings');
}

function saveSettings() {
  settings.url = $('s-url').value.trim();
  settings.token = $('s-token').value.trim();
  save(K_SETTINGS, settings);
  toast('Salvo');
}

function testSync() {
  var status = $('settings-status');
  if (!settings.url) { status.textContent = 'Salve a URL primeiro.'; return; }
  status.textContent = 'Testando...';
  fetch(settings.url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ token: settings.token, entries: [] })
  })
    .then(function (r) { return r.json(); })
    .then(function (res) {
      status.textContent = res.ok ? 'Conexao OK.' : 'Recusado: ' + res.error;
    })
    .catch(function (err) {
      status.textContent = 'Falhou: ' + err.message
        + ' (confira se o deploy esta como "Anyone")';
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
$('open-settings').addEventListener('click', openSettings);
$('sync-badge').addEventListener('click', function () { sync(true); });

$('add-exercise').addEventListener('click', function () { renderGroups(); show('screen-group'); });
$('finish').addEventListener('click', finishSession);

$('search').addEventListener('input', function () { renderExercises(this.value); });
$('custom-exercise').addEventListener('click', openCustomForm);

$('last-chip').addEventListener('click', function () {
  var last = lastEntryFor(draft.exercise);
  if (!last) return;
  $('f-sets').value = last.sets || '';
  $('f-reps').value = last.reps || '';
  $('f-weight').value = last.weight || '';
  $('f-rpe').value = last.rpe || '';
  toast('Valores do ultimo treino');
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
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  });
}
