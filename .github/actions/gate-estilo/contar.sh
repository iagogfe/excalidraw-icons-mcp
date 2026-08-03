#!/usr/bin/env bash
# Conta violacoes de estilo no repositorio do diretorio atual.
# Saida: uma linha "chave<TAB>valor" por metrica.
#
# Tudo aqui e agnostico da config do projeto de proposito. O mesmo script
# precisa medir a branch base, que ainda nao tem eslint/ruff configurado com
# estas regras — se a medicao dependesse da config, o "antes" daria zero e
# mentiria. Por isso: git ls-files, git grep, lizard e jscpd, nenhum deles
# lendo config do repo.
#
# Sem `set -e`: grep sai 1 quando nao acha nada, e nao achar nada e o
# resultado bom.
set -uo pipefail

LIMITE_ARQUIVO=${LIMITE_ARQUIVO:-500}
LIMITE_FUNCAO=${LIMITE_FUNCAO:-60}
LIMITE_CCN=${LIMITE_CCN:-10}
# Diretorios cuja saida e para pessoa, onde print/console e a interface.
# `prisma` entra por causa do seed, que existe justamente para logar progresso.
CLI_DIRS=${CLI_DIRS:-'scripts bin cli prisma'}
# Globs a ignorar, um por linha. Serve para codigo vendorizado (shadcn) e
# gerado, que o gate nao deve cobrar de quem nao escreveu.
IGNORE_FILE=${IGNORE_FILE:-.gate-estilo-ignore}

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

GLOBS_IGNORADOS=()
if [ -f "$IGNORE_FILE" ]; then
  while IFS= read -r linha; do
    [[ -z $linha || $linha == \#* ]] && continue
    GLOBS_IGNORADOS+=("$linha")
  done < "$IGNORE_FILE"
fi

# Traduz os globs para o dialeto de cada ferramenta.
excl_git=()
excl_lizard=()
for g in "${GLOBS_IGNORADOS[@]}"; do
  excl_git+=(":!$g")
  excl_lizard+=(-x "./$g")
done
excl_jscpd='**/node_modules/**,**/dist/**,**/.next/**,**/build/**,**/*.min.js,**/migrations/**,**/.github/**'
for g in "${GLOBS_IGNORADOS[@]}"; do excl_jscpd="$excl_jscpd,$g"; done

# Só arquivos rastreados: gitignore ja tira node_modules, dist e .next de graca.
#
# `.github` fica de fora porque e encanamento de CI, nao o produto. Sem isso, um
# repositorio que vendoriza esta propria action passa a medi-la: o `main` do
# comparar.py tem CCN 13 e sozinho reprovava o PR que instalava o gate.
fontes() {
  git ls-files -- "$@" ':!*.min.js' ':!*.d.ts' ':!**/migrations/**' ':!.github' "${excl_git[@]}"
}

TODAS=('*.ts' '*.tsx' '*.js' '*.jsx' '*.mjs' '*.py')
JS=('*.ts' '*.tsx' '*.js' '*.jsx' '*.mjs')
TS=('*.ts' '*.tsx')

soma_grep() { xargs -r -d '\n' grep -I -c -E "$1" 2>/dev/null | awk -F: '{s+=$NF} END {print s+0}'; }

# --- 1. arquivos grandes ----------------------------------------------------
# `$2 != "total"` tira a linha de somatorio que o wc imprime com varios arquivos.
printf 'arquivos_grandes\t%s\n' \
  "$(fontes "${TODAS[@]}" | xargs -r -d '\n' wc -l 2>/dev/null \
     | awk -v lim="$LIMITE_ARQUIVO" '$2 != "total" && $1 > lim' | wc -l)"

# --- 2 e 3. funcoes longas e complexas ---------------------------------------
# CSV do lizard: NLOC,CCN,token,PARAM,length,location,...
# Uso NLOC (linhas de codigo) e nao `length` (linhas fisicas) porque comentario
# e linha em branco nao devem engordar a metrica — a regra de docstring do
# CLAUDE.md brigaria com a de funcao curta.
lizard --csv -l typescript -l javascript -l python \
  -x './node_modules/*' -x './dist/*' -x './.next/*' -x './build/*' \
  -x './.github/*' \
  "${excl_lizard[@]}" . > "$TMP/lizard.csv" 2>/dev/null
printf 'funcoes_longas\t%s\n' \
  "$(awk -F, -v lim="$LIMITE_FUNCAO" '$1 > lim' "$TMP/lizard.csv" | wc -l)"
printf 'complexidade_alta\t%s\n' \
  "$(awk -F, -v lim="$LIMITE_CCN" '$2 > lim' "$TMP/lizard.csv" | wc -l)"

# --- 4. tipagem escapada -----------------------------------------------------
printf 'any_e_ts_ignore\t%s\n' \
  "$(fontes "${TS[@]}" | soma_grep '\bas any\b|:[[:space:]]*any\b|<any>|@ts-ignore|@ts-expect-error')"

# --- 5. nomes vagos ----------------------------------------------------------
# So em declaracao: `const data =` conta, `user.data` nao. Contar uso puniria
# quem consome uma API de terceiro que ja se chama assim.
vagos_js=$(fontes "${JS[@]}" | soma_grep \
  '(const|let|var|function|class|interface|type)[[:space:]]+(data|handler|manager)[[:space:]]*[=:(<{]|class[[:space:]]+[A-Za-z]*Manager\b')
vagos_py=$(fontes '*.py' | soma_grep \
  '^[[:space:]]*(def|class)[[:space:]]+(data|handler|manager)\b|^[[:space:]]*class[[:space:]]+[A-Za-z]*Manager\b')
printf 'nomes_vagos\t%s\n' "$((vagos_js + vagos_py))"

# --- 6. log solto ------------------------------------------------------------
excl_cli=()
for d in $CLI_DIRS; do excl_cli+=(":!$d/**" ":!**/$d/**"); done
printf 'console_log\t%s\n' \
  "$(fontes "${JS[@]}" "${excl_cli[@]}" | soma_grep '\bconsole\.(log|debug|info)\(')"

# --- 7. duplicacao (informativo) ---------------------------------------------
# Nao reprova: bloco parecido e bloco identico se confundem, e extrair a
# abstracao errada custa mais caro que a duplicacao.
#
# `--format` restringe aos formatos que as outras metricas medem. Sem isso o
# jscpd le os 17 formatos que reconhece — markdown, csv, txt, snapshot de
# migration — e o numero deixa de falar sobre duplicacao de codigo.
#
# O binario e chamado direto, nao via `npx`, porque o npx resolve dependencias
# contra o package.json do repositorio medido e aborta em repo com conflito de
# `overrides`. Quando isso acontecia o erro era engolido e a metrica saia 0:
# ferramenta quebrada relatando "nenhuma duplicacao" e pior que nao medir.
jscpd --reporters json --output "$TMP/jscpd" \
  --min-lines 8 --min-tokens 60 --silent \
  --format 'typescript,tsx,javascript,jsx,python' \
  --ignore "$excl_jscpd" . > "$TMP/jscpd.log" 2>&1
if [ -f "$TMP/jscpd/jscpd-report.json" ]; then
  printf 'duplicacao\t%s\n' \
    "$(python3 -c "import json; print(len(json.load(open('$TMP/jscpd/jscpd-report.json'))['duplicates']))")"
else
  echo "::warning::jscpd nao produziu relatorio; duplicacao fica sem medicao" >&2
  sed 's/^/  jscpd: /' "$TMP/jscpd.log" >&2
  printf 'duplicacao\tna\n'
fi
