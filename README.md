# Gym Log — V0.1

PWA para registrar treinos de academia no iPhone, durante o treino, com o mínimo de
digitação. Os registros vão para uma planilha do Google Sheets e de lá para a aba
`Off_Court` do `Tennis.xlsm`, onde o macro `UpdateOffCourtLog` que já existe gera o bloco
de `#06_TRAINING_LOG.md`.

```
iPhone (PWA)  ──POST──►  Apps Script  ──►  Google Sheets
                                              │
                          PC: ImportGymLog ◄──┘
                                   │
                          Off_Court!B5:G  ──►  UpdateOffCourtLog  ──►  #06_TRAINING_LOG.md
```

O app **não** gera markdown e **não** reimplementa agrupamento. Ele só substitui a
digitação manual na aba `Off_Court`.

---

## Setup

### 1. Google Sheets + Apps Script

1. Crie uma planilha nova no Google Sheets. Renomeie a primeira aba para `LOG`.
2. Abra um editor de Apps Script e cole **o conteúdo** de
   [`apps_script/Code.gs`](apps_script/Code.gs) por cima do `function myFunction() {}`
   que vem de fábrica. Dois caminhos, ambos funcionam:
   - **Pela planilha** (*Extensões → Apps Script*) — o script já sabe qual é a planilha.
   - **Avulso** (`script.google.com`) — aí é preciso a propriedade `SHEET_ID` abaixo.
3. **⚙ Project Settings → Script Properties → Add script property**:
   - `TOKEN` = uma string aleatória longa. Gere com:
     `python -c "import secrets; print(secrets.token_urlsafe(32))"`
   - `SHEET_ID` = **só no caminho avulso**: o trecho entre `/d/` e `/edit` na URL da
     planilha (`docs.google.com/spreadsheets/d/`**`ESTE_PEDAÇO`**`/edit`).
4. No editor, selecione a função `setup` e clique em **Run**. Autorize quando pedir
   (é a sua própria conta acessando a sua própria planilha).
5. **Deploy → New deployment → Web app**:
   - Execute as: **Me**
   - Who has access: **Anyone**
   - Copie a URL que termina em `/exec`.

> **Por que "Anyone":** o iPhone não faz login OAuth. A URL do deploy + o `TOKEN` são a
> credencial. Guarde os dois como senha. Nenhuma credencial do Google entra no app —
> o script roda na sua conta, no servidor do Google.

Sempre que alterar o `Code.gs`: **Deploy → Manage deployments → ✎ → Version: New version**.
Sem isso a URL continua servindo o código antigo.

### 2. Publicar o app (GitHub Pages)

```bash
cd D:/ALEXANDRE/CLAUDE/GYM_LOG_APP
git init && git add . && git commit -m "Gym Log V0.1"
gh repo create gym-log --public --source=. --push
```

No GitHub: **Settings → Pages → Source: Deploy from a branch → `main` / `/docs` → Save**.
Em ~1 minuto o app está em `https://<usuario>.github.io/gym-log/`.

> O repositório é público e contém **apenas** front-end e a lista de exercícios. A URL do
> Apps Script e o token ficam só no `localStorage` do iPhone — nunca no repositório.
> Por isso este projeto vive fora de `PROJECT_TENNIS_PERFORMANCE_TEAM`, que tem dados
> de saúde.

### 3. Instalar no iPhone

Abra a URL **no Safari** (o Chrome do iOS não instala PWA) → Compartilhar → **Adicionar à
Tela de Início**. Abra o app → **Configurações** → cole a URL `/exec` e o token →
**SALVAR** → **TESTAR CONEXÃO**.

### 4. Fechar o ciclo no PC (opcional, mas recomendado)

1. No Google Sheets: **Arquivo → Compartilhar → Publicar na web** → aba `LOG`, formato
   **CSV** → Publicar. Copie a URL.
2. No `Tennis.xlsm`: Alt+F11 → **File → Import File** → `vba/Module_OffCourtImport.bas`.
3. Cole a URL na constante `CSV_URL` no topo do módulo.
4. Rode `ImportGymLog`, confirme a data, e depois rode `UpdateOffCourtLog` como sempre.

Alternativa sem VBA: copiar as colunas `exercise, sets, reps, weight, rpe` do Google
Sheets e colar direto em `Off_Court!B5`.

---

## Uso na academia

1. **INICIAR TREINO**
2. **+ ADICIONAR EXERCÍCIO** → grupo → exercício
3. O formulário abre **já preenchido com os valores do último treino** daquele exercício.
   Ajuste só o que mudou → **SALVAR**
4. Repita. Toque num item da lista para editar ou excluir.
5. **FINALIZAR TREINO**

O campo de busca procura em **todos** os grupos — digitar "preacher" costuma ser mais
rápido do que lembrar em qual grupo o exercício está.

### Offline

Tudo é salvo no aparelho antes de qualquer tentativa de rede. Sem sinal, o badge no topo
mostra `N pendentes` e a fila é enviada sozinha quando a conexão volta (ou ao tocar no
badge). Nenhum registro é descartado antes de o Apps Script confirmar o `id`.

### Exercício fora da lista

**Outro exercício (digitar)** → nome livre, mas o grupo tem que ser um da lista. O registro
vai para o Sheets com `custom = TRUE`. Se virar rotina, adicione o exercício em
`Tennis.xlsm` (colunas H/I/J da `Off_Court`) e rode `build_exercises.py` de novo.

---

## Manutenção

**Adicionou exercícios no `Tennis.xlsm`?**

```bash
python tools/build_exercises.py
git add docs/exercises.json && git commit -m "Atualiza lista" && git push
```

**Mudou `index.html`, `app.js` ou `styles.css`?** Suba o número em `CACHE` no
`docs/sw.js` (`gymlog-v1` → `gymlog-v2`), senão o iPhone continua servindo a versão
antiga do cache.

**Testar o Apps Script pelo terminal:** o `/exec` responde com um **302** e o corpo real vem
na URL do `Location`. O `curl -L` reenvia o POST sem `Content-Length` e o Google devolve
`411 Length Required` — mas **o POST já foi executado e as linhas já foram gravadas**. Não
é falha; é o redirect. Siga o redirect à mão:

```bash
printf '%s' '{"token":"...","entries":[...]}' > /tmp/body.json
LOC=$(curl -s -D - -o /dev/null -X POST -H "Content-Type: text/plain;charset=utf-8" \
      --data-binary @/tmp/body.json "$URL" | tr -d '\r' | awk 'tolower($1)=="location:"{print $2}')
curl -s "$LOC"
```

O navegador trata esse redirect corretamente sozinho, então o app não precisa de nada disso.

**Testar antes de publicar:**

```bash
node tools/smoke_test.js              # fluxo completo, sem navegador
python -m http.server 8000 -d docs    # abrir http://localhost:8000
```

O `smoke_test.js` monta um DOM mínimo e simula um treino inteiro (registrar, prefill,
offline, dedupe, editar, excluir, navegação). Rode depois de mexer no `app.js`.

---

## Estrutura

| Arquivo | O quê |
|---|---|
| `docs/index.html` | As 6 telas |
| `docs/app.js` | Toda a lógica — vanilla JS, sem build, sem dependências |
| `docs/styles.css` | Alvos de toque ≥56px, tema escuro |
| `docs/exercises.json` | **Gerado.** Não editar à mão |
| `docs/sw.js` | Service worker (abre offline) |
| `tools/build_exercises.py` | `Tennis.xlsm` → `exercises.json` |
| `tools/make_icons.py` | Gera os ícones (roda uma vez só) |
| `tools/smoke_test.js` | Teste do fluxo completo em Node, sem navegador |
| `apps_script/Code.gs` | Recebe os POSTs e escreve no Sheets |
| `vba/Module_OffCourtImport.bas` | Sheets → `Off_Court!B2:G` |

## Modelo de dados

Uma linha por exercício — igual ao `Off_Court`, não uma linha por série.

```
id | synced_at | session_id | date | exercise | group1 | group2 | sets | reps | weight | rpe | notes | custom
```

`sets`, `reps` e `weight` são **texto**, não número: `"40s"` e `"20kg + Bar"` são valores
reais na sua planilha. Validar como número quebraria a compatibilidade com o macro.

`id` é um UUID gerado no celular; o Apps Script deduplica por ele, então reenvio depois de
falha de rede nunca gera linha duplicada.

## Limitações conhecidas (V0.1)

- **Editar ou excluir um registro já sincronizado** só corrige no celular. O app avisa; a
  correção no Google Sheets é manual. (Deduplicar por `id` é o que evita duplicatas; fazer
  update remoto exigiria mais uma rota no Apps Script.)
- **Histórico só deste aparelho.** O `Último: 3×10 @ 56kg` vem do `localStorage`. Num
  aparelho novo ele começa vazio — os dados antigos continuam no Sheets.
- **Uma carga por exercício.** Séries com pesos diferentes viram uma linha só, como no
  `Off_Court` hoje.
- Limpar os dados do site no Safari apaga o histórico local e a fila pendente. Use
  **Exportar backup (JSON)** em Configurações antes de mexer nisso.
