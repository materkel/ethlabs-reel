#!/bin/sh
# 12 stills from t0 every dt seconds, tiled 4x3 at 480x270 into out/strip12.png:  ./strip12.sh 1.4 0.05
set -e
cd "$(dirname "$0")"
T=$(node -e "const [a,d]=process.argv.slice(1).map(Number);console.log(Array.from({length:12},(_, i)=>(a+i*d).toFixed(2)).join(' '))" "$1" "$2")
node render.mjs stills $T >/dev/null
IN=""; F=""; S=""; i=0
for t in $T; do IN="$IN -i $(printf 'out/stills/t%05.2f.png' "$t")"; F="$F[$i]scale=480:270,drawtext=fontfile=/System/Library/Fonts/Supplemental/Arial.ttf:text='$t':x=8:y=8:fontsize=18:fontcolor=0x999999[v$i];"; S="$S[v$i]"; i=$((i+1)); done
L=$(node -e "console.log(Array.from({length:12},(_, i)=>((i%4)*480)+'_'+(Math.floor(i/4)*270)).join('|'))")
bin/ffmpeg -y -loglevel error $IN -filter_complex "${F}${S}xstack=inputs=12:layout=$L" out/strip12.png
