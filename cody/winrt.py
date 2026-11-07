"""A Windows system fact read by a Windows PowerShell child process (the media sessions, the notifications): the
WinRT types are reachable from Windows PowerShell 5.1, the one every Windows has, and not from the newer pwsh;
loading them takes a few seconds, so the child stays up and prints one line whenever it has something to say.

  ChildReader(script, enabled).start() / .stop() / .set_enabled(on); hear(line) is the subclass's
  command(script) → the command line: the prelude (the Await helper) and the script, base64-encoded, no window
"""
from __future__ import annotations

import base64
import logging
import subprocess
import sys
import threading
import time

LOG = logging.getLogger("cody")
RETRY_S = (5, 30, 120)         # the child is started again after these waits; after the last, it stays down
PRELUDE = r"""
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
function Await($op, $type) {
  $task = $asTask.MakeGenericMethod($type).Invoke($null, @($op))
  $task.Wait(-1) | Out-Null
  $task.Result
}
"""


def command(script: str) -> list[str]:
    encoded = base64.b64encode((PRELUDE + script).encode("utf-16-le")).decode("ascii")
    return ["powershell.exe", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded]


def spawn(script: str):
    flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    return subprocess.Popen(command(script), stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                            text=True, encoding="utf-8", errors="replace", bufsize=1, creationflags=flags)


class ChildReader:
    """Reads the child's lines on a thread and hands each one to hear(); restarts the child a few times if it dies."""

    name = "cody-winrt"
    what = "the reader"

    def __init__(self, script: str, enabled: bool = True, spawn_child=None, clock=time.monotonic,
                 platform: str = sys.platform):
        self._script = script
        self._possible = platform == "win32"
        self.enabled = enabled and self._possible
        self._spawn = spawn_child or (lambda: spawn(self._script))
        self._clock = clock
        self._lock = threading.Lock()
        self._child = None
        self._thread = None
        self._stopping = threading.Event()

    def start(self) -> None:
        if not self.enabled or (self._thread and self._thread.is_alive()):
            return
        self._stopping.clear()
        self._thread = threading.Thread(target=self._run, name=self.name, daemon=True)
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

    def hear(self, line: str) -> None:
        raise NotImplementedError

    def quiet(self) -> None:
        """The child is gone (for a while or for good): what it said no longer holds."""

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
                LOG.info("%s could not start (%s)", self.what, error)
            finally:
                child, self._child = self._child, None
                if child is not None:
                    try:
                        child.terminate()
                        child.wait(timeout=2)
                    except (OSError, subprocess.TimeoutExpired):
                        pass
            self.quiet()
            if wait is None or self._stopping.wait(wait):
                break
        if not self._stopping.is_set():
            LOG.info("%s stopped; it is back when Cody starts again", self.what)
