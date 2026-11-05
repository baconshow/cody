---
description: Show what is on and off in Cody (server, voice session, hooks, Tailscale, phone, voice provider)
allowed-tools: Bash(python3:*), Bash(python:*), Bash(py:*)
---

Run Cody's doctor and report the result to the user:

```
python3 "${CLAUDE_PLUGIN_ROOT}/cody.py" --doctor
```

If `python3` is not found, try `python`, then `py -3`. The doctor prints one line per item with OK, WARN or FAIL and
what to do. Summarize it in a few short lines: first what is not working and the fix it suggests, then what works.
Do not run any fix yourself unless the user asks.
