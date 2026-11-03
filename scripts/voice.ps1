# voice.ps1 - starts a Claude Code session that listens to the mascot: hold the mascot (or say "Cody") and what you
# say arrives here as a message; Claude's short reply goes back and the mascot speaks it.
#
#   .\scripts\voice.ps1                  in the current folder
#   .\scripts\voice.ps1 C:\path\to\repo  in another working folder
#
# Channels are a research preview: a custom channel only loads with --dangerously-load-development-channels, and
# Claude Code asks for a confirmation at startup (choose "I am using this for local development"). The MCP config goes
# to a temp file used by this session only: no other session loads the channel.

$ErrorActionPreference = 'Stop'
$channel = Join-Path (Split-Path $PSScriptRoot -Parent) 'cody\channel.py'
$folder = if ($args.Count -gt 0) { $args[0] } else { (Get-Location).Path }
$config = Join-Path $env:TEMP 'cody.mcp.json'
$python = if (Get-Command python -ErrorAction SilentlyContinue) { 'python' } else { 'py' }

$json = @{ mcpServers = @{ cody = @{ command = $python; args = @($channel) } } } | ConvertTo-Json -Depth 5
[System.IO.File]::WriteAllText($config, $json, (New-Object System.Text.UTF8Encoding $false))   # no BOM

Set-Location $folder
claude --mcp-config $config --dangerously-load-development-channels server:cody
