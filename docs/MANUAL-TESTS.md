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

1. Close the voice session: the light in the corner turns red, "voice session closed". Tap it: the Status drawer
   opens on the right, the mascot still in view. "Open voice session" opens it (on the PC only; on the phone the
   button is not there). The X, Esc and a click outside close the drawer.
2. Open a second voice session: Status warns "2 voice sessions are open".
3. With an ElevenLabs key whose account has a payment problem: Status shows `ElevenLabs: payment pending` and the
   voice falls back to the phone's voice with a notice.
4. `python cody.py --doctor` (or `cody-cli.exe --doctor`) prints the same.
5. Look in the data folder (`%LOCALAPPDATA%\cody`): after a voice session has run, does `channel.log` have lines?
   (Open question from v1.1: it stayed empty in real sessions. Note what you see.)
6. If Claude Code shows `server:cody · no MCP server configured with that name`, check the channel still works.

## 4. Create your private network

On a PC without Tailscale: Settings > Create your private network. The drawer shows four numbered steps; the done
ones get a tick and the current one is lit. Expect, in order: winget installs Tailscale; the
sign-in page opens; the DNS page opens if MagicDNS or HTTPS is off; "Share Cody" ends with two QR codes. Scan the
Tailscale one with the phone, install, sign in to the same account, then scan Cody's. The mascot opens on the phone
over HTTPS. Check `tailscale serve status`: no Funnel.

## 5. Voice on the phone

1. On Android Chrome, add Cody to the home screen, open it, tap once (sound unlocks).
2. Each provider in Settings > Voice: ElevenLabs (paste a working key and save it: the voices of the account show
   in a list; pick one and Cody says hi with it, mouth moving; the Test button says it again), the device's voice,
   Cody's sounds (chirps while the caption shows; the mouth moves with them). With a key restricted to text to
   speech, the list is replaced by a voice id field and the reason.
3. Reload the page: sound is locked again until a tap; the Status screen says so and its button unlocks it.
4. Shake the phone (on an iPhone, tap first so the motion sensor is allowed): Cody stretches its arms to the screen
   edges and opens its eyes wide, with the startle sound. Stop shaking: `&#$*%@!` comes out of its mouth one symbol
   at a time for about 2 seconds, then the mouth is back to normal. With "reduce motion" on, neither happens.

## 6. Scenes with real work

Watch the mascot while Claude: edits code (monitor), runs a long command (bubble with "..."), runs a failing test
(a bug walking on Cody's head and the DEBUG MODE sign, error sound), finishes a long task (confetti). Leave it idle a
minute (a coffee mug in its right hand), then ten minutes (nightcap on the right of its head, Z letters on the left).
Turn on "reduce motion" in the OS: scenes appear without moving.

On a wide window and on the phone lying down, check that nothing is cut off: the monitor and the sign are whole (the
camera slides toward them and back), the mug and the bug show. Speak softly so Cody turns sideways to listen: the
four legs walk around with the body, and whatever it is wearing turns with it.

## 7. First run and settings

Delete `first-run.json` in the data folder, reload on the PC: three steps in a drawer on the right, with Cody
talking beside it, ending in "say hi". Change the language on the first step: Cody says the step again in the new
language. A click outside the drawer does not close it; Skip, the X and Esc do, and it does not come back on reload.
Change the language and voice in Settings: the next reply uses them.

The corner of the mascot page: a light (green while Cody listens for its name, red when off; a tap switches it and
the words show for a moment) and a gear. The gear opens Settings as a drawer on the right, with the mascot still in
view; the X, Esc and a click outside the drawer close it. Changing a switch says "Saved." at the bottom of the
drawer. Clicking inside the drawer must not make Cody hop. Tap Cody itself: it hops and blinks, with no sound.

## 8. Android app

Install the debug APK (`android/app/build/outputs/apk/debug/app-debug.apk`, or `Cody-debug.apk` from the `Android
app` workflow) on a phone with Tailscale and Chrome. Open it: the first run, six screens with the progress bar on
top. Welcome (Cody blinks); "Two things first" (Tailscale: Installed, with Open; Cody: Pending, with the command
and copy); "Connect to your computer": tap Open the camera, point it at the second QR code in Settings > On your
phone and tap the link the camera offers, or type the address. A wrong address turns the field red and greys out
Connect; the computer off gives "Computer not found" with Try again, Open Tailscale and Change the address; found,
Cody is happy and says "Hi! Cody is awake." over the address. Continue: the heads-up screen, where the switch asks
for the notification permission as soon as it goes on; the widget screen, where Add to home screen opens the
launcher's own sheet; "All set." Tap Open Cody: with the debug fingerprint in `android_fingerprints` (README),
Chrome shows the mascot full screen, landscape, no bar, and the wake word light is there; without it, the same page
with a thin bar on top. Say "Cody" and talk: the microphone works like in Chrome. Turn the phone on any screen of
the first run: the step stays, the words rearrange.

Long-press the icon > Settings: the flow opens at the address and checks it right away. With "Tell me when Claude
needs me" on, Continue to the end, Open Cody, then close the app and lock the phone. On the PC, make Claude ask
for a permission: within seconds the phone shows "Claude needs you" with sound; the quiet "Waiting on your
computer" notification stays in the shade. Stop the Cody server: the quiet one says "Computer not reachable. Trying
again."; start it again: back to "Waiting on your computer" within two minutes, and the next heads-up arrives.
Add the widget (long-press the home screen, or the first run's button): Cody's face for the last heads-up and the
words; a tap opens the mascot. Reboot the phone: the quiet notification comes back by itself.
