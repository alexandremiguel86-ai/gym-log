/**
 * GYM LOG - recebedor de registros de treino.
 *
 * Instalacao (uma vez):
 *  1. Crie uma planilha nova no Google Sheets. Renomeie a primeira aba para LOG.
 *  2. Abra um editor de Apps Script, de um destes dois jeitos:
 *        a) pela planilha: Extensoes > Apps Script  (nao precisa de SHEET_ID)
 *        b) avulso, em script.google.com             (precisa de SHEET_ID)
 *     Cole este arquivo por cima do Code.gs padrao.
 *  3. Project Settings (engrenagem) > Script Properties > Add script property:
 *        TOKEN    = <uma string aleatoria longa, so sua>
 *        SHEET_ID = <so no caso (b): o trecho entre /d/ e /edit na URL da planilha>
 *     O token NAO fica neste arquivo, para poder versionar o codigo com seguranca.
 *  4. Rode setup() uma vez pelo editor (cria o cabecalho e autoriza o script).
 *     O resultado aparece em "Execution log".
 *  5. Deploy > New deployment > Web app
 *        Execute as:      Me
 *        Who has access:  Anyone
 *     Copie a URL /exec. Ela + o TOKEN sao a credencial do app: cole os dois
 *     na tela de Configuracoes do PWA e nao guarde em lugar publico.
 *
 * Toda vez que voce alterar este arquivo, e preciso Deploy > Manage deployments >
 * editar > Version: New version. Sem isso a URL continua servindo o codigo antigo.
 */

var SHEET_NAME = 'LOG';

var HEADERS = [
  'id', 'synced_at', 'session_id', 'date', 'exercise',
  'group1', 'group2', 'sets', 'reps', 'weight', 'rpe', 'notes', 'custom'
];

function setup() {
  var sheet = getSheet_();
  Logger.log('OK: aba "' + sheet.getName() + '" pronta em "' +
             getSpreadsheet_().getName() + '".');
  return sheet.getName();
}

/**
 * Funciona tanto num script criado pela planilha (Extensoes > Apps Script)
 * quanto num script avulso. No avulso, getActiveSpreadsheet() devolve null,
 * entao abrimos pelo id guardado na Script Property SHEET_ID.
 */
function getSpreadsheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss) return ss;

  var id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (!id) {
    throw new Error(
      'Script avulso sem SHEET_ID. Adicione a Script Property SHEET_ID com o id ' +
      'da planilha (o trecho entre /d/ e /edit na URL do Google Sheets).');
  }
  return SpreadsheetApp.openById(id);
}

function getSheet_() {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
  }
  // Colunas de texto puro. Sem isso o Sheets converte "10-12" em data e
  // "20kg + Bar" continua texto mas "3" vira numero - o Excel precisa do
  // valor literal que foi digitado.
  sheet.getRange('D:D').setNumberFormat('@'); // date (YYYY-MM-DD como texto)
  sheet.getRange('H:L').setNumberFormat('@'); // sets, reps, weight, rpe, notes
  return sheet;
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** GET serve so para testar no navegador se o deploy esta no ar. */
function doGet() {
  return json_({ ok: true, service: 'gym-log', headers: HEADERS });
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return json_({ ok: false, error: 'empty_body' });
    }

    var body = JSON.parse(e.postData.contents);
    var expected = PropertiesService.getScriptProperties().getProperty('TOKEN');

    if (!expected) return json_({ ok: false, error: 'token_not_configured' });
    if (body.token !== expected) return json_({ ok: false, error: 'bad_token' });

    var entries = body.entries || [];
    if (!entries.length) return json_({ ok: true, accepted: [] });

    // Lock: dois envios simultaneos poderiam ler o mesmo lastRow e duplicar.
    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      var sheet = getSheet_();
      var known = existingIds_(sheet);
      var now = new Date();
      var rows = [];
      var accepted = [];

      for (var i = 0; i < entries.length; i++) {
        var entry = entries[i];
        if (!entry || !entry.id) continue;
        // Ja gravado num envio anterior que falhou so na resposta: confirma de novo
        // para o app poder tirar da fila, mas nao escreve segunda linha.
        if (known[entry.id]) { accepted.push(entry.id); continue; }
        known[entry.id] = true;
        accepted.push(entry.id);
        rows.push([
          entry.id,
          now,
          str_(entry.session_id),
          str_(entry.date),
          str_(entry.exercise),
          str_(entry.group1),
          str_(entry.group2),
          str_(entry.sets),
          str_(entry.reps),
          str_(entry.weight),
          str_(entry.rpe),
          str_(entry.notes),
          entry.custom ? 'TRUE' : ''
        ]);
      }

      if (rows.length) {
        sheet
          .getRange(sheet.getLastRow() + 1, 1, rows.length, HEADERS.length)
          .setValues(rows);
      }

      return json_({ ok: true, accepted: accepted, written: rows.length });
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function existingIds_(sheet) {
  var last = sheet.getLastRow();
  var map = {};
  if (last < 2) return map;
  var ids = sheet.getRange(2, 1, last - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    var id = ids[i][0];
    if (id) map[String(id)] = true;
  }
  return map;
}

/**
 * Forca texto. Sem isso o Sheets interpreta "3" como numero e, pior, transforma
 * "10-12" em data. Os campos sets/reps/weight precisam chegar ao Excel exatamente
 * como foram digitados ("40s", "20kg + Bar").
 */
function str_(v) {
  if (v === null || v === undefined) return '';
  return String(v);
}
