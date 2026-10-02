Attribute VB_Name = "Module_OffCourtImport"
Option Explicit

'=======================================================================
' Module_OffCourtImport
'
' Traz o treino registrado no celular (PWA -> Apps Script -> Google Sheets)
' para a aba Off_Court, no formato que Module_OffCourtSync ja espera.
'
' Escreve:  Off_Court!B2            data da sessao
'           Off_Court!B5:F<n>       Exercise | Sets | Reps/Time | Weight/Hold | RPE
'           Off_Court!G5:G<n>       OBS (o Sync leva para o #06 no fim do exercicio)
'           Off_Court!I:L           so linhas NOVAS no fim da lista de referencia:
'                                   exercicio digitado no app ("Other exercise",
'                                   custom = TRUE) que ainda nao esta em I.
'                                   M (portugues) fica vazio para o
'                                   PublishExerciseList traduzir.
'
' Nunca altera nem apaga linha que ja existe na lista, e nao toca no markdown.
' Depois de rodar este import, rode UpdateOffCourtLog como sempre.
'
' Setup (uma vez):
'   No Google Sheets:  File > Share > Publish to web
'                      aba LOG, formato CSV, Publish.
'   Cole a URL gerada no arquivo apontado por CONFIG_FILE abaixo.
'
' A URL fica FORA deste arquivo de proposito: quem tem a URL le o seu log de
' treinos inteiro, e este .bas vive num repositorio publico no GitHub.
' O config.local.txt esta no .gitignore.
'=======================================================================

Private Const CONFIG_FILE As String = "D:\ALEXANDRE\CLAUDE\GYM_LOG_APP\config.local.txt"

Private Const SHEET_NAME As String = "Off_Court"
Private Const FIRST_DATA_ROW As Long = 5

' Lista de referencia: EXERCISE | GROUP 1 | GROUP 2 | GROUP 0 | EXERCISE (PT)
Private Const REF_FIRST_ROW As Long = 3

' Indices das colunas do CSV, 0-based, na ordem definida em Code.gs:
' id | synced_at | session_id | date | exercise | group1 | group2 |
' sets | reps | weight | rpe | notes | custom | group0
' Linhas gravadas antes de group0 existir chegam com ele vazio.
Private Const C_SESSION As Long = 2
Private Const C_DATE As Long = 3
Private Const C_EXERCISE As Long = 4
Private Const C_GROUP1 As Long = 5
Private Const C_GROUP2 As Long = 6
Private Const C_SETS As Long = 7
Private Const C_REPS As Long = 8
Private Const C_WEIGHT As Long = 9
Private Const C_RPE As Long = 10
Private Const C_NOTES As Long = 11
Private Const C_CUSTOM As Long = 12
Private Const C_GROUP0 As Long = 13
Private Const COL_COUNT As Long = 14


'=======================================================================
' Ponto de entrada
'=======================================================================
Public Sub ImportGymLog()
    Dim ws As Worksheet
    On Error Resume Next
    Set ws = ThisWorkbook.Worksheets(SHEET_NAME)
    On Error GoTo 0
    If ws Is Nothing Then
        MsgBox "Aba '" & SHEET_NAME & "' nao encontrada.", vbCritical
        Exit Sub
    End If

    Dim csvUrl As String
    csvUrl = ReadCsvUrl()
    If Len(csvUrl) = 0 Then
        MsgBox "Nao encontrei a URL do CSV." & vbCrLf & vbCrLf & _
               "Crie o arquivo:" & vbCrLf & CONFIG_FILE & vbCrLf & vbCrLf & _
               "com uma linha:" & vbCrLf & "CSV_URL=https://docs.google.com/.../pub?...output=csv", _
               vbExclamation, "Importar treino"
        Exit Sub
    End If

    ' ---- baixa o CSV ---------------------------------------------------
    Dim csv As String
    csv = FetchUtf8(csvUrl)
    If Len(csv) = 0 Then
        MsgBox "Nao consegui baixar o CSV. Confira a URL publicada e a conexao.", vbCritical
        Exit Sub
    End If

    ' ---- parse ---------------------------------------------------------
    Dim rows() As Variant, rowCount As Long
    rowCount = ParseCsv(csv, rows)
    If rowCount < 2 Then
        MsgBox "O CSV veio sem linhas de dados.", vbExclamation
        Exit Sub
    End If

    ' ---- escolhe a data ------------------------------------------------
    Dim latest As String
    latest = LatestDate(rows, rowCount)

    Dim answer As String
    answer = InputBox( _
        "Data do treino a importar (AAAA-MM-DD):" & vbCrLf & vbCrLf & _
        "Mais recente na planilha: " & latest, _
        "Importar treino", latest)
    If Len(Trim$(answer)) = 0 Then Exit Sub
    answer = Trim$(answer)

    If Not IsIsoDate(answer) Then
        MsgBox "Use o formato AAAA-MM-DD (ex.: " & latest & ").", vbExclamation
        Exit Sub
    End If

    ' ---- filtra, preservando a ordem de entrada -------------------------
    Dim picked() As Long
    ReDim picked(0 To rowCount - 1)
    Dim n As Long, r As Long
    n = 0
    For r = 1 To rowCount - 1          ' linha 0 = cabecalho
        If CStr(rows(r)(C_DATE)) = answer Then
            picked(n) = r
            n = n + 1
        End If
    Next r

    If n = 0 Then
        MsgBox "Nenhum registro na data " & answer & ".", vbExclamation
        Exit Sub
    End If

    Dim sessions As Long
    sessions = CountSessions(rows, picked, n)
    If sessions > 1 Then
        If MsgBox(sessions & " sessoes diferentes nessa data. Importar todas juntas?", _
                  vbYesNo + vbQuestion, "Importar treino") <> vbYes Then Exit Sub
    End If

    ' ---- escreve -------------------------------------------------------
    Application.ScreenUpdating = False

    ClearEntries ws

    Dim i As Long, target As Long
    For i = 0 To n - 1
        target = FIRST_DATA_ROW + i
        r = picked(i)
        ws.Cells(target, "B").Value = CStr(rows(r)(C_EXERCISE))
        ws.Cells(target, "C").Value = CStr(rows(r)(C_SETS))
        ws.Cells(target, "D").Value = CStr(rows(r)(C_REPS))
        ws.Cells(target, "E").Value = CStr(rows(r)(C_WEIGHT))
        ws.Cells(target, "F").Value = CStr(rows(r)(C_RPE))
        ws.Cells(target, "G").Value = CStr(rows(r)(C_NOTES))
    Next i

    ' DateSerial e nao CDate: CDate de "2026-09-20" depende do locale e pode
    ' virar 20/09 ou falhar dependendo da configuracao do Windows.
    ws.Range("B2").Value = DateSerial( _
        CLng(Left$(answer, 4)), CLng(Mid$(answer, 6, 2)), CLng(Mid$(answer, 9, 2)))

    Dim added As String, unknown As String
    AddNewExercises ws, rows, picked, n, added, unknown

    Application.ScreenUpdating = True

    Dim msg As String
    msg = n & " exercicio(s) importado(s) para " & SHEET_NAME & "."
    If Len(added) > 0 Then
        msg = msg & vbCrLf & vbCrLf & _
              "Exercicio(s) novo(s) acrescentado(s) a lista (I:L):" & vbCrLf & added & _
              "Confira o nome em ingles e clique em Update Exercise List " & _
              "para traduzir e publicar no app."
    End If
    If Len(unknown) > 0 Then
        msg = msg & vbCrLf & vbCrLf & _
              "Fora da lista de referencia (I:L) - o Sync vai marcar como 'Other':" & _
              vbCrLf & unknown
    End If
    msg = msg & vbCrLf & vbCrLf & "Agora rode UpdateOffCourtLog."
    MsgBox msg, vbInformation, "Importar treino"
End Sub


'=======================================================================
' Diagnostico
'
' Rode pela janela Imediata do VBA:  ?GymLogConfigCheck
' Serve para conferir a configuracao sem disparar a importacao inteira.
'=======================================================================
Public Function GymLogConfigCheck() As String
    Dim url As String
    url = ReadCsvUrl()

    If Len(Dir$(CONFIG_FILE)) = 0 Then
        GymLogConfigCheck = "FALTA o arquivo: " & CONFIG_FILE
    ElseIf Len(url) = 0 Then
        GymLogConfigCheck = "Arquivo existe, mas nao achei a linha CSV_URL= nele."
    Else
        GymLogConfigCheck = "OK - CSV_URL com " & Len(url) & " caracteres, terminando em '" & _
                            Right$(url, 11) & "'"
    End If
End Function


'=======================================================================
' Planilha
'=======================================================================

Private Sub ClearEntries(ws As Worksheet)
    Dim lastRow As Long
    lastRow = ws.Cells(ws.Rows.Count, "B").End(xlUp).Row
    If lastRow >= FIRST_DATA_ROW Then
        ws.Range(ws.Cells(FIRST_DATA_ROW, "B"), ws.Cells(lastRow, "G")).ClearContents
    End If
End Sub

'--- Exercicio importado que nao esta em I:
'---   custom = TRUE  -> foi digitado no app de proposito: ganha uma linha no fim
'---                     de I:L, com os grupos escolhidos no app. Sem GROUP 0
'---                     (app ou Apps Script antigos), usa o do GROUP 1 na lista.
'---   senao          -> volta em `unknown`, so como aviso. E nome do catalogo que
'---                     mudou depois do treino; recriar o nome velho na lista
'---                     desfaria a renomeacao. O Sync o joga em "Other".
'--- Linha copiada da ultima da lista para herdar a formatacao; M fica vazio.
Private Sub AddNewExercises(ws As Worksheet, rows() As Variant, picked() As Long, _
                            n As Long, ByRef added As String, ByRef unknown As String)
    Dim refLast As Long
    refLast = ws.Cells(ws.Rows.Count, "I").End(xlUp).Row

    Dim known As Object, categoryOf As Object
    Set known = CreateObject("Scripting.Dictionary")
    known.CompareMode = 1                      ' TextCompare
    Set categoryOf = CreateObject("Scripting.Dictionary")
    categoryOf.CompareMode = 1

    Dim r As Long, nm As String, g0 As String, g1 As String, g2 As String
    For r = REF_FIRST_ROW To refLast
        nm = Trim$(CStr(ws.Cells(r, "I").Value & ""))
        If Len(nm) > 0 Then known(nm) = True
        g1 = Trim$(CStr(ws.Cells(r, "J").Value & ""))
        g0 = Trim$(CStr(ws.Cells(r, "L").Value & ""))
        If Len(g1) > 0 And Len(g0) > 0 Then
            If Not categoryOf.Exists(g1) Then categoryOf(g1) = g0
        End If
    Next r

    Dim i As Long, nextRow As Long
    For i = 0 To n - 1
        nm = Trim$(CStr(rows(picked(i))(C_EXERCISE)))
        If Len(nm) > 0 And Not known.Exists(nm) Then
            known(nm) = True                   ' o mesmo exercicio duas vezes no treino

            If UCase$(Trim$(CStr(rows(picked(i))(C_CUSTOM)))) = "TRUE" Then
                g1 = Trim$(CStr(rows(picked(i))(C_GROUP1)))
                g2 = Trim$(CStr(rows(picked(i))(C_GROUP2)))
                g0 = Trim$(CStr(rows(picked(i))(C_GROUP0)))
                If Len(g2) = 0 Then g2 = g1
                If Len(g0) = 0 And categoryOf.Exists(g1) Then g0 = categoryOf(g1)

                nextRow = refLast + 1
                If refLast >= REF_FIRST_ROW Then
                    ws.Range(ws.Cells(refLast, "I"), ws.Cells(refLast, "M")).Copy _
                        ws.Range(ws.Cells(nextRow, "I"), ws.Cells(nextRow, "M"))
                    ws.Range(ws.Cells(nextRow, "I"), ws.Cells(nextRow, "M")).ClearContents
                Else
                    nextRow = REF_FIRST_ROW
                End If
                ws.Cells(nextRow, "I").Value = nm
                ws.Cells(nextRow, "J").Value = g1
                ws.Cells(nextRow, "K").Value = g2
                ws.Cells(nextRow, "L").Value = g0
                refLast = nextRow

                added = added & "  - " & nm & "  (" & g1 & " / " & g2 & " / " & _
                        IIf(Len(g0) > 0, g0, "SEM GROUP 0") & ")" & vbCrLf
            Else
                unknown = unknown & "  - " & nm & vbCrLf
            End If
        End If
    Next i
End Sub


'=======================================================================
' Dados
'=======================================================================

'--- Le CSV_URL=... do config.local.txt. Linhas em branco e comecadas por '#'
'--- sao ignoradas, para o arquivo poder ter um comentario explicando o que e.
'---
'--- Le o arquivo inteiro e quebra a mao em vez de usar "Line Input": o
'--- Line Input so reconhece CR e CRLF, e um arquivo salvo por editor Unix
'--- (LF puro) voltaria como uma unica linha - que comeca com "#" e seria
'--- descartada como comentario, deixando a URL invisivel.
Private Function ReadCsvUrl() As String
    Dim text As String
    text = ReadTextFileUtf8(CONFIG_FILE)
    If Len(text) = 0 Then Exit Function

    text = Replace$(text, vbCrLf, vbLf)
    text = Replace$(text, vbCr, vbLf)

    Dim parts() As String, i As Long, line As String
    parts = Split(text, vbLf)
    For i = LBound(parts) To UBound(parts)
        line = Trim$(parts(i))
        If Len(line) > 0 Then
            If Left$(line, 1) <> "#" Then
                If LCase$(Left$(line, 8)) = "csv_url=" Then
                    ReadCsvUrl = Trim$(Mid$(line, 9))
                    Exit Function
                End If
            End If
        End If
    Next i
End Function

'--- Le um arquivo de texto como UTF-8 (a URL pode ter caracteres acentuados
'--- num comentario, e o BOM, se houver, e tratado pelo ADODB.Stream).
Private Function ReadTextFileUtf8(path As String) As String
    If Len(Dir$(path)) = 0 Then Exit Function

    Dim stream As Object
    On Error GoTo Failed
    Set stream = CreateObject("ADODB.Stream")
    stream.Type = 2                          ' text
    stream.Charset = "utf-8"
    stream.Open
    stream.LoadFromFile path
    ReadTextFileUtf8 = stream.ReadText
    stream.Close
Failed:
End Function

Private Function IsIsoDate(s As String) As Boolean
    If Len(s) <> 10 Then Exit Function
    If Mid$(s, 5, 1) <> "-" Or Mid$(s, 8, 1) <> "-" Then Exit Function
    If Not IsNumeric(Left$(s, 4)) Then Exit Function
    If Not IsNumeric(Mid$(s, 6, 2)) Then Exit Function
    If Not IsNumeric(Mid$(s, 9, 2)) Then Exit Function
    IsIsoDate = True
End Function

Private Function LatestDate(rows() As Variant, rowCount As Long) As String
    Dim r As Long, d As String, best As String
    For r = 1 To rowCount - 1
        d = CStr(rows(r)(C_DATE))
        If Len(d) = 10 Then                     ' AAAA-MM-DD ordena como texto
            If d > best Then best = d
        End If
    Next r
    LatestDate = best
End Function

Private Function CountSessions(rows() As Variant, picked() As Long, n As Long) As Long
    Dim seen As Object
    Set seen = CreateObject("Scripting.Dictionary")
    Dim i As Long
    For i = 0 To n - 1
        seen(CStr(rows(picked(i))(C_SESSION))) = True
    Next i
    CountSessions = seen.Count
End Function


'=======================================================================
' HTTP + UTF-8
'=======================================================================

'--- Baixa e decodifica como UTF-8. Sem isso o travessao dos nomes
'--- ("Seated Cable Row — Wide Neutral Grip") chega corrompido.
Private Function FetchUtf8(url As String) As String
    Dim http As Object, stream As Object

    On Error GoTo Failed
    Set http = CreateObject("MSXML2.ServerXMLHTTP.6.0")
    http.Open "GET", url, False
    http.setRequestHeader "Cache-Control", "no-cache"
    http.Send

    If http.Status < 200 Or http.Status >= 300 Then GoTo Failed

    Set stream = CreateObject("ADODB.Stream")
    stream.Type = 1                             ' binary
    stream.Open
    stream.Write http.responseBody
    stream.Position = 0
    stream.Type = 2                             ' text
    stream.Charset = "utf-8"
    FetchUtf8 = stream.ReadText
    stream.Close
    Exit Function

Failed:
    FetchUtf8 = ""
End Function


'=======================================================================
' CSV
'
' Parser completo de RFC 4180: aspas duplas, virgulas e quebras de linha
' dentro do campo. As observacoes sao texto livre, entao isso nao e luxo.
' Preenche rows() com arrays 0-based de COL_COUNT campos.
'=======================================================================
Private Function ParseCsv(text As String, ByRef rows() As Variant) As Long
    Dim fields() As String
    ReDim fields(0 To COL_COUNT - 1)

    Dim buffer() As Variant
    ReDim buffer(0 To 2000)

    Dim rowCount As Long, col As Long
    Dim cell As String
    Dim inQuotes As Boolean
    Dim i As Long, ch As String, nextCh As String
    Dim n As Long
    n = Len(text)

    For i = 1 To n
        ch = Mid$(text, i, 1)

        If inQuotes Then
            If ch = """" Then
                nextCh = IIf(i < n, Mid$(text, i + 1, 1), "")
                If nextCh = """" Then
                    cell = cell & """"          ' aspas escapadas
                    i = i + 1
                Else
                    inQuotes = False
                End If
            Else
                cell = cell & ch
            End If

        ElseIf ch = """" Then
            inQuotes = True

        ElseIf ch = "," Then
            If col <= UBound(fields) Then fields(col) = cell
            col = col + 1
            cell = ""

        ElseIf ch = vbCr Then
            ' ignora: o vbLf seguinte fecha a linha

        ElseIf ch = vbLf Then
            If col <= UBound(fields) Then fields(col) = cell
            If rowCount > UBound(buffer) Then ReDim Preserve buffer(0 To rowCount + 1000)
            buffer(rowCount) = fields
            rowCount = rowCount + 1
            ReDim fields(0 To COL_COUNT - 1)
            col = 0
            cell = ""

        Else
            cell = cell & ch
        End If
    Next i

    ' ultima linha sem quebra final
    If col > 0 Or Len(cell) > 0 Then
        If col <= UBound(fields) Then fields(col) = cell
        If rowCount > UBound(buffer) Then ReDim Preserve buffer(0 To rowCount + 1000)
        buffer(rowCount) = fields
        rowCount = rowCount + 1
    End If

    rows = buffer
    ParseCsv = rowCount
End Function
