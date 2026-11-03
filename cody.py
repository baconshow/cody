"""Cody: a desk mascot for Claude Code. Run `python cody.py --open`.

    python cody.py --hook               what the Claude Code hooks run (reads the hook's JSON on stdin)
    python cody.py --install-hooks      adds those hooks to Claude Code's user settings
    python cody.py --uninstall-hooks    removes them
"""
import sys

if sys.version_info < (3, 10):
    sys.exit("Cody needs Python 3.10 or newer.")

if __name__ == "__main__":
    if sys.argv[1:] == ["--hook"]:          # fast path: a hook must not import the whole server
        from cody.hooks import run_hook
        sys.exit(run_hook())
    if sys.argv[1:] in (["--install-hooks"], ["--uninstall-hooks"]):
        from cody.hooks import install
        print(install(remove=sys.argv[1] == "--uninstall-hooks"))
        sys.exit(0)
    from cody.server import main
    sys.exit(main())
