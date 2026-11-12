#!/bin/bash
# Screenshot a scene folder in real Chrome (GPU). Usage: ../shot.sh <folder> <out.png> [seconds=5] [width=1920] [height=1080]
# A screenshot service takes one shot at a time for every agent on this machine, so this may wait a little.
[ -z "$2" ] && { echo "usage: ../shot.sh <folder> <out.png> [seconds] [width] [height]"; exit 1; }
Q="$HOME/koi-arena/_queue"; id="$(date +%s%N)-$$-$RANDOM"
dir="$(cd "$1" && pwd)"; mkdir -p "$(dirname "$2")"; out="$(cd "$(dirname "$2")" && pwd)/$(basename "$2")"
printf '{"dir":"%s","out":"%s","secs":"%s","w":"%s","h":"%s"}' "$dir" "$out" "${3:-5}" "${4:-1920}" "${5:-1080}" > "$Q/$id.req.tmp" && mv "$Q/$id.req.tmp" "$Q/$id.req"
for i in $(seq 1 1200); do [ -f "$Q/$id.res" ] && { cat "$Q/$id.res"; rm -f "$Q/$id.res"; exit 0; }; sleep 0.5; done
echo "error: screenshot service did not answer in 10 minutes"; rm -f "$Q/$id.req"; exit 1
