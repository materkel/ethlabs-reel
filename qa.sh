#!/bin/sh
# 16 frames decoded from the final MP4 (BT.709), tiled 4x4 into out/qa/sheet.png:  ./qa.sh t1 ... t16
set -e
cd "$(dirname "$0")"
mkdir -p out/qa
IN=""; F=""; S=""; i=0
for t in "$@"; do
  bin/ffmpeg -y -hide_banner -loglevel error -ss "$t" -i out/ethlabs.mp4 -frames:v 1 -vf "scale=in_color_matrix=bt709:in_range=tv" out/qa/$i.png
  IN="$IN -i out/qa/$i.png"; F="$F[$i]scale=480:270[v$i];"; S="$S[v$i]"; i=$((i+1))
done
L="0_0|480_0|960_0|1440_0|0_270|480_270|960_270|1440_270|0_540|480_540|960_540|1440_540|0_810|480_810|960_810|1440_810"
bin/ffmpeg -y -loglevel error $IN -filter_complex "${F}${S}xstack=inputs=16:layout=$L" out/qa/sheet.png
