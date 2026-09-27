#!/bin/sh
# render 4 stills and tile them 2x2 into out/sheet.png:  ./sheet.sh 1.0 2.0 3.0 4.0
set -e
cd "$(dirname "$0")"
node render.mjs stills "$@" >/dev/null
set -- $(for t in "$@"; do printf 'out/stills/t%05.2f.png ' "$t"; done)
bin/ffmpeg -y -loglevel error -i "$1" -i "$2" -i "$3" -i "$4" -filter_complex \
  "[0]scale=960:540[a];[1]scale=960:540[b];[2]scale=960:540[c];[3]scale=960:540[d];[a][b][c][d]xstack=inputs=4:layout=0_0|w0_0|0_h0|w0_h0" out/sheet.png
