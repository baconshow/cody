"""Music on the computer: whether anything is playing, for the headphones (web/scenes/scenes.json, trigger "music").

Windows only. The system keeps a list of media sessions (what the volume flyout shows: Spotify, a browser tab, a
player), reachable from Windows PowerShell (cody/winrt.py). The child prints one word every POLL_S: "playing" when
any session is playing, "silent" otherwise. That is all it reads: no title, no artist, no app name, and nothing
leaves the machine. Off with "music": false in config.json; on other systems, nothing plays.

  MediaWatcher(enabled).start() / .stop() / .playing() → bool
"""
from __future__ import annotations

import threading
import time

from cody import winrt

POLL_S = 2
STALE_S = 15                   # no word for this long (the child died, the machine slept): nothing is playing
SCRIPT = r"""
$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
$manager = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
while ($true) {
  $playing = $false
  foreach ($s in $manager.GetSessions()) {
    try { if ($s.GetPlaybackInfo().PlaybackStatus -eq 'Playing') { $playing = $true } } catch {}
  }
  if ($playing) { 'playing' } else { 'silent' }
  [Console]::Out.Flush()
  Start-Sleep -Seconds %d
}
""" % POLL_S


def command() -> list[str]:
    return winrt.command(SCRIPT)


class MediaWatcher(winrt.ChildReader):
    """playing() is the child's last word, as long as it is fresh."""

    name = "cody-media"
    what = "music: the media reader"

    def __init__(self, enabled: bool = True, spawn=None, clock=time.monotonic, platform: str = None):
        super().__init__(SCRIPT, enabled, spawn_child=spawn, clock=clock,
                         **({"platform": platform} if platform is not None else {}))
        self._playing = False
        self._at = -1e9
        self._words = threading.Lock()

    def playing(self) -> bool:
        with self._words:
            return self._playing and self._clock() - self._at < STALE_S

    def hear(self, word: str) -> None:
        """One word from the child (public for the tests)."""
        word = word.strip()
        if word not in ("playing", "silent"):
            return
        with self._words:
            self._playing = word == "playing"
            self._at = self._clock()

    def quiet(self) -> None:
        with self._words:
            self._playing = False
