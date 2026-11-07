"""Your Windows notifications, read aloud: the important ones only, and only if you turn it on.

Windows only, opt-in ("notifications": true in config.json, the Settings checkbox). The child process
(cody/winrt.py) asks the system's notification listener for new toasts every POLL_S and prints one JSON line per
toast: its id, the app's name and the first line of text (the title: a sender, a subject). Never the body. What
counts as important: a toast from a messaging, mail, calendar or phone app (APPS, or "notification_apps" in
config.json), or a title with an urgent word in it (WORDS). The rest is dropped here and never shown.

An important one becomes a "notice" event for the page (cody/hooks.py, HookFeed.add): Cody knocks on the screen
and says the app and the title with the device's own voice or its sounds; with ElevenLabs, only the app's name is
spoken (phrase()), so the title never leaves the computer. Windows must allow the access (Settings > Privacy >
Notifications); when it does not, the child says so once and stays down.

  NoticeWatcher(enabled, feed, apps).start() / .stop(); important(app, title, apps) is pure
"""
from __future__ import annotations

import json
import logging
import time

from cody import winrt

LOG = logging.getLogger("cody")
POLL_S = 3
MAX_TITLE = 80
SAME_AGAIN_S = 60              # the same app and title within this: said once
BREATH_S = 15                  # at most one notice this often; the rest of a burst is dropped, not queued
APPS = ("whatsapp", "telegram", "signal", "teams", "slack", "discord", "outlook", "mail", "correio", "gmail",
        "calendar", "calendário", "agenda", "messenger", "zoom", "meet", "phone link", "vincular ao celular",
        "your phone", "seu telefone", "skype")
WORDS = ("urgent", "urgente", "reminder", "lembrete", "call", "chamada", "ligação", "meeting", "reunião", "alarm",
         "alarme", "deadline", "prazo", "vence")
PHRASES = {"en": "Something new on {app}.", "pt-BR": "Novidade no {app}."}
SCRIPT = r"""
$null = [Windows.UI.Notifications.Management.UserNotificationListener, Windows.UI.Notifications, ContentType = WindowsRuntime]
$null = [Windows.UI.Notifications.NotificationKinds, Windows.UI.Notifications, ContentType = WindowsRuntime]
$null = [Windows.UI.Notifications.KnownNotificationBindings, Windows.UI.Notifications, ContentType = WindowsRuntime]
$listener = [Windows.UI.Notifications.Management.UserNotificationListener]::Current
$toast = [Windows.UI.Notifications.NotificationKinds]::Toast
$listType = [System.Collections.Generic.IReadOnlyList[Windows.UI.Notifications.UserNotification]]
$status = Await ($listener.RequestAccessAsync()) ([Windows.UI.Notifications.Management.UserNotificationListenerAccessStatus])
if ("$status" -ne 'Allowed') { @{ error = "$status" } | ConvertTo-Json -Compress; [Console]::Out.Flush(); exit 0 }
$last = 0
foreach ($n in (Await ($listener.GetNotificationsAsync($toast)) ($listType))) { if ($n.Id -gt $last) { $last = $n.Id } }
while ($true) {
  Start-Sleep -Seconds %d
  try { $list = Await ($listener.GetNotificationsAsync($toast)) ($listType) } catch { continue }
  foreach ($n in $list) {
    if ($n.Id -le $last) { continue }
    $last = $n.Id
    $title = ''
    try {
      $binding = $n.Notification.Visual.GetBinding([Windows.UI.Notifications.KnownNotificationBindings]::ToastGeneric)
      # the first text element only (indexing a WinRT list in PowerShell gives every element: Select-Object does not)
      if ($binding) { $first = $binding.GetTextElements() | Select-Object -First 1; if ($first) { $title = [string]$first.Text } }
    } catch {}
    @{ id = $n.Id; app = [string]$n.AppInfo.DisplayInfo.DisplayName; title = $title } | ConvertTo-Json -Compress
    [Console]::Out.Flush()
  }
}
""" % POLL_S


def command() -> list[str]:
    return winrt.command(SCRIPT)


def important(app: str, title: str, apps=APPS, words=WORDS) -> bool:
    name = app.casefold()
    text = title.casefold()
    return any(a in name for a in apps) or any(w in text for w in words)


def phrase(app: str, language: str = "en") -> str:
    """What the mascot's hosted voice says: the app's name, nothing of the title."""
    return PHRASES.get(language, PHRASES["en"]).format(app=app)


class NoticeWatcher(winrt.ChildReader):
    """Turns the child's lines into notice events on the feed (cody/hooks.py HookFeed)."""

    name = "cody-notices"
    what = "notifications: the reader"

    def __init__(self, enabled: bool, feed, apps=None, spawn=None, clock=time.monotonic, platform: str = None):
        super().__init__(SCRIPT, enabled, spawn_child=spawn, clock=clock,
                         **({"platform": platform} if platform is not None else {}))
        self._feed = feed
        self._apps = tuple(a.casefold() for a in apps) if apps else APPS
        self._last: tuple[str, str] | None = None
        self._last_at = -1e9
        self._said_at = -1e9

    def hear(self, line: str) -> None:
        """One JSON line from the child (public for the tests): {"id", "app", "title"} or {"error"}."""
        try:
            item = json.loads(line)
        except ValueError:
            return
        if not isinstance(item, dict):
            return
        if "error" in item:
            LOG.info("notifications: Windows did not allow the access (%s): Settings > Privacy > Notifications", item["error"])
            return
        app = str(item.get("app") or "").strip()[:40]
        title = " ".join(str(item.get("title") or "").split())[:MAX_TITLE]
        if not app or not important(app, title, self._apps):
            return
        now = self._clock()
        if (app, title) == self._last and now - self._last_at < SAME_AGAIN_S:
            return
        if now - self._said_at < BREATH_S:
            return
        self._last, self._last_at, self._said_at = (app, title), now, now
        self._feed.add("notice", f"{app}: {title}" if title else app, app=app)
