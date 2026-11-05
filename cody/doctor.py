"""What is on and off, in plain words: `python cody.py --doctor`, GET /api/status and the Status screen.

Each check is {"id", "state", "title", "say", "fix", "action"}: state is "ok", "warn" or "fail"; say is one simple
sentence; fix says what to do (empty when nothing); action names a button the Status screen can offer ("voice",
"hooks", "network") or is None. The microphone, the sound and the phone's own voice are checked by the page itself
(web/js/status.js): only the browser knows them.
"""
from __future__ import annotations

import json
import subprocess
import time
from pathlib import Path

from cody import hooks, launcher, setup
from cody.store import data_dir, read_json, write_private

PHONE_FILE = "phone.json"         # when a request last came through Tailscale (written by the server)
VOICE_ERROR_FILE = "voice-error.json"
PHONE_RECENT_S = 120
SESSIONS_DIR = "voice-sessions"

TEXT = {
    "en": {
        "server": "Mascot server", "server.ok": "Running at {url}.", "server.off": "Not running.",
        "server.fix": "Open the Cody app, or run `python cody.py --open`.",
        "voice": "Voice session", "voice.ok": "Open: Cody can hear you.",
        "voice.off": "Closed: Cody can't hear you yet.",
        "voice.fix": "Open the voice session (tray menu, /cody:voice or `python cody.py --voice`).",
        "voice.two": "{count} voice sessions are open: only the newest one hears you.",
        "voice.two.fix": "Close the older Claude Code windows with the voice channel.",
        "channel": "Voice channel", "channel.ok": "Claude Code loaded it.",
        "channel.wait": "The session is up, but Claude Code has not loaded the channel yet.",
        "channel.wait.fix": "In the voice session window, choose \"I am using this for local development\".",
        "channel.off": "Comes up with the voice session.",
        "channel.note": "If Claude Code says \"no MCP server configured with that name\", ignore it: the channel works.",
        "hooks": "Heads-up hooks", "hooks.plugin": "On, from the Cody plugin.", "hooks.ok": "On.",
        "hooks.off": "Off: Cody won't know when other sessions finish or need you.",
        "hooks.fix": "Install the Cody plugin, or run `python cody.py --install-hooks`.",
        "hooks.last": " Last heads-up {ago} ago.",
        "tailscale": "Private network", "tailscale.off": "Tailscale is not running on this computer.",
        "tailscale.fix": "Settings > Create your private network.",
        "tailscale.ok": "Shared with your devices at https://{host}/", "tailscale.unshared": "Tailscale is on, but "
        "Cody is not shared with your phone yet.", "tailscale.unshared.fix": "Settings > Create your private network.",
        "phone": "Phone", "phone.ok": "Connected {ago} ago.", "phone.off": "No phone has opened Cody recently.",
        "phone.fix": "Open the private address on your phone (it needs the Tailscale app too).",
        "provider": "Voice", "provider.device": "The phone's own voice.",
        "provider.sounds": "Cody's sounds (no words).",
        "provider.hosted": "Cody's hosted voice is not offered yet: the phone's own voice is used.",
        "provider.hosted.fix": "Settings > Voice: pick another voice.",
        "provider.eleven": "ElevenLabs.", "provider.nokey": "ElevenLabs is chosen, but there is no key on this "
        "computer: the phone's own voice is used.", "provider.nokey.fix": "Settings > Voice: paste your key.",
        "provider.error": "ElevenLabs: {reason}. The phone's own voice is used meanwhile.",
        "provider.error.fix": "Check your ElevenLabs account, then Settings > Voice > Test.",
    },
    "pt-BR": {
        "server": "Servidor do mascote", "server.ok": "Ligado em {url}.", "server.off": "Desligado.",
        "server.fix": "Abra o app do Cody ou rode `python cody.py --open`.",
        "voice": "Sessão de voz", "voice.ok": "Aberta: o Cody escuta você.",
        "voice.off": "Fechada: o Cody ainda não escuta você.",
        "voice.fix": "Abra a sessão de voz (menu da bandeja, /cody:voice ou `python cody.py --voice`).",
        "voice.two": "{count} sessões de voz abertas: só a mais nova escuta você.",
        "voice.two.fix": "Feche as janelas antigas do Claude Code com o canal de voz.",
        "channel": "Canal de voz", "channel.ok": "O Claude Code carregou o canal.",
        "channel.wait": "A sessão abriu, mas o Claude Code ainda não carregou o canal.",
        "channel.wait.fix": "Na janela da sessão de voz, escolha \"I am using this for local development\".",
        "channel.off": "Sobe junto com a sessão de voz.",
        "channel.note": "Se o Claude Code disser \"no MCP server configured with that name\", ignore: o canal "
        "funciona.",
        "hooks": "Avisos (hooks)", "hooks.plugin": "Ligados, pelo plugin do Cody.", "hooks.ok": "Ligados.",
        "hooks.off": "Desligados: o Cody não sabe quando outras sessões terminam ou precisam de você.",
        "hooks.fix": "Instale o plugin do Cody ou rode `python cody.py --install-hooks`.",
        "hooks.last": " Último aviso há {ago}.",
        "tailscale": "Rede privada", "tailscale.off": "O Tailscale não está rodando neste computador.",
        "tailscale.fix": "Configurações > Criar sua rede privada.",
        "tailscale.ok": "Compartilhado com seus aparelhos em https://{host}/", "tailscale.unshared": "O Tailscale "
        "está ligado, mas o Cody ainda não foi compartilhado com o celular.",
        "tailscale.unshared.fix": "Configurações > Criar sua rede privada.",
        "phone": "Celular", "phone.ok": "Conectado há {ago}.", "phone.off": "Nenhum celular abriu o Cody há pouco.",
        "phone.fix": "Abra o endereço privado no celular (ele também precisa do app do Tailscale).",
        "provider": "Voz", "provider.device": "A voz do próprio celular.",
        "provider.sounds": "Os sons do Cody (sem palavras).",
        "provider.hosted": "A voz hospedada do Cody ainda não está disponível: o celular usa a própria voz.",
        "provider.hosted.fix": "Configurações > Voz: escolha outra voz.",
        "provider.eleven": "ElevenLabs.", "provider.nokey": "O ElevenLabs foi escolhido, mas não há chave neste "
        "computador: o celular usa a própria voz.", "provider.nokey.fix": "Configurações > Voz: cole sua chave.",
        "provider.error": "ElevenLabs: {reason}. Enquanto isso, o celular usa a própria voz.",
        "provider.error.fix": "Confira sua conta no ElevenLabs e depois Configurações > Voz > Testar.",
    },
}


def _text(language: str) -> dict:
    return TEXT.get(language, TEXT["en"])


def ago(seconds: float, language: str = "en") -> str:
    seconds = max(0, int(seconds))
    if seconds < 90:
        return f"{seconds} s"
    if seconds < 5400:
        return f"{round(seconds / 60)} min"
    return f"{round(seconds / 3600)} h"


def item(ident: str, state: str, title: str, say: str, fix: str = "", action: str | None = None) -> dict:
    return {"id": ident, "state": state, "title": title, "say": say, "fix": fix, "action": action}


# ---- what other parts of Cody write for the doctor ------------------------------------------------------------

def note_phone(clock=time.time, folder: Path | None = None) -> None:
    """The server calls this for requests through Tailscale (at most once a minute is enough)."""
    write_private((folder or data_dir()) / PHONE_FILE, json.dumps({"t": round(clock())}))


def note_voice_error(reason: str | None, folder: Path | None = None) -> None:
    """The last ElevenLabs failure in plain words ("payment pending"), or None to clear it after a success."""
    path = (folder or data_dir()) / VOICE_ERROR_FILE
    if reason is None:
        path.unlink(missing_ok=True)
        return
    write_private(path, json.dumps({"reason": reason[:120], "t": round(time.time())}))


def live_sessions(folder: Path | None = None, connect=None) -> int:
    """How many voice channels answer on their port (cody/channel.py registers each one in voice-sessions/)."""
    count = 0
    for path in ((folder or data_dir()) / SESSIONS_DIR).glob("*.json"):
        data = read_json(path)
        port = data.get("port") if isinstance(data, dict) else None
        if isinstance(port, int) and launcher.server_running(port, connect):
            count += 1
        else:
            path.unlink(missing_ok=True)                  # a session that ended without cleaning up
    return count


# ---- the checks ------------------------------------------------------------------------------------------------

def check_server(config: dict, text: dict, running: bool | None) -> dict:
    url = f"http://127.0.0.1:{config['port']}/"
    on = launcher.server_running(config["port"]) if running is None else running
    if on:
        return item("server", "ok", text["server"], text["server.ok"].format(url=url))
    return item("server", "fail", text["server"], text["server.off"], text["server.fix"])


def check_voice(text: dict, folder: Path | None = None) -> list[dict]:
    count = live_sessions(folder)
    channel = read_json((folder or data_dir()) / "channel.json")
    loaded = isinstance(channel, dict) and bool(channel.get("loaded"))
    if count == 0:
        return [item("voice", "fail", text["voice"], text["voice.off"], text["voice.fix"], "voice"),
                item("channel", "warn", text["channel"], text["channel.off"])]
    voice = item("voice", "ok", text["voice"], text["voice.ok"])
    if count > 1:
        voice = item("voice", "warn", text["voice"], text["voice.two"].format(count=count), text["voice.two.fix"])
    if loaded:
        return [voice, item("channel", "ok", text["channel"], text["channel.ok"], text["channel.note"])]
    return [voice, item("channel", "warn", text["channel"], text["channel.wait"], text["channel.wait.fix"])]


def check_hooks(text: dict, language: str, settings_path: Path | None = None, clock=time.time) -> dict:
    if hooks.plugin_enabled(settings_path):
        say = text["hooks.plugin"]
    elif setup.hooks_installed(settings_path):
        say = text["hooks.ok"]
    else:
        return item("hooks", "warn", text["hooks"], text["hooks.off"], text["hooks.fix"], "hooks")
    try:
        say += text["hooks.last"].format(ago=ago(clock() - hooks.events_file().stat().st_mtime, language))
    except OSError:
        pass
    return item("hooks", "ok", text["hooks"], say)


NETWORK_CACHE_S = 60
_network_seen: dict = {}


def _tailscale_facts(port: int, run, clock) -> tuple[dict | None, list[str]]:
    """Tailscale's identity and what it serves for Cody, asked at most once a minute (forget_network() to redo)."""
    cached = _network_seen.get(port)
    if cached and clock() - cached[0] < NETWORK_CACHE_S and run is subprocess.run:
        return cached[1], cached[2]
    me = setup.identity(run)
    hosts = setup.served(setup.serve_status(run), port) if me else []
    _network_seen[port] = (clock(), me, hosts)
    return me, hosts


def forget_network() -> None:
    _network_seen.clear()


def check_network(config: dict, text: dict, language: str, run=subprocess.run, clock=time.time,
                  folder: Path | None = None) -> list[dict]:
    me, hosts = _tailscale_facts(config["port"], run, clock)
    if not me:
        network = item("tailscale", "warn", text["tailscale"], text["tailscale.off"], text["tailscale.fix"], "network")
    else:
        network = (item("tailscale", "ok", text["tailscale"], text["tailscale.ok"].format(host=hosts[0])) if hosts
                   else item("tailscale", "warn", text["tailscale"], text["tailscale.unshared"],
                             text["tailscale.unshared.fix"], "network"))
    seen = read_json((folder or data_dir()) / PHONE_FILE)
    when = seen.get("t") if isinstance(seen, dict) else None
    if isinstance(when, (int, float)) and clock() - when < PHONE_RECENT_S:
        phone = item("phone", "ok", text["phone"], text["phone.ok"].format(ago=ago(clock() - when, language)))
    else:
        phone = item("phone", "warn", text["phone"], text["phone.off"], text["phone.fix"])
    return [network, phone]


def check_provider(config: dict, text: dict, folder: Path | None = None, key=None) -> dict:
    from cody import voice
    chosen = config.get("voice_provider") or ("elevenlabs" if config.get("voice") else "device")
    if chosen == "sounds":
        return item("provider", "ok", text["provider"], text["provider.sounds"])
    if chosen == "hosted":
        return item("provider", "warn", text["provider"], text["provider.hosted"], text["provider.hosted.fix"])
    if chosen == "device" or not config.get("voice"):
        return item("provider", "ok", text["provider"], text["provider.device"])
    if not (key or voice._api_key)():
        return item("provider", "warn", text["provider"], text["provider.nokey"], text["provider.nokey.fix"])
    error = read_json((folder or data_dir()) / VOICE_ERROR_FILE)
    if isinstance(error, dict) and error.get("reason"):
        return item("provider", "fail", text["provider"], text["provider.error"].format(reason=error["reason"]),
                    text["provider.error.fix"])
    return item("provider", "ok", text["provider"], text["provider.eleven"])


def report(config: dict, server_running: bool | None = None, run=subprocess.run, language: str | None = None
           ) -> list[dict]:
    language = language if language in TEXT else config.get("language", "en")
    text = _text(language)
    return [check_server(config, text, server_running), *check_voice(text), check_hooks(text, language),
            *check_network(config, text, language, run), check_provider(config, text)]


def render(items: list[dict]) -> str:
    marks = {"ok": "OK  ", "warn": "WARN", "fail": "FAIL"}
    lines = []
    for entry in items:
        lines.append(f"{marks[entry['state']]}  {entry['title']}: {entry['say']}")
        if entry["fix"] and entry["state"] != "ok":
            lines.append(f"      -> {entry['fix']}")
    return "\n".join(lines)


def main(config: dict) -> int:
    items = report(config)
    print(render(items))
    return 1 if any(entry["state"] == "fail" for entry in items) else 0
