#!/bin/sh
# Full render: sync export → soundtrack → 10 parallel 1.5 s chunks @ 60 fps → concat → mux (+ web copy, poster).
set -e
cd "$(dirname "$0")"
mkdir -p out/seg
node render.mjs eval 'JSON.stringify(window.SYNC)' | node -e "let b='';process.stdin.on('data',(d)=>(b+=d)).on('end',()=>require('fs').writeFileSync('out/sync.json',JSON.parse(b)))"
node synth.mjs
for i in 0 1 2 3 4 5 6 7 8 9; do
  node render.mjs video 60 $(node -e "console.log($i*1.5, $i*1.5+1.5)") out/seg/$i.mp4 > out/seg/$i.log 2>&1 &
done
wait
printf "file '%s'\n" seg/0.mp4 seg/1.mp4 seg/2.mp4 seg/3.mp4 seg/4.mp4 seg/5.mp4 seg/6.mp4 seg/7.mp4 seg/8.mp4 seg/9.mp4 > out/seg.txt
bin/ffmpeg -y -hide_banner -loglevel error -f concat -safe 0 -i out/seg.txt -i out/audio.wav \
  -map 0:v -map 1:a -c:v copy -c:a aac -b:a 320k -shortest -movflags +faststart out/ethlabs.mp4
bin/ffmpeg -y -hide_banner -loglevel error -i out/ethlabs.mp4 -c:v libx264 -preset slow -crf 21 -pix_fmt yuv420p -color_primaries bt709 -color_trc bt709 -colorspace bt709 \
  -c:a aac -b:a 192k -movflags +faststart out/ethlabs-web.mp4
node render.mjs stills 14.9 >/dev/null && cp out/stills/t14.90.png out/poster.png
ls -la out/ethlabs.mp4 out/ethlabs-web.mp4 out/poster.png
