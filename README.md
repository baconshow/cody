# Cody

A little desk pet for [Claude Code](https://code.claude.com). It lives on your phone (or in a browser tab), watches
what Claude is doing on your computer and reacts: it grabs a magnifier when Claude searches, types on a tiny
keyboard when Claude writes code, thinks while commands run, hops when a subagent finishes, gets sleepy when nothing
happens and falls asleep (zzZ) when Claude is closed.

You can also **talk to it**. Hold Cody (or say "Cody") and ask anything: your words go into a real Claude
Code session on your computer, and the mascot answers out loud in one or two short sentences. Honestly, it answers
far better than Alexa, because it *is* Claude Code: your files, your tools, your context.

> **Unofficial fan project.** Not affiliated with, endorsed by or sponsored by Anthropic. Claude and Claude Code are
> trademarks of Anthropic, PBC. Cody is fan art. Not related to Sourcegraph's Cody either.

## What it costs

**Nothing extra, out of the box.**

| Piece | Cost |
|---|---|
| Cody | Free, MIT license |
| Claude | **No API key and no API billing.** Voice commands run inside your normal Claude Code session, so they count against your Claude subscription (Pro or Max) like any message you type |
| Phone access | [Tailscale](https://tailscale.com/pricing) Personal plan: free (up to 6 users, unlimited devices) |
| Mascot voice | Your phone's built-in voice: free and unlimited |
| Nicer voice (optional) | [ElevenLabs](https://elevenlabs.io/pricing): free tier of 10,000 credits a month, paid plans from $6 a month |

### Optional ElevenLabs voice: a cost simulation

The mascot is told to answer in at most two short sentences, so a reply is about **100 characters**. With the
default model, Flash v2.5, ElevenLabs charges between 0.5 and 1 credit per character through the API. Plans and
prices from the ElevenLabs pricing page, checked October 2026:

| Plan | Price | Credits a month | Spoken replies a month | About per day | Cost per reply |
|---|---|---|---|---|---|
| Free | $0 | 10,000 | 100 to 200 | 3 to 6 | $0 |
| Starter | $6/month | 30,000 | 300 to 600 | 10 to 20 | 1 to 2 cents |
| Creator | $22/month | 121,000 | 1,210 to 2,420 | 40 to 80 | about 1 to 2 cents |

The free tier covers casual use. If you talk to it a lot, Starter costs about a cent or two per answer. Unused
credits roll over for up to two months. Only what the mascot says out loud is sent to ElevenLabs (Claude's short
replies and its "can I run a command?" questions), never your question or your files. Without a voice configured,
nothing goes to ElevenLabs at all. Synthesis is capped at 20 replies a minute, so a leak can't drain your credits.

## Quick start

You need **Python 3.10+** and **Claude Code**. Nothing to `pip install`: the server uses only the standard library.

```bash
git clone https://github.com/baconshow/cody
cd cody
python cody.py --open
```

That opens the mascot at `http://127.0.0.1:7420`. Use Claude Code as usual and watch it react.

To change the port or the language, copy `config.example.json` to `config.json` and edit it.

| Key | Default | What it does |
|---|---|---|
| `port` | `7420` | Local port |
| `language` | `"en"` | `"en"` or `"pt-BR"`: spoken replies, wake word and screen text |
| `extra_hosts` | `[]` | Host names allowed besides localhost (your Tailscale name, see below) |
| `allowed_logins` | `[]` | Optional: only these Tailscale logins may use it from the phone (recommended) |
| `voice` | `null` | Optional ElevenLabs voice: `{"voice_id": "...", "model": "eleven_flash_v2_5"}` |

## Put it on your phone

The server only listens on `127.0.0.1`. To reach it from your phone, use Tailscale **serve**, which keeps it inside
your private tailnet. Never use `tailscale funnel`: that would put your mascot (and its voice channel into Claude) on
the public internet.

1. Install [Tailscale](https://tailscale.com/download) on your computer and your phone, and sign in to the same
   account on both.
2. In the Tailscale admin console, under **DNS**, enable **MagicDNS** and **HTTPS certificates**.
3. On the computer, share the port:
   ```bash
   tailscale serve --bg 7420
   ```
   `tailscale serve status` shows your address, for example `https://my-pc.tail1234.ts.net`.
4. Put that host name and your Tailscale login in `config.json` and restart Cody:
   ```json
   { "extra_hosts": ["my-pc.tail1234.ts.net"], "allowed_logins": ["you@example.com"] }
   ```
   With `allowed_logins` set, only you get in, even if other people or shared devices are in your tailnet.
   Without it, **every device in your tailnet that can reach this computer is trusted**: it could talk to your
   Claude session.
5. Open the address on your phone and use **Add to Home screen**. It runs full screen, landscape, and keeps the
   screen awake.

Shake the phone and the mascot holds on to the edges of the screen for dear life.

## Talk to it (voice)

Voice uses Claude Code [channels](https://code.claude.com/docs/en/channels), a research preview. Channels work when
you sign in to Claude Code with your claude.ai account (Pro or Max) or a Console API key. On Team and Enterprise
plans an admin has to enable them first.

1. Start the voice session in the folder you want Claude to work in:
   ```powershell
   .\scripts\voice.ps1            # Windows
   ```
   ```bash
   ./scripts/voice.sh             # macOS / Linux
   ```
   Claude Code asks you to confirm the development channel: choose **I am using this for local development**.
2. On the mascot, **hold** it and speak, or say **"Cody"** (or "Claude") followed by your request.
3. Claude does the work in that session and the mascot speaks a short answer. Links, commands and file paths are
   never read aloud: they show up on screen to tap and copy.
4. When Claude needs permission to run something, the mascot asks out loud and shows the command. Answer with
   just **yes** or **no** within a minute; a sentence like "ok, stop" counts as neither. Commands too long to show
   in full must be approved in the terminal. The terminal prompt stays open too; whichever answers first wins.
5. Ask for a screenshot: *"take a screenshot and send it to my WhatsApp"*. Claude takes it on the computer (you
   approve the tool like any other), and the picture pops up on the phone with **Share** and **Save**. Tap Share and
   pick WhatsApp, or any other app. Claude only gets an id, never the picture, and nothing is uploaded anywhere
   except where you share it. Screenshots happen only when you ask: there is no periodic capture.

Speech recognition uses your browser's Web Speech API. Chrome on Android and on the desktop works best. In Chrome,
the audio is transcribed by Google's speech service.

### A nicer voice with ElevenLabs

1. Create an [ElevenLabs](https://elevenlabs.io) account (the free tier is enough to start).
2. Create an API key and make it available to Cody in **one** of these ways:
   - the `ELEVENLABS_API_KEY` environment variable, or
   - a file named `.elevenlabs-key` in your home folder, holding only the key.
3. Pick a voice in the ElevenLabs voice library, copy its voice ID, and add it to `config.json`:
   ```json
   { "voice": { "voice_id": "YOUR_VOICE_ID", "model": "eleven_flash_v2_5" } }
   ```

Never commit your key. `config.json` and `.elevenlabs-key` are already in `.gitignore`.

## How it works

```
Claude Code ──writes──> ~/.claude/projects/**/*.jsonl ──read every 2 s──> cody.py ──> mascot (browser/phone)
                                                                                 │
phone mic ──Web Speech──> POST /api/voice ──> voice channel (MCP) ──> your Claude Code session
                                                                                 │
mascot speaks <── phone voice or ElevenLabs <── short reply (reply tool) <───────┘
```

- **Activity**: the server reads the tail of Claude Code's own transcripts. Only the tool name (and whether it
  edited a source file) reaches the page: never commands, file paths or conversation text.
- **Voice channel**: `cody/channel.py` is a tiny MCP server that Claude Code starts. It pushes what you said into
  the session and keeps Claude's short reply for the mascot.
- **Mascot**: three.js (loaded from esm.sh), with a pixel-art 2D fallback. The face motion (springs, blinks, glances)
  is ported from the face animator of the public-domain Bluey app.
- **Cursor follow**: on Windows the mascot looks at your mouse pointer. Other systems: PRs welcome.

## Privacy and security

- No telemetry. Cody never sends anything to its author.
- Screenshots are taken only on request, kept in memory (the latest three) and never written to disk on Windows
  (macOS and Linux use a temp file that is deleted right away). If your screen may show things that must not leave
  the computer, deny the screenshot tool in Claude Code's permissions.
- The server binds to `127.0.0.1`. Every request needs an allowed `Host` header, every `/api` route needs a random
  token that changes on each start, and cross-site requests are refused. Requests through Tailscale Funnel are
  always refused; set `allowed_logins` to keep the rest of your tailnet out.
- Trust model: anyone who can load the page can talk to your Claude session. That means programs on this computer
  and, without `allowed_logins`, every device in your tailnet. Voice messages are capped at
  20 a minute.
- The voice channel listens on `127.0.0.1` only and needs a secret that lives in a file readable only by you.
- Outside connections: three.js from esm.sh and a font from Google Fonts (loaded by the page), your browser's speech
  service, and ElevenLabs only if you configure a voice.

## Tests

```bash
python -m unittest discover tests
node --test "tests/js/*.test.mjs"
```

## URL options

Handy for tinkering: `?lang=pt-BR`, `?visual=2d`, `?gallery=1` (all moods side by side), `?mood=sleepy`,
`?prop=keyboard`, `?grab=1`, `?sensor=1` (shows the accelerometer readings).

## License

MIT. See [LICENSE](LICENSE).
