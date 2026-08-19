#!/usr/bin/env bash
# Aguarda os workflows que precisam estar verdes antes de publicar um artefato.
#
# A publicação roda em workflows separados do CI e da segurança. Sem esta
# espera, os três começam juntos no mesmo push e a imagem/pacote pode sair
# enquanto um gate ainda está executando ou já falhou.
set -euo pipefail

: "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY não definido}"
: "${GITHUB_SHA:?GITHUB_SHA não definido}"
: "${GH_TOKEN:?GH_TOKEN não definido}"

for workflow in ci.yml security.yml; do
  concluido=false

  for tentativa in $(seq 1 60); do
    if ! runs=$(gh run list \
      --repo "$GITHUB_REPOSITORY" \
      --workflow "$workflow" \
      --commit "$GITHUB_SHA" \
      --limit 20 \
      --json status,conclusion,createdAt,databaseId); then
      echo "::error::não consegui consultar as execuções de $workflow"
      exit 1
    fi

    run=$(jq -c 'sort_by(.createdAt) | last // empty' <<< "$runs")

    if [ -z "$run" ]; then
      echo "[$workflow] ainda não iniciou para $GITHUB_SHA (tentativa $tentativa/60)"
    else
      status=$(jq -r '.status' <<< "$run")
      conclusion=$(jq -r '.conclusion // ""' <<< "$run")
      id=$(jq -r '.databaseId' <<< "$run")
      echo "[$workflow] run $id: $status${conclusion:+ ($conclusion)}"

      if [ "$status" = completed ]; then
        if [ "$conclusion" != success ]; then
          echo "::error::${workflow} terminou com $conclusion; publicação bloqueada"
          exit 1
        fi
        concluido=true
        break
      fi
    fi

    sleep 30
  done

  if [ "$concluido" != true ]; then
    echo "::error::timeout aguardando $workflow; publicação bloqueada"
    exit 1
  fi
done
