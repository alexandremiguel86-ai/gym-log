Attribute VB_Name = "Module_GymLogButtons"
Option Explicit

'=======================================================================
' Module_GymLogButtons
'
' Publica a lista de exercicios de Off_Court!H:K no app do celular.
'
' Fluxo: salva esta planilha -> tools\translate_pt.py traduz o que ainda
'        nao tem portugues -> FillPortuguese escreve nas celulas VAZIAS de
'        L e N:O -> salva -> tools\publish_exercises.ps1 (build_exercises.py
'        regera docs\exercises.json -> git commit + push -> GitHub Pages).
'
' Portugues:  L    = EXERCISE (PT), na linha do exercicio
'             N:O  = glossario TERM (EN) | TERM (PT) dos GROUP 1/2/0
' Uma celula de L ou O ja preenchida nunca e sobrescrita: e assim que uma
' correcao feita a mao fica para sempre. Para retraduzir, apague a celula.
'
' O botao "Import Gym Log" chama ImportGymLog, que vive em
' Module_OffCourtImport. Este modulo cuida so da publicacao da lista.
'=======================================================================

Private Const REPO_DIR As String = "D:\ALEXANDRE\CLAUDE\GYM_LOG_APP"
Private Const PUBLISH_SCRIPT As String = "tools\publish_exercises.ps1"
Private Const TRANSLATE_SCRIPT As String = "tools\translate_pt.py"

Private Const SHEET_NAME As String = "Off_Court"
Private Const FIRST_ROW As Long = 3
Private Const COL_EN As String = "H"
Private Const COL_PT As String = "L"
Private Const COL_TERM_EN As String = "N"
Private Const COL_TERM_PT As String = "O"


'=======================================================================
' Ponto de entrada (botao "Update Exercise List")
'=======================================================================
Public Sub PublishExerciseList()
    Dim scriptPath As String
    scriptPath = REPO_DIR & "\" & PUBLISH_SCRIPT

    If Len(Dir$(scriptPath)) = 0 Then
        MsgBox "Nao encontrei:" & vbCrLf & scriptPath & vbCrLf & vbCrLf & _
               "Confira REPO_DIR no topo do Module_GymLogButtons.", _
               vbCritical, "Publicar lista"
        Exit Sub
    End If

    ' Os scripts leem o .xlsm do DISCO, nao a copia aberta na memoria. Sem
    ' salvar antes, um exercicio recem-digitado nao seria visto.
    If Not ThisWorkbook.Saved Then
        If MsgBox("A planilha tem alteracoes nao salvas." & vbCrLf & vbCrLf & _
                  "Salvar agora e publicar?", vbYesNo + vbQuestion, _
                  "Publicar lista") <> vbYes Then Exit Sub
    End If
    ThisWorkbook.Save

    Dim shell As Object
    Set shell = CreateObject("WScript.Shell")

    Application.Cursor = xlWait

    ' ---- 1. traduz o que e novo ------------------------------------------
    ' Falhar aqui nao impede a publicacao: o app mostra em ingles o que ficou
    ' sem traducao, e o proximo clique tenta de novo.
    Dim tsvFile As String, trLog As String, trReport As String
    tsvFile = Environ$("TEMP") & "\gymlog_translate.tsv"
    trLog = Environ$("TEMP") & "\gymlog_translate.txt"
    On Error Resume Next
    Kill tsvFile
    Kill trLog
    On Error GoTo 0

    Application.StatusBar = "Traduzindo exercicios novos para portugues..."
    shell.Run "cmd.exe /c set PYTHONIOENCODING=utf-8&& python """ & _
              REPO_DIR & "\" & TRANSLATE_SCRIPT & """ """ & tsvFile & _
              """ > """ & trLog & """ 2>&1", 0, True

    trReport = Trim$(ReadTextFile(trLog))
    If Len(Dir$(tsvFile)) > 0 Then
        trReport = trReport & vbCrLf & FillPortuguese(tsvFile)
        If Not ThisWorkbook.Saved Then ThisWorkbook.Save
    ElseIf Len(trReport) = 0 Then
        trReport = "Traducao: nao rodou (python nao encontrado?)."
    End If

    ' ---- 2. publica --------------------------------------------------------
    Dim outFile As String
    outFile = Environ$("TEMP") & "\gymlog_publish.txt"
    On Error Resume Next
    Kill outFile
    On Error GoTo 0

    Dim cmd As String
    cmd = "cmd.exe /c powershell.exe -NoProfile -ExecutionPolicy Bypass -File """ & _
          scriptPath & """ > """ & outFile & """ 2>&1"

    Application.StatusBar = "Publicando lista de exercicios..."

    Dim code As Long
    code = shell.Run(cmd, 0, True)          ' 0 = janela oculta, True = espera

    Application.Cursor = xlDefault
    Application.StatusBar = False

    Dim report As String
    report = ReadTextFile(outFile)
    If Len(Trim$(report)) = 0 Then
        report = "(o script nao produziu saida)"
    End If
    report = trReport & vbCrLf & vbCrLf & report

    If code = 0 Then
        MsgBox report, vbInformation, "Lista publicada"
    Else
        MsgBox "A publicacao falhou (codigo " & code & ")." & vbCrLf & vbCrLf & _
               report, vbCritical, "Publicar lista"
    End If
End Sub


'=======================================================================
' Portugues
'
' Le o arquivo gerado por translate_pt.py (UTF-8, separado por TAB):
'     E <TAB> nome em ingles <TAB> nome em portugues    -> coluna L
'     T <TAB> termo em ingles <TAB> termo em portugues  -> glossario N:O
' e escreve SO onde a celula esta vazia. E publica para poder ser chamada
' tambem por script, sem MsgBox.
'=======================================================================
Public Function FillPortuguese(tsvPath As String) As String
    Dim ws As Worksheet
    Set ws = ThisWorkbook.Worksheets(SHEET_NAME)

    Dim text As String
    text = ReadTextFile(tsvPath)
    text = Replace$(text, vbCrLf, vbLf)

    Dim lastEx As Long, lastTerm As Long
    lastEx = ws.Cells(ws.Rows.Count, COL_EN).End(xlUp).Row
    lastTerm = ws.Cells(ws.Rows.Count, COL_TERM_EN).End(xlUp).Row
    If lastTerm < FIRST_ROW - 1 Then lastTerm = FIRST_ROW - 1

    Dim lines() As String, parts() As String
    Dim i As Long, r As Long, nEx As Long, nTerm As Long, found As Boolean
    lines = Split(text, vbLf)
    For i = LBound(lines) To UBound(lines)
        parts = Split(lines(i), vbTab)
        If UBound(parts) = 2 Then
            If Len(Trim$(parts(2))) > 0 Then
                If parts(0) = "E" Then
                    For r = FIRST_ROW To lastEx
                        If Trim$(CStr(ws.Cells(r, COL_EN).Value & "")) = parts(1) Then
                            If Len(Trim$(CStr(ws.Cells(r, COL_PT).Value & ""))) = 0 Then
                                ws.Cells(r, COL_PT).Value = parts(2)
                                nEx = nEx + 1
                            End If
                        End If
                    Next r
                ElseIf parts(0) = "T" Then
                    found = False
                    For r = FIRST_ROW To lastTerm
                        If Trim$(CStr(ws.Cells(r, COL_TERM_EN).Value & "")) = parts(1) Then
                            found = True
                            If Len(Trim$(CStr(ws.Cells(r, COL_TERM_PT).Value & ""))) = 0 Then
                                ws.Cells(r, COL_TERM_PT).Value = parts(2)
                                nTerm = nTerm + 1
                            End If
                            Exit For
                        End If
                    Next r
                    If Not found Then
                        lastTerm = lastTerm + 1
                        ws.Cells(lastTerm, COL_TERM_EN).Value = parts(1)
                        ws.Cells(lastTerm, COL_TERM_PT).Value = parts(2)
                        nTerm = nTerm + 1
                    End If
                End If
            End If
        End If
    Next i

    FillPortuguese = "Planilha: " & nEx & " nome(s) em L e " & nTerm & _
                     " termo(s) em N:O preenchidos."
End Function


'=======================================================================
' Utilitario
'=======================================================================

'--- Le como UTF-8: o relatorio pode conter nomes de exercicio com travessao.
Private Function ReadTextFile(path As String) As String
    If Len(Dir$(path)) = 0 Then Exit Function

    Dim stream As Object
    On Error GoTo Failed
    Set stream = CreateObject("ADODB.Stream")
    stream.Type = 2                          ' text
    stream.Charset = "utf-8"
    stream.Open
    stream.LoadFromFile path
    ReadTextFile = stream.ReadText
    stream.Close
    Exit Function

Failed:
    ReadTextFile = "(nao consegui ler " & path & ")"
End Function
