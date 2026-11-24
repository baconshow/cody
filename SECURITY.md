# Security

Please report a vulnerability privately, through GitHub's **Report a vulnerability** button on the repository's
Security tab. Do not open a public issue for it. You will get an answer within a week.

## What Cody protects

- The server listens on `127.0.0.1` only. Every request needs an allowed `Host`; every `/api` route needs a token
  that changes on each start; cross-site requests are refused (`Sec-Fetch-Site`); the page has a strict
  Content-Security-Policy with no outside origins.
- From the phone (Tailscale serve), only your own Tailscale login gets in by default; Tailscale Funnel web
  requests are refused. Cody's own settings and buttons (settings, the ElevenLabs key, hooks, opening the voice session,
  Tailscale steps) are refused through Tailscale: only the computer itself can use them.
- The voice channel listens on `127.0.0.1` and needs a secret kept in a file only you can read.
- Cody pre-approves only five of its own tools (reply, timer, remember, forget, point); the development-channel
  confirmation is always yours to answer. Everything else is up to the permission mode that session is in and to your own
  rules: in auto mode most things run without a question, `screenshot` and `look` included when its own check lets them.
- The ElevenLabs key is kept on the computer, sent only to ElevenLabs and never returned by the API.

## Trust model

Anyone who can load the page can talk to your Claude session: programs on this computer, your own Tailscale login and, on a
tagged machine without `allowed_logins`, every device in your tailnet. Anyone near an open page can too: Cody does not
recognize voices, so whoever is heard can ask for something, say the *yes* and message your other Claude sessions. A spoken
*"take a screenshot"* asks no one and no rule stops it: the picture goes to the page that asked. Keep the tailnet yours.
