#!/usr/bin/env bash
# loop-encode.sh <frames dir> <out base> [start s] [end s]
#
# Cuts [start, end] out of a 60 fps frame sequence, makes it loop seamlessly (its last X seconds are dissolved into its
# first X, so the end runs straight back into the start), crops to the target aspect from the middle of the frame, and writes:
#   <out>.mp4      H.264, faststart, no audio          (every browser)
#   <out>.webm     AV1 (SVT-AV1)                       (smaller; list it first in <video>)
#   <out>.sm.webp  poster: the loop's first frame
#   with SM=1 also <out>.sm.mp4 / <out>.sm.webm at half width (thumbnails, "next project" previews)
#
# Settings (environment):
#   X=0.6          dissolve length in seconds (0.5-0.8 hides most seams; longer ghosts)
#   ASPECT=16:10   crop to this aspect from the middle of the frame (ASPECT=none keeps the frame as filmed)
#   WIDTH=1280     output width
#   LOOK=ui        ui: flat interface, type, scrolling (H.264 CRF 27, AV1 CRF 50, poster q62)
#                  rich: renders, photoreal, film grain, gradients (H.264 CRF 19-21, AV1 CRF 33, poster q82)
#   CRF= AV1CRF=   override either
#   PATTERN=       frame file pattern (default b-%05d.jpg if present, else s-%05d.jpg, else %05d.jpg)
set -euo pipefail
export SVT_LOG=${SVT_LOG:-1}   # SVT-AV1: errors only
src=${1:?usage: loop-encode.sh <frames dir> <out base> [start s] [end s]}; out=${2:?out base}
X=${X:-0.6}; ASPECT=${ASPECT:-16:10}; WIDTH=${WIDTH:-1280}; LOOK=${LOOK:-ui}
if [[ $LOOK == rich ]]; then CRF=${CRF:-20}; AV1CRF=${AV1CRF:-33}; PQ=82; else CRF=${CRF:-27}; AV1CRF=${AV1CRF:-50}; PQ=62; fi
if [[ -z ${PATTERN:-} ]]; then
  for p in b-%05d.jpg s-%05d.jpg %05d.jpg f-%05d.jpg; do [[ -f $src/${p/\%05d/00000} ]] && { PATTERN=$p; break; }; done
fi
[[ -n ${PATTERN:-} ]] || { echo "no frames found in $src"; exit 1; }
# count by decoding the sequence itself, so any PATTERN works (%04d, f-%05d.png ...)
n=$(ffprobe -v error -f image2 -framerate 60 -i "$src/$PATTERN" -count_frames -select_streams v:0 -show_entries stream=nb_read_frames -of csv=p=0 2>/dev/null || true)
[[ $n =~ ^[0-9]+$ && $n -gt 0 ]] || { echo "no frames matching $PATTERN in $src (it must start at 0, numbered without gaps)"; exit 1; }
full=$(printf "%.4f" "$(echo "scale=4; $n / 60" | bc)")
a=${3:-0}; b=${4:-$full}
L=$(printf "%.4f" "$(echo "$b - $a" | bc)"); off=$(printf "%.4f" "$(echo "$L - 2*$X" | bc)")
(( $(echo "$off > 0" | bc) )) || { echo "window ${L}s too short for a ${X}s dissolve"; exit 1; }
mkdir -p "$(dirname "$out")"

if [[ $ASPECT == none ]]; then CROP=""; else
  AW=${ASPECT%:*}; AH=${ASPECT#*:}
  CROP="crop='min(iw\,ih*$AW/$AH)':'min(ih\,iw*$AH/$AW)',"
fi
# the middle from X on, then its tail dissolved into the head [0, X]: the output is L - X long and its last frame runs into its first
LOOP="trim=start=$a:end=$b,setpts=PTS-STARTPTS,split[s1][s2];[s1]trim=start=$X,setpts=PTS-STARTPTS[m];[s2]trim=end=$X,setpts=PTS-STARTPTS[h];[m][h]xfade=transition=fade:duration=$X:offset=$off,${CROP}format=yuv420p"
H264=(-c:v libx264 -preset slow -profile:v high -pix_fmt yuv420p -g 120 -movflags +faststart -an)
AV1=(-c:v libsvtav1 -preset 4 -g 240 -pix_fmt yuv420p -an)

if [[ ${SM:-} ]]; then
  ffmpeg -v error -y -framerate 60 -i "$src/$PATTERN" -filter_complex "$LOOP,split[v1][v2];[v1]scale=$WIDTH:-2:flags=lanczos[big];[v2]scale=$((WIDTH/2)):-2:flags=lanczos[s]" \
    -map "[big]" "${H264[@]}" -crf "$CRF" "$out.mp4" -map "[s]" "${H264[@]}" -crf $((CRF+1)) "$out.sm.mp4"
  ffmpeg -v error -y -i "$out.sm.mp4" "${AV1[@]}" -crf "$AV1CRF" "$out.sm.webm" || echo "(no AV1 encoder: $out.sm.webm skipped)"
else
  ffmpeg -v error -y -framerate 60 -i "$src/$PATTERN" -filter_complex "$LOOP,scale=$WIDTH:-2:flags=lanczos" "${H264[@]}" -crf "$CRF" "$out.mp4"
fi
# AV1 from the frames, not from the H.264 (no second generation of loss)
ffmpeg -v error -y -framerate 60 -i "$src/$PATTERN" -filter_complex "$LOOP,scale=$WIDTH:-2:flags=lanczos" "${AV1[@]}" -crf "$AV1CRF" "$out.webm" \
  || echo "(no AV1 encoder in this ffmpeg: $out.webm skipped; the .mp4 alone plays everywhere)"

# poster: the loop's first frame. ffmpeg's own WebP encoder if it has one, else cwebp
PD=$(mktemp -d); P=$PD/poster.png
ffmpeg -v error -y -i "$out.mp4" -frames:v 1 -vf "scale=$((WIDTH*3/4)):-2:flags=lanczos" "$P"
if ffmpeg -hide_banner -encoders 2>/dev/null | grep -q libwebp; then ffmpeg -v error -y -i "$P" -c:v libwebp -quality $PQ "$out.sm.webp"
elif command -v cwebp >/dev/null; then cwebp -quiet -q $PQ "$P" -o "$out.sm.webp"
else echo "(no WebP encoder: install cwebp; poster left as PNG)"; cp "$P" "$out.sm.png"; fi
rm -f -- "$P"; rmdir -- "$PD"

for f in "$out".*; do printf "%-40s %8s KB\n" "$(basename "$f")" $(( $(wc -c < "$f") / 1024 )); done
ffprobe -v error -count_frames -select_streams v:0 -show_entries stream=codec_name,width,height,nb_read_frames -show_entries format=duration -of compact "$out.mp4"
