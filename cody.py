"""Cody: a desk mascot for Claude Code. Run `python cody.py --open`."""
import sys

if sys.version_info < (3, 10):
    sys.exit("Cody needs Python 3.10 or newer.")

from cody.server import main  # noqa: E402 - after the version check

if __name__ == "__main__":
    sys.exit(main())
