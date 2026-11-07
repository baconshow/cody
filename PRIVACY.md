# Privacy

Short version: **Cody sends nothing to its author.** No account, no analytics, no tracking.

What stays on your computer: timers, memory, hook events (time, kind and the first characters of a session id),
settings, the ElevenLabs key, screenshots (in memory). What the page learns from Claude Code's transcripts is the
tool name and whether a command failed: never commands, paths, output or conversation text. For the headphones,
on Windows, Cody asks the system whether any player is playing: one yes or no, never the song, the artist or the
app (off in Settings). Reading your Windows notifications is off by default; on, Cody reads the app's name and
the first line (the title) of the important ones, never the body, and keeps them on this computer (with
ElevenLabs, only the app's name is sent for the voice).

What leaves your computer, and only because you use it:

| What | Goes to | When |
|---|---|---|
| What you say and Claude's replies | Your own Claude Code session (Anthropic, under your account) | Voice session |
| Your speech audio | Your browser's speech service (Google, in Chrome) | When you talk to the mascot |
| The text Cody speaks | ElevenLabs | Only if you chose ElevenLabs with your own key |
| A request for the latest version number | GitHub | Only if you turn on "Tell me when there is a new version" (off by default) |
| Your phone's connection | Tailscale, inside your own tailnet | Only if you set up the phone |

Cody's hosted voice is not offered yet. If it ever is, it will be opt-in, explained on screen ("the spoken text
passes through the Cody server and is not kept"), and this page will list it before it ships.
