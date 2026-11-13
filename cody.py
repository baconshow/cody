"""Cody: a desk mascot for Claude Code. Run `python cody.py --open`.

    python cody.py --hook               what the Claude Code hooks run (reads the hook's JSON on stdin)
    python cody.py --install-hooks      adds those hooks to Claude Code's user settings
    python cody.py --uninstall-hooks    removes them
    python cody.py --voice [folder]     the voice session: Claude Code with Cody's voice channel
    python cody.py --tray               the tray icon app (what the Windows app runs; needs pystray and Pillow)

All the options: cody/cli.py.
"""
import sys

if sys.version_info < (3, 10):
    sys.exit("Cody needs Python 3.10 or newer.")

if __name__ == "__main__":
    from cody.cli import main
    sys.exit(main())
