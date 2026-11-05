"""PyInstaller entry for the Windows app: both Cody.exe (no console, the tray icon) and cody-cli.exe (console: hooks,
voice channel, voice session, --doctor) start here. cody/cli.py decides what to run."""
import sys

from cody.cli import main

if __name__ == "__main__":
    sys.exit(main())
