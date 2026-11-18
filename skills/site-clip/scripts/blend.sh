#!/usr/bin/env bash
# blend.sh <frames dir> [sub]  — average the recorder's sub-frames down to 60 fps with motion blur.
# With sub=120 each 60 fps frame is the mean of two pictures (a half-open shutter); sub=240 averages four.
# Reads <dir>/s-NNNNN.jpg, writes <dir>/b-NNNNN.jpg. sub=60 just copies (no blur).
set -euo pipefail
D=${1:?usage: blend.sh <frames dir> [sub, default 120]}; SUB=${2:-120}
[[ -f $D/s-00000.jpg ]] || { echo "no $D/s-00000.jpg"; exit 1; }
shopt -s nullglob
old=("$D"/b-[0-9][0-9][0-9][0-9][0-9].jpg)
(( ${#old[@]} )) && rm -f -- "${old[@]}"   # this script's own outputs from an earlier run: a shorter re-take must not keep them
K=$(( SUB / 60 ))
(( K * 60 == SUB )) || { echo "sub must be a multiple of 60"; exit 1; }
if (( K == 1 )); then
  ffmpeg -v error -y -framerate 60 -i "$D/s-%05d.jpg" -q:v 2 -start_number 0 "$D/b-%05d.jpg"
else
  ffmpeg -v error -y -framerate "$SUB" -i "$D/s-%05d.jpg" \
    -vf "tmix=frames=$K,select='eq(mod(n\,$K)\,$((K-1)))',setpts=N/60/TB" -fps_mode passthrough -q:v 2 -start_number 0 "$D/b-%05d.jpg"
fi
subs=("$D"/s-[0-9][0-9][0-9][0-9][0-9].jpg); outs=("$D"/b-[0-9][0-9][0-9][0-9][0-9].jpg)
echo "$D: ${#subs[@]} sub-frames -> ${#outs[@]} frames at 60 fps"
