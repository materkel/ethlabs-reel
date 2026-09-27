#!/bin/sh
# render 16 stills and tile them 4x4 into out/sheet16.png:  ./sheet16.sh t1 ... t16
set -e
cd "$(dirname "$0")"
node render.mjs stills "$@" >/dev/null
IN=""; F=""; i=0
for t in "$@"; do IN="$IN -i $(printf 'out/stills/t%05.2f.png' "$t")"; F="$F[$i]scale=480:270[v$i];"; i=$((i+1)); done
L="0_0|w0_0|w0+w1_0|w0+w1+w2_0|0_h0|w0_h0|w0+w1_h0|w0+w1+w2_h0|0_h0+h4|w0_h0+h4|w0+w1_h0+h4|w0+w1+w2_h0+h4|0_h0+h4+h8|w0_h0+h4+h8|w0+w1_h0+h4+h8|w0+w1+w2_h0+h4+h8"
bin/ffmpeg -y -loglevel error $IN -filter_complex "${F}[v0][v1][v2][v3][v4][v5][v6][v7][v8][v9][v10][v11][v12][v13][v14][v15]xstack=inputs=16:layout=$L" out/sheet16.png
