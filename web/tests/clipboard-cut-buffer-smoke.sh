#!/bin/sh
# Regression for the X11 selection bridge required by Guacamole VNC clipboard.
# Run only on an isolated display with autocutsel already running.
set -eu

: "${DISPLAY:?Set DISPLAY to an isolated Xvfb session}"
for binary in xprop xclip; do
  if ! command -v "$binary" >/dev/null 2>&1; then
    echo "MISSING_DEPENDENCY=$binary" >&2
    exit 2
  fi
done

nonce_from_vnc="PLANCIA_CUT_BUFFER_TO_CLIPBOARD_$$"
nonce_from_x11="PLANCIA_CLIPBOARD_TO_CUT_BUFFER_$$"

# x11vnc sets CUT_BUFFER0 after VNC ClientCutText. The bridge must become
# the selection owner, otherwise xclip cannot read CLIPBOARD.
xprop -root -f CUT_BUFFER0 8s -set CUT_BUFFER0 "$nonce_from_vnc"
ok=0
i=0
while [ "$i" -lt 50 ]; do
  if [ "$(xclip -selection clipboard -o 2>/dev/null || true)" = "$nonce_from_vnc" ]; then
    ok=1
    break
  fi
  i=$((i + 1))
  sleep 0.1
done
[ "$ok" -eq 1 ] || { echo 'CUT_BUFFER_TO_CLIPBOARD=FAIL' >&2; exit 1; }
echo 'CUT_BUFFER_TO_CLIPBOARD=PASS'

# The reverse direction is used when an X11 application copies text and
# x11vnc advertises ServerCutText to Guacamole's web clipboard.
printf '%s' "$nonce_from_x11" | xclip -selection clipboard -i
ok=0
i=0
while [ "$i" -lt 50 ]; do
  if xprop -root CUT_BUFFER0 2>/dev/null | grep -Fq "$nonce_from_x11"; then
    ok=1
    break
  fi
  i=$((i + 1))
  sleep 0.1
done
[ "$ok" -eq 1 ] || { echo 'CLIPBOARD_TO_CUT_BUFFER=FAIL' >&2; exit 1; }
echo 'CLIPBOARD_TO_CUT_BUFFER=PASS'
