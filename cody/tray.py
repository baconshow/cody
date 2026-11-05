"""The installed app (Cody.exe): starts the mascot server, opens the mascot and the voice session, and lives in the
notification area with a small menu. Nobody opens a terminal by hand.

    Open Cody · Status · Start voice session · Settings · Start with Windows · Quit

The menu needs pystray and Pillow, which the Windows build bundles (packaging/). A checkout keeps running with the
standard library only: `python cody.py --tray` works when those two are installed, and says so when they are not.
`--background` (what starting with Windows runs) skips opening the browser and the voice session.
"""
from __future__ import annotations

import logging
import logging.handlers
import sys
import threading
import webbrowser
from pathlib import Path

from cody import autostart, launcher, setup
from cody.config import load_config
from cody.store import data_dir

LOG = logging.getLogger("cody")
ICON = Path(__file__).resolve().parent.parent / "web" / "icon-192.png"
LABELS = {
    "en": {"open": "Open Cody", "status": "Status", "voice": "Start voice session", "settings": "Settings",
           "autostart": "Start with Windows", "quit": "Quit", "voice_on": "voice session: on",
           "voice_off": "voice session: off", "busy": "Cody is already running"},
    "pt-BR": {"open": "Abrir o Cody", "status": "Estado", "voice": "Abrir sessão de voz", "settings": "Configurações",
              "autostart": "Iniciar com o Windows", "quit": "Sair", "voice_on": "sessão de voz: ligada",
              "voice_off": "sessão de voz: desligada", "busy": "O Cody já está aberto"},
}


def labels(language: str) -> dict:
    return LABELS.get(language, LABELS["en"])


def page(config: dict, view: str = "") -> str:
    return f"http://127.0.0.1:{config['port']}/" + (f"#{view}" if view else "")


def title(config: dict, running: bool | None = None) -> str:
    text = labels(config["language"])
    on = launcher.voice_session_running() if running is None else running
    return f"Cody · {text['voice_on'] if on else text['voice_off']}"


def start_voice(config: dict, opener=launcher.open_voice_window) -> str | None:
    """Opens the voice session unless one is already up. Returns what went wrong, if anything."""
    if launcher.voice_session_running():
        return None
    return opener(launcher.voice_folder(None, config, Path.home()))


def actions(config: dict, stop, open_url=webbrowser.open) -> dict:
    """What each menu entry does, by key (kept apart from pystray so it can be tested anywhere)."""
    def voice():
        problem = start_voice(config)
        if problem:
            LOG.warning("%s", problem)
            open_url(page(config, "status"))
    return {
        "open": lambda: open_url(page(config)),
        "status": lambda: open_url(page(config, "status")),
        "voice": voice,
        "settings": lambda: open_url(page(config, "settings")),
        "autostart": lambda: autostart.set_enabled(not autostart.enabled()),
        "quit": stop,
    }


def _log_to_file() -> None:
    folder = data_dir()
    folder.mkdir(parents=True, exist_ok=True)
    handler = logging.handlers.RotatingFileHandler(folder / "cody.log", maxBytes=256 * 1024, backupCount=1,
                                                   encoding="utf-8")
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s", "%Y-%m-%d %H:%M:%S"))
    logging.basicConfig(level=logging.INFO, handlers=[handler])


def _menu(pystray, config: dict, do: dict):
    text = labels(config["language"])
    item = pystray.MenuItem
    return pystray.Menu(
        item(text["open"], lambda: do["open"](), default=True),
        item(lambda _i: title(config), lambda: do["status"]()),
        item(text["voice"], lambda: do["voice"]()),
        item(text["settings"], lambda: do["settings"]()),
        item(text["autostart"], lambda: do["autostart"](), checked=lambda _i: autostart.enabled(),
             visible=sys.platform == "win32"),
        pystray.Menu.SEPARATOR,
        item(text["quit"], lambda: do["quit"]()),
    )


def main(argv: list[str] | None = None) -> int:
    from cody.server import start
    argv = list(argv or [])
    background = "--background" in argv
    _log_to_file()
    try:
        import pystray
        from PIL import Image
    except ImportError:
        LOG.error("the tray icon needs pystray and Pillow (pip install pystray pillow)")
        print("The tray icon needs pystray and Pillow: pip install pystray pillow")
        return 1
    config, notes = setup.prepare(load_config(), ask=None)
    for note in notes:
        LOG.info("%s", note)
    try:
        app, server = start(config)
    except OSError:                       # another Cody holds the port: show that one instead of failing silently
        LOG.info("%s", labels(config["language"])["busy"])
        if not background:
            webbrowser.open(page(config))
        return 0
    threading.Thread(target=server.serve_forever, kwargs={"poll_interval": 0.5}, daemon=True).start()
    LOG.info("Cody is up at %s", page(config))
    if not background:
        threading.Timer(0.8, webbrowser.open, args=(page(config),)).start()
        problem = start_voice(config)
        if problem:
            LOG.warning("%s", problem)
    icon = pystray.Icon("cody", Image.open(ICON), title(config))

    def stop():
        server.shutdown()
        icon.stop()
    icon.menu = _menu(pystray, config, actions(config, stop))
    icon.run()
    app.activity.stop()
    server.server_close()
    return 0
