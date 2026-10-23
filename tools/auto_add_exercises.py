"""Exercicio novo digitado no app -> fim de Off_Court!I:L -> lista publicada no app.

E o que o botao Import Gym Log faz com exercicio novo, mas sozinho: roda a cada 15 minutos
pela tarefa GymLog_Nightly (tools\\gym_nightly.ps1 do projeto de tenis), depois do #06.

  * Candidato = linha do LOG com custom = TRUE, nome que ainda nao esta em I, e id que este
    script nunca viu. O "nunca viu" importa: um exercicio digitado no app e depois RENOMEADO
    na planilha continua com o nome velho no LOG, e recria-lo desfaria a renomeacao. Na 1a
    execucao tudo o que ja esta no LOG conta como visto.
  * Escreve pelo proprio Excel (COM). Se o Tennis.xlsm estiver aberto, usa a copia aberta,
    mas so se nao houver alteracao nao salva: salvar por cima levaria junto o que o usuario
    esta fazendo. Fechado, abre num Excel escondido e fecha no fim (try/finally: Excel orfao
    segurando o arquivo faz o Save seguinte falhar em silencio).
  * Publica chamando PublishExerciseListSilent (Module_GymLogButtons): salva, traduz e faz
    o push, igual ao botao Update Exercise List.

    python -I tools/auto_add_exercises.py            # simula: so lista os candidatos
    python -I tools/auto_add_exercises.py --apply    # escreve e publica

Codigos de saida: 0 nada a fazer · 10 acrescentou e publicou · 11 ficou para a proxima
rodada (planilha aberta com alteracao, Excel ocupado ou publicacao falhou) · 1 erro.
"""
import argparse
import csv
import io
import json
import sys
import urllib.request
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_exercises as build  # noqa: E402  (leitura do .xlsm sem Excel)

REPO = Path(__file__).resolve().parent.parent
CONFIG = REPO / "config.local.txt"
STATE = REPO / "auto_add_state.local.json"   # ids do LOG ja vistos; fora do git
# Nao usar build.XLSM: ele le sys.argv[1], que aqui e "--apply".
XLSM = Path(r"C:\ALEXANDRE\CLAUDE\PROJECT_TENNIS_PERFORMANCE_TEAM\Tennis.xlsm")
XL_UP = -4162

OK, ADDED, LATER, ERROR = 0, 10, 11, 1


def csv_url():
    for line in CONFIG.read_text(encoding="utf-8-sig").splitlines():
        line = line.strip()
        if line.lower().startswith("csv_url="):
            return line[8:].strip()
    raise SystemExit(f"CSV_URL nao encontrada em {CONFIG}")


def load_log(source):
    if source:
        text = Path(source).read_text(encoding="utf-8")
    else:
        req = urllib.request.Request(csv_url(), headers={"Cache-Control": "no-cache"})
        text = urllib.request.urlopen(req, timeout=60).read().decode("utf-8")
    return list(csv.DictReader(io.StringIO(text)))


def names_on_disk(xlsm):
    with zipfile.ZipFile(xlsm) as z:
        rows = build.read_rows(z, build.sheet_path(z, build.SHEET), build.shared_strings(z))
    return {c["I"].strip().lower() for n, c in rows.items() if n >= build.FIRST_ROW and c.get("I")}


def load_state(path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return None


def save_state(path, state):
    path.write_text(json.dumps(state, indent=1, ensure_ascii=False), encoding="utf-8")


def candidates(log, known, seen):
    """Exercicios novos, na ordem em que apareceram no LOG, um por nome."""
    out, taken = [], set(known)
    for r in log:
        name = (r.get("exercise") or "").strip()
        if (r.get("custom") or "").strip().upper() != "TRUE" or not name:
            continue
        if r.get("id") in seen or name.lower() in taken:
            continue
        taken.add(name.lower())
        out.append({"id": r.get("id"), "name": name, "g1": (r.get("group1") or "").strip(),
                    "g2": (r.get("group2") or "").strip(), "g0": (r.get("group0") or "").strip()})
    return out


# ------------------------------------------------------------------ Excel
class Later(Exception):
    """Nao deu agora, sem erro: tenta de novo na proxima rodada."""


def open_workbook(xlsm):
    """(excel, wb, aberto_por_nos). Usa a copia ja aberta, se houver."""
    import win32com.client
    target = str(Path(xlsm).resolve()).lower()
    try:
        running = win32com.client.GetActiveObject("Excel.Application")
    except Exception:
        running = None
    if running is not None:
        for wb in running.Workbooks:
            if str(wb.FullName).lower() == target:
                if not wb.Saved:
                    raise Later("Tennis.xlsm aberto com alteracao nao salva")
                return running, wb, False

    excel = win32com.client.DispatchEx("Excel.Application")
    try:
        excel.Visible = False
        excel.DisplayAlerts = False
        excel.EnableEvents = False
        wb = excel.Workbooks.Open(str(Path(xlsm).resolve()), 0, False)
        if wb.ReadOnly:   # aberto em outro Excel que o GetActiveObject nao achou
            wb.Close(False)
            raise Later("Tennis.xlsm aberto em outro Excel")
        return excel, wb, True
    except BaseException:
        excel.Quit()
        raise


def write_rows(wb, new):
    """Acrescenta no fim de I:L, como o AddNewExercises do VBA. Devolve o que entrou."""
    ws = wb.Worksheets(build.SHEET)
    last = ws.Cells(ws.Rows.Count, "I").End(XL_UP).Row
    values = ws.Range(ws.Cells(build.FIRST_ROW, "I"), ws.Cells(max(last, build.FIRST_ROW), "L")).Value or ()
    known, category = set(), {}
    for row in values:
        nm, g1, _, g0 = (str(v or "").strip() for v in row)
        if nm:
            known.add(nm.lower())
        if g1 and g0:
            category.setdefault(g1, g0)

    added = []
    for e in new:
        if e["name"].lower() in known:   # a copia aberta pode estar a frente do disco
            continue
        known.add(e["name"].lower())
        g2 = e["g2"] or e["g1"]
        g0 = e["g0"] or category.get(e["g1"], "")
        row = last + 1
        if last >= build.FIRST_ROW:      # herda a formatacao da ultima linha; M fica vazio
            ws.Range(ws.Cells(last, "I"), ws.Cells(last, "M")).Copy(ws.Range(ws.Cells(row, "I"), ws.Cells(row, "M")))
            ws.Range(ws.Cells(row, "I"), ws.Cells(row, "M")).ClearContents()
        else:
            row = build.FIRST_ROW
        for col, v in zip("IJKL", (e["name"], e["g1"], g2, g0)):
            ws.Cells(row, col).Value = v
        last = row
        added.append(f"{e['name']} ({e['g1']} / {g2} / {g0 or 'SEM GROUP 0'})")
    return added


def run_excel(xlsm, new, publish):
    """Escreve e publica. Devolve (acrescentados, relatorio, publicou)."""
    import pythoncom
    pythoncom.CoInitialize()
    excel = wb = None
    ours = False
    try:
        try:
            excel, wb, ours = open_workbook(xlsm)
            added = write_rows(wb, new)
            report, published = "", True
            if publish:
                report = str(excel.Run(f"'{wb.Name}'!PublishExerciseListSilent") or "")
                published = report.startswith("Lista publicada")
            elif added:
                wb.Save()
            return added, report, published
        except pythoncom.com_error as e:
            # Excel em edicao de celula ou com janela aberta recusa a chamada.
            raise Later(f"Excel ocupado ({e.args[1] if len(e.args) > 1 else e})")
    finally:
        if ours:
            try:
                if wb is not None:
                    wb.Close(False)
            finally:
                excel.Quit()
        pythoncom.CoUninitialize()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="escreve na planilha e publica")
    ap.add_argument("--xlsm", default=str(XLSM))
    ap.add_argument("--csv", help="LOG de um arquivo, em vez da URL (teste)")
    ap.add_argument("--state", default=str(STATE))
    ap.add_argument("--no-publish", action="store_true", help="so escreve e salva (teste)")
    a = ap.parse_args()
    state_path = Path(a.state)

    try:
        log = load_log(a.csv)
        known = names_on_disk(a.xlsm)
    except Exception as e:
        print(f"ERRO lendo LOG ou planilha: {e}")
        return ERROR

    state = load_state(state_path)
    if state is None:
        # 1a execucao: o que ja esta no LOG fica como esta (ver docstring).
        state = {"seen": sorted({r["id"] for r in log if r.get("id")}), "publish_pending": False}
        if a.apply:
            save_state(state_path, state)
        print(f"Primeira execucao: {len(state['seen'])} linhas do LOG marcadas como vistas.")
        return OK

    seen = set(state["seen"])
    new = candidates(log, known, seen)
    pending = state.get("publish_pending", False)
    if not new and not pending:
        seen.update(r["id"] for r in log if r.get("id"))
        if a.apply and len(seen) != len(state["seen"]):
            state["seen"] = sorted(seen)
            save_state(state_path, state)
        print("Nada novo.")
        return OK

    for e in new:
        print(f"Novo: {e['name']} ({e['g1']} / {e['g2'] or e['g1']} / {e['g0'] or '-'})")
    if pending:
        print("Publicacao pendente da rodada anterior.")
    if not a.apply:
        print("(simulacao: nada foi gravado)")
        return OK

    try:
        added, report, published = run_excel(a.xlsm, new, not a.no_publish)
    except Later as e:
        print(f"Fica para a proxima rodada: {e}.")
        return LATER
    except Exception as e:
        print(f"ERRO no Excel: {e}")
        return ERROR

    # Ja esta em I (ou entrou agora): nao e mais candidato, publicando ou nao.
    state["seen"] = sorted(seen | {r["id"] for r in log if r.get("id")})
    state["publish_pending"] = not published
    save_state(state_path, state)

    for line in added:
        print(f"Acrescentado a I:L: {line}")
    if report:
        print(report.replace("\r\n", "\n").replace("\r", "\n").strip())
    if not published:
        print("A publicacao falhou; tenta de novo na proxima rodada.")
        return LATER
    return ADDED if added else OK


if __name__ == "__main__":
    sys.exit(main())
