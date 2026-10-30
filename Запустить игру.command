#!/bin/bash
cd -- "$(dirname -- "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo 'Сначала установите Node.js LTS с https://nodejs.org/'
  read -r -p 'Нажмите Enter, чтобы закрыть окно.'
  exit 1
fi
node server.mjs
read -r -p 'Нажмите Enter, чтобы закрыть окно.'
