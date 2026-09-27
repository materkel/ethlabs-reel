#!/bin/sh
# 30 stills from t0 every dt seconds, tiled 6x5 at 320x180 into out/strip.png:  ./strip.sh 0 0.5
set -e
cd "$(dirname "$0")"
T=$(node -e "const [a,d]=process.argv.slice(1).map(Number);console.log(Array.from({length:30},(_, i)=>(a+i*d).toFixed(2)).join(' '))" "$1" "$2")
node render.mjs stills $T >/dev/null
IN=""; F=""; S=""; i=0
for t in $T; do IN="$IN -i $(printf 'out/stills/t%05.2f.png' "$t")"; F="$F[$i]scale=320:180[v$i];"; S="$S[v$i]"; i=$((i+1)); done
L=$(node -e "console.log(Array.from({length:30},(_, i)=>((i%6)*320)+'_'+(Math.floor(i/6)*180)).join('|'))")
bin/ffmpeg -y -loglevel error $IN -filter_complex "${F}${S}xstack=inputs=30:layout=$L" out/strip.png
