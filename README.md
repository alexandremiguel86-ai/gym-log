# Gym Log

PWA para registrar treinos de academia no iPhone, **durante** o treino, com o mínimo de
digitação. Os registros vão para o Google Sheets e de lá para a aba `Off_Court` do
`Tennis.xlsm`, onde o macro `UpdateOffCourtLog` que já existia gera o bloco de
`#06_TRAINING_LOG.md`.

**App:** https://alexandremiguel86-ai.github.io/gym-log/

```
iPhone (PWA)  ──POST──►  Apps Script  ──►  Google Sheets (aba LOG)
                                               │ publicado como CSV
                          ┌────────────────────┘
                          ▼
              [Import Gym Log]  ──►  Off_Court!B5:G
                                          │
                          [Update Training Log]  ──►  #06_TRAINING_LOG.md
```

O app **não** gera markdown e **não** reimplementa agrupamento. Ele substitui apenas a
digitação manual na aba `Off_Court`.

---

## Uso no dia a dia

### Na academia

1. **INICIAR TREINO**
2. **+ ADICIONAR EXERCÍCIO** → grupo → exercício
3. O formulário abre **já preenchido com os valores do último treino** daquele exercício.
   Ajuste só o que mudou → **SALVAR**
4. Repita. Toque num item da lista para editar ou excluir.
5. **FINALIZAR TREINO**

A busca procura em **todos** os grupos — digitar "preacher" costuma ser mais rápido do que
lembrar em qual grupo o exercício está.

### No PC — três botões na aba `Off_Court`

| Botão | O quê |
|---|---|
| **Import Gym Log** | baixa o treino do Sheets para `Off_Court!B5:G` (pergunta a data) |
| **Update Training Log** | o de sempre: `Off_Court` → `#06_TRAINING_LOG.md` |
| **Update Exercise List** | publica a lista de `H:I/J` no app do celular |

Fluxo normal depois de um treino: **Import Gym Log** → **Update Training Log**.

⚠️ **Import Gym Log limpa `Off_Court!B5:G`** antes de escrever.

### Adicionou um exercício novo

Digite nas colunas `H` (nome), `I` (GROUP 1) e `J` (GROUP 2) da `Off_Court`, e clique em
**Update Exercise List**. Ele salva a planilha, regera o JSON, e só faz commit+push se a
lista realmente mudou. Depois **feche e reabra o app no iPhone**.

No celular, a opção *"Outro exercício (digitar)"* aceita um nome livre (o grupo continua
obrigatoriamente da lista). Esses registros vão para o Sheets com `custom = TRUE`, e o
**Import Gym Log** avisa quais não estão na lista de referência — o `UpdateOffCourtLog`
jogaria esses no grupo "Other".

### Offline

Tudo é salvo no aparelho antes de qualquer tentativa de rede. Sem sinal, o badge no topo
mostra `N pendentes` e a fila é enviada sozinha quando a conexão volta (ou ao tocar no
badge). Nenhum registro é descartado antes de o Apps Script confirmar o `id`.

---

## Segredos — o que fica onde

O repositório é **público**. Nada que dê acesso aos dados pode entrar nele.

| Segredo | Onde vive | Quem o tem consegue |
|---|---|---|
| URL `/exec` + `TOKEN` | `localStorage` do iPhone (tela de Configurações) | **escrever** na sua planilha |
| `TOKEN` | Script Properties do Apps Script | — |
| `SHEET_ID` | Script Properties do Apps Script | — |
| URL do CSV publicado | `config.local.txt` (no `.gitignore`) | **ler** todo o seu log de treinos |

Por isso este projeto vive fora de `PROJECT_TENNIS_PERFORMANCE_TEAM`, que tem perfil de
lesão e dados de consultas médicas.

### Sobre a URL do CSV — risco aceito conscientemente

A aba `LOG` é publicada como CSV para o botão **Import Gym Log** conseguir lê-la. Quem
tiver essa URL lê o log de treinos inteiro: exercícios, séries, cargas, datas e observações.
Nada de saúde, identificação ou contato.

Ela está no `config.local.txt` (não versionado), mas **também nos commits
`cd20707`..`11a7e77`**, onde ficou por engano antes de ser movida. Isso é irreversível na
prática: o Google reaproveita o mesmo identificador de publicação para a mesma planilha, e
*parar de publicar e republicar* **devolve a URL idêntica** — testado. Reescrever o
histórico do git também não resolveria direito, porque o GitHub mantém os objetos órfãos
acessíveis por SHA durante um tempo.

Decisão: aceitar. O conteúdo exposto é baixo risco e a URL não é indexada.

Se um dia isso incomodar, a saída limpa é parar de publicar a aba e fazer o VBA buscar os
dados pelo próprio Apps Script, autenticado com o `TOKEN` — aí não existe nenhuma URL de
leitura pública, nem hoje nem no histórico.

---

## Setup do zero

### 1. Google Sheets + Apps Script

1. Crie uma planilha. Renomeie a primeira aba para `LOG`.
2. Abra um editor de Apps Script e cole **o conteúdo** de
   [`apps_script/Code.gs`](apps_script/Code.gs) por cima do `function myFunction() {}`.
   Dois caminhos, ambos funcionam:
   - **Pela planilha** (*Extensões → Apps Script*) — o script já sabe qual é a planilha.
   - **Avulso** (`script.google.com`) — aí é preciso a propriedade `SHEET_ID`.
3. **⚙ Project Settings → Script Properties**:
   - `TOKEN` = string aleatória longa:
     `python -c "import secrets; print(secrets.token_urlsafe(32))"`
   - `SHEET_ID` = **só no caminho avulso**: o trecho entre `/d/` e `/edit` na URL da
     planilha.
4. Rode `setup` pelo editor. Autorize (*Advanced* → *Go to … (unsafe)* → *Allow*); o aviso
   de "app não verificado" é normal para um script pessoal.
   O **Execution log** deve mostrar `OK: aba "LOG" pronta em "…"`.
5. **Deploy → New deployment → Web app**:
   - Execute as: **Me**
   - Who has access: **Anyone** (não "Anyone with Google account" — o iPhone não faz login)
   - Copie a URL terminada em `/exec`.

Ao alterar o `Code.gs`: **Deploy → Manage deployments → ✎ → Version: New version**.
Sem isso a URL continua servindo o código antigo.

### 2. Publicar o app (GitHub Pages)

```bash
git remote add origin https://github.com/<usuario>/gym-log.git
git push -u origin main
```

**Settings → Pages → Deploy from a branch → `main` / `/docs` → Save.**

### 3. Instalar no iPhone

Abra a URL **no Safari** (o Chrome do iOS não instala PWA) → Compartilhar → **Adicionar à
Tela de Início**. Abra o app → **Configurações** → cole a URL `/exec` e o token → **SALVAR**
→ **TESTAR CONEXÃO**.

### 4. Fechar o ciclo no PC

1. Google Sheets: *Arquivo → Compartilhar → Publicar na web* → aba `LOG`, formato **CSV**.
2. Crie `config.local.txt` na raiz deste projeto com uma linha:
   ```
   CSV_URL=https://docs.google.com/spreadsheets/d/e/.../pub?gid=0&single=true&output=csv
   ```
3. `Tennis.xlsm` → `Alt+F11` → **File → Import File**, duas vezes:
   `vba/Module_OffCourtImport.bas` e `vba/Module_GymLogButtons.bas`.
4. Os botões da aba `Off_Court` podem ser recriados com
   `tools/setup_buttons.ps1` (veja abaixo).

---

## Manutenção

**Mexeu em `index.html`, `app.js` ou `styles.css`?** Suba o número em `CACHE` no
[`docs/sw.js`](docs/sw.js) (`gymlog-v2` → `gymlog-v3`), senão o iPhone continua servindo a
versão antiga. O `exercises.json` é exceção: ele é network-first justamente para que o botão
**Update Exercise List** tenha efeito já na próxima abertura do app.

**Testar antes de publicar:**

```bash
node tools/smoke_test.js              # fluxo completo, sem navegador
python -m http.server 8000 -d docs    # abrir http://localhost:8000
```

O `smoke_test.js` monta um DOM mínimo e simula um treino inteiro (registrar, prefill,
offline, dedupe, editar, excluir, navegação). Rode depois de mexer no `app.js`.

**Testar o Apps Script pelo terminal:** o `/exec` responde com um **302** e o corpo real vem
na URL do `Location`. O `curl -L` reenvia o POST sem `Content-Length` e o Google devolve
`411 Length Required` — mas **o POST já foi executado e as linhas já foram gravadas**. Não
é falha; é o redirect. Siga-o à mão:

```bash
printf '%s' '{"token":"...","entries":[...]}' > /tmp/body.json
LOC=$(curl -s -D - -o /dev/null -X POST -H "Content-Type: text/plain;charset=utf-8" \
      --data-binary @/tmp/body.json "$URL" | tr -d '\r' | awk 'tolower($1)=="location:"{print $2}')
curl -s "$LOC"
```

O navegador trata esse redirect sozinho, então o app não precisa de nada disso.

**PowerShell 5.1:** nunca use `2>&1` em executável nativo nos scripts daqui. O 5.1 embrulha
cada linha de stderr num `ErrorRecord` e mata o script — e o `git push` escreve progresso em
stderr *mesmo quando dá certo*. Só o `$LASTEXITCODE` decide sucesso.

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
| `tools/publish_exercises.ps1` | rebuild + commit + push (botão da planilha) |
| `tools/setup_buttons.ps1` | (re)cria os botões da aba `Off_Court` |
| `tools/make_icons.py` | Gera os ícones (roda uma vez só) |
| `tools/smoke_test.js` | Teste do fluxo completo em Node, sem navegador |
| `apps_script/Code.gs` | Recebe os POSTs e escreve no Sheets |
| `vba/Module_OffCourtImport.bas` | Sheets → `Off_Court!B2:G` |
| `vba/Module_GymLogButtons.bas` | Publica a lista de exercícios |
| `config.local.txt` | **Não versionado.** URL do CSV publicado |

## Modelo de dados

Uma linha por exercício — igual ao `Off_Court`, não uma linha por série.

```
id | synced_at | session_id | date | exercise | group1 | group2 | sets | reps | weight | rpe | notes | custom
```

`sets`, `reps` e `weight` são **texto**, não número: `"40s"` e `"20kg + Bar"` são valores
reais na sua planilha. Validar como número quebraria a compatibilidade com o macro. O
`Code.gs` força formato texto nas colunas, senão o Sheets converteria `10-12` em data.

`id` é um UUID gerado no celular; o Apps Script deduplica por ele, então reenvio depois de
falha de rede nunca gera linha duplicada.

`notes` vai para a coluna `G` do `Off_Court`, que está livre — o `UpdateOffCourtLog` lê
apenas `B:F`.

## Limitações conhecidas

- **Editar ou excluir um registro já sincronizado** só corrige no celular. O app avisa; a
  correção no Google Sheets é manual. (Deduplicar por `id` é o que evita duplicatas; fazer
  update remoto exigiria mais uma rota no Apps Script.)
- **Histórico só deste aparelho.** O `Último: 3×10 @ 56kg` vem do `localStorage`. Num
  aparelho novo ele começa vazio — os dados antigos continuam no Sheets.
- **Uma carga por exercício.** Séries com pesos diferentes viram uma linha só, como no
  `Off_Court` hoje.
- Limpar os dados do site no Safari apaga o histórico local e a fila pendente. Use
  **Exportar backup (JSON)** em Configurações antes de mexer nisso.
