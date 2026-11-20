# voice.ps1 - starts a Claude Code session that listens to the mascot: hold the mascot (or say "Cody") and what you
# say arrives here as a message; Claude's short reply goes back and the mascot speaks it.
#
#   .\scripts\voice.ps1                  in the current folder
#   .\scripts\voice.ps1 C:\path\to\repo  in another working folder
#
# The work is done by `python cody.py --voice` (cody/launcher.py): it writes the channel's MCP config to the data
# folder (no fixed path in %TEMP%) and starts Claude Code with the channel. Claude Code asks you to confirm the
# development channel at startup: choose "I am using this for local development".

$ErrorActionPreference = 'Stop'
$cody = Join-Path (Split-Path $PSScriptRoot -Parent) 'cody.py'
$folder = if ($args.Count -gt 0) { $args[0] } else { (Get-Location).Path }
$python = if (Get-Command python -ErrorAction SilentlyContinue) { 'python' } else { 'py' }
& $python $cody --voice $folder
exit $LASTEXITCODE
