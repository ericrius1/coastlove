#!/bin/zsh
cd -- "${0:A:h}"
if curl --fail --silent http://127.0.0.1:5190/ > /dev/null; then
  open -a 'Google Chrome' http://127.0.0.1:5190
  exit 0
fi
if [[ ! -d node_modules ]]; then npm install || exit 1; fi
npm run dev -- --strictPort &
coastlove_server=$!
trap 'kill "$coastlove_server" 2>/dev/null' EXIT INT TERM
for coastlove_attempt in {1..50}; do
  if curl --fail --silent http://127.0.0.1:5190/ > /dev/null; then
    open -a 'Google Chrome' http://127.0.0.1:5190
    break
  fi
  sleep 0.2
done
wait "$coastlove_server"
