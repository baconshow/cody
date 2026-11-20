"""QR codes made on this computer (no web service sees the address): byte mode, error correction level M, versions
1 to 10 (up to 213 bytes, plenty for an https:// address). The Settings screen and the first run show the phone's
address and the Tailscale download page with it.

    svg("https://pc.tailnet.ts.net/") -> "<svg ...>"      matrix(text) -> list of rows of booleans

The encoder follows ISO/IEC 18004: Reed-Solomon over GF(256), the eight masks scored by the standard penalty rules.
"""
from __future__ import annotations

# level M: (error correction bytes per block, number of blocks in group 1, data bytes each,
#           number of blocks in group 2, data bytes each), versions 1..10
BLOCKS_M = {
    1: (10, 1, 16, 0, 0), 2: (16, 1, 28, 0, 0), 3: (26, 1, 44, 0, 0), 4: (18, 2, 32, 0, 0), 5: (24, 2, 43, 0, 0),
    6: (16, 4, 27, 0, 0), 7: (18, 4, 31, 0, 0), 8: (22, 2, 38, 2, 39), 9: (22, 3, 36, 2, 37),
    10: (26, 4, 43, 1, 44),
}
ALIGN = {1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42],
         9: [6, 26, 46], 10: [6, 28, 50]}
LEVEL_M = 0b00

EXP = [0] * 512
LOG = [0] * 256
_x = 1
for _i in range(255):
    EXP[_i] = _x
    LOG[_x] = _i
    _x <<= 1
    if _x & 0x100:
        _x ^= 0x11D
for _i in range(255, 512):
    EXP[_i] = EXP[_i - 255]


def _mul(a: int, b: int) -> int:
    return 0 if a == 0 or b == 0 else EXP[LOG[a] + LOG[b]]


def _generator(degree: int) -> list[int]:
    poly = [1]
    for i in range(degree):
        nxt = [0] * (len(poly) + 1)
        for j, coef in enumerate(poly):
            nxt[j] ^= coef
            nxt[j + 1] ^= _mul(coef, EXP[i])
        poly = nxt
    return poly


def _ecc(data: list[int], degree: int) -> list[int]:
    gen = _generator(degree)
    rest = list(data) + [0] * degree
    for i in range(len(data)):
        factor = rest[i]
        if factor:
            for j, coef in enumerate(gen):
                rest[i + j] ^= _mul(coef, factor)
    return rest[len(data):]


def _capacity(version: int) -> int:
    _ecc_len, n1, d1, n2, d2 = BLOCKS_M[version]
    return n1 * d1 + n2 * d2


def _version_for(length: int) -> int:
    for version in BLOCKS_M:
        count_bits = 8 if version < 10 else 16
        if 4 + count_bits + 8 * length <= 8 * _capacity(version):
            return version
    raise ValueError("text too long for a QR code up to version 10")


def _codewords(data: bytes, version: int) -> list[int]:
    bits = [0, 1, 0, 0]                                   # byte mode
    count_bits = 8 if version < 10 else 16
    bits += [(len(data) >> i) & 1 for i in range(count_bits - 1, -1, -1)]
    for byte in data:
        bits += [(byte >> i) & 1 for i in range(7, -1, -1)]
    capacity = 8 * _capacity(version)
    bits += [0] * min(4, capacity - len(bits))
    bits += [0] * (-len(bits) % 8)
    words = [int("".join(map(str, bits[i:i + 8])), 2) for i in range(0, len(bits), 8)]
    pad = 0xEC
    while len(words) < _capacity(version):
        words.append(pad)
        pad ^= 0xEC ^ 0x11
    ecc_len, n1, d1, n2, d2 = BLOCKS_M[version]
    blocks, at = [], 0
    for size in [d1] * n1 + [d2] * n2:
        blocks.append(words[at:at + size])
        at += size
    eccs = [_ecc(block, ecc_len) for block in blocks]
    out = [block[i] for i in range(max(d1, d2)) for block in blocks if i < len(block)]
    return out + [ecc[i] for i in range(ecc_len) for ecc in eccs]


def _bch(value: int, poly: int, bits: int) -> int:
    rest = value << bits
    top = poly.bit_length() - 1
    for shift in range(rest.bit_length() - 1, top - 1, -1):
        if rest >> shift & 1:
            rest ^= poly << (shift - top)
    return (value << bits) | rest


class _Grid:
    def __init__(self, version: int):
        self.version = version
        self.size = 17 + 4 * version
        self.dark = [[False] * self.size for _ in range(self.size)]
        self.fixed = [[False] * self.size for _ in range(self.size)]

    def put(self, row: int, col: int, dark: bool) -> None:
        self.dark[row][col] = dark
        self.fixed[row][col] = True

    def patterns(self) -> None:
        n = self.size
        for i in range(n):
            self.put(6, i, i % 2 == 0)
            self.put(i, 6, i % 2 == 0)
        for r0, c0 in ((0, 0), (0, n - 7), (n - 7, 0)):
            for dr in range(-1, 8):
                for dc in range(-1, 8):
                    r, c = r0 + dr, c0 + dc
                    if 0 <= r < n and 0 <= c < n:
                        ring = max(abs(dr - 3), abs(dc - 3))
                        self.put(r, c, ring != 2 and ring != 4)
        spots = ALIGN[self.version]
        corners = {(spots[0], spots[0]), (spots[0], spots[-1]), (spots[-1], spots[0])} if spots else set()
        for r in spots:
            for c in spots:
                if (r, c) in corners:                     # those three would sit on the finder patterns
                    continue
                for dr in range(-2, 3):
                    for dc in range(-2, 3):
                        self.put(r + dr, c + dc, max(abs(dr), abs(dc)) != 1)
        self.put(n - 8, 8, True)                          # the dark module
        self.format(0)                                    # reserve the format areas
        if self.version >= 7:
            value = _bch(self.version, 0x1F25, 12)
            for i in range(18):
                bit = bool(value >> i & 1)
                self.put(n - 11 + i % 3, i // 3, bit)
                self.put(i // 3, n - 11 + i % 3, bit)

    def format(self, mask: int) -> None:
        n = self.size
        value = _bch(LEVEL_M << 3 | mask, 0x537, 10) ^ 0x5412
        bits = [bool(value >> i & 1) for i in range(15)]
        for i in range(6):                                # first copy, around the top-left finder
            self.put(i, 8, bits[i])
        self.put(7, 8, bits[6])
        self.put(8, 8, bits[7])
        self.put(8, 7, bits[8])
        for i in range(9, 15):
            self.put(8, 14 - i, bits[i])
        for i in range(8):                                # second copy, split between the other two finders
            self.put(8, n - 1 - i, bits[i])
        for i in range(8, 15):
            self.put(n - 15 + i, 8, bits[i])
        self.put(n - 8, 8, True)

    def data(self, words: list[int]) -> None:
        bits = [(w >> i) & 1 for w in words for i in range(7, -1, -1)]
        at, n = 0, self.size
        col = n - 1
        upward = True
        while col > 0:
            if col == 6:
                col -= 1
            rows = range(n - 1, -1, -1) if upward else range(n)
            for r in rows:
                for c in (col, col - 1):
                    if not self.fixed[r][c]:
                        self.dark[r][c] = at < len(bits) and bits[at] == 1
                        at += 1
            upward = not upward
            col -= 2


MASKS = [
    lambda r, c: (r + c) % 2 == 0, lambda r, c: r % 2 == 0, lambda r, c: c % 3 == 0,
    lambda r, c: (r + c) % 3 == 0, lambda r, c: (r // 2 + c // 3) % 2 == 0,
    lambda r, c: (r * c) % 2 + (r * c) % 3 == 0, lambda r, c: ((r * c) % 2 + (r * c) % 3) % 2 == 0,
    lambda r, c: ((r + c) % 2 + (r * c) % 3) % 2 == 0,
]


def _masked(grid: _Grid, base: list[list[bool]], mask: int) -> list[list[bool]]:
    test = MASKS[mask]
    return [[base[r][c] ^ (not grid.fixed[r][c] and test(r, c)) for c in range(grid.size)]
            for r in range(grid.size)]


def _penalty(m: list[list[bool]]) -> int:
    n, score = len(m), 0
    for lines in (m, [list(col) for col in zip(*m)]):
        for line in lines:
            run, prev = 0, None
            for cell in line:
                run = run + 1 if cell == prev else 1
                prev = cell
                if run == 5:
                    score += 3
                elif run > 5:
                    score += 1
            text = "".join("1" if x else "0" for x in line)
            for pattern in ("10111010000", "00001011101"):
                start = text.find(pattern)
                while start != -1:
                    score += 40
                    start = text.find(pattern, start + 1)
    for r in range(n - 1):
        for c in range(n - 1):
            if m[r][c] == m[r][c + 1] == m[r + 1][c] == m[r + 1][c + 1]:
                score += 3
    dark, total = sum(map(sum, m)), n * n
    score += ((abs(dark * 20 - total * 10) + total - 1) // total - 1) * 10
    return score


def matrix(text: str) -> list[list[bool]]:
    data = text.encode("utf-8")
    version = _version_for(len(data))
    grid = _Grid(version)
    grid.patterns()
    grid.data(_codewords(data, version))
    base = [row[:] for row in grid.dark]
    best, best_score = None, None
    for mask in range(8):
        grid.format(mask)
        candidate = _masked(grid, [row[:] for row in base], mask)
        for r in range(grid.size):                        # format bits were just written into grid.dark
            for c in range(grid.size):
                if grid.fixed[r][c]:
                    candidate[r][c] = grid.dark[r][c]
        score = _penalty(candidate)
        if best_score is None or score < best_score:
            best, best_score = candidate, score
    return best


def svg(text: str, scale: int = 6, border: int = 4) -> str:
    """The QR code as a small SVG (black on white, with the quiet zone readers need)."""
    m = matrix(text)
    size = len(m) + 2 * border
    path = "".join(f"M{c + border},{r + border}h1v1h-1z" for r, row in enumerate(m) for c, on in enumerate(row) if on)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}" width="{size * scale}" '
            f'height="{size * scale}" shape-rendering="crispEdges"><rect width="{size}" height="{size}" fill="#fff"/>'
            f'<path d="{path}" fill="#000"/></svg>')
