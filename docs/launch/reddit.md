# Draft post (r/ClaudeAI)

**Title:** I made Cody, a little desk pet for Claude Code that reacts to what Claude is doing (and you can talk to it)

Hi! Cody is a small voxel mascot that lives in a browser tab or on your phone and watches your Claude Code sessions:
it types on a tiny keyboard while Claude edits code, shows a "..." bubble while commands run, pulls out a bug and a
DEBUG MODE sign when a test fails, throws confetti when a long task finishes and falls asleep when Claude is closed.

You can also hold it (or say "Cody") and talk: your words go into a real Claude Code session on your computer, and
it answers in one or two short sentences, out loud. Timers, reminders, a memory of how you like things, and a heads-up
on your phone when another session finishes or needs your permission.

- Windows app (one installer, a tray icon), or a Claude Code plugin (`/plugin marketplace add baconshow/cody`), or
  from source (Python standard library only).
- Private by default: it runs on your computer, uses your own Claude Code, and sends nothing to me. The phone
  connects through your own Tailscale network, never the public internet.
- Its own sounds when you have no voice set up; ElevenLabs with your own key if you want a nicer one.
- Scenes are just JSON, so new ones are easy to add.

It is an unofficial fan project, MIT licensed: https://github.com/baconshow/cody

I would love to hear which scenes you would want next.

*(GIF: docs/media/cody-scenes.gif)*
