# Security

Please report a vulnerability privately, through GitHub's **Report a vulnerability** button on the repository's
Security tab. Do not open a public issue for it. You will get an answer within a week.

## What Cody protects

- The server listens on `127.0.0.1` only. Every request needs an allowed `Host`; every `/api` route needs a token
  that changes on each start; cross-site requests are refused (`Sec-Fetch-Site`); the page has a strict
  Content-Security-Policy with no outside origins.
- From the phone (Tailscale serve), only your own Tailscale login gets in by default; Tailscale Funnel requests are
  always refused. Anything that changes the computer (settings, the ElevenLabs key, hooks, opening the voice
  session, Tailscale steps) is refused through Tailscale: only the computer itself can do it.
- The voice channel listens on `127.0.0.1` and needs a secret kept in a file only you can read.
- Cody never skips Claude Code's permission prompts: `screenshot` and `look` always ask, and the development-channel
  confirmation is always yours to answer.
- The ElevenLabs key stays on the computer (data folder, mode 600) and is never returned by the API.

## Trust model

Anyone who can load the page can talk to your Claude session: programs on this computer and, without
`allowed_logins`, every device in your tailnet. Keep the tailnet yours.
