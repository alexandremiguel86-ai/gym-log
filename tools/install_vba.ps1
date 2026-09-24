# (Re)instala os modulos VBA no Tennis.xlsm.
#
#   powershell -ExecutionPolicy Bypass -File tools\install_vba.ps1
#
# Idempotente: remove o modulo antigo antes de importar, entao pode rodar
# sempre que um .bas mudar.
#
# NAO MEXE EM BOTAO NENHUM. Os botoes da aba Off_Court (incluindo o "Filter
# List", que e do usuario) sao layout dele: legendas, posicoes e macros
# atribuidas ficam como ele deixou. Este script so troca codigo.
#
# Requisitos:
#   - O Tennis.xlsm FECHADO.
#   - Excel > Arquivo > Opcoes > Central de Confiabilidade > Configuracoes da
#     Central de Confiabilidade > Configuracoes de Macro >
#     "Confiar no acesso ao modelo de objeto do projeto do VBA" LIGADO.
#     (equivale a HKCU:\...\Office\16.0\Excel\Security\AccessVBOM = 1)

$ErrorActionPreference = 'Stop'

$Workbook = 'D:\ALEXANDRE\CLAUDE\PROJECT_TENNIS_PERFORMANCE_TEAM\Tennis.xlsm'
$repo = Split-Path -Parent $PSScriptRoot

# Modulo -> arquivo .bas. Cada modulo mora junto do projeto dono dele:
# os dois do Gym Log aqui, e o Module_OffCourtSync no projeto de tenis, que
# e quem gera o markdown. Um modulo ausente e apenas pulado, para este
# repositorio continuar utilizavel sozinho.
$modules = [ordered]@{
    'Module_OffCourtImport' = "$repo\vba\Module_OffCourtImport.bas"
    'Module_GymLogButtons'  = "$repo\vba\Module_GymLogButtons.bas"
    'Module_OffCourtSync'   = 'D:\ALEXANDRE\CLAUDE\PROJECT_TENNIS_PERFORMANCE_TEAM\tools\Module_OffCourtSync.bas'
}

if (-not (Test-Path $Workbook)) { throw "Nao encontrei $Workbook" }

# Um backup por execucao, em backups\ para nao poluir a raiz do projeto de
# tenis, que e onde ficam os arquivos de conhecimento #00..#06.
$backupDir = Join-Path (Split-Path $Workbook) 'backups'
if (-not (Test-Path $backupDir)) { New-Item -ItemType Directory -Path $backupDir | Out-Null }
$backup = Join-Path $backupDir (
    '{0}_backup_{1}{2}' -f [IO.Path]::GetFileNameWithoutExtension($Workbook),
                           (Get-Date -Format 'yyyyMMdd_HHmmss'),
                           [IO.Path]::GetExtension($Workbook))
Copy-Item $Workbook $backup
Write-Output "backup: $backup"

$xl = $null; $wb = $null
try {
    $xl = New-Object -ComObject Excel.Application
    $xl.Visible = $false
    $xl.DisplayAlerts = $false
    $xl.AutomationSecurity = 1        # msoAutomationSecurityLow: habilita macros
    $wb = $xl.Workbooks.Open($Workbook)

    try { $null = $wb.VBProject.VBComponents.Count }
    catch { throw "Sem acesso ao projeto VBA. Ligue 'Confiar no acesso ao modelo de objeto do projeto do VBA' na Central de Confiabilidade do Excel." }

    foreach ($name in $modules.Keys) {
        $path = $modules[$name]
        if (-not (Test-Path $path)) {
            Write-Output "pulado : $name  (nao achei $path)"
            continue
        }
        foreach ($c in @($wb.VBProject.VBComponents)) {
            if ($c.Name -eq $name) { $wb.VBProject.VBComponents.Remove($c) }
        }
        $null = $wb.VBProject.VBComponents.Import($path)
        $m = $wb.VBProject.VBComponents($name).CodeModule
        Write-Output ("modulo : {0} ({1} linhas)" -f $name, $m.CountOfLines)
    }

    # Rodar qualquer macro compila o projeto inteiro: um erro de sintaxe em
    # qualquer modulo estoura aqui, antes de salvar.
    $check = $xl.Run("'" + $wb.Name + "'!GymLogConfigCheck")
    Write-Output "compilou: projeto sem erro de sintaxe"
    Write-Output "          ($check)"

    $wb.Save()
    Write-Output ""
    Write-Output "--- botoes na aba Off_Court (nao tocados) ---"
    foreach ($s in $wb.Worksheets('Off_Court').Shapes) {
        Write-Output ("  {0,-24} -> {1}" -f $s.Name, $s.OnAction)
    }
    $wb.Close($true); $wb = $null
    Write-Output ""
    Write-Output "Salvo."
}
finally {
    if ($wb) { $wb.Close($false) }
    if ($xl) {
        $xl.Quit()
        [void][Runtime.InteropServices.Marshal]::ReleaseComObject($xl)
    }
}
