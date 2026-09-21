"""Gera docs/exercises.json a partir da aba Off_Court de Tennis.xlsm.

Le as colunas H/I/J (EXERCISE | GROUP 1 | GROUP 2) a partir da linha 3.
Sem dependencias externas: o .xlsm e um zip com XML dentro.

Uso:  python tools/build_exercises.py
"""

import json
import sys
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

# Caminho padrao; `python tools/build_exercises.py <outro.xlsm>` sobrepoe,
# o que serve para testar sem tocar na planilha de verdade.
XLSM = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(r"D:\ALEXANDRE\Tennis.xlsm")
OUT = Path(__file__).resolve().parent.parent / "docs" / "exercises.json"
SHEET = "Off_Court"
FIRST_ROW = 3

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
RNS = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"


def col_letters(ref):
    return "".join(ch for ch in ref if ch.isalpha())


def row_number(ref):
    return int("".join(ch for ch in ref if ch.isdigit()) or 0)


def sheet_path(z, name):
    """Resolve o nome da aba para o caminho do XML via workbook rels."""
    wb = ET.fromstring(z.read("xl/workbook.xml"))
    rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
    target_by_id = {r.get("Id"): r.get("Target") for r in rels}
    for sheet in wb.iter(NS + "sheet"):
        if sheet.get("name") == name:
            target = target_by_id[sheet.get(RNS + "id")]
            return "xl/" + target.lstrip("/").removeprefix("xl/")
    raise SystemExit(f"Aba '{name}' nao encontrada em {XLSM}")


def shared_strings(z):
    if "xl/sharedStrings.xml" not in z.namelist():
        return []
    root = ET.fromstring(z.read("xl/sharedStrings.xml"))
    return ["".join(t.text or "" for t in si.iter(NS + "t")) for si in root]


def read_rows(z, path, strings):
    """Devolve {numero_da_linha: {letra_da_coluna: valor}}."""
    root = ET.fromstring(z.read(path))
    rows = {}
    for row in root.iter(NS + "row"):
        cells = {}
        for c in row.iter(NS + "c"):
            ref = c.get("r")
            if not ref:
                continue
            kind = c.get("t")
            if kind == "inlineStr":
                value = "".join(t.text or "" for t in c.iter(NS + "t"))
            else:
                value = c.findtext(NS + "v")
                if kind == "s" and value is not None:
                    value = strings[int(value)]
            if value:
                cells[col_letters(ref)] = value.strip()
        if cells:
            rows[row_number(row.get("r") or "0")] = cells
    return rows


def main():
    if not XLSM.exists():
        raise SystemExit(f"Nao encontrei {XLSM}")

    with zipfile.ZipFile(XLSM) as z:
        strings = shared_strings(z)
        rows = read_rows(z, sheet_path(z, SHEET), strings)

    groups = {}
    total = 0
    for n in sorted(rows):
        if n < FIRST_ROW:
            continue
        cells = rows[n]
        name = cells.get("H")
        g1 = cells.get("I")
        if not name or not g1:
            continue
        g2 = cells.get("J") or g1
        groups.setdefault(g1, []).append({"n": name, "g2": g2})
        total += 1

    # Dentro do grupo: por subgrupo, depois por nome.
    ordered = []
    for g1 in sorted(groups):
        items = sorted(groups[g1], key=lambda e: (e["g2"].lower(), e["n"].lower()))
        ordered.append({"name": g1, "exercises": items})

    # Sem data de geracao de proposito: um campo que muda todo dia faria o
    # arquivo diferir a cada build, e publish_exercises.ps1 nao conseguiria
    # distinguir "a lista mudou" de "so rodei de novo". O git ja guarda quando.
    payload = {"source": str(XLSM), "groups": ordered}

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8"
    )
    print(f"{OUT}: {total} exercicios em {len(ordered)} grupos")
    for g in ordered:
        print(f"  {len(g['exercises']):3d}  {g['name']}")


if __name__ == "__main__":
    sys.exit(main())
