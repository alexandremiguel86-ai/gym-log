# (Re)instala os modulos VBA e os botoes da aba Off_Court do Tennis.xlsm.
#
# Idempotente: remove o modulo/botao antigo antes de recriar, entao pode rodar
# sempre que os .bas mudarem.
#
#   powershell -ExecutionPolicy Bypass -File tools\setup_buttons.ps1
#
# Requisitos:
#   - O Tennis.xlsm FECHADO.
#   - Excel > Arquivo > Opcoes > Central de Confiabilidade > Configuracoes da
#     Central de Confiabilidade > Configuracoes de Macro >
#     "Confiar no acesso ao modelo de objeto do projeto do VBA" LIGADO.
#     (equivale a HKCU:\...\Office\16.0\Excel\Security\AccessVBOM = 1)

$ErrorActionPreference = 'Stop'

$Workbook = 'D:\ALEXANDRE\CLAUDE\PROJECT_TENNIS_PERFORMANCE_TEAM\Tennis.xlsm'
$SheetName = 'Off_Court'
$repo = Split-Path -Parent $PSScriptRoot

# nome do modulo -> arquivo .bas
$modules = [ordered]@{
    'Module_OffCourtImport' = "$repo\vba\Module_OffCourtImport.bas"
    'Module_GymLogButtons'  = "$repo\vba\Module_GymLogButtons.bas"
}

# nome do botao -> legenda, macro, esquerda, topo, largura, altura
# O btnUpdateOffCourtLog (que ja existia) ocupa L=326..391; estes vem depois,
# e param antes da coluna H (left=567), onde comeca a lista de referencia.
$buttons = [ordered]@{
    'btnImportGymLog'        = @{ Caption = 'Import Gym Log';       Macro = 'ImportGymLog';        Left = 396; Top = 6; Width = 80; Height = 32 }
    'btnPublishExerciseList' = @{ Caption = 'Update Exercise List'; Macro = 'PublishExerciseList'; Left = 480; Top = 6; Width = 84; Height = 32 }
}

if (-not (Test-Path $Workbook)) { throw "Nao encontrei $Workbook" }
foreach ($f in $modules.Values) { if (-not (Test-Path $f)) { throw "Nao encontrei $f" } }

# Um backup por dia, para nao acumular lixo se rodar varias vezes.
$backup = Join-Path (Split-Path $Workbook) (
    '{0}_backup_{1}{2}' -f [IO.Path]::GetFileNameWithoutExtension($Workbook),
                           (Get-Date -Format 'yyyyMMdd'),
                           [IO.Path]::GetExtension($Workbook))
if (-not (Test-Path $backup)) {
    Copy-Item $Workbook $backup
    Write-Output "backup: $backup"
} else {
    Write-Output "backup de hoje ja existe: $backup"
}

$xl = $null; $wb = $null
try {
    $xl = New-Object -ComObject Excel.Application
    $xl.Visible = $false
    $xl.DisplayAlerts = $false
    $wb = $xl.Workbooks.Open($Workbook)

    try { $null = $wb.VBProject.VBComponents.Count }
    catch { throw "Sem acesso ao projeto VBA. Ligue 'Confiar no acesso ao modelo de objeto do projeto do VBA' na Central de Confiabilidade do Excel." }

    # ---- modulos ------------------------------------------------------
    foreach ($name in $modules.Keys) {
        foreach ($c in @($wb.VBProject.VBComponents)) {
            if ($c.Name -eq $name) { $wb.VBProject.VBComponents.Remove($c) }
        }
        $null = $wb.VBProject.VBComponents.Import($modules[$name])
        Write-Output "modulo: $name"
    }

    # ---- botoes -------------------------------------------------------
    $ws = $wb.Worksheets($SheetName)
    foreach ($name in $buttons.Keys) {
        foreach ($s in @($ws.Shapes)) { if ($s.Name -eq $name) { $s.Delete() } }
        $spec = $buttons[$name]
        $b = $ws.Buttons().Add($spec.Left, $spec.Top, $spec.Width, $spec.Height)
        $b.Name = $name
        $b.Caption = $spec.Caption
        $b.OnAction = $spec.Macro
        Write-Output ("botao : {0}  ->  {1}" -f $spec.Caption, $spec.Macro)
    }

    $wb.Save()
    Write-Output ""
    Write-Output "--- botoes na aba $SheetName ---"
    foreach ($s in $ws.Shapes) {
        Write-Output ("  {0,-24} L={1,-4} -> {2}" -f $s.Name, [math]::Round($s.Left), $s.OnAction)
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
