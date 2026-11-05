---
description: Open Cody's voice session in a new terminal window, in this folder or the one given
argument-hint: "[folder]"
---

Open Cody's voice session (a Claude Code session that listens to the mascot) in a new terminal window:

```
python3 "${CLAUDE_PLUGIN_ROOT}/cody.py" --voice-window "$ARGUMENTS"
```

If `python3` is not found, try `python`, then `py -3`. Then tell the user, in one or two sentences:
- the new window asks to confirm the development channel: choose "I am using this for local development" (Cody's
  voice channel is a research preview, so Claude Code always asks; nothing can or should skip that);
- hold the mascot, or say "Cody", and speak.

If the command says a voice session is already running, say so and stop. If it says Claude Code or a terminal
program was not found, pass that message on.
