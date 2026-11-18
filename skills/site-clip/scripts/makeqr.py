# makeqr.py: a stand-in QR code, to swap in for a real one before filming (see references/privacy.md).
# Version 3 (29x29), error correction M, byte mode, up to 42 bytes; rounded dark modules on a transparent SVG.
#   python3 makeqr.py "https://example.com" out.svg [mask 0-7] [colour]
import sys
text, out = sys.argv[1].encode(), sys.argv[2]; MASK = int(sys.argv[3]) if len(sys.argv) > 3 and sys.argv[3] != "" else None
FILL = sys.argv[4] if len(sys.argv) > 4 else "#111"
N, DATA, ECC = 29, 44, 26
assert len(text) <= 42
def mul(x, y):
    z = 0
    for i in range(7, -1, -1):
        z = (z << 1) ^ ((z >> 7) * 0x11D); z ^= ((y >> i) & 1) * x
    return z & 0xFF
def rs_divisor(deg):
    res = [0] * (deg - 1) + [1]; root = 1
    for _ in range(deg):
        for j in range(deg):
            res[j] = mul(res[j], root)
            if j + 1 < deg: res[j] ^= res[j + 1]
        root = mul(root, 2)
    return res
def rs_rem(data, div):
    res = [0] * len(div)
    for b in data:
        f = b ^ res.pop(0); res.append(0)
        res = [r ^ mul(d, f) for r, d in zip(res, div)]
    return res
bits = [0, 1, 0, 0] + [(len(text) >> i) & 1 for i in range(7, -1, -1)]
for b in text: bits += [(b >> i) & 1 for i in range(7, -1, -1)]
bits += [0] * min(4, DATA * 8 - len(bits)); bits += [0] * (-len(bits) % 8)
cw = [int("".join(map(str, bits[i:i + 8])), 2) for i in range(0, len(bits), 8)]
pad = [0xEC, 0x11]; k = 0
while len(cw) < DATA: cw.append(pad[k % 2]); k += 1
allcw = cw + rs_rem(cw, rs_divisor(ECC))
def build(mask):
    M = [[False] * N for _ in range(N)]; F = [[False] * N for _ in range(N)]
    def fn(x, y, v): M[y][x] = bool(v); F[y][x] = True
    for i in range(N): fn(6, i, i % 2 == 0); fn(i, 6, i % 2 == 0)
    def finder(cx, cy):
        for dy in range(-4, 5):
            for dx in range(-4, 5):
                x, y = cx + dx, cy + dy
                if 0 <= x < N and 0 <= y < N: fn(x, y, max(abs(dx), abs(dy)) not in (2, 4))
    finder(3, 3); finder(N - 4, 3); finder(3, N - 4)
    for dy in range(-2, 3):
        for dx in range(-2, 3): fn(22 + dx, 22 + dy, max(abs(dx), abs(dy)) != 1)
    def fmt(mask):
        data = (0 << 3) | mask; rem = data            # error correction level M is 00
        for _ in range(10): rem = (rem << 1) ^ ((rem >> 9) * 0x537)
        b = ((data << 10) | rem) ^ 0x5412
        g = lambda i: (b >> i) & 1
        for i in range(6): fn(8, i, g(i))
        fn(8, 7, g(6)); fn(8, 8, g(7)); fn(7, 8, g(8))
        for i in range(9, 15): fn(14 - i, 8, g(i))
        for i in range(8): fn(N - 1 - i, 8, g(i))
        for i in range(8, 15): fn(8, N - 15 + i, g(i))
        fn(8, N - 8, 1)
    fmt(mask)
    i = 0; right = N - 1
    while right >= 1:
        if right == 6: right = 5
        for vert in range(N):
            for j in range(2):
                x = right - j; up = ((right + 1) & 2) == 0; y = N - 1 - vert if up else vert
                if not F[y][x] and i < len(allcw) * 8:
                    M[y][x] = bool((allcw[i >> 3] >> (7 - (i & 7))) & 1); i += 1
        right -= 2
    assert i == len(allcw) * 8, i
    cond = [lambda x, y: (x + y) % 2 == 0, lambda x, y: y % 2 == 0, lambda x, y: x % 3 == 0, lambda x, y: (x + y) % 3 == 0,
            lambda x, y: (x // 3 + y // 2) % 2 == 0, lambda x, y: x * y % 2 + x * y % 3 == 0, lambda x, y: (x * y % 2 + x * y % 3) % 2 == 0, lambda x, y: ((x + y) % 2 + x * y % 3) % 2 == 0][mask]
    for y in range(N):
        for x in range(N):
            if not F[y][x] and cond(x, y): M[y][x] = not M[y][x]
    return M
def penalty(M):
    p = 0
    for line in list(M) + [list(c) for c in zip(*M)]:
        run = 1
        for a, b in zip(line, line[1:]):
            run = run + 1 if a == b else 1
            if run == 5: p += 3
            elif run > 5: p += 1
    for y in range(N - 1):
        for x in range(N - 1):
            if M[y][x] == M[y][x + 1] == M[y + 1][x] == M[y + 1][x + 1]: p += 3
    dark = sum(map(sum, M)); p += abs(dark * 20 // (N * N) - 10) * 10
    return p
best = MASK if MASK is not None else min(range(8), key=lambda m: penalty(build(m)))
M = build(best)
rects = "".join(f'<rect x="{x}" y="{y}" width="1.06" height="1.06" rx=".34"/>' for y in range(N) for x in range(N) if M[y][x])
open(out, "w").write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {N} {N}" shape-rendering="geometricPrecision"><g fill="{FILL}">{rects}</g></svg>')
print("mask", best, "dark modules", sum(map(sum, M)))
