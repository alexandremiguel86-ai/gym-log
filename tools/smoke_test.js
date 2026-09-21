/* Teste de fumaca do app.js sem navegador.
 *
 * Monta um DOM minimo a partir dos id= do index.html, carrega o app.js e
 * simula um treino inteiro: iniciar, registrar dois exercicios, conferir o
 * prefill do historico, editar, excluir, finalizar e sincronizar.
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
function fill(sets, reps, weight, rpe, notes) {
  el('f-sets').value = sets;
  el('f-reps').value = reps;
  el('f-weight').value = weight || '';
  el('f-rpe').value = rpe || '';
  el('f-notes').value = notes || '';
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

Promise.resolve()
  .then(function () { return new Promise(function (r) { setTimeout(r, 30); }); })
  .then(function () {
    console.log('\n1. Boot');
    check('abre no Inicio', active() === 'screen-home', active());
    check('88 exercicios carregados',
      catalog.groups.reduce(function (a, g) { return a + g.exercises.length; }, 0) === 88);

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
    check('12 grupos', el('group-grid').children.length === 12, el('group-grid').children.length);
    el('group-grid').children[0].click();   // Back (ordem alfabetica)
    check('tela de exercicios', active() === 'screen-exercise', active());
    pick('Single-Arm Dumbbell Row').click();
    check('tela de formulario', active() === 'screen-form', active());
    check('sem historico ainda -> chip oculto', el('last-chip').hidden === true);
    fill('2', '10', '25kg', '7', 'ombro ok');
    el('save-entry').click();
    check('volta para a sessao', active() === 'screen-session', active());
    check('1 registro gravado', entries().length === 1, entries().length);
    check('valores gravados como texto',
      entries()[0].sets === '2' && entries()[0].weight === '25kg');
    check('group1/group2 preenchidos', entries()[0].group1 === 'Back');
  })
  .then(function () { return new Promise(function (r) { setTimeout(r, 20); }); })
  .then(function () {
    console.log('\n5. Sincronizacao automatica ao salvar');
    check('enviado ao servidor', Object.keys(serverIds).length === 1, Object.keys(serverIds).length);
    check('marcado como synced', entries()[0].synced === true);
    check('badge escondido', el('sync-badge').hidden === true);

    console.log('\n6. Exercicio com tempo (nao numerico)');
    el('add-exercise').click();
    // grupo Tennis Conditioning
    var idx = catalog.groups.map(function (g) { return g.name; }).indexOf('Tennis Conditioning');
    el('group-grid').children[idx].click();
    pick('Figure-8 Drill').click();
    fill('4', '40s', '', '', '');
    el('save-entry').click();
    var e2 = entries()[1];
    check('reps "40s" preservado', e2.reps === '40s', e2.reps);
    check('group2 = Footwork', e2.group2 === 'Footwork', e2.group2);
    check('2 registros na sessao', entries().length === 2);
  })
  .then(function () { return new Promise(function (r) { setTimeout(r, 20); }); })
  .then(function () {
    console.log('\n7. Finalizar e iniciar um novo treino');
    el('finish').click();
    check('volta para o Inicio', active() === 'screen-home', active());
    check('sessao encerrada', localStorage.getItem('gymlog.session') === null);

    el('start').click();
    el('add-exercise').click();
    el('group-grid').children[0].click();   // Back
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
    check('notes NAO prefilled', el('f-notes').value === '', el('f-notes').value);

    // so mudou a carga
    el('f-weight').value = '27.5kg';
    el('save-entry').click();
    check('3 registros no total', entries().length === 3, entries().length);
    check('nova sessao separada', entries()[2].session_id !== entries()[0].session_id);
  })
  .then(function () { return new Promise(function (r) { setTimeout(r, 20); }); })
  .then(function () {
    console.log('\n9. Offline: fila e reenvio');
    networkUp = false;
    el('add-exercise').click();
    var idx = catalog.groups.map(function (g) { return g.name; }).indexOf('Core');
    el('group-grid').children[idx].click();
    pick('Swiss Ball Crunch').click();
    fill('5', '20', '', '', '');
    el('save-entry').click();
    check('gravado localmente mesmo offline', entries().length === 4, entries().length);
    check('marcado como pendente', entries()[3].synced !== true);
    return new Promise(function (r) { setTimeout(r, 20); });
  })
  .then(function () {
    check('badge mostra pendencia', el('sync-badge').textContent.indexOf('1 pendente') === 0,
      el('sync-badge').textContent);
    networkUp = true;
    el('sync-badge').click();
    return new Promise(function (r) { setTimeout(r, 20); });
  })
  .then(function () {
    check('sincronizado ao voltar a rede', entries()[3].synced === true);
    check('4 linhas no servidor', Object.keys(serverIds).length === 4, Object.keys(serverIds).length);

    console.log('\n10. Dedupe: reenviar nao duplica');
    // forca tudo para pendente e reenvia
    var all = entries();
    all.forEach(function (e) { e.synced = false; });
    localStorage.setItem('gymlog.entries', JSON.stringify(all));
    vm.runInContext('entries = JSON.parse(localStorage.getItem("gymlog.entries"));', sandbox);
    vm.runInContext('sync(true);', sandbox);
    return new Promise(function (r) { setTimeout(r, 20); });
  })
  .then(function () {
    check('servidor continua com 4 ids', Object.keys(serverIds).length === 4, Object.keys(serverIds).length);

    console.log('\n11. Exercicio fora da lista');
    el('add-exercise').click();
    el('group-grid').children[0].click();
    el('custom-exercise').click();
    check('campos custom visiveis', el('custom-fields').hidden === false);
    check('select de grupos preenchido', el('f-group').children.length === 12, el('f-group').children.length);
    el('f-name').value = 'Landmine Press';
    el('f-group').value = 'Shoulder';
    fill('3', '8', '15kg', '7', '');
    el('save-entry').click();
    var last = entries()[entries().length - 1];
    check('exercicio custom gravado', last.exercise === 'Landmine Press', last.exercise);
    check('marcado como custom', last.custom === true);
    check('grupo escolhido da lista', last.group1 === 'Shoulder', last.group1);
  })
  .then(function () { return new Promise(function (r) { setTimeout(r, 20); }); })
  .then(function () {
    console.log('\n12. Editar e excluir');
    var n = entries().length;
    el('entry-list').children[el('entry-list').children.length - 1].children[0].click();
    check('abre o formulario em modo edicao', active() === 'screen-form', active());
    check('botao excluir visivel', el('delete-entry').hidden === false);
    check('valores carregados', el('f-sets').value === '3', el('f-sets').value);
    el('f-sets').value = '4';
    el('save-entry').click();
    check('nao criou registro novo', entries().length === n, entries().length);
    check('edicao aplicada', entries()[n - 1].sets === '4', entries()[n - 1].sets);

    el('entry-list').children[el('entry-list').children.length - 1].children[0].click();
    el('delete-entry').click();
    check('registro excluido', entries().length === n - 1, entries().length);

    console.log('\n13. Validacao');
    el('add-exercise').click();
    el('group-grid').children[0].click();
    pick('Single-Arm Dumbbell Row').click();
    fill('', '', '', '', '');
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

    console.log('\n' + (failures ? failures + ' FALHA(S)' : 'Todos os testes passaram.'));
    process.exit(failures ? 1 : 0);
  })
  .catch(function (err) {
    console.error('\nERRO: ' + err.stack);
    process.exit(1);
  });
