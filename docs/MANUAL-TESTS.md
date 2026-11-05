# Manual tests

What CI cannot prove, step by step, on real devices. Tick each one before the release. Use a Windows PC with Claude
Code signed in, an Android phone with Chrome, and Tailscale on both (or let test 4 install it).

## 1. Windows installer and tray

1. Download `CodySetup.exe` from the `Windows app` workflow run (artifact) or the release.
2. Run it. SmartScreen says "Windows protected your PC": **More info > Run anyway**. Expect no UAC prompt.
3. Keep "Start Cody with Windows" checked. Finish with "Open Cody now".
4. Expect: Cody's icon in the notification area; the mascot opens in the browser; a terminal opens with Claude Code
   asking about the development channel. Choose "I am using this for local development".
5. Right-click the icon: Open Cody, Status (shows "voice session: on"), Start voice session (nothing new opens while
   one is running), Settings, Start with Windows (checked), Quit.
6. Focus test: with Notepad in front, start Cody from the Start menu. The tray app must not steal the focus.
7. Sign out and in: Cody starts quietly in the tray (no browser, no terminal).
8. Uninstall from Settings > Apps. Expect the Start menu entry and the Run value gone, and Cody's hooks gone from
   `%USERPROFILE%\.claude\settings.json`.

## 2. Claude Code plugin

1. In Claude Code: `/plugin marketplace add baconshow/cody`, then `/plugin install cody@cody`. Restart Claude Code.
2. `/cody:status` prints the checks. `/cody:setup` starts the server if it is off. `/cody:voice` opens the voice
   session in a new window.
3. Finish a long task (over 20 s) in another session: the mascot cheers and says "Done!". Trigger a permission prompt:
   the mascot points and calls you. Each happens once (no double hooks).

## 3. Status screen and doctor

1. Close the voice session: the light in the corner turns red, "voice session closed". Tap it: the Status screen.
   "Open voice session" opens it (on the PC only; on the phone the button is not there).
2. Open a second voice session: Status warns "2 voice sessions are open".
3. With an ElevenLabs key whose account has a payment problem: Status shows `ElevenLabs: payment pending` and the
   voice falls back to the phone's voice with a notice.
4. `python cody.py --doctor` (or `cody-cli.exe --doctor`) prints the same.
5. Look in the data folder (`%LOCALAPPDATA%\cody`): after a voice session has run, does `channel.log` have lines?
   (Open question from v1.1: it stayed empty in real sessions. Note what you see.)
6. If Claude Code shows `server:cody · no MCP server configured with that name`, check the channel still works.

## 4. Create your private network

On a PC without Tailscale: Settings > Create your private network. Expect, in order: winget installs Tailscale; the
sign-in page opens; the DNS page opens if MagicDNS or HTTPS is off; "Share Cody" ends with two QR codes. Scan the
Tailscale one with the phone, install, sign in to the same account, then scan Cody's. The mascot opens on the phone
over HTTPS. Check `tailscale serve status`: no Funnel.

## 5. Voice on the phone

1. On Android Chrome, add Cody to the home screen, open it, tap once (sound unlocks).
2. Each provider in Settings > Voice: ElevenLabs (with a working key, the Test button says it works), the device's
   voice, Cody's sounds (chirps while the caption shows; the mouth moves with them).
3. Reload the page: sound is locked again until a tap; the Status screen says so and its button unlocks it.
4. Shake the phone (on an iPhone, tap first so the motion sensor is allowed): Cody stretches his arms to the screen
   edges and opens his eyes wide, with the startle sound. Stop shaking: `&#$*%@!` comes out of his mouth one symbol
   at a time for about 2 seconds, then the mouth is back to normal. With "reduce motion" on, neither happens.

## 6. Scenes with real work

Watch the mascot while Claude: edits code (monitor), runs a long command (bubble with "..."), runs a failing test
(bug and DEBUG MODE sign, error sound), finishes a long task (confetti). Leave it idle a minute (coffee), then ten
minutes (nightcap). Turn on "reduce motion" in the OS: scenes appear without moving.

## 7. First run and settings

Delete `first-run.json` in the data folder, reload on the PC: three steps with Cody talking, ending in "say hi".
Change the language and voice in Settings: the next reply uses them.
