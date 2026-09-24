# Invariantes do Gym Log

Regras que seria **erro** violar. O `README.md` tem o resto (setup, arquivos, URLs).

## 1. Este repositório é público

Vai para `github.com/alexandremiguel86-ai/gym-log` e é servido pelo GitHub Pages.
Nada de token, URL de Apps Script, dado de treino ou qualquer coisa vinda de
`D:\ALEXANDRE\CLAUDE\PROJECT_TENNIS_PERFORMANCE_TEAM` — aquela pasta tem prontuário
médico. Segredos ficam no `localStorage` do iPhone, nas Script Properties do Apps Script
e no `config.local.txt` (que está no `.gitignore`).

## 2. `sets`, `reps` e `weight` são texto — nunca número

Em todo o caminho: formulário, JSON, Apps Script, Sheets, Excel. `"40s"` e `"20kg + Bar"`
são valores reais na planilha do usuário. Nada de `parseInt`, validação numérica ou
`type="number"`. O `Code.gs` força `setNumberFormat('@')` porque senão o Sheets converte
`"10-12"` em data.

Uma linha por exercício, não por série.

## 3. O app não gera markdown

Ele alimenta `Off_Court!B5:G` e para por aí. O bloco de `#06_TRAINING_LOG.md` é gerado
por `Module_OffCourtSync`, dentro do `Tennis.xlsm`. Pedido de mudança no formato do log
se resolve lá, nunca aqui e nunca editando o markdown à mão.

## 4. `docs/exercises.json` é gerado

Vem de `Off_Court!H:I/J` via `tools/build_exercises.py`. Editar à mão é trabalho perdido:
o próximo build sobrescreve.

## 5. Mexeu no shell? suba o `CACHE` do `sw.js`

`index.html`, `app.js` ou `styles.css` alterados sem subir `gymlog-vN` = o iPhone continua
servindo a versão antiga indefinidamente. `exercises.json` é exceção: é network-first de
propósito, para o botão "Update Exercise List" ter efeito na próxima abertura.

## 6. Armadilhas desta máquina

- **PowerShell 5.1: nunca `2>&1` em executável nativo.** Ele embrulha stderr em
  `ErrorRecord` e mata o script — e `git push` escreve progresso em stderr *mesmo quando
  dá certo*. Decidir sucesso só por `$LASTEXITCODE`.
- **Excel via COM deixa processo órfão** quando o script falha antes do `Quit()`. Um Excel
  órfão segurando o workbook faz o `Save()` seguinte falhar **em silêncio**. Usar
  `try/finally` e conferir `Get-Process EXCEL` quando o resultado não bater.
- **O `/exec` do Apps Script responde 302** e o corpo vem no `Location`. `curl -L` devolve
  `411` — mas o POST já foi executado e já gravou. Não é falha.
- **Console do Windows mostra `?` no lugar de acentos.** Conferir os bytes antes de
  concluir que o dado corrompeu.

## Antes de commitar

```bash
node tools/smoke_test.js
```
