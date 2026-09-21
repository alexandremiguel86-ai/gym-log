Attribute VB_Name = "Module_GymLogButtons"
Option Explicit

'=======================================================================
' Module_GymLogButtons
'
' Publica a lista de exercicios de Off_Court!H:J no app do celular.
'
' Fluxo: salva esta planilha -> tools\build_exercises.py regera
'        docs\exercises.json -> git commit + push -> GitHub Pages.
'
' O botao "Import Gym Log" chama ImportGymLog, que vive em
' Module_OffCourtImport. Este modulo cuida so da publicacao da lista.
'=======================================================================

Private Const REPO_DIR As String = "D:\ALEXANDRE\CLAUDE\GYM_LOG_APP"
Private Const PUBLISH_SCRIPT As String = "tools\publish_exercises.ps1"


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

    ' O script le o .xlsm do DISCO, nao a copia aberta na memoria. Sem salvar
    ' antes, um exercicio recem-digitado nao seria publicado.
    If Not ThisWorkbook.Saved Then
        If MsgBox("A planilha tem alteracoes nao salvas." & vbCrLf & vbCrLf & _
                  "Salvar agora e publicar?", vbYesNo + vbQuestion, _
                  "Publicar lista") <> vbYes Then Exit Sub
    End If
    ThisWorkbook.Save

    Dim outFile As String
    outFile = Environ$("TEMP") & "\gymlog_publish.txt"
    On Error Resume Next
    Kill outFile
    On Error GoTo 0

    Dim cmd As String
    cmd = "cmd.exe /c powershell.exe -NoProfile -ExecutionPolicy Bypass -File """ & _
          scriptPath & """ > """ & outFile & """ 2>&1"

    Dim shell As Object
    Set shell = CreateObject("WScript.Shell")

    Application.Cursor = xlWait
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

    If code = 0 Then
        MsgBox report, vbInformation, "Lista publicada"
    Else
        MsgBox "A publicacao falhou (codigo " & code & ")." & vbCrLf & vbCrLf & _
               report, vbCritical, "Publicar lista"
    End If
End Sub


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
