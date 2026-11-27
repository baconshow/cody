# Privacy

Short version: **Cody sends nothing to its author.** No account, no analytics, no tracking.

Kept on your computer: timers, memory, custom scenes, hook events (time, kind and the first characters of a session id),
settings, the ElevenLabs key, screenshots (in memory and on the clipboard; the latest five as files, only when Claude was asked to hand one on), the latest 50 pictures sent with the clip. From Claude Code's transcripts
the page learns tool names, failures, code edits, session ids and times: never commands, paths, output or conversation
text. For the headphones,
on Windows, Cody asks the system whether any player is playing: one yes or no, never the song, the artist or the
app (off in Settings). Reading your Windows notifications is off by default; on, Cody reads the app's name and
the first line (the title) of the important ones, never the body, and sends them to your own Cody pages and app (with
ElevenLabs, only the app's name is sent for the voice). Typing along is off by default; on, Cody checks only
that input arrived while the pointer stayed put and a Claude window was in front: never which keys, no keyboard
hook, nothing recorded.

What leaves your computer, and only because you use it:

| What | Goes to | When |
|---|---|---|
| What you say, the facts Cody remembers, the pictures you send, what Claude reads or sees to answer (files, your screen with `look`), and its replies | Your own Claude Code session (Anthropic, under your account) | Voice session |
| Your speech audio | Your browser's speech service (Google, in Chrome) | While the microphone listens: with the wake word on (the default), whenever the page is on screen |
| The text Cody speaks | ElevenLabs, or your browser's voice service if the device's voice is an online one | Only if you chose that voice |
| A request for the latest version number | GitHub | Only if you turn on "Tell me when there is a new version" (off by default) |
| Your phone's connection | Tailscale, inside your own tailnet | Only if you set up the phone |
| The Android app's requests (the token, the heads-up list) | Your own computer, through your tailnet; nowhere else | Only with the app installed and paired; the "even with the app closed" switch is off by default |

Cody's hosted voice is not offered yet. If it ever is, it will be opt-in, explained on screen ("the spoken text
passes through the Cody server and is not kept"), and this page will list it before it ships.
