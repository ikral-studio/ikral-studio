#!/bin/bash
# Publica IKRAL Studio en https://ikral.com/studio/ (Hostinger). Es la ÚNICA vía de publicar que tiene Kraken.
# Orden fijo: pruebas + build → respaldo del sitio actual (servidor + copia verificada en la unidad C)
# → subir dist/ → comprobar la página publicada (y Playwright contra ella). Si un paso falla, se detiene.
# Ensayo sin subir nada: tools/publicar-studio.sh --prueba (pruebas, build y respaldo verificado; se detiene antes de subir).
# Revertir: tools/publicar-studio.sh --revertir <archivo .tgz de /Volumes/c/respaldos/ikral-studio/publicaciones/>
set -euo pipefail
cd "$(dirname "$0")/.."
SSH=(ssh -p 65002 -i "$HOME/.ssh/id_ed25519_hostinger" -o BatchMode=yes u598821666@46.202.183.107)
D=domains/ikral.com/public_html/studio
URL=https://ikral.com/studio/
LOCAL=/Volumes/c/respaldos/ikral-studio/publicaciones
TS=$(date +%Y%m%d-%H%M%S)

subir() { # $1 = carpeta con el sitio
  rsync -a --delete -e "ssh -p 65002 -i $HOME/.ssh/id_ed25519_hostinger -o BatchMode=yes" "$1"/ "u598821666@46.202.183.107:$D/"
}

if [ "${1:-}" = "--revertir" ]; then
  T=$(mktemp -d); tar -xzf "$2" -C "$T"; subir "$T/studio"; rm -rf "$T"
  curl -fsS -o /dev/null "$URL" && echo "REVERTIDO a $2"; exit 0
fi

echo "1/4 pruebas y build"
npm test --silent
npm run build --silent

echo "2/4 respaldo del sitio publicado"
[ -d /Volumes/c ] || { echo "FALLA: la unidad C no está conectada; sin respaldo no se publica"; exit 1; }
mkdir -p "$LOCAL"
"${SSH[@]}" "mkdir -p ~/respaldos && tar -czf ~/respaldos/studio-$TS.tgz -C domains/ikral.com/public_html studio"
scp -P 65002 -i "$HOME/.ssh/id_ed25519_hostinger" -q "u598821666@46.202.183.107:respaldos/studio-$TS.tgz" "$LOCAL/"
tar -tzf "$LOCAL/studio-$TS.tgz" | grep -q '^studio/index.html$' || { echo "FALLA: el respaldo no se pudo verificar"; exit 1; }
echo "   respaldo verificado: $LOCAL/studio-$TS.tgz"

[ "${1:-}" = "--prueba" ] && { echo "PRUEBA OK: no se subió nada (respaldo $LOCAL/studio-$TS.tgz)"; exit 0; }

echo "3/4 subir dist/"
subir dist

echo "4/4 comprobar la página publicada"
JS=$(grep -o 'assets/index-[^"]*\.js' dist/index.html | head -1)
curl -fsS "$URL?v=$TS" | grep -q "$JS" || { echo "FALLA: la página publicada no tiene el build nuevo. Revertir con: $0 --revertir $LOCAL/studio-$TS.tgz"; exit 1; }
curl -fsS -o /dev/null "$URL$JS"
BASE_URL="$URL" npx playwright test --reporter=line || { echo "FALLA: Playwright contra la página publicada. Revertir con: $0 --revertir $LOCAL/studio-$TS.tgz"; exit 1; }
echo "PUBLICADO OK: $URL · build $JS · commit $(git log -1 --format=%h) · respaldo $LOCAL/studio-$TS.tgz"
