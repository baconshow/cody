"""The voice channel's extra tools, beyond reply and screenshot (cody/channel.py):

    timer      timers and reminders that ring on the phone (cody/timers.py)
    remember   a fact kept for the next voice sessions (cody/memory.py); forget drops it
    look       the screen, scaled down, for Claude to see (only when you ask about something on it)
    point      the mini Cody flies to a spot on the screen and points at it (cody/pointer.py, Windows)

Each tool is a JSON schema plus a handler that returns an MCP tool result. Texts in English and Portuguese, like the
channel's; the tool descriptions carry the details, so the channel's instructions stay short.
"""
from __future__ import annotations

import base64
from datetime import datetime

from cody import timers as timer_module
from cody.memory import MIN_QUERY, Memory, clean_fact
from cody.pointer import Pointer

TEXTS = {
    "en": {
        "timer": "Timers and reminders that ring on the user's phone, like a kitchen timer. action \"set\" with "
                 "`minutes` from now, or `at` (24-hour local time, \"HH:MM\", the next one: today or tomorrow), and a "
                 "short `label` the mascot says when it rings (\"pizza\", \"call Ana\"). action \"cancel\" with "
                 "`label` (part of it, an id, or \"all\"). action \"list\": what is running. They keep running after "
                 "this session closes.",
        "remember": "Saves one short fact for future voice sessions: the user's name, how they like things, people and "
                    "places they mention. Use it when they tell you their name or ask you to remember something. "
                    "Write it in the user's language, as a full sentence (\"The user's name is Ana.\").",
        "forget": "Deletes the saved facts that contain this text: when the user asks you to forget something, or a "
                  "fact changed (forget the old one, then remember the new one).",
        "look": "Shows you the user's computer screen right now, scaled down. Only when they ask about something on "
                "the screen (\"where is the export button?\"): the picture goes into this conversation. Then call "
                "point to show them the spot.",
        "point": "A mini Cody flies to a spot on the user's computer screen and points at it, with a short speech "
                 "bubble (Windows only). x and y are pixels in the latest look picture. `text` is the bubble (a few "
                 "words, like \"Right here! Click Export\"). Then reply as usual.",
        "set": "{kind} \"{label}\" set: rings at {time}.", "kind_timer": "Timer", "kind_reminder": "Reminder",
        "none": "No timers running.", "running": "Running: {list}.", "item": "\"{label}\" at {time} (id {id})",
        "cancelled": "Cancelled: {list}.", "no_match": "No running timer matches \"{label}\".",
        "when": "Give either minutes or at, not both.",
        "minutes": "minutes must be at least ten seconds (0.17) and at most a week.",
        "busy": "Too many timers set in the last hour: try again later.",
        "storage": "Could not read or save that on this computer (the file may be open or damaged).",
        "short": "Say a bit more of what to forget (at least three letters).",
        "at": "at must be a time of day like \"15:30\".", "full": "Too many timers running: cancel one first.",
        "action": "action must be set, cancel or list.",
        "added": "Saved.", "known": "Already saved.", "empty": "Nothing to save.",
        "memory_full": "The memory is full: forget something first.", "forgot": "Forgot: {list}.",
        "nothing_forgot": "No saved fact contains that.",
        "looked": "The screen as the user sees it, {width} by {height} pixels. To show a spot, call point with x and y "
                  "in this picture.",
        "looked_plain": "The user's screen (pointing is not available on this system).",
        "look_failed": "The screen could not be captured on this computer.",
        "pointed": "Cody is pointing at it on the screen. Now reply.",
        "unsupported": "Pointing works on Windows only for now: describe where it is instead.",
        "need_look": "Call look first: point uses the pixels of the latest look picture.",
        "outside": "That spot is outside the latest look picture.",
        "point_failed": "The mini Cody could not be shown on this computer: describe where it is instead.",
    },
    "pt-BR": {
        "timer": "Cronômetros e lembretes que tocam no celular do usuário, como um timer de cozinha. action \"set\" "
                 "com `minutes` a partir de agora, ou `at` (hora local de 24 horas, \"HH:MM\", a próxima: hoje ou "
                 "amanhã), e um `label` curto que o mascote fala quando tocar (\"pizza\", \"ligar para a Ana\"). "
                 "action \"cancel\" com `label` (um pedaço, um id ou \"all\"). action \"list\": o que está rodando. "
                 "Continuam rodando depois que esta sessão fecha.",
        "remember": "Guarda um fato curto para as próximas sessões de voz: o nome do usuário, como ele gosta das "
                    "coisas, pessoas e lugares que ele cita. Use quando ele disser o nome ou pedir para lembrar de "
                    "algo. Escreva em português, como frase completa (\"O nome do usuário é Ana.\").",
        "forget": "Apaga os fatos guardados que contêm este texto: quando o usuário pedir para esquecer algo, ou um "
                  "fato mudou (esqueça o antigo e guarde o novo).",
        "look": "Mostra para você a tela do computador do usuário agora, reduzida. Só quando ele perguntar de algo na "
                "tela (\"cadê o botão de exportar?\"): a imagem entra nesta conversa. Depois chame point para mostrar "
                "o lugar.",
        "point": "Um mini Cody voa até um ponto da tela do computador e aponta para ele, com um balão curto (só no "
                 "Windows). x e y são pixels da última imagem do look. `text` é o balão (poucas palavras, como "
                 "\"Aqui! Clica em Exportar\"). Depois responda como sempre.",
        "set": "{kind} \"{label}\" marcado: toca às {time}.", "kind_timer": "Cronômetro", "kind_reminder": "Lembrete",
        "none": "Nenhum cronômetro rodando.", "running": "Rodando: {list}.", "item": "\"{label}\" às {time} (id {id})",
        "cancelled": "Cancelado: {list}.", "no_match": "Nenhum cronômetro rodando bate com \"{label}\".",
        "when": "Passe minutes ou at, não os dois.",
        "minutes": "minutes precisa ser de pelo menos dez segundos (0.17) e no máximo uma semana.",
        "busy": "Cronômetros demais na última hora: tente mais tarde.",
        "storage": "Não deu para ler ou salvar isso neste computador (o arquivo pode estar aberto ou danificado).",
        "short": "Diga um pouco mais do que esquecer (pelo menos três letras).",
        "at": "at precisa ser uma hora do dia, como \"15:30\".", "full": "Cronômetros demais rodando: cancele um antes.",
        "action": "action precisa ser set, cancel ou list.",
        "added": "Guardado.", "known": "Já estava guardado.", "empty": "Nada para guardar.",
        "memory_full": "A memória está cheia: esqueça algo antes.", "forgot": "Esquecido: {list}.",
        "nothing_forgot": "Nenhum fato guardado contém isso.",
        "looked": "A tela como o usuário vê, {width} por {height} pixels. Para mostrar um lugar, chame point com x e y "
                  "nesta imagem.",
        "looked_plain": "A tela do usuário (apontar não está disponível neste sistema).",
        "look_failed": "Não deu para capturar a tela neste computador.",
        "pointed": "O Cody está apontando na tela. Agora responda.",
        "unsupported": "Apontar só funciona no Windows por enquanto: descreva onde fica.",
        "need_look": "Chame look antes: o point usa os pixels da última imagem do look.",
        "outside": "Esse ponto está fora da última imagem do look.",
        "point_failed": "Não deu para mostrar o mini Cody neste computador: descreva onde fica.",
    },
}


def _text(text: str, error: bool = False) -> dict:
    result = {"content": [{"type": "text", "text": text}]}
    if error:
        result["isError"] = True
    return result


def schemas(texts: dict) -> list[dict]:
    string, number = {"type": "string"}, {"type": "number"}
    return [
        {"name": "timer", "description": texts["timer"], "inputSchema": {
            "type": "object", "required": ["action"],
            "properties": {"action": {"type": "string", "enum": ["set", "cancel", "list"]},
                           "minutes": {**number, "description": "set: minutes from now (0.5 is thirty seconds)"},
                           "at": {**string, "description": "set: a time of day, \"HH:MM\" (24 hours)"},
                           "label": {**string, "description": "set: what it is for; cancel: which one"}}}},
        {"name": "remember", "description": texts["remember"], "inputSchema": {
            "type": "object", "required": ["fact"], "properties": {"fact": string}}},
        {"name": "forget", "description": texts["forget"], "inputSchema": {
            "type": "object", "required": ["text"], "properties": {"text": string}}},
        {"name": "look", "description": texts["look"], "inputSchema": {"type": "object", "properties": {}}},
        {"name": "point", "description": texts["point"], "inputSchema": {
            "type": "object", "required": ["x", "y"],
            "properties": {"x": number, "y": number, "text": string}}},
    ]


class Abilities:
    def __init__(self, lang: str = "en", store=None, memory: Memory | None = None, pointer: Pointer | None = None,
                 now=None):
        self._texts = TEXTS.get(lang, TEXTS["en"])
        self._store = store or timer_module.TimerStore()
        self.memory = memory or Memory()
        self._pointer = pointer or Pointer()
        self._now = now or datetime.now          # naive local time: right across a daylight saving change

    def tools(self) -> list[dict]:
        return schemas(self._texts)

    def handles(self, name) -> bool:
        return name in ("timer", "remember", "forget", "look", "point")

    def call(self, name: str, arguments: dict) -> dict:
        handler = {"timer": self._timer, "remember": self._remember, "forget": self._forget, "look": self._look,
                   "point": self._point}[name]
        try:
            return handler(arguments if isinstance(arguments, dict) else {})
        except OSError:                      # a file held open or damaged: a tool error, never a dead channel
            return _text(self._texts["storage"], error=True)

    def close(self) -> None:
        self._pointer.close()

    # ---- timer ---------------------------------------------------------------------------------------------------
    def _clock(self, ends_at: float) -> str:
        return datetime.fromtimestamp(ends_at, tz=self._now().tzinfo).strftime("%H:%M")

    def _timer(self, a: dict) -> dict:
        t = self._texts
        action = a.get("action")
        if action == "list":
            running = self._store.running()
            if not running:
                return _text(t["none"])
            items = [t["item"].format(label=r["label"], time=self._clock(r["ends_at"]), id=r["id"]) for r in running]
            return _text(t["running"].format(list="; ".join(items)))
        if action == "cancel":
            gone = self._store.cancel(str(a.get("label") or ""))
            if not gone:
                return _text(t["no_match"].format(label=timer_module.clean_label(a.get("label"))), error=True)
            return _text(t["cancelled"].format(list=", ".join(f"\"{g['label']}\"" for g in gone)))
        if action != "set":
            return _text(t["action"], error=True)
        try:
            ends_at, kind = timer_module.end_time(a.get("minutes"), a.get("at"), self._now())
        except ValueError as error:
            return _text(t[str(error)], error=True)
        try:
            timer = self._store.add(str(a.get("label") or ""), ends_at, kind)
        except ValueError as error:
            return _text(t[str(error)], error=True)
        return _text(t["set"].format(kind=t[f"kind_{kind}"], label=timer["label"], time=self._clock(ends_at)))

    # ---- memory --------------------------------------------------------------------------------------------------
    def _remember(self, a: dict) -> dict:
        outcome = self.memory.remember(a.get("fact"))
        return _text(self._texts["memory_full" if outcome == "full" else outcome], error=outcome in ("empty", "full"))

    def _forget(self, a: dict) -> dict:
        if len(clean_fact(a.get("text"))) < MIN_QUERY:
            return _text(self._texts["short"], error=True)
        gone = self.memory.forget(a.get("text"))
        if not gone:
            return _text(self._texts["nothing_forgot"])
        return _text(self._texts["forgot"].format(list=" / ".join(gone)))

    # ---- screen --------------------------------------------------------------------------------------------------
    def _look(self, _a: dict) -> dict:
        try:
            png, view = self._pointer.look()
        except Exception:  # noqa: BLE001 - any capture failure becomes a tool error
            return _text(self._texts["look_failed"], error=True)
        note = (self._texts["looked"].format(width=view["image_width"], height=view["image_height"]) if view
                else self._texts["looked_plain"])
        return {"content": [{"type": "image", "data": base64.b64encode(png).decode("ascii"), "mimeType": "image/png"},
                            {"type": "text", "text": note}]}

    def _point(self, a: dict) -> dict:
        try:
            self._pointer.point(a.get("x"), a.get("y"), a.get("text"))
        except ValueError as error:
            key = {"unsupported": "unsupported", "look": "need_look"}.get(str(error), "outside")
            return _text(self._texts[key], error=True)
        except OSError:
            return _text(self._texts["point_failed"], error=True)
        return _text(self._texts["pointed"])
