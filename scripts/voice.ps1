# voice.ps1 - starts a Claude Code session that listens to the mascot: hold the mascot (or say "Cody") and what you
# say arrives here as a message; Claude's short reply goes back and the mascot speaks it.
#
#   .\scripts\voice.ps1                  in the current folder
#   .\scripts\voice.ps1 C:\path\to\repo  in another working folder
#
# Channels are a research preview: a custom channel only loads with --dangerously-load-development-channels, and
# Claude Code asks for a confirmation at startup (choose "I am using this for local development"). The MCP config goes
# to a temp file used by this session only: no other session loads the channel.
#
# The mascot's harmless tools run without asking (reply, timers, memory, pointing); the two that capture the screen,
# screenshot and look, still ask for your permission (by voice too). CODY_VOICE=1 tells Cody's hooks (cody/hooks.py)
# that this is the voice session, where the mascot already does the talking.

$ErrorActionPreference = 'Stop'
$channel = Join-Path (Split-Path $PSScriptRoot -Parent) 'cody\channel.py'
$folder = if ($args.Count -gt 0) { $args[0] } else { (Get-Location).Path }
$config = Join-Path $env:TEMP 'cody.mcp.json'
$python = if (Get-Command python -ErrorAction SilentlyContinue) { 'python' } else { 'py' }

$json = @{ mcpServers = @{ cody = @{ command = $python; args = @($channel) } } } | ConvertTo-Json -Depth 5
[System.IO.File]::WriteAllText($config, $json, (New-Object System.Text.UTF8Encoding $false))   # no BOM

$allowed = 'reply', 'timer', 'remember', 'forget', 'point' | ForEach-Object { "mcp__cody__$_" }

Set-Location $folder
$env:CODY_VOICE = '1'                  # only for this session: removed again when Claude Code exits
try {
    claude --mcp-config $config --dangerously-load-development-channels server:cody --allowedTools @allowed
} finally {
    Remove-Item Env:CODY_VOICE -ErrorAction SilentlyContinue
}
