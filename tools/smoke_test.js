/* Teste de fumaca do app.js sem navegador.
 *
 * Monta um DOM minimo a partir dos id= do index.html, carrega o app.js e
 * simula treinos inteiros: iniciar, registrar, conferir o prefill do historico,
 * editar, excluir, finalizar (so entao sincroniza), descartar e consultar os
 * treinos anteriores.
 *
 * Nao substitui o teste no iPhone (layout, Safari, service worker), mas pega
 * erros de referencia e de logica de estado, que sao a maioria.
 *
 * Uso:  node tools/smoke_test.js
 */

'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var DOCS = path.join(__dirname, '..', 'docs');
var html = fs.readFileSync(path.join(DOCS, 'index.html'), 'utf8');
var appjs = fs.readFileSync(path.join(DOCS, 'app.js'), 'utf8');
var catalog = JSON.parse(fs.readFileSync(path.join(DOCS, 'exercises.json'), 'utf8'));

// ------------------------------------------------------------ DOM minimo

function El(tag, id) {
  this.tagName = (tag || 'div').toUpperCase();
  this.id = id || '';
  this.children = [];
  this.listeners = {};
  this.className = '';
  this._text = '';
  this.value = '';
  this.hidden = false;
  this.style = { _props: {}, setProperty: function (k, v) { this._props[k] = v; } };
  this.classList = {
    _self: this,
    add: function (c) { if (!this._self._classes().includes(c)) this._self.className = (this._self.className + ' ' + c).trim(); },
    remove: function (c) { this._self.className = this._self._classes().filter(function (x) { return x !== c; }).join(' '); },
    contains: function (c) { return this._self._classes().includes(c); }
  };
}
El.prototype._classes = function () { return this.className.split(/\s+/).filter(Boolean); };
El.prototype.appendChild = function (c) { this.children.push(c); return c; };
El.prototype.addEventListener = function (t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); };
El.prototype.click = function () {
  var self = this;
  (this.listeners.click || []).forEach(function (fn) { fn.call(self, {}); });
};
El.prototype.dispatch = function (type) {
  var self = this;
  (this.listeners[type] || []).forEach(function (fn) { fn.call(self, {}); });
};
Object.defineProperty(El.prototype, 'textContent', {
  get: function () {
    if (this.children.length) return this.children.map(function (c) { return c.textContent; }).join('');
    return this._text;
  },
  set: function (v) { this._text = String(v); this.children = []; }
});
Object.defineProperty(El.prototype, 'innerHTML', {
  get: function () { return this.textContent; },
  set: function (v) { this._text = ''; this.children = []; }
});

var byId = {};
var re = /<(\w+)[^>]*\bid="([^"]+)"/g;
var m;
while ((m = re.exec(html))) byId[m[2]] = new El(m[1], m[2]);

// as <section class="screen"> precisam ser encontradas por querySelectorAll
var screens = Object.keys(byId)
  .filter(function (k) { return k.indexOf('screen-') === 0; })
  .map(function (k) { byId[k].className = 'screen'; return byId[k]; });

var document = {
  getElementById: function (id) {
    if (!byId[id]) throw new Error('getElementById nulo: ' + id);
    return byId[id];
  },
  querySelectorAll: function (sel) {
    if (sel === '.screen') return screens;
    return [];
  },
  querySelector: function () { return null; },
  createElement: function (tag) { return new El(tag); },
  addEventListener: function () {}
};

// ------------------------------------------------------------ ambiente

var store = {};
var localStorage = {
  getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
  setItem: function (k, v) { store[k] = String(v); },
  removeItem: function (k) { delete store[k]; }
};

var posted = [];
var serverIds = {};
var networkUp = true;

function fakeFetch(url, opts) {
  if (url === 'exercises.json') {
    return Promise.resolve({ json: function () { return Promise.resolve(catalog); } });
  }
  if (!networkUp) return Promise.reject(new Error('offline'));
  var body = JSON.parse(opts.body);
  posted.push(body);
  if (body.token !== 'TESTTOKEN') {
    return Promise.resolve({ json: function () { return Promise.resolve({ ok: false, error: 'bad_token' }); } });
  }
  var accepted = [];
  (body.entries || []).forEach(function (e) { serverIds[e.id] = e; accepted.push(e.id); });
  return Promise.resolve({ json: function () { return Promise.resolve({ ok: true, accepted: accepted }); } });
}

var confirmAnswer = true;
var sandbox = {
  document: document,
  localStorage: localStorage,
  fetch: fakeFetch,
  navigator: { onLine: true },
  setTimeout: setTimeout,
  clearTimeout: clearTimeout,
  confirm: function () { return confirmAnswer; },
  Promise: Promise,
  Blob: function () {},
  URL: { createObjectURL: function () { return ''; }, revokeObjectURL: function () {} },
  console: console
};
sandbox.window = sandbox;
sandbox.crypto = { randomUUID: (function () { var n = 0; return function () { return 'id-' + (++n); }; })() };
sandbox.window.addEventListener = function () {};
sandbox.window.scrollTo = function () {};

vm.createContext(sandbox);
vm.runInContext(appjs, sandbox, { filename: 'app.js' });

// ------------------------------------------------------------ helpers

var failures = 0;
function check(label, cond, extra) {
  if (cond) {
    console.log('  ok   ' + label);
  } else {
    failures++;
    console.log('  FAIL ' + label + (extra !== undefined ? '  -> ' + extra : ''));
  }
}
function active() {
  var a = screens.filter(function (s) { return s.classList.contains('active'); });
  return a.length === 1 ? a[0].id : '(' + a.length + ' telas ativas)';
}
function entries() { return JSON.parse(localStorage.getItem('gymlog.entries') || '[]'); }
function el(id) { return byId[id]; }
function fill(sets, reps, weight, rpe) {
  el('f-sets').value = sets;
  el('f-reps').value = reps;
  el('f-weight').value = weight || '';
  el('f-rpe').value = rpe || '';
}
/** Botoes de grupo, na ordem da tela: secoes (titulo + grade) em sequencia. */
function groupButtons() {
  var out = [];
  el('group-grid').children.forEach(function (c) {
    if (c.className === 'grid') out = out.concat(c.children);
  });
  return out;
}
/** Encontra o botao de um grupo na tela de grupos. */
function group(name) {
  var found = groupButtons().filter(function (b) { return b.textContent.indexOf(name) === 0; })[0];
  if (!found) throw new Error('grupo nao encontrado: ' + name);
  return found;
}
/** Encontra o botao de um exercicio na tela de lista. */
function pick(name) {
  var found = null;
  el('exercise-list').children.forEach(function (c) {
    if (!found && c.className === 'row-btn' && c.children.length && c.children[0].textContent === name) found = c;
  });
  if (!found) throw new Error('exercicio nao encontrado na lista: ' + name);
  return found;
}

// ------------------------------------------------------------ cenario

function wait(ms) { return new Promise(function (r) { setTimeout(r, ms || 20); }); }

Promise.resolve()
  .then(function () { return wait(30); })
  .then(function () {
    console.log('\n1. Boot');
    check('abre no Inicio', active() === 'screen-home', active());
    // Contagens derivadas do catalogo, nunca fixas: a lista cresce toda vez que
    // ele adiciona um exercicio na planilha, e um numero magico aqui quebraria
    // o teste sem que nada estivesse errado.
    check('catalogo nao vazio',
      catalog.groups.length > 0 &&
      catalog.groups.every(function (g) { return g.exercises.length > 0; }));
    check('sem campo de observacao', !byId['f-notes']);

    console.log('\n2. Configuracoes');
    el('s-url').value = 'https://script.google.com/fake/exec';
    el('s-token').value = 'TESTTOKEN';
    el('save-settings').click();
    check('settings persistidas', JSON.parse(localStorage.getItem('gymlog.settings')).token === 'TESTTOKEN');

    console.log('\n3. Iniciar treino');
    el('start').click();
    check('vai para a sessao', active() === 'screen-session', active());
    check('sessao salva', !!localStorage.getItem('gymlog.session'));

    console.log('\n4. Registrar primeiro exercicio');
    el('add-exercise').click();
    check('tela de grupos', active() === 'screen-group', active());
    check('um botao por grupo do catalogo',
      groupButtons().length === catalog.groups.length,
      groupButtons().length + ' vs ' + catalog.groups.length);
    var heads = el('group-grid').children
      .filter(function (c) { return c.className === 'cat-head'; })
      .map(function (c) { return c.textContent; });
    check('secoes na ordem Gym, Gym - Lower Body/Core, Mobility, Conditioning',
      heads.join('|') === 'Gym|Gym - Lower Body/Core|Mobility & Recovery|Conditioning', heads.join('|'));
    check('Back na secao Gym', el('group-grid').children[1].children[0].textContent.indexOf('Back') === 0);
    check('secao colorida', el('group-grid').children[0].style._props['--cat'] === '#00ff00');
    group('Back').click();
    check('tela de exercicios', active() === 'screen-exercise', active());
    pick('Single-Arm Dumbbell Row').click();
    check('tela de formulario', active() === 'screen-form', active());
    check('sem historico ainda -> chip oculto', el('last-chip').hidden === true);
    fill('2', '10', '25kg', '7');
    el('save-entry').click();
    check('volta para a sessao', active() === 'screen-session', active());
    check('1 registro gravado', entries().length === 1, entries().length);
    check('valores gravados como texto',
      entries()[0].sets === '2' && entries()[0].weight === '25kg');
    check('group1/group2 preenchidos', entries()[0].group1 === 'Back');
    check('notes vai vazio (coluna mantida no Sheets)', entries()[0].notes === '');
  })
  .then(function () { return wait(); })
  .then(function () {
    console.log('\n5. Nada e enviado com o treino aberto');
    check('servidor vazio', Object.keys(serverIds).length === 0, Object.keys(serverIds).length);
    check('nenhum POST', posted.length === 0, posted.length);
    check('badge escondido (treino aberto nao e pendencia)', el('sync-badge').hidden === true);
    el('sync-badge').click();
    vm.runInContext('sync(true);', sandbox);
    return wait();
  })
  .then(function () {
    check('sync manual tambem ignora o treino aberto', posted.length === 0, posted.length);

    console.log('\n6. Exercicio com tempo (nao numerico)');
    el('add-exercise').click();
    // grupo Tennis Conditioning
    group('Tennis Conditioning').click();
    pick('Figure-8 Drill').click();
    fill('4', '40s', '', '');
    el('save-entry').click();
    var e2 = entries()[1];
    check('reps "40s" preservado', e2.reps === '40s', e2.reps);
    check('group2 = Footwork', e2.group2 === 'Footwork', e2.group2);
    check('2 registros na sessao', entries().length === 2);
  })
  .then(function () { return wait(); })
  .then(function () {
    console.log('\n7. Finalizar pede confirmacao e so entao envia');
    confirmAnswer = false;
    el('finish').click();
    check('cancelar mantem o treino aberto', active() === 'screen-session', active());
    check('cancelar nao envia', posted.length === 0, posted.length);
    confirmAnswer = true;
    el('finish').click();
    check('volta para o Inicio', active() === 'screen-home', active());
    check('sessao encerrada', localStorage.getItem('gymlog.session') === null);
    return wait();
  })
  .then(function () {
    check('2 linhas no servidor', Object.keys(serverIds).length === 2, Object.keys(serverIds).length);
    check('marcados como synced', entries().every(function (e) { return e.synced === true; }));

    el('start').click();
    el('add-exercise').click();
    group('Back').click();
    var btn = pick('Single-Arm Dumbbell Row');
    check('lista mostra o ultimo valor', btn.textContent.indexOf('2x10 @ 25kg') !== -1, btn.textContent);
    btn.click();
    console.log('\n8. Prefill do historico');
    check('chip visivel', el('last-chip').hidden === false);
    check('chip mostra o ultimo', el('last-chip').textContent.indexOf('2x10 @ 25kg') !== -1,
      el('last-chip').textContent);
    check('sets prefilled', el('f-sets').value === '2', el('f-sets').value);
    check('reps prefilled', el('f-reps').value === '10', el('f-reps').value);
    check('weight prefilled', el('f-weight').value === '25kg', el('f-weight').value);

    // so mudou a carga
    el('f-weight').value = '27.5kg';
    el('save-entry').click();
    check('3 registros no total', entries().length === 3, entries().length);
    check('nova sessao separada', entries()[2].session_id !== entries()[0].session_id);

    console.log('\n9. Editar e excluir com o treino aberto');
    el('add-exercise').click();
    group('Core').click();
    pick('Swiss Ball Crunch').click();
    fill('5', '20', '', '');
    el('save-entry').click();
    var n = entries().length;
    var rows = el('entry-list').children;
    rows[rows.length - 1].children[0].click();
    check('abre o formulario em modo edicao', active() === 'screen-form', active());
    check('botao excluir visivel', el('delete-entry').hidden === false);
    check('valores carregados', el('f-sets').value === '5', el('f-sets').value);
    el('f-sets').value = '4';
    el('save-entry').click();
    check('nao criou registro novo', entries().length === n, entries().length);
    check('edicao aplicada', entries()[n - 1].sets === '4', entries()[n - 1].sets);

    el('entry-list').children[0].children[0].click();
    el('delete-entry').click();
    check('registro excluido', entries().length === n - 1, entries().length);
    check('sobrou o Swiss Ball Crunch', entries()[n - 2].exercise === 'Swiss Ball Crunch');
    check('nada enviado ainda', Object.keys(serverIds).length === 2, Object.keys(serverIds).length);
  })
  .then(function () {
    console.log('\n10. Offline ao finalizar: fila e reenvio');
    networkUp = false;
    el('finish').click();
    return wait();
  })
  .then(function () {
    check('gravado localmente mesmo offline', entries()[entries().length - 1].synced !== true);
    check('badge mostra pendencia', el('sync-badge').textContent.indexOf('1 pending') === 0,
      el('sync-badge').textContent);
    networkUp = true;
    el('sync-badge').click();
    return wait();
  })
  .then(function () {
    check('sincronizado ao voltar a rede', entries()[entries().length - 1].synced === true);
    check('edicao chegou ao servidor',
      serverIds[entries()[entries().length - 1].id].sets === '4');
    check('3 linhas no servidor', Object.keys(serverIds).length === 3, Object.keys(serverIds).length);

    console.log('\n11. Dedupe: reenviar nao duplica');
    // forca tudo para pendente e reenvia
    var all = entries();
    all.forEach(function (e) { e.synced = false; });
    localStorage.setItem('gymlog.entries', JSON.stringify(all));
    vm.runInContext('entries = JSON.parse(localStorage.getItem("gymlog.entries"));', sandbox);
    vm.runInContext('sync(true);', sandbox);
    return wait();
  })
  .then(function () {
    check('servidor continua com 3 ids', Object.keys(serverIds).length === 3, Object.keys(serverIds).length);

    console.log('\n12. Exercicio fora da lista');
    el('start').click();
    el('add-exercise').click();
    group('Back').click();
    el('custom-exercise').click();
    check('campos custom visiveis', el('custom-fields').hidden === false);
    check('select com todos os grupos',
      el('f-group').children.length === catalog.groups.length,
      el('f-group').children.length + ' vs ' + catalog.groups.length);
    el('f-name').value = 'Landmine Press';
    el('f-group').value = 'Shoulder';
    fill('3', '8', '15kg', '7');
    el('save-entry').click();
    var last = entries()[entries().length - 1];
    check('exercicio custom gravado', last.exercise === 'Landmine Press', last.exercise);
    check('marcado como custom', last.custom === true);
    check('grupo escolhido da lista', last.group1 === 'Shoulder', last.group1);

    console.log('\n13. Validacao');
    el('add-exercise').click();
    group('Back').click();
    pick('Single-Arm Dumbbell Row').click();
    fill('', '', '', '');
    var before = entries().length;
    el('save-entry').click();
    check('recusa registro sem series nem reps', entries().length === before, entries().length);
    check('continua no formulario', active() === 'screen-form', active());

    console.log('\n14. Navegacao (botao voltar)');
    vm.runInContext('goBack();', sandbox);
    check('form -> lista de exercicios', active() === 'screen-exercise', active());
    vm.runInContext('goBack();', sandbox);
    check('lista -> grupos', active() === 'screen-group', active());
    vm.runInContext('goBack();', sandbox);
    check('grupos -> sessao', active() === 'screen-session', active());
    vm.runInContext('goBack();', sandbox);
    check('sessao -> inicio', active() === 'screen-home', active());
    check('voltar oculto na raiz', el('back').hidden === true);
    check('inicio oferece continuar', el('resume').hidden === false && el('start').hidden === true);

    console.log('\n15. Descartar o treino aberto');
    el('resume').click();
    var n = entries().length;
    confirmAnswer = false;
    el('discard').click();
    check('cancelar mantem o treino', active() === 'screen-session' && entries().length === n);
    confirmAnswer = true;
    el('discard').click();
    check('volta para o Inicio', active() === 'screen-home', active());
    check('sessao encerrada', localStorage.getItem('gymlog.session') === null);
    check('exercicios do treino apagados', entries().length === n - 1, entries().length);
    check('nenhum registro de Landmine Press',
      entries().every(function (e) { return e.exercise !== 'Landmine Press'; }));
    return wait();
  })
  .then(function () {
    check('nada enviado do treino descartado', Object.keys(serverIds).length === 3,
      Object.keys(serverIds).length);

    console.log('\n16. Previous Workouts');
    el('start').click();                     // treino aberto nao aparece no historico
    vm.runInContext('goBack();', sandbox);
    el('open-history').click();
    check('tela de historico', active() === 'screen-history', active());
    var rows = el('history-list').children;
    check('2 treinos finalizados', rows.length === 2, rows.length);
    check('mesma data: o mais recente primeiro',
      rows[0].children[0].textContent.indexOf('1 exercise') !== -1, rows[0].children[0].textContent);
    rows[0].children[0].click();
    check('abre o treino', active() === 'screen-workout', active());
    check('mostra os exercicios', el('workout-list').children.length === 1 &&
      el('workout-list').children[0].textContent.indexOf('Swiss Ball Crunch') !== -1,
      el('workout-list').textContent);
    vm.runInContext('goBack();', sandbox);
    check('voltar -> historico', active() === 'screen-history', active());

    // Datas diferentes: ordem pela data, nao pela ordem de gravacao.
    vm.runInContext(
      'entries.push({ id: "o1", session_id: "old", date: "2020-01-05", exercise: "X", synced: true });' +
      'entries.push({ id: "n1", session_id: "new", date: "2099-01-05", exercise: "Y", synced: true });' +
      'entries.unshift({ id: "m1", session_id: "mid", date: "2050-01-05", exercise: "Z", synced: true });',
      sandbox);
    var order = vm.runInContext('finishedWorkouts().map(function (w) { return w.id; }).join(",")', sandbox);
    check('mais recente -> mais antigo',
      order.indexOf('new,mid,') === 0 && /,old$/.test(order), order);

    console.log('\n' + (failures ? failures + ' FALHA(S)' : 'Todos os testes passaram.'));
    process.exit(failures ? 1 : 0);
  })
  .catch(function (err) {
    console.error('\nERRO: ' + err.stack);
    process.exit(1);
  });
