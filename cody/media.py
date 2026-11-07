"""Music on the computer: whether anything is playing, for the headphones (web/scenes/scenes.json, trigger "music").

Windows only. The system keeps a list of media sessions (what the volume flyout shows: Spotify, a browser tab, a
player), reachable from Windows PowerShell. One child process stays up and prints one word every POLL_S:
"playing" when any session is playing, "silent" otherwise. That is all it reads: no title, no artist, no app
name, and nothing leaves the machine. Off with "music": false in config.json; on other systems, nothing plays.

  MediaWatcher(enabled).start() / .stop() / .playing() → bool
"""
from __future__ import annotations

import base64
import logging
import subprocess
import sys
import threading
import time

LOG = logging.getLogger("cody")
POLL_S = 2
STALE_S = 15                   # no word for this long (the child died, the machine slept): nothing is playing
RETRY_S = (5, 30, 120)         # the child is started again after these waits; after the last, it stays down
SCRIPT = r"""
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
$task = $asTask.MakeGenericMethod([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]).Invoke(
  $null, @([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()))
$task.Wait(-1) | Out-Null
$manager = $task.Result
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
    """Windows PowerShell (the one every Windows has; the newer pwsh cannot reach the media sessions), no window."""
    encoded = base64.b64encode(SCRIPT.encode("utf-16-le")).decode("ascii")
    return ["powershell.exe", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded]


def spawn_powershell():
    flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    return subprocess.Popen(command(), stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                            text=True, encoding="utf-8", errors="replace", bufsize=1, creationflags=flags)


class MediaWatcher:
    """Reads the child's words on a thread; playing() is the last word, as long as it is fresh."""

    def __init__(self, enabled: bool = True, spawn=spawn_powershell, clock=time.monotonic, platform: str = sys.platform):
        self._possible = platform == "win32"
        self.enabled = enabled and self._possible
        self._spawn = spawn
        self._clock = clock
        self._lock = threading.Lock()
        self._playing = False
        self._at = -1e9
        self._child = None
        self._thread = None
        self._stopping = threading.Event()

    def start(self) -> None:
        if not self.enabled or (self._thread and self._thread.is_alive()):
            return
        self._stopping.clear()
        self._thread = threading.Thread(target=self._run, name="cody-media", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stopping.set()
        child = self._child
        if child is not None:
            try:
                child.terminate()
            except OSError:
                pass

    def set_enabled(self, on: bool) -> None:
        """The setting changed: the reader starts or stops now."""
        self.enabled = on and self._possible
        if self.enabled:
            self.start()
        else:
            self.stop()

    def playing(self) -> bool:
        with self._lock:
            return self._playing and self._clock() - self._at < STALE_S

    def hear(self, word: str) -> None:
        """One word from the child (public for the tests)."""
        word = word.strip()
        if word not in ("playing", "silent"):
            return
        with self._lock:
            self._playing = word == "playing"
            self._at = self._clock()

    def _run(self) -> None:
        for wait in (*RETRY_S, None):
            if self._stopping.is_set():
                return
            try:
                self._child = self._spawn()
                for line in self._child.stdout:
                    self.hear(line)
                    if self._stopping.is_set():
                        break
            except (OSError, ValueError) as error:
                LOG.info("music: the media reader could not start (%s)", error)
            finally:
                child, self._child = self._child, None
                if child is not None:
                    try:
                        child.terminate()
                        child.wait(timeout=2)
                    except (OSError, subprocess.TimeoutExpired):
                        pass
            with self._lock:
                self._playing = False
            if wait is None or self._stopping.wait(wait):
                break
        if not self._stopping.is_set():
            LOG.info("music: the media reader stopped; the headphones stay off until Cody starts again")
