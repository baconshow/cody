"""The mini Cody's drawing and where it goes on the screen (cody/overlay.py draws it): pure data and arithmetic,
without tkinter, so it can be tested anywhere."""
from __future__ import annotations

# the mascot's colors (web/js/measures.js)
COLOR = {"body": "#cb743c", "top": "#dc8550", "base": "#b16234", "leg": "#914c2c", "eye": "#161618",
         "glint": "#dfdfda", "cheek": "#df8e60", "stem": "#4a7a2a", "leaf": "#32952a", "leafLight": "#45aa34",
         "bubble": "#f2ece2", "ink": "#22151a"}

# the mascot from the front, pointing left with its arm stretched out, in voxels: (x0, y0, x1, y1, color). x from the
# body's left edge, y from its top downward (the sprout goes above 0, the legs end at 19)
SPRITE = (
    (1, 14, 4, 19, "leg"), (6, 14, 9, 19, "leg"), (15, 14, 18, 19, "leg"), (20, 14, 23, 19, "leg"),
    (-6, 2, 0, 4, "body"),                                 # the pointing arm
    (24, 2, 27, 7, "body"),                                # the other arm, hanging
    (1, 0, 23, 1, "top"), (0, 1, 24, 13, "body"), (0, 13, 24, 14, "base"),
    (2, 10, 4, 11, "cheek"), (20, 10, 22, 11, "cheek"),
    (4, 2, 6, 7, "eye"), (16, 2, 18, 7, "eye"),            # the eyes look toward the arm
    (4, 2, 5, 3, "glint"), (16, 2, 17, 3, "glint"),
    (7, -1, 8, 0, "stem"), (7, -2, 8, -1, "stem"), (6, -3, 7, -2, "leaf"), (8, -3, 9, -2, "leaf"),
    (5, -4, 6, -3, "leafLight"), (9, -4, 10, -3, "leafLight"),
)
SPRITE_BOX = (-6, -4, 27, 19)                              # x0, y0, x1, y1 of all of the above
TIP = (-6, 3)                                              # the arm's tip: the spot it points at


def local(rect: tuple, flip: bool) -> tuple:
    """A piece in voxels from the sprite box's top-left corner; flip: the Cody that points right (mirrored around
    the body's middle)."""
    x0, y0, x1, y1, color = rect
    if flip:
        x0, x1 = 24 - x1, 24 - x0
        left = 24 - SPRITE_BOX[2]
    else:
        left = SPRITE_BOX[0]
    return (x0 - left, y0 - SPRITE_BOX[1], x1 - left, y1 - SPRITE_BOX[1], color)


def ease(t: float) -> float:
    return 1 - (1 - t) ** 3


def layout(spot: tuple[int, int], area: tuple[int, int, int, int], sprite: tuple[int, int],
           bubble: tuple[int, int], u: int) -> dict:
    """Where everything goes so the arm's tip lands on the spot: the Cody to the right of it (to the left near the
    right edge), the bubble above it (below near the top edge). Returns the window's corner and size and the
    sprite's and bubble's corners inside it, in pixels."""
    left, top, width, height = area
    sprite_w, sprite_h = sprite
    bubble_w, bubble_h = bubble
    win_w = max(sprite_w, bubble_w)
    flip = spot[0] + win_w + u > left + width
    tip_x = (SPRITE_BOX[2] - TIP[0] if flip else TIP[0] - SPRITE_BOX[0]) * u   # the tip inside the sprite box
    tip_y = (TIP[1] - SPRITE_BOX[1]) * u
    gap = 2 * u
    below = spot[1] - tip_y - bubble_h - gap < top
    win_h = sprite_h + bubble_h + gap
    sprite_x = win_w - sprite_w if flip else 0
    sprite_y = 0 if below else bubble_h + gap
    bubble_x = (sprite_x + sprite_w - bubble_w) if flip else sprite_x
    bubble_x = max(0, min(win_w - bubble_w, bubble_x))
    bubble_y = sprite_h + gap if below else 0
    return {"flip": flip, "x": spot[0] - sprite_x - tip_x, "y": spot[1] - sprite_y - tip_y, "w": win_w, "h": win_h,
            "sprite": (sprite_x, sprite_y), "bubble": (bubble_x, bubble_y), "below": below}
