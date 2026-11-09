"""Scenes Cody makes for itself, and scenes shown because you asked.

By voice, Claude can write a scene for the mascot: data only, the same shape as web/scenes/scenes.json (voxel
boxes, colors, clips, a sign), never code. It goes to `custom/<id>.json` in Cody's data folder, after this module
has checked every field (validate); the page loads it with the built-in scenes. "Cody, undo" removes the newest
one. The voice session's other tool here asks for a scene to be shown for a while ("put your headphones on"):
`custom/wanted.json`, which the server hands the page. Nothing here touches the files of any repository.

  CustomScenes(folder): create(data) → (scene, errors), undo(id) → removed id | None, list(), version(), clear()
                        want(id, seconds, now) / wanted(now) → the id still asked for, or None
  validate(data) → (scene, errors)   pure
"""
from __future__ import annotations

import json
import re
import time
from pathlib import Path

from cody.store import data_dir, read_json, write_atomic

ID = re.compile(r"^[a-z][a-z0-9-]{0,30}$")
HEX = re.compile(r"^#[0-9a-fA-F]{6}$")
TRIGGERS = ("request", "failed", "done", "sleeping", "coding", "thinking", "music", "idle", "knock")
CLIPS = ("bob", "blink", "dots", "steam", "walk", "confetti", "sway")
ANCHORS = ("world", "body")
MAX_SCENES = 12
MAX_PARTS = 12
MAX_BOXES = 80
MAX_SIGN_LINES, MAX_SIGN_CHARS = 4, 18
EYE_SHAPES = ("dot", "cross", "chevron", "heart", "bang", "star")   # the names in web/js/eyeshapes.js
REACH = 60.0                   # voxels from the mascot's middle, any direction
MAX_SIZE = 40.0
MAX_SECONDS = 600
DEFAULT_SECONDS = 30
PRIORITY = (1, 100)
WANTED_FILE = "wanted.json"


def folder() -> Path:
    return data_dir() / "custom"


def _box_ok(b) -> bool:
    return (isinstance(b, list) and len(b) == 6 and all(isinstance(v, (int, float)) and not isinstance(v, bool) for v in b)
            and all(abs(float(v)) <= REACH for v in b[:3]) and all(0.1 <= float(v) <= MAX_SIZE for v in b[3:]))


def _part(part, where: str, errors: list) -> dict | None:
    if not isinstance(part, dict):
        errors.append(f"{where}: a part must be an object")
        return None
    out = {}
    if part.get("on") is not None:
        if part["on"] not in ANCHORS:
            errors.append(f"{where}.on: world or body")
        else:
            out["on"] = part["on"]
    color = part.get("color")
    if color is not None:
        if not isinstance(color, str) or not HEX.match(color):
            errors.append(f"{where}.color: a hex color like #ff8a3d")
        else:
            out["color"] = color
    glow = part.get("glow")
    if glow is not None:
        if not isinstance(glow, str) or not HEX.match(glow):
            errors.append(f"{where}.glow: a hex color")
        else:
            out["glow"] = glow
    clip = part.get("clip")
    if clip is not None:
        if clip not in CLIPS:
            errors.append(f"{where}.clip: one of {', '.join(CLIPS)}")
        else:
            out["clip"] = clip
    pivot = part.get("pivot")
    if pivot is not None:
        if not (isinstance(pivot, list) and len(pivot) == 3 and all(isinstance(v, (int, float)) and abs(v) <= REACH for v in pivot)):
            errors.append(f"{where}.pivot: [x, y, z] in voxels")
        else:
            out["pivot"] = [float(v) for v in pivot]
    sign = part.get("sign")
    if sign is not None:
        box = part.get("box")
        lines_ok = isinstance(sign, list) and 0 < len(sign) <= MAX_SIGN_LINES
        if not (lines_ok and all(isinstance(s, str) and len(s) <= MAX_SIGN_CHARS for s in sign)):
            errors.append(f"{where}.sign: up to {MAX_SIGN_LINES} lines of {MAX_SIGN_CHARS} characters")
        elif not _box_ok(box):
            errors.append(f"{where}.box: a sign needs one box [x, y, z, width, height, depth]")
        else:
            out["sign"] = [s.strip() for s in sign]
            out["box"] = [float(v) for v in box]
            ink = part.get("ink")
            if isinstance(ink, str) and HEX.match(ink):
                out["ink"] = ink
        return out if not errors else None
    boxes = part.get("boxes")
    if not isinstance(boxes, list) or not boxes or len(boxes) > MAX_BOXES:
        errors.append(f"{where}.boxes: 1 to {MAX_BOXES} boxes [x, y, z, width, height, depth], in voxels")
        return None
    bad = [i for i, b in enumerate(boxes) if not _box_ok(b)]
    if bad:
        errors.append(f"{where}.boxes[{bad[0]}]: six numbers, within {REACH:g} voxels, sizes 0.1 to {MAX_SIZE:g}")
        return None
    out["boxes"] = [[float(v) for v in b] for b in boxes]
    return out


def validate(data) -> tuple[dict | None, list[str]]:
    """The scene as the page will load it, or what is wrong with it (every problem, not just the first)."""
    errors: list[str] = []
    if not isinstance(data, dict):
        return None, ["the scene must be an object with id and parts"]
    scene_id = data.get("id")
    if not isinstance(scene_id, str) or not ID.match(scene_id):
        errors.append("id: lowercase letters, digits and dashes, starting with a letter (\"rainbow\")")
    trigger = data.get("trigger", "request")
    if trigger not in TRIGGERS:
        errors.append(f"trigger: one of {', '.join(TRIGGERS)} (request: shown only when asked)")
    priority = data.get("priority", 45)
    if not isinstance(priority, (int, float)) or isinstance(priority, bool) or not PRIORITY[0] <= priority <= PRIORITY[1]:
        errors.append(f"priority: a number from {PRIORITY[0]} to {PRIORITY[1]}")
    eyes = _eyes(data.get("eyes"), errors)
    parts = data.get("parts", [] if eyes else None)
    if not isinstance(parts, list) or len(parts) > MAX_PARTS or (not parts and not eyes):
        errors.append(f"parts: 1 to {MAX_PARTS} parts (none only with eyes)")
        parts = []
    clean = [p for p in (_part(part, f"parts[{i}]", errors) for i, part in enumerate(parts)) if p]
    if errors:
        return None, errors
    scene = {"id": scene_id, "trigger": trigger, "priority": float(priority), "parts": clean, "custom": True}
    if data.get("over") is True:
        scene["over"] = True
    if eyes:
        scene["eyes"] = eyes
    return scene, []


def _eyes(value, errors: list) -> list | None:
    """"eyes": one shape for both eyes or [left, right], from EYE_SHAPES (web/js/eyeshapes.js draws them)."""
    if value is None:
        return None
    pair = [value, value] if isinstance(value, str) else value
    if isinstance(pair, list) and len(pair) == 2 and all(isinstance(e, str) and e in EYE_SHAPES for e in pair):
        return list(pair)
    errors.append(f"eyes: a shape name or [left, right], from {', '.join(EYE_SHAPES)}")
    return None


class CustomScenes:
    def __init__(self, path: Path | None = None, clock=time.time):
        self._folder = path or folder()
        self._clock = clock

    def _files(self) -> list[Path]:
        try:
            return sorted((p for p in self._folder.glob("*.json") if p.name != WANTED_FILE), key=lambda p: p.stat().st_mtime)
        except OSError:
            return []

    def list(self) -> list[dict]:
        out = []
        for path in self._files():
            data = read_json(path)
            scene, errors = validate(data)
            if scene and not errors:
                out.append(scene)
        return out

    def version(self) -> int:
        """Changes whenever a scene is added or removed: the page reloads its scenes when it sees a new one."""
        try:
            return int(max((p.stat().st_mtime_ns for p in self._files()), default=0) % 10**9) + len(self._files()) * 7
        except OSError:
            return 0

    def create(self, data) -> tuple[dict | None, list[str]]:
        scene, errors = validate(data)
        if errors:
            return None, errors
        existing = [p.stem for p in self._files()]
        if scene["id"] not in existing and len(existing) >= MAX_SCENES:
            return None, [f"there are {MAX_SCENES} custom scenes already: undo one first"]
        write_atomic(self._folder / f"{scene['id']}.json", json.dumps(scene, ensure_ascii=False, indent=1) + "\n")
        return scene, []

    def undo(self, scene_id: str | None = None) -> str | None:
        """Removes the scene named, or the newest one; its id, or None when there was nothing."""
        files = self._files()
        if scene_id:
            files = [p for p in files if p.stem == scene_id]
        if not files:
            return None
        gone = files[-1]
        try:
            gone.unlink()
        except OSError:
            return None
        return gone.stem

    def clear(self) -> None:
        for path in self._files():
            try:
                path.unlink()
            except OSError:
                pass

    # ---- a scene asked for by voice --------------------------------------------------------------------------------
    def want(self, scene_id: str | None, seconds: float | None = None) -> None:
        """Asks the page to show a scene for a while (None: stop asking)."""
        path = self._folder / WANTED_FILE
        if not scene_id:
            write_atomic(path, "{}\n")
            return
        seconds = max(1.0, min(float(MAX_SECONDS), float(seconds or DEFAULT_SECONDS)))
        write_atomic(path, json.dumps({"id": scene_id, "until": self._clock() + seconds}) + "\n")

    def wanted(self) -> str | None:
        data = read_json(self._folder / WANTED_FILE)
        if not isinstance(data, dict) or not isinstance(data.get("id"), str) or not isinstance(data.get("until"), (int, float)):
            return None
        return data["id"] if self._clock() < data["until"] else None
