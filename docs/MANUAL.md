# Cody: the full manual

The [README](../README.md) has the short version. This is the long one.

A little desk pet for [Claude Code](https://code.claude.com). It lives on your phone (or in a browser tab), watches
what Claude is doing on your computer and reacts: it grabs a magnifier when Claude searches, types on a tiny
keyboard when Claude writes code, thinks while commands run, hops when a subagent finishes, gets sleepy when nothing
happens and falls asleep (zzZ) when Claude is closed.

You can also **talk to it**. Hold Cody (or say "Cody") and ask anything: your words go into a real Claude
Code session on your computer, and the mascot answers out loud in one or two short sentences. Honestly, it answers
far better than Alexa, because it *is* Claude Code: your files, your tools, your context.

It also does the desk-buddy things: **timers and reminders** that ring on the phone, a **memory** of your name and
how you like things, a **mini Cody that flies across your computer screen** to point at the button you asked about,
and a **heads-up** when one of your Claude Code sessions finishes a long task or is waiting for your permission.

## Everything it does

> The one section of this manual written like a brochure, for a thing that is free and MIT. The rest of the manual
> says how each line works, what has to be turned on, and what it costs (nothing extra).

**Bring your Claude Code to life.** A desk pet that reacts, live, to every search, edit, command, failed test,
finished subagent and permission prompt. Glance at it instead of at the terminal.

**Command Claude Code by voice.** Say *"Cody"* from the couch. Your words land in a real Claude Code session on your
computer, with your files, your tools and your context, and the mascot answers out loud in two sentences. When it
asks to run something, answer with a spoken *yes* or *no*.

**Change your own code without touching the keyboard.** *"Cody, add a dark mode toggle to the settings page."*
Claude edits the project the voice session was started in, on your computer, asking when your Claude Code permission
settings say so. Quick questions work the same way: *"what does the auth middleware do?"*, *"are the tests green?"*

**Everything you already plugged into Claude Code, by voice.** A calendar, Airtable, your smart home: the MCP servers
the voice session loads answer through Cody, under the same permission settings.

**Message your other Claude conversations.** *"Cody, tell the payments session to run the tests."* Claude can message
another Claude Code session running on the computer, a local one in the Claude Desktop app's Code tab included. It
arrives marked as coming from another session, and the receiver's own permissions decide.
([How it works](#your-other-claude-sessions))

**Keep an eye on every session.** A long task finishes, Claude waits for your permission: Cody says so and, with the
Android app and its switch on, your phone buzzes with Cody's face and the words, app closed or not. A home screen widget
keeps the last heads-up.

**Know where you stand with your plan.** *"Cody, how much usage do I have left?"*: the session and the week, said out
loud and shown on screen, with when each one resets. Read from Claude Code's own status line, no API call.

**A desk buddy on top.** Timers and reminders that ring on the phone, a memory of your name and how you like things,
*"take a screenshot and send it to my WhatsApp"*, *"where is the export button?"* (a mini Cody flies to it on your
screen), scenes and skins, and a swear word when you shake it.

**Installs in three steps.** Download `CodySetup.exe`, open Cody, scan the QR code with your phone. The first run
walks you through the private network and the voice session. (The honest version, SmartScreen warning and all, is
under [Windows app](#windows-app) and [Put it on your phone](#put-it-on-your-phone).) You need Claude Code installed
and signed in.

**Yours, on your network.** It runs on your computer, on your Claude subscription (no API key, no extra bill), and
reaches your phone through your own Tailscale network. Nothing is sent to the author; where the rest goes is in
[PRIVACY.md](../PRIVACY.md).

## With your kids: apps by talking

What you can make with a kid, each one a sentence away, then *"bigger"*, *"slower"*, *"add a sound"*. Toys, games and
experiments, not apps for production, and the real skill underneath them: saying exactly what you want, then changing it
until it is right.

- *"Make a game where a cat catches falling fish, and the score goes up."*
- *"A dinosaur quiz with three questions and confetti at the end."*
- *"A birthday card for grandma that plays a song when you click it."*
- *"A page where I draw with the mouse and pick the colors."*
- *"A two-minute timer for brushing my teeth, and Cody cheers at the end."*
- *"A story where I choose what happens next."*

**They invent it, you do the talking.** Claude's consumer accounts are for one person, 18 or over
([terms](https://www.anthropic.com/legal/consumer-terms)), and an account that looks used by a minor can be disabled
until its owner proves their age. What the microphone hears goes to the browser's speech service (Google, in Chrome) and
what is asked goes to Anthropic: keep children's names and details out of it.

Cody adds no protection of its own. The limits are Claude Code's, yours to set before you start, and none of them is a
wall:

- **Make Claude ask.** Recent Claude Code starts in *auto* mode, where most things run without a question and there is
  nothing for Cody to pass on. Each time the voice session opens, before anyone talks, press Shift+Tab in its window
  (Alt+M on some Windows setups) until it says *manual mode on*: Claude then asks before most edits and commands you have
  not already allowed. To start that way, set `permissions.defaultMode` to `"default"` in Claude Code's settings. Do not
  press Shift+Tab while a question is open: there it allows the rest of the session's edits.
- **Know how the question arrives.** Cody passes it on while its page is on screen, in words only if you picked a voice
  (at first it chirps). Anything over 500 characters, most new files included, is answered in the session's window:
  choose plain *Yes* there, the other yeses stop the asking. After a question the microphone opens by itself, even with
  the wake word off, and *ok* or *sure* is a yes. Cody does not know whose voice it hears.
- **Use a separate folder.** Claude starts in the folder named after `--voice`, or else in `voice_folder` from `config.json`
  (forward slashes: `"C:/Games"`; then restart Cody). If that is unset, wrong or missing: the terminal's folder or, from
  the app or Cody's page, your home folder. Claude reads what is in the folder without asking, even in manual
  mode, and in auto mode edits it too. It is where Claude starts, not a fence: it can read, write and run things
  elsewhere. Claude Code's own sandbox is off by default and does not run on native Windows.
- **Mind what never asks, in any mode:** a message to your other Claude sessions (deny `SendMessage` and `ListAgents` in
  Claude Code's permissions), and *"Cody, take a screenshot"*, which Cody takes by itself and no rule stops.
- **Write down what should not run.** Deny rules in Claude Code's permissions apply to the voice session too, but only a
  rule that names a whole tool is firm: a command or a path can be reached another way.

## What it costs

**Nothing extra, out of the box.**

| Piece | Cost |
|---|---|
| Cody | Free, MIT license |
| Claude | **No API key and no API billing.** Voice commands run inside your normal Claude Code session, so they count against your Claude subscription (Pro or Max) like any message you type |
| Phone access | [Tailscale](https://tailscale.com/pricing) Personal plan: free (up to 6 users, unlimited devices) |
| Mascot voice | Cody's own sounds (no words: chirps while the text shows), or your phone's built-in voice if you pick it in Settings: free and unlimited |
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

## Windows app

Download **CodySetup.exe** from the [latest release](https://github.com/baconshow/cody/releases/latest) and run it.
No Python needed, no admin rights: it installs for your user only.

- Cody lives in the notification area (next to the clock). Its menu: **Open Cody**, **Status**, **Start voice
  session**, **Settings**, **Start with Windows** and **Quit**.
- Opening Cody starts everything: the mascot server, the mascot in your browser and the voice session (a terminal
  window with Claude Code; confirm the development channel there once, see [Talk to it](#talk-to-it-voice)). You
  never start two terminals by hand. Started with Windows, it stays quiet in the tray until you open it.
- **Windows SmartScreen will warn you** the first time ("Windows protected your PC"), because the installer is not
  signed with a paid code-signing certificate yet. Click **More info**, then **Run anyway**. The installer is built
  by GitHub Actions from this repository ([`packaging/`](../packaging), workflow `Windows app`); you can check the
  build log of any release.
- Uninstalling (Settings, Apps) also takes Cody's hooks out of Claude Code's settings. Your timers and memory stay
  in `%LOCALAPPDATA%\cody` until you delete that folder.

## Claude Code plugin

Cody is also a Claude Code plugin, from the marketplace in this repository. In Claude Code:

```
/plugin marketplace add baconshow/cody
/plugin install cody@cody
```

(Claude Code 2.1.275 or later can do it in one step: `/plugin install cody --marketplace baconshow/cody`.)

The plugin brings Cody's heads-up hooks and three commands:

| Command | What it does |
|---|---|
| `/cody:setup` | Checks everything, starts the mascot server if it is off and walks you through what is missing |
| `/cody:status` | What is on and off: server, voice session, hooks, Tailscale, phone, voice |
| `/cody:voice` | Opens the voice session in a new terminal window |

Nothing to edit by hand. With the plugin on, `--install-hooks` does nothing (the plugin already has the hooks), so
they never run twice. The plugin does not load the voice channel into every session: a plugin's MCP server would
start in all of them, and the channel only belongs in the voice session, which `/cody:voice` opens. The hooks and
commands need Python 3 (`python3`, `python` or `py`), or the Windows app.

## Quick start (from source, any system)

You need **Python 3.10+** and **Claude Code**. Nothing to `pip install`: the server uses only the standard library.

```bash
git clone https://github.com/baconshow/cody
cd cody
python cody.py --open
```

That opens the mascot at `http://127.0.0.1:7420`. Use Claude Code as usual and watch it react.

**It sets itself up.** The first time, Cody asks two questions in the terminal (Enter means yes):

- *Open Cody on your phone through Tailscale?* If Tailscale runs on the computer, Cody shares itself in your private
  tailnet (`tailscale serve`, never Funnel), on a free HTTPS port so anything you already serve stays as it is, and
  prints the address to open on the phone. Only your own Tailscale login gets in.
- *Tell you on the phone when Claude finishes a long task or needs you?* Adds three Claude Code hooks (see
  [Heads-up](#heads-up-from-your-other-claude-code-sessions)).

A "no" is remembered. `python cody.py --setup` asks again; `--no-setup` skips all of it. The language follows the
computer's (Portuguese or English) unless you set it.

Nothing else to configure. To change something, copy `config.example.json` to `config.json` and edit it (the
Windows app keeps its `config.json` in `%LOCALAPPDATA%\cody`):

| Key | Default | What it does |
|---|---|---|
| `port` | `7420` | Local port |
| `language` | the computer's | `"en"` or `"pt-BR"`: spoken replies, wake word and screen text |
| `extra_hosts` | found by itself | More host names allowed besides localhost (Tailscale addresses that forward to Cody are found at start) |
| `allowed_logins` | your own login | The Tailscale logins that may use it from the phone |
| `android_fingerprints` | none | SHA-256 certificate fingerprints of your own build of the Android app, for `/.well-known/assetlinks.json` |
| `voice` | `null` | Optional ElevenLabs voice: `{"voice_id": "...", "model": "eleven_flash_v2_5"}` |
| `voice_folder` | current folder | Folder the voice session works in (the Windows app's default is your home folder) |

## Scenes

What Cody does around itself follows what Claude really does: a monitor full of code while Claude edits files, a
speech bubble with "..." while a command runs, a black bug and a `> DEBUG MODE` sign when a command or a test fails,
confetti when a long task finishes, a coffee mug after a quiet while, a nightcap when it sleeps, and headphones
while music plays on the computer (Windows: Cody asks the system whether any player is playing, Spotify, a browser
tab, anything; it never learns what. Off in Settings). The headphones go over whatever else is going on. Scenes are
data, in `web/scenes/scenes.json`: voxel boxes, a trigger, simple clips, a sound and a priority (the highest one
whose trigger is on wins; one marked `"over"` is worn on top), so new scenes and skins are a JSON edit. Try one with
`?scene=debug` (or `coding`, `thinking`, `coffee`, `party`, `sleeping`), and `?over=headphones` with any of them.
With "reduce motion" on, scenes appear without moving. Only the failure itself is read from the transcripts, never
its output.

## Skins

Settings has a **Skin shop**: the classic Cody, **Jack-o'-Cody**, the Halloween one (a real pumpkin: a ribbed
body, a ridged stem with a tendril, a grin carved through the front with candlelight inside, the ^ eyes and a
leather witch hat with a bent tip, a satin band and a gold buckle), and three looks with glasses: the **Aviator** (round gold
wire glasses with lenses, a pilot's cap with its badge and a toothy grin), **Pixel** (8-bit frames and a top hat,
blocks on purpose) and **The Boss** (polished dark glasses, a red beret and a curled moustache). A hat steps aside
while a scene puts something on the head (the nightcap, the headphones) and comes back after. Every skin is free while Cody is Cody; a paid one comes only
with a character of its own. A skin is data, in `web/skins/skins.json`: new colors for the figure's plastic,
pieces it wears (voxel boxes like a scene's worn parts, a color, maybe a glow; or, for what boxes cannot say,
**shapes**: a `tube` along a spine, a `lathe` profile turned around, a `plate` with rounded edges, each in a
finish: plastic, matte, leather, satin, metal) and its looks (the smile, its own mouth, a ribbed `gourd` body
instead of the box, its own stem instead of the leaves, a mouth carved through the front, shorter legs). The
shapes and their numbers are described at the top of `web/js/forms.js`. The choice is per screen (the phone and the computer each pick theirs); `?skin=halloween` shows one.

## Is everything on?

The pill in the corner of the mascot says it at a glance (a green light and "all good"; red and what to fix, for
example "voice session closed"). Tap it for **Status**: server, voice session, voice channel, hooks, Tailscale,
phone, microphone, sound and voice, each with one plain sentence, what to do and, where Cody can do it, a line to
press. Status is the last entry of the same panel as Settings, so one tap goes from a problem to its setting.
Buttons that change the computer (open the voice session, add the hooks) only work on the computer itself, not
from the phone. Errors show their real reason, for example `ElevenLabs: payment pending`.

The same checks in the terminal: `python cody.py --doctor` (or `/cody:status` in Claude Code). If two voice
sessions are open, Cody says so: only the newest one hears you.

## Settings and the first run

The first time you open Cody on the computer, it walks you through three steps, out loud: language and voice, the
phone (a QR code to scan), and the voice session, ending in "say hi". **Settings** (the pill in the top corner of
the mascot page, the tray menu, or the page's `#settings`) opens beside the mascot and has the rest, one section
at a time from a list (Voice, On your phone, General, Skins, About, and Status at the end): voice (ElevenLabs with
your own key and a **Test** button, the device's voice or Cody's sounds; Cody's hosted voice is listed as coming
soon), the phone (the codes to scan and the private address with a Copy button), language, the hooks, starting
with Windows and privacy. On a phone lying down the panel is the whole screen: a back arrow, the list on the left,
the section on the right. Three pills sit over the mascot: **Settings** at the top, the **Status** light with its
words at the bottom left and the **wake word** at the bottom right; after four seconds without a touch they step
back (only the wake word's light stays, and a Status that needs you), and a tap brings them back. The wake word
pill shows whether Cody is listening for its name (green) or not (red); a tap switches it. Its light shows
what the microphone is doing: it swells a little with every sound it hears, **grows and shrinks while Cody is
taking a command** (after its name, after an answer, or while you hold it), and turns amber, with the reason in
words, when it cannot hear (no microphone, speech recognition offline).

- The key is typed in Settings, saved in Cody's data folder on this computer only (readable only by you), and never
  shown again: the page only learns that a key is there.
- Settings change only on the computer itself; from the phone you can switch the language of that phone's screen.
- The QR codes are drawn on your computer (`cody/qr.py`): no web service ever sees your address.

## Put it on your phone

**The easy way:** Settings > **Create your private network**, one press. Cody does it without a terminal and goes
on by itself: it installs Tailscale if it is missing (`winget` on Windows, the official download page elsewhere),
opens the sign-in page (Google, Microsoft, GitHub or Apple), opens the Tailscale admin page if MagicDNS or HTTPS
certificates are off, looks again every few seconds while you finish in the browser, shares itself with
`tailscale serve`, and shows two QR codes: the Tailscale app for your phone, and Cody's private address. Only your
own devices can see Cody. Your phone needs the Tailscale app too, signed in to the same account.

**By hand:**

The server only listens on `127.0.0.1`. To reach it from your phone, Cody uses Tailscale **serve**, which keeps it
inside your private tailnet. Never use `tailscale funnel`: that would put your mascot (and its voice channel into
Claude) on the public internet. Cody refuses Funnel requests and never trusts a Funnel address.

1. Install [Tailscale](https://tailscale.com/download) on your computer and your phone, and sign in to the same
   account on both.
2. In the Tailscale admin console, under **DNS**, enable **MagicDNS** and **HTTPS certificates**.
3. Start Cody and answer yes to the phone question. It prints the address, for example
   `https://my-pc.tail1234.ts.net`. (By hand: `tailscale serve --bg 7420`, then restart Cody from Status (the bottom
   row) > **Restart Cody**: it finds the address.)
4. Open the address on your phone and use **Add to Home screen**. It runs full screen, landscape, and keeps the
   screen awake.

Only your own Tailscale login gets in, even if other people or shared devices are in your tailnet. To let someone
else in, list their logins in `allowed_logins`. A tagged Tailscale machine has no login of its own: then Cody warns
you and trusts every device in your tailnet until you set `allowed_logins`.

Shake the phone and the mascot holds on to the edges of the screen for dear life.

### The Android app

The same mascot as an app (`android/`, on Google Play once published; until then, the APK from the `Android app`
workflow). It opens the page your computer serves in Chrome as a *Trusted Web Activity*: full screen, landscape,
with the microphone and speech of a Chrome tab, no address bar. The first run walks you through it: what you
need (Cody on the computer, Tailscale on the phone), pairing by the second QR code in Settings > On your phone
(a `cody://pair` link your camera understands) or the typed address, the heads-up switch and the widget. Then two
things a web page cannot do:

- **Tell me when Claude needs me** (a switch on the first run, off by default): a
  quiet notification keeps the app waiting on your computer (`/api/events`, held open up to 25 s at a time), and a
  long task done, Claude waiting for your permission, or an important notification you chose to hear become
  Android notifications with sound, screen off or not. Nothing leaves your tailnet; the app knows only the address
  you gave it.
- **A home screen widget**: Cody's face for the last heads-up (waiting for you, done, a notification, or all
  quiet) and the words, with how long ago. Tap it to open the mascot.

Chrome shows the page as the app only when the computer vouches for it: `/.well-known/assetlinks.json` lists the
app's certificates (the published one, plus `android_fingerprints` in `config.json` for a build of your own:
`keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android` prints the
SHA-256). Without a match it opens as a Custom Tab, the same page with a thin bar on top. Long-press the app's icon
for *Settings* (the first run again, from the address on). Building it yourself: `cd android && ./gradlew
assembleDebug` with JDK 17 and the Android SDK (platform 36); the unit tests run with `./gradlew testDebugUnitTest`.

## Talk to it (voice)

Voice uses Claude Code [channels](https://code.claude.com/docs/en/channels), a research preview. Channels work when
you sign in to Claude Code with your claude.ai account (Pro or Max) or a Console API key. On Team and Enterprise
plans an admin has to enable them first.

1. Start the voice session in the folder you want Claude to work in. In the Windows app: the tray menu's **Start
   voice session** (it opens in your home folder, or in `voice_folder` from `config.json`). From source:
   ```bash
   python cody.py --voice            # any system; or .\scripts\voice.ps1 / ./scripts/voice.sh
   ```
   Claude Code asks you to confirm the development channel: choose **I am using this for local development**.
2. On the mascot, **hold** it and speak, or say **"Cody"** (or "Claude") followed by your request.
3. Claude does the work in that session and the mascot speaks a short answer. Links, commands and file paths are
   never read aloud: they show up on screen to tap and copy. To show Claude a picture, tap the **clip** above the
   wake word and pick one: it is kept in Cody's data folder on the computer (the latest 50) and the session is
   told where, so Claude opens it. On a computer (Chrome or Edge), the round button above the clip opens Cody in a
   **little window** that floats over your other apps, without the browser's bar: Cody keeps listening and
   answering from there while you work in something else. After the answer **the microphone stays open for a
   few seconds**: just go on talking, no "Cody" needed (and when Claude asks something back, simply answer). The
   light grows and shrinks while it does. It can be turned off in Settings, per screen.
4. When Claude needs permission to run something, Cody asks (in words if you chose a voice) and shows the command. Answer with
   just **yes** or **no** within a minute; a sentence like "ok, stop" counts as neither. Commands too long to show
   in full must be approved in the terminal (so must anything over 500 characters, most new files included; Claude Code
   2.1.211 or later). The terminal prompt stays open too; whichever answers first wins. **What needs permission is up to
   Claude Code, not to Cody:** in *auto* mode, where recent versions start, most things run without a question; in
   *manual* mode Claude asks before most edits and commands you have not already allowed. Shift+Tab in the voice session's
   window switches, for that session.
5. Ask for a screenshot: *"take a screenshot and send it to my WhatsApp"*. Claude takes it on the computer (your
   permission settings decide whether it asks), and the picture pops up on the phone with **Share** and **Save**. Tap Share and
   pick WhatsApp, or any other app. Claude only gets an id, never the picture, and nothing is uploaded anywhere
   except where you share it. Cody takes none on a schedule.
6. In a hurry: *"Cody, take a screenshot"* (or *"Cody, printa"*): any sentence of up to six words that says so. Cody takes it on
   the spot, with a shutter click, and the picture pops up with Share: no round trip through Claude, no voice
   session needed. The saying is the asking: the picture goes to the page you asked from, nowhere else.

The voice session lets Cody's harmless tools run without asking (reply, timers, memory, pointing). The two that
capture your screen, `screenshot` and `look`, Cody never approves ahead: in manual mode Claude Code asks, unless a rule of
yours allows them; in auto mode its own check decides. Denying `mcp__cody__screenshot` and `mcp__cody__look` in Claude
Code's permissions stops those two tools, not the quick "take a screenshot": there your words are the permission, and
nothing turns it off.

**Scenes on request, and scenes of Cody's own.** *"Cody, put your headphones on"*, *"show the party for a
minute"*, *"heart eyes!"*: Claude calls the `scene` tool and the page shows it for a while (30 seconds unless you
say), over whatever else is going on. Five scenes only change the eyes: `love` (♥ ♥), `laugh` (> <), `wink` (! <),
`dizzy` (● ×) and `stars` (★ ★); the party has starstruck eyes and the bug scene dizzy ones on their own. *"Cody,
make yourself a rainbow"*: Claude writes a scene of its own with
`custom_scene`, as data only (the same voxel boxes, colors, clips and `eyes` as `web/scenes/scenes.json`, never code),
which Cody checks field by field, refuses with the reasons if anything is off, and keeps in `custom/` in its data
folder, loaded with the built-in scenes; it shows right away. *"Cody, undo"* removes the newest one. Twelve at
most. Nothing of this ever touches the files of your project.

**Your other MCP servers work by voice too.** The voice session is a normal Claude Code session with Cody's channel
added, so whatever you already connected to Claude Code (Airtable, a calendar, your smart home) is there: *"Cody,
what is on my roadmap this week?"*. Cody pre-approves only its own harmless tools; a tool from another server follows
your permission settings like always, and when Claude asks, you answer **yes** or **no** out loud.

### Your other Claude sessions

*"Cody, tell the payments session to run the tests when it is done."* The voice session is an ordinary Claude Code session,
so it can list your other Claude Code sessions running on the computer (not across WSL or a container), local ones in the
Claude Desktop app's Code tab included, and message one. This is Claude Code's own
[messaging between sessions](https://code.claude.com/docs/en/cross-session-messaging); Cody brings the voice.

- **What the list shows:** their names, which are busy and at times their folders, not what is written in them. The Claude
  there can answer a message with what it knows. Claude Desktop's ordinary chats are not in it.
- **What arrives:** Claude writes the message from what you asked, and it lands marked as coming from another session,
  never as if you had typed it. It approves nothing, and the receiver's own permissions decide: manual mode asks there for
  what you have not allowed, auto mode may just act. That session's settings can also hold or refuse it.
- **What it does not do itself:** open, close, rename, archive or stop the conversations of the Claude Desktop app.
- **It does not ask first,** in any mode, so anyone who can talk to the voice session can put a message into the others. To
  stop sending, deny `SendMessage` and `ListAgents` in Claude Code's permissions; to stop receiving, set
  `crossSessionInbound` to `refuse` in the other session's settings.
- **Where it travels:** on the same computer, straight from one session to the other; with Remote Control on, it can also
  reach your sessions elsewhere, through Anthropic's servers. Each Claude reads it like any prompt, so its text reaches
  Anthropic under your account, as usual.

It needs a recent Claude Code: 2.1.248 or later is safe on any system.

### Timers and reminders

*"Cody, set a timer for ten minutes for the pizza"*, *"a 25 minute focus timer"*, *"remind me at 3:30 to call
Ana"*, *"cancel the pizza timer"*, *"what timers are running?"*

The countdown shows in the corner of the phone. When it ends, Cody hops, the phone buzzes and chimes, and the mascot
says what it was for, until you tap the timer (or a minute goes by). Reminders more than an hour away show the time
of day instead of a countdown. Timers live on your computer (`timers.json` in Cody's data folder, see below), so they
keep running after you close the voice session or reload the phone. The phone has to be on to ring, like any desk
clock.

### Memory

*"My name is Ana"*, *"remember that I like short answers"*, *"forget my address"*

Claude saves short facts with Cody's `remember` tool and gets them back at the start of every voice session, so Cody
doesn't forget your name. They are kept in `memory.json` in Cody's data folder: no account, no sync, no cloud of
Cody's own (Claude gets them with the first thing you say). Delete the file to make Cody forget everything. At most 40 facts.

### Cody on your computer screen (Windows)

*"Cody, where is the export button?"*

Claude takes a look at your screen (the `look` tool, under your permission settings), finds the spot, and a mini Cody
flies there and points at it with a little speech bubble: *"Right here! Click Export"*. Meanwhile the mascot on the
phone turns and points the same way. The mini Cody is a see-through window you can click through; it never takes
the focus and leaves after eight seconds.

Unlike `screenshot`, **`look` does send the picture to Claude**, scaled down, as part of the conversation: that is
how Claude finds the button. Claude is told to use it only when you ask about something on the screen. To forbid it, deny
`mcp__cody__look` in Claude Code's permissions. Pointing is Windows only for now (macOS and Linux: PRs welcome).

Speech recognition uses your browser's Web Speech API. Chrome on Android and on the desktop works best. In Chrome,
the audio is transcribed by Google's speech service.

## Heads-up from your other Claude Code sessions

Cody can tell you when Claude finishes a long task in any session (*"Done! Claude finished."*) or is waiting for
your permission: Cody knocks on the screen, toc-toc, and says *"Claude needs you at the computer."*, so you can
leave the desk while it works. It uses Claude Code [hooks](https://code.claude.com/docs/en/hooks). Add them with:

```bash
python cody.py --install-hooks
```

That adds three small hooks (`UserPromptSubmit`, `Stop` and `Notification`) to your Claude Code user settings,
`~/.claude/settings.json`, keeping a dated backup beside it and everything else you have there. New
sessions pick them up. `python cody.py --uninstall-hooks` removes them.

Each hook writes one line to `events.jsonl` in Cody's data folder: the time, the kind of event and the first
characters of the session id. Never your prompt, Claude's reply or a command. A turn shorter than 20 seconds ends
without a word (the face already showed the work), and the voice session is skipped, since there Cody already does
the talking.

Prefer to add them by hand? Each one is a command hook running `"<python>" "<path to>/cody.py" --hook`.

### "Cody, how much usage do I have left?" (opt-in)

Turn on **Usage limits** in Settings and Cody becomes Claude Code's status line: on every refresh, Claude Code
hands the status line your plan's session (five-hour) and week usage, and Cody keeps those two numbers (nothing
else of what the status line gets) in `usage.json` in its data folder. The status line you had still shows:
Cody runs it right after, with the same input, and puts it back when you turn the switch off. Then ask, by
voice, *"Cody, how much usage do I have left?"* (*"Cody, quanto resta de uso?"*): it says and shows the session
and the week, with when each resets. No API call, no token read, nothing leaves the computer. Subscription
plans only: an API account gets no usage numbers from Claude Code.

### Typing along (opt-in)

Turn on **Type along when I type to Claude** in Settings and Cody's keyboard comes out while you type in a
window with "Claude" in its title (the Claude app, or Claude Code in a terminal). What Cody checks, a few
times a second: whether input arrived on the computer and the pointer did not move (so it was the keyboard),
and whether the front window is a Claude one. There is no keyboard hook: Cody never learns which keys, and
nothing is recorded. Off by default.

### Your Windows notifications, read aloud (opt-in)

Turn on **Read my important Windows notifications** in Settings (Windows asks you to allow it, under Privacy >
Notifications) and Cody knocks on the screen and says the app and the title of the important ones: messages,
mail, calendar and calls (WhatsApp, Telegram, Teams, Slack, Outlook, Mail, Calendar, Phone Link and the like, or
your own list in `notification_apps` in config.json), or any toast with an urgent word in the title. Cody reads
the title only, never the body; the same one is said once, and at most one every 15 seconds. The title goes to your own Cody pages and app, and an online browser voice, if that is your device's, gets it too; with
ElevenLabs only the app's name is sent (*"Something new on Outlook."*), the title stays in the caption. Off by default.

### Four ways to sound

Settings > Voice picks the first one to try; when it fails, the next one speaks and the screen says so (for example
"ElevenLabs didn't work (payment pending): This device's voice instead"):

1. **ElevenLabs**, with your own key (below);
2. **Cody's hosted voice**, opt-in, not offered yet;
3. **this device's voice** (the browser's speech; robotic on most computers);
4. **Cody's sounds**: no words, little chirps in the rhythm of the text while it shows on screen. They always work,
   and they are what a new install uses until you pick something else.

Cody's sounds also mark what happens: thinking, done, an error, calling you, a timer ringing, a startle. A tap on
Cody is silent: tapping and holding it is how you talk to it, so it answers with a hop, not with a noise.
They are made from scratch by `tools/make_sounds.py` (only the Python standard library, no samples), live in
`web/sounds`, and are MIT like the rest. The mouth follows their volume.

### A nicer voice with ElevenLabs

1. Create an [ElevenLabs](https://elevenlabs.io) account (the free tier is enough to start).
2. Create an API key and paste it in **Settings > Voice** (or on the first step of the first run). It is saved on
   this computer only, in Cody's data folder. The `ELEVENLABS_API_KEY` environment variable and a `.elevenlabs-key`
   file in your home folder still work too.
3. With the key saved, Settings lists the voices of your ElevenLabs account. Pick one: Cody says hi with it right
   away, and it is saved. To use a voice from the ElevenLabs voice library, add it to your voices there first. If
   your key is not allowed to list voices (a key restricted to text to speech), Settings asks for a voice ID
   instead. By hand, the same thing in `config.json`:
   ```json
   { "voice": { "voice_id": "YOUR_VOICE_ID", "model": "eleven_flash_v2_5" } }
   ```

Listing the voices costs no credits; hearing one costs one short sentence (about 30 characters).

Never commit your key. `config.json` and `.elevenlabs-key` are already in `.gitignore`.

With a voice configured, timers and heads-up are spoken in it too. Their words are always made on the computer
from a fixed list (and the timer's label), never sent in by the phone.

## How it works

```
Claude Code ──writes──> ~/.claude/projects/**/*.jsonl ──read every 2 s──> cody.py ──> mascot (browser/phone)
                                                                                 │
phone mic ──Web Speech──> POST /api/voice ──> voice channel (MCP) ──> your Claude Code session
                                                                                 │
mascot speaks <── phone voice or ElevenLabs <── short reply (reply tool) <───────┘
```

- **Activity**: the server reads the tail of Claude Code's own transcripts. Tool names, failures, code edits, session ids and times reach the page: never commands, file paths or conversation
text.
- **Voice channel**: `cody/channel.py` is a tiny MCP server that Claude Code starts. It pushes what you said into
  the session and keeps Claude's short reply for the mascot. Its other tools (`cody/abilities.py`) set timers,
  save facts, look at the screen and send the mini Cody (`cody/overlay.py`, plain tkinter) to point.
- **Data folder**: `%LOCALAPPDATA%\cody` on Windows, `~/.local/state/cody` elsewhere. Small JSON files shared by
  the server, the channel and the hooks: timers, memory, hook events. Readable only by you.
- **Mascot**: three.js (bundled in `web/vendor/three`, MIT), with a pixel-art 2D fallback. The face motion (springs, blinks, glances)
  is ported from the face animator of the public-domain Bluey app.
- **Cursor follow**: on Windows the mascot looks at your mouse pointer. Other systems: PRs welcome.

## Privacy and security

- No telemetry. Cody never sends anything to its author (what goes where is in
  [PRIVACY.md](../PRIVACY.md)). The update check is off by default; on, it asks GitHub once a day for the latest
  version number. Timers, memory and hook events stay in the data folder on
  your computer. What does leave it, as part of using Claude and the voice you chose: the saved facts reach Claude
  with the first thing you say in each voice session, and with an ElevenLabs voice the timer labels are spoken by
  ElevenLabs when they ring.
- Screenshots are taken when you ask or when Claude calls the tool. Cody keeps the latest few in memory, not on disk
  (macOS and Linux: a temp file, deleted at once); Claude Code may save `look` pictures with its session. The `screenshot`
  picture goes to your open Cody pages; the `look` picture goes to Claude, so it travels like anything else in your Claude Code conversation. Neither is approved
  ahead by Cody; your Claude Code settings decide whether they ask. If your screen may show things that must not leave the
  computer, deny `mcp__cody__screenshot` and `mcp__cody__look` there, and mind that the quick "take a screenshot" asks
  no one.
- The server binds to `127.0.0.1`. Every request needs an allowed `Host` header, every `/api` route needs a random
  token that changes on each start, and cross-site requests are refused. Requests through Tailscale Funnel are
  always refused, and by default only your own Tailscale login gets in (on a tagged machine, set `allowed_logins`).
- Trust model: anyone who can load the page can talk to your Claude session. That means programs on this computer,
  your own Tailscale login and, on a tagged machine without `allowed_logins`, every device in your tailnet. Voice messages are capped at
  20 a minute.
- The voice channel listens on `127.0.0.1` only and needs a secret that lives in a file readable only by you.
- Outside connections: your browser's speech service, and ElevenLabs only if you configure a voice. three.js and the
  font (Varela Round, SIL Open Font License) ship with Cody, so the page loads no CDN and works without internet.

## Tests

```bash
python -m unittest discover tests
node --test "tests/js/*.test.mjs"
cd android && ./gradlew testDebugUnitTest
```

## URL options

Handy for tinkering: `?lang=pt-BR`, `?visual=2d`, `?gallery=1` (all moods side by side), `?mood=sleepy`,
`?prop=keyboard`, `?grab=1` (the shake startle), `?curse=1` (the swearing after it),
`?sensor=1` (shows the accelerometer readings).

## More

[CHANGELOG](../CHANGELOG.md) · [Privacy](../PRIVACY.md) · [Security](../SECURITY.md) · [Contributing](../CONTRIBUTING.md) · [Manual tests](MANUAL-TESTS.md)

## License

MIT. See [LICENSE](../LICENSE).
