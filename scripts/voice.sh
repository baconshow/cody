#!/usr/bin/env sh
# voice.sh - starts a Claude Code session that listens to the mascot: hold the mascot (or say "Cody") and what you
# say arrives here as a message; Claude's short reply goes back and the mascot speaks it.
#
#   ./scripts/voice.sh                 in the current folder
#   ./scripts/voice.sh ~/code/my-repo  in another working folder
#
# Channels are a research preview: a custom channel only loads with --dangerously-load-development-channels, and
# Claude Code asks for a confirmation at startup (choose "I am using this for local development"). The MCP config goes
# to a temp file used by this session only: no other session loads the channel.
set -eu

here=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
channel="$here/cody/channel.py"
folder="${1:-$PWD}"
python=$(command -v python3 || command -v python)
config=$(mktemp "${TMPDIR:-/tmp}/cody.XXXXXX")

printf '{"mcpServers":{"cody":{"command":"%s","args":["%s"]}}}\n' "$python" "$channel" > "$config"

cd "$folder"
exec claude --mcp-config "$config" --dangerously-load-development-channels server:cody
