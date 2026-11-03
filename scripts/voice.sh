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
#
# The mascot's harmless tools run without asking (reply, timers, memory, pointing); the two that capture the screen,
# screenshot and look, still ask for your permission (by voice too). CODY_VOICE=1 tells Cody's hooks (cody/hooks.py)
# that this is the voice session, where the mascot already does the talking.
set -eu

here=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
channel="$here/cody/channel.py"
folder="${1:-$PWD}"
python=$(command -v python3 || command -v python)
config=$(mktemp "${TMPDIR:-/tmp}/cody.XXXXXX")

printf '{"mcpServers":{"cody":{"command":"%s","args":["%s"]}}}\n' "$python" "$channel" > "$config"

cd "$folder"
export CODY_VOICE=1
exec claude --mcp-config "$config" --dangerously-load-development-channels server:cody   --allowedTools mcp__cody__reply mcp__cody__timer mcp__cody__remember mcp__cody__forget mcp__cody__point
