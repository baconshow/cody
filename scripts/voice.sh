#!/usr/bin/env sh
# voice.sh - starts a Claude Code session that listens to the mascot: hold the mascot (or say "Cody") and what you
# say arrives here as a message; Claude's short reply goes back and the mascot speaks it.
#
#   ./scripts/voice.sh                 in the current folder
#   ./scripts/voice.sh ~/code/my-repo  in another working folder
#
# The work is done by `python cody.py --voice` (cody/launcher.py): it writes the channel's MCP config to the data
# folder with a real JSON encoder and starts Claude Code with the channel. Claude Code asks you to confirm the
# development channel at startup: choose "I am using this for local development".
set -eu

here=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
python=$(command -v python3 || command -v python)
exec "$python" "$here/cody.py" --voice "${1:-$PWD}"
