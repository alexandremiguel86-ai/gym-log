"""Traduz para portugues o que ainda nao tem traducao na aba Off_Court.

Chamado pelo botao "Update Exercise List" (Module_GymLogButtons) ANTES da
publicacao. Le o Tennis.xlsm do disco e procura:

  - exercicios com H preenchido e L (EXERCISE (PT)) vazio;
  - valores de GROUP 1/2/0 (I, J, K) que nao estao no glossario N:O, ou estao
    com O (TERM (PT)) vazio.

So isso e traduzido. Uma celula de L ou O ja preenchida nunca entra aqui, e e
assim que uma correcao feita a mao na planilha fica para sempre.

A traducao e feita pelo Claude Code em modo nao interativo (`claude -p`), com
as traducoes que ja existem na planilha como glossario, para manter os mesmos
termos.

Saida: um arquivo de texto UTF-8, uma traducao por linha, separado por TAB:
    E<TAB>nome em ingles<TAB>nome em portugues      (exercicio -> coluna L)
    T<TAB>termo em ingles<TAB>termo em portugues    (grupo -> glossario N:O)
O VBA le esse arquivo e escreve so nas celulas vazias.

Falhar aqui nao impede a publicacao: o app mostra o nome em ingles para o que
ficou sem traducao, e o proximo clique tenta de novo.

Uso:  python tools/translate_pt.py <saida.tsv> [<outro.xlsm>]
      python tools/translate_pt.py --dry-run          (so lista o que falta)
"""

import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

# build_exercises le sys.argv[1] como caminho da planilha ao ser importado;
# esconde os argumentos deste script durante o import.
_argv, sys.argv = sys.argv, sys.argv[:1]
sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_exercises as b  # noqa: E402
sys.argv = _argv

TIMEOUT = 600


def find_claude():
    found = shutil.which("claude")
    if found:
        return found
    # O Excel abre o PowerShell com o PATH do sistema, que pode nao ter o
    # ~/.local/bin do usuario.
    fallback = Path.home() / ".local" / "bin" / "claude.exe"
    return str(fallback) if fallback.exists() else None


def collect(rows):
    """Devolve (exercicios_faltando, termos_faltando, glossario_existente)."""
    known_ex = {}
    missing_ex = []
    terms_used = []
    for n in sorted(rows):
        if n < b.FIRST_ROW:
            continue
        cells = rows[n]
        name = cells.get("H")
        if not name:
            continue
        pt = cells.get("L")
        if pt:
            known_ex[name] = pt
        elif name not in missing_ex:
            missing_ex.append(name)
        for col in ("I", "J", "K"):
            v = cells.get(col)
            if v and v not in terms_used:
                terms_used.append(v)

    known_terms = {}
    for n in sorted(rows):
        if n < b.FIRST_ROW:
            continue
        en = rows[n].get("N")
        pt = rows[n].get("O")
        if en and pt:
            known_terms[en] = pt
    missing_terms = [t for t in terms_used if t not in known_terms]
    return missing_ex, missing_terms, known_ex, known_terms


PROMPT = """You translate gym / physiotherapy / tennis-conditioning exercise names from \
English to Brazilian Portuguese for a workout-logging app used by a Brazilian tennis \
player in the gym.

Rules:
- Use the terms a Brazilian personal trainer or physiotherapist would actually say.
  Keep an English word when that is what Brazilians use in the gym (e.g. "Crossover",
  "Swiss Ball", "Band", "Deadlift" may stay if more natural) - naturalness beats
  literal translation.
- Keep equipment/grip/variation details (e.g. "Pronated Grip" -> "Pegada Pronada").
- Keep the same punctuation structure, including the " — " separator when present.
- Short, Title Case like the English, no explanations.
- Be consistent with the existing translations below; reuse their terms.

Existing translations (already approved - do not change, use as glossary):
{glossary}

Translate every item below. Reply with ONLY a JSON object, no markdown fence, in the
form {{"exercises": {{"<english>": "<portuguese>", ...}}, "terms": {{"<english>": \
"<portuguese>", ...}}}} containing exactly the keys given.

exercises (exercise names):
{exercises}

terms (muscle group / category names):
{terms}
"""


def ask_claude(missing_ex, missing_terms, known_ex, known_terms):
    exe = find_claude()
    if not exe:
        raise RuntimeError("Claude Code (claude.exe) nao encontrado")

    glossary = {**known_terms, **known_ex}
    prompt = PROMPT.format(
        glossary=json.dumps(glossary, ensure_ascii=False, indent=0) if glossary else "(none yet)",
        exercises=json.dumps(missing_ex, ensure_ascii=False),
        terms=json.dumps(missing_terms, ensure_ascii=False),
    )

    # Roda fora do repositorio para nao carregar o CLAUDE.md do projeto.
    proc = subprocess.run(
        [exe, "-p", "--model", "sonnet"],
        input=prompt.encode("utf-8"),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        cwd=tempfile.gettempdir(),
        timeout=TIMEOUT,
    )
    out = proc.stdout.decode("utf-8", errors="replace")
    if proc.returncode != 0:
        err = proc.stderr.decode("utf-8", errors="replace").strip()
        raise RuntimeError(f"claude saiu com codigo {proc.returncode}: {(err or out)[:300]}")

    m = re.search(r"\{.*\}", out, re.S)
    if not m:
        raise RuntimeError(f"resposta sem JSON: {out[:300]}")
    data = json.loads(m.group(0))
    ex = data.get("exercises") or {}
    tm = data.get("terms") or {}
    return ex, tm


def clean(v):
    # TAB e quebra de linha quebrariam o arquivo de saida.
    return re.sub(r"[\t\r\n]+", " ", str(v)).strip()


def main():
    args = sys.argv[1:]
    dry = "--dry-run" in args
    args = [a for a in args if a != "--dry-run"]
    out_path = None if dry else (Path(args.pop(0)) if args else None)
    xlsm = Path(args[0]) if args else b.XLSM
    if not dry and out_path is None:
        raise SystemExit(__doc__)

    with zipfile.ZipFile(xlsm) as z:
        rows = b.read_rows(z, b.sheet_path(z, b.SHEET), b.shared_strings(z))
    missing_ex, missing_terms, known_ex, known_terms = collect(rows)

    if dry:
        print(f"faltam {len(missing_ex)} exercicio(s) e {len(missing_terms)} termo(s)")
        for x in missing_ex + missing_terms:
            print("  " + x)
        return 0

    lines = []
    got_ex = got_terms = 0
    if missing_ex or missing_terms:
        try:
            ex, tm = ask_claude(missing_ex, missing_terms, known_ex, known_terms)
        except Exception as err:  # nunca derruba a publicacao
            out_path.write_text("", encoding="utf-8")
            print(f"Traducao: falhou ({err}).")
            print(f"  {len(missing_ex) + len(missing_terms)} nome(s) seguem em ingles; "
                  "o proximo clique tenta de novo.")
            return 0
        for name in missing_ex:
            pt = clean(ex.get(name, ""))
            if pt:
                lines.append(f"E\t{name}\t{pt}")
                got_ex += 1
        for term in missing_terms:
            pt = clean(tm.get(term, ""))
            if pt:
                lines.append(f"T\t{term}\t{pt}")
                got_terms += 1

    out_path.write_text("\n".join(lines) + ("\n" if lines else ""), encoding="utf-8")
    left = (len(missing_ex) - got_ex) + (len(missing_terms) - got_terms)
    if not missing_ex and not missing_terms:
        print("Traducao: nada novo para traduzir.")
    else:
        print(f"Traducao: {got_ex} exercicio(s) e {got_terms} grupo(s) traduzidos.")
        if left:
            print(f"  {left} ficaram sem traducao (seguem em ingles no app).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
