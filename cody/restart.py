"""Cody starting itself again: the Restart button in Settings and the tray's Restart. The server answers, stops a
moment later, and the process starts a new one with the same command line once it has let go of the port (new
code in cody/ and web/ is picked up; the page reloads itself for the new token). The voice session is another
process and keeps running.

  command() → the command line to run again (this interpreter and cody.py, or the installed exe)
  relaunch(cmd)   Windows: a new process on this console (or log file); elsewhere: this process becomes the new one
"""
from __future__ import annotations

import os
import subprocess
import sys


def command(executable: str | None = None, argv: list[str] | None = None, is_frozen: bool | None = None) -> list[str]:
    executable = executable or sys.executable
    argv = list(sys.argv if argv is None else argv)
    frozen = bool(getattr(sys, "frozen", False)) if is_frozen is None else is_frozen
    return [executable, *(argv[1:] if frozen else argv)]      # the exe is argv[0] when frozen; cody.py is not


def relaunch(cmd: list[str] | None = None, popen=subprocess.Popen, exec_=os.execv, platform: str = sys.platform) -> None:
    cmd = cmd or command()
    if platform == "win32":
        popen(cmd, close_fds=False)       # Windows has no exec: a child that inherits this console or log file
        return
    exec_(cmd[0], cmd)
