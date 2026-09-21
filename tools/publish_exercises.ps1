# Regera docs/exercises.json a partir do Tennis.xlsm e publica no GitHub Pages.
#
# Chamado pelo botao "Update Exercise List" da aba Off_Court, mas tambem roda
# sozinho:  powershell -ExecutionPolicy Bypass -File tools\publish_exercises.ps1
#
# Escreve um relatorio legivel no stdout; o VBA captura e mostra numa MsgBox.
# Codigo de saida 0 = sucesso (inclusive "nada mudou"), 1 = falhou.
#
# NOTA sobre PowerShell 5.1: nunca use "2>&1" num executavel nativo aqui. O 5.1
# embrulha cada linha de stderr num ErrorRecord e, com ErrorActionPreference
# 'Stop', mata o script - e o "git push" escreve o progresso em stderr mesmo
# quando da certo. Por isso so o $LASTEXITCODE decide sucesso ou falha.

$ErrorActionPreference = 'Continue'
$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo

function Fail($msg) {
    Write-Output ""
    Write-Output "ERRO: $msg"
    exit 1
}

# ---- 1. regera o JSON a partir da planilha -----------------------------

Write-Output "1/3  Lendo Tennis.xlsm..."

$build = & python "tools\build_exercises.py"
if ($LASTEXITCODE -ne 0) { Fail "build_exercises.py falhou:`r`n$($build -join "`r`n")" }

# A 1a linha e "<caminho>: N exercicios em M grupos". Pegamos so o trecho do
# resumo - o caminho tem "D:" e quebraria um split ingenuo por ":".
$resumo = "lista atualizada"
foreach ($line in $build) {
    if ($line -match '(\d+\s+exercicios\s+em\s+\d+\s+grupos)') { $resumo = $Matches[1]; break }
}
Write-Output "     $resumo"

# ---- 2. ha mudanca? ---------------------------------------------------

$status = & git status --porcelain -- "docs/exercises.json"
if ($LASTEXITCODE -ne 0) { Fail "git status falhou." }

if ([string]::IsNullOrWhiteSpace(($status -join ''))) {
    Write-Output ""
    Write-Output "Nada mudou - a lista no celular ja esta igual a da planilha."
    Write-Output "($resumo)"
    exit 0
}

Write-Output "2/3  A lista mudou."

# ---- 3. commit + push -------------------------------------------------

Write-Output "3/3  Publicando no GitHub Pages..."

& git add "docs/exercises.json" | Out-Null
if ($LASTEXITCODE -ne 0) { Fail "git add falhou." }

& git -c commit.gpgsign=false commit -m "Atualiza lista de exercicios ($resumo)" | Out-Null
if ($LASTEXITCODE -ne 0) { Fail "git commit falhou." }

# O push escreve progresso em stderr mesmo quando funciona; ignoramos o texto
# e olhamos so o codigo de saida.
& git push origin main 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
    Fail "git push falhou (codigo $LASTEXITCODE). O commit foi feito localmente; " +
         "rode 'git push' na pasta do projeto para investigar."
}

Write-Output ""
Write-Output "Publicado: $resumo"
Write-Output ""
Write-Output "O GitHub Pages leva ~1 minuto para reconstruir."
Write-Output "No iPhone, feche o app (deslize para cima) e abra de novo."
exit 0
