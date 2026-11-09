"""The voice channel's extra tools, beyond reply and screenshot (cody/channel.py):

    timer      timers and reminders that ring on the phone (cody/timers.py)
    remember   a fact kept for the next voice sessions (cody/memory.py); forget drops it
    look       the screen, scaled down, for Claude to see (only when you ask about something on it)
    point      the mini Cody flies to a spot on the screen and points at it (cody/pointer.py, Windows)
    scene      shows one of the mascot's scenes for a while because you asked ("put your headphones on")
    custom_scene   writes a scene of Claude's own making, data only, checked field by field (cody/custom.py);
               undo removes the newest one

Each tool is a JSON schema plus a handler that returns an MCP tool result. Texts in English and Portuguese, like the
channel's; the tool descriptions carry the details, so the channel's instructions stay short.
"""
from __future__ import annotations

import base64
from datetime import datetime

import json
from pathlib import Path

from cody import timers as timer_module
from cody.custom import CustomScenes
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
        "scene": "Shows one of the mascot's scenes for a while, because the user asked for it (\"put your headphones "
                 "on\", \"show the party\"): action \"show\" with `id` and `seconds` (default 30, at most 600), "
                 "action \"clear\" to take it off. Built-in ids: {ids}; plus any custom scene. Then reply.",
        "custom_scene": "Makes a scene of your own for the mascot, as data, never code. action \"create\" with "
                        "`scene`: {{id, parts: [{{boxes: [[x, y, z, width, height, depth]...] in voxels (the mascot "
                        "is 24 wide and 19 tall from the floor, x 0 at its middle, +z in front), color \"#rrggbb\", "
                        "on: \"world\" (stands around it) or \"body\" (worn: then a pivot [x, y, z]), clip: bob, "
                        "blink, dots, steam, walk, confetti or sway, or a sign: [lines] with one box}}], "
                        "trigger: request (shown only when asked, the default) or failed, done, coding, thinking, "
                        "music, idle, sleeping, priority 1 to 100, over: true to wear it over other scenes, eyes: a "
                        "shape for both eyes or [left, right] from dot, cross, chevron, heart, bang, star (eyes alone "
                        "make a scene: {{id: \"love\", eyes: \"heart\"}})}}. It is "
                        "checked and refused with the reasons if anything is off; created, it shows right away. "
                        "action \"undo\" removes the newest custom scene (or `id`); action \"list\" names them. "
                        "Only when the user asks for a scene of their own.",
        "shown": "Showing \"{id}\" for {seconds} seconds. Now reply.", "cleared": "Nothing asked for any more.",
        "unknown_scene": "No scene named \"{id}\". Known: {ids}.", "created": "Scene \"{id}\" saved and showing. Now reply.",
        "invalid": "The scene was refused: {errors}", "undone": "Removed the custom scene \"{id}\".",
        "nothing_undo": "There is no custom scene to remove.", "listed": "Custom scenes: {ids}.",
        "no_custom": "No custom scenes yet.",
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
        "scene": "Mostra uma das cenas do mascote por um tempo, porque o usuário pediu (\"põe os fones\", \"mostra a "
                 "festa\"): action \"show\" com `id` e `seconds` (padrão 30, no máximo 600), action \"clear\" para "
                 "tirar. Ids de fábrica: {ids}; mais qualquer cena personalizada. Depois responda.",
        "custom_scene": "Cria uma cena sua para o mascote, como dados, nunca código. action \"create\" com "
                        "`scene`: {{id, parts: [{{boxes: [[x, y, z, largura, altura, profundidade]...] em voxels (o "
                        "mascote tem 24 de largura e 19 de altura a partir do chão, x 0 no meio, +z na frente), color "
                        "\"#rrggbb\", on: \"world\" (fica em volta) ou \"body\" (vestida: aí um pivot [x, y, z]), clip: "
                        "bob, blink, dots, steam, walk, confetti ou sway, ou um sign: [linhas] com um box}}], "
                        "trigger: request (só quando pedirem, o padrão) ou failed, done, coding, thinking, music, "
                        "idle, sleeping, priority de 1 a 100, over: true para vestir por cima das outras, eyes: uma "
                        "forma para os dois olhos ou [esquerdo, direito] entre dot, cross, chevron, heart, bang, star "
                        "(só os olhos já fazem uma cena: {{id: \"love\", eyes: \"heart\"}})}}. É "
                        "conferida e recusada com os motivos se algo estiver errado; criada, aparece na hora. "
                        "action \"undo\" remove a cena personalizada mais nova (ou `id`); action \"list\" lista. "
                        "Só quando o usuário pedir uma cena própria.",
        "shown": "Mostrando \"{id}\" por {seconds} segundos. Agora responda.", "cleared": "Não estou mais pedindo cena.",
        "unknown_scene": "Não existe cena \"{id}\". Conhecidas: {ids}.", "created": "Cena \"{id}\" salva e aparecendo. Agora responda.",
        "invalid": "A cena foi recusada: {errors}", "undone": "Removi a cena personalizada \"{id}\".",
        "nothing_undo": "Não há cena personalizada para remover.", "listed": "Cenas personalizadas: {ids}.",
        "no_custom": "Ainda não há cena personalizada.",
    },
}

SCENES_FILE = Path(__file__).resolve().parent.parent / "web" / "scenes" / "scenes.json"


def builtin_scene_ids(path: Path = SCENES_FILE) -> list[str]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return [s["id"] for s in data["scenes"] if isinstance(s, dict) and isinstance(s.get("id"), str)]
    except (OSError, ValueError, KeyError, TypeError):
        return []


def _text(text: str, error: bool = False) -> dict:
    result = {"content": [{"type": "text", "text": text}]}
    if error:
        result["isError"] = True
    return result


def schemas(texts: dict, scene_ids: list[str] = ()) -> list[dict]:
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
        {"name": "scene", "description": texts["scene"].format(ids=", ".join(scene_ids) or "none"), "inputSchema": {
            "type": "object", "required": ["action"],
            "properties": {"action": {"type": "string", "enum": ["show", "clear"]}, "id": string,
                           "seconds": {**number, "description": "show: for how long (default 30, at most 600)"}}}},
        {"name": "custom_scene", "description": texts["custom_scene"], "inputSchema": {
            "type": "object", "required": ["action"],
            "properties": {"action": {"type": "string", "enum": ["create", "undo", "list"]},
                           "scene": {"type": "object", "description": "create: the scene as data"},
                           "id": {**string, "description": "undo: which one (default: the newest)"}}}},
    ]


class Abilities:
    def __init__(self, lang: str = "en", store=None, memory: Memory | None = None, pointer: Pointer | None = None,
                 now=None, custom: CustomScenes | None = None, scene_ids: list[str] | None = None):
        self._texts = TEXTS.get(lang, TEXTS["en"])
        self._custom = custom or CustomScenes()
        self._scene_ids = list(scene_ids) if scene_ids is not None else builtin_scene_ids()
        self._store = store or timer_module.TimerStore()
        self.memory = memory or Memory()
        self._pointer = pointer or Pointer()
        self._now = now or datetime.now          # naive local time: right across a daylight saving change

    def tools(self) -> list[dict]:
        return schemas(self._texts, self._scene_ids)

    def handles(self, name) -> bool:
        return name in ("timer", "remember", "forget", "look", "point", "scene", "custom_scene")

    def call(self, name: str, arguments: dict) -> dict:
        handler = {"timer": self._timer, "remember": self._remember, "forget": self._forget, "look": self._look,
                   "point": self._point, "scene": self._scene, "custom_scene": self._custom_scene}[name]
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

    # ---- scenes --------------------------------------------------------------------------------------------------
    def _known_scenes(self) -> list[str]:
        return [*self._scene_ids, *(s["id"] for s in self._custom.list())]

    def _scene(self, a: dict) -> dict:
        t = self._texts
        if a.get("action") == "clear":
            self._custom.want(None)
            return _text(t["cleared"])
        scene_id = str(a.get("id") or "").strip()
        known = self._known_scenes()
        if scene_id not in known:
            return _text(t["unknown_scene"].format(id=scene_id, ids=", ".join(known)), error=True)
        seconds = a.get("seconds")
        seconds = float(seconds) if isinstance(seconds, (int, float)) and not isinstance(seconds, bool) else None
        self._custom.want(scene_id, seconds)
        from cody.custom import DEFAULT_SECONDS, MAX_SECONDS
        shown = int(max(1, min(MAX_SECONDS, seconds or DEFAULT_SECONDS)))
        return _text(t["shown"].format(id=scene_id, seconds=shown))

    def _custom_scene(self, a: dict) -> dict:
        t = self._texts
        action = a.get("action")
        if action == "list":
            ids = [s["id"] for s in self._custom.list()]
            return _text(t["listed"].format(ids=", ".join(ids)) if ids else t["no_custom"])
        if action == "undo":
            gone = self._custom.undo(str(a.get("id") or "") or None)
            if gone is None:
                return _text(t["nothing_undo"], error=True)
            self._custom.want(None)
            return _text(t["undone"].format(id=gone))
        scene, errors = self._custom.create(a.get("scene"))
        if errors:
            return _text(t["invalid"].format(errors="; ".join(errors)), error=True)
        self._custom.want(scene["id"])                 # it shows right away, whatever its trigger
        return _text(t["created"].format(id=scene["id"]))
