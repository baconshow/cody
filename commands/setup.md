---
description: Check Cody and set up what is missing, step by step (server, hooks, phone through Tailscale)
allowed-tools: Bash(python3:*), Bash(python:*), Bash(py:*)
---

Help the user get Cody working. Use `python3` below; if it is not found, try `python`, then `py -3`.

1. Run the doctor and read it:
   ```
   python3 "${CLAUDE_PLUGIN_ROOT}/cody.py" --doctor
   ```
2. If the mascot server is not running, start it in the background and open the mascot in the browser:
   ```
   python3 "${CLAUDE_PLUGIN_ROOT}/cody.py" --start
   ```
3. This plugin already brings Cody's hooks: never run `--install-hooks` too (that would add a second copy).
4. For the phone, explain the Tailscale steps the doctor prints (Cody only uses `tailscale serve`, inside the user's
   own tailnet, never Funnel). Ask before running any Tailscale command.
5. Run the doctor again and tell the user, in a few short lines, what is ready and what is left. Finish with: "Run
   /cody:voice to talk to Cody."

Never ask for or handle any key or password. The ElevenLabs key, if the user wants one, is typed in Cody's own
settings screen, not here.
