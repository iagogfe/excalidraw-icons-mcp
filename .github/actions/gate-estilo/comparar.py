#!/usr/bin/env python3
"""Compara duas medicoes do gate de estilo, comenta no PR e reprova se piorou.

O "antes" e a branch base do PR, nao um numero de catraca commitado. Isso e o
que torna o gate ligavel num repo existente sem enxurrada: divida antiga nao
reprova ninguem, so o que o PR acrescenta reprova.
"""

import json
import os
import subprocess
import sys

MARCADOR = "<!-- gate-estilo -->"

lim_arquivo = os.environ.get("LIMITE_ARQUIVO", "500")
lim_funcao = os.environ.get("LIMITE_FUNCAO", "60")
lim_ccn = os.environ.get("LIMITE_CCN", "10")

# chave, rotulo, reprova quando aumenta
METRICAS = [
    ("arquivos_grandes", f"Arquivos com mais de {lim_arquivo} linhas", True),
    ("funcoes_longas", f"Funcoes com mais de {lim_funcao} linhas de codigo", True),
    ("complexidade_alta", f"Complexidade ciclomatica acima de {lim_ccn}", True),
    ("any_e_ts_ignore", "`any`, `@ts-ignore` e `@ts-expect-error`", True),
    ("nomes_vagos", "Nomes vagos declarados (`data`, `handler`, `Manager`)", True),
    ("console_log", "`console.log` fora dos diretorios de CLI", True),
    # Duplicacao nao reprova: bloco parecido e bloco identico se confundem, e
    # extrair a abstracao errada custa mais caro que a duplicacao.
    ("duplicacao", "Blocos duplicados", False),
]


def ler(caminho):
    """Le o TSV de medicao. Valor "na" vira None: a metrica nao pode ser medida.

    Sem esse caso o contador precisaria escolher um numero para representar
    falha, e qualquer numero escolhido mente — zero pareceria o melhor
    resultado possivel.
    """
    with open(caminho) as arquivo:
        pares = (linha.split("\t") for linha in arquivo.read().splitlines() if linha)
        return {c: (None if v == "na" else int(v)) for c, v in pares}


def gh(*argumentos):
    return subprocess.run(
        ["gh", *argumentos], capture_output=True, text=True, check=False
    )


def publicar_comentario(corpo, repo, pr):
    """Reaproveita o proprio comentario a cada push, em vez de empilhar um novo.

    Procura pelo marcador em vez de usar `--edit-last` porque este nao filtra
    por comentario nosso: se outro workflow comentar no PR, o edit-last
    sobrescreveria o comentario dele.
    """
    caminho = "/tmp/gate-estilo-comentario.md"
    with open(caminho, "w") as arquivo:
        arquivo.write(corpo)

    listagem = gh("api", f"repos/{repo}/issues/{pr}/comments", "--paginate")
    if listagem.returncode != 0:
        print(f"::warning::nao consegui listar comentarios: {listagem.stderr.strip()}")
        return
    anterior = next(
        (c for c in json.loads(listagem.stdout) if MARCADOR in (c.get("body") or "")),
        None,
    )

    if anterior:
        alvo = ["--method", "PATCH", f"repos/{repo}/issues/comments/{anterior['id']}"]
    else:
        alvo = ["--method", "POST", f"repos/{repo}/issues/{pr}/comments"]
    resultado = gh("api", *alvo, "-F", f"body=@{caminho}")
    if resultado.returncode != 0:
        print(f"::warning::nao consegui comentar no PR: {resultado.stderr.strip()}")


def main():
    antes, depois = ler(sys.argv[1]), ler(sys.argv[2])

    linhas, reprovou = [], False
    for chave, rotulo, reprova in METRICAS:
        a, d = antes.get(chave, 0), depois.get(chave, 0)
        if a is None or d is None:
            linhas.append(
                f"| {rotulo} | {'n/d' if a is None else a} | "
                f"{'n/d' if d is None else d} | ⚠️ não medido |"
            )
            continue
        delta = d - a
        if delta > 0 and reprova:
            marca, reprovou = f"❌ +{delta}", True
        elif delta > 0:
            marca = f"ℹ️ +{delta}"
        elif delta < 0:
            marca = f"✅ {delta}"
        else:
            marca = "✅"
        linhas.append(f"| {rotulo} | {a} | {d} | {marca} |")

    base_ref = os.environ.get("BASE_REF", "base")
    base_sha = os.environ.get("BASE_SHA", "")[:7]
    veredito = (
        "**Reprovado.** As metricas marcadas com ❌ aumentaram neste PR."
        if reprovou
        else "**Aprovado.** Nenhuma metrica piorou."
    )

    corpo = "\n".join(
        [
            MARCADOR,
            "## Gate de estilo",
            "",
            veredito,
            "",
            "| Metrica | `" + base_ref + "` | Este PR | |",
            "|---|---:|---:|---|",
            *linhas,
            "",
            f"Comparado com `{base_ref}@{base_sha}`. O gate cobra apenas o que o PR "
            "acrescenta — divida antiga nao reprova.",
            "",
            "Blocos duplicados e informativo e nunca reprova. Para excluir codigo "
            "vendorizado ou gerado, liste os globs em `.gate-estilo-ignore`.",
        ]
    )

    if resumo := os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(resumo, "a") as arquivo:
            arquivo.write(corpo + "\n")

    repo, pr = os.environ.get("REPO"), os.environ.get("PR")
    if repo and pr:
        publicar_comentario(corpo, repo, pr)

    print(corpo)
    sys.exit(1 if reprovou else 0)


if __name__ == "__main__":
    main()
