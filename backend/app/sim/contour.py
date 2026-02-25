import math
from typing import Dict, Iterable, List, Sequence, Tuple

import numpy as np

Point = Tuple[float, float]
Segment = Tuple[Point, Point]


def _lerp_point(p0: Point, p1: Point, v0: float, v1: float, level: float) -> Point:
    dv = v1 - v0
    if abs(dv) < 1e-12:
        t = 0.5
    else:
        t = (level - v0) / dv
        t = max(0.0, min(1.0, t))
    return (p0[0] + t * (p1[0] - p0[0]), p0[1] + t * (p1[1] - p0[1]))


def _cell_segments(field: np.ndarray, x: int, y: int, level: float) -> List[Segment]:
    """
    Marching-squares segments for one cell.
    Corners: tl, tr, br, bl for values v0..v3.
    """
    v0 = float(field[y, x])
    v1 = float(field[y, x + 1])
    v2 = float(field[y + 1, x + 1])
    v3 = float(field[y + 1, x])

    b0 = 1 if v0 >= level else 0
    b1 = 1 if v1 >= level else 0
    b2 = 1 if v2 >= level else 0
    b3 = 1 if v3 >= level else 0
    idx = b0 | (b1 << 1) | (b2 << 2) | (b3 << 3)

    if idx == 0 or idx == 15:
        return []

    tl = (float(x), float(y))
    tr = (float(x + 1), float(y))
    br = (float(x + 1), float(y + 1))
    bl = (float(x), float(y + 1))

    edge_pts: Dict[int, Point] = {
        0: _lerp_point(tl, tr, v0, v1, level),  # top
        1: _lerp_point(tr, br, v1, v2, level),  # right
        2: _lerp_point(br, bl, v2, v3, level),  # bottom
        3: _lerp_point(bl, tl, v3, v0, level),  # left
    }

    table: Dict[int, List[Tuple[int, int]]] = {
        1: [(3, 0)],
        2: [(0, 1)],
        3: [(3, 1)],
        4: [(1, 2)],
        6: [(0, 2)],
        7: [(3, 2)],
        8: [(2, 3)],
        9: [(0, 2)],
        11: [(1, 2)],
        12: [(1, 3)],
        13: [(0, 1)],
        14: [(3, 0)],
    }

    # Ambiguous saddle cases 5 and 10: resolve by center value.
    if idx in (5, 10):
        vc = 0.25 * (v0 + v1 + v2 + v3)
        if idx == 5:
            pairs = [(3, 2), (0, 1)] if vc >= level else [(3, 0), (2, 1)]
        else:  # idx == 10
            pairs = [(3, 0), (2, 1)] if vc >= level else [(3, 2), (0, 1)]
        return [(edge_pts[a], edge_pts[b]) for a, b in pairs]

    pairs = table.get(idx, [])
    return [(edge_pts[a], edge_pts[b]) for a, b in pairs]


def _quantize(p: Point, eps: float) -> Tuple[int, int]:
    return (int(round(p[0] / eps)), int(round(p[1] / eps)))


def _stitch_segments(segments: Sequence[Segment], eps: float = 1e-4, close_eps: float = 1e-2) -> List[List[Point]]:
    """Stitch unordered segments into polyline loops/chains by quantized endpoints."""
    if not segments:
        return []

    edges = []
    node_to_edges: Dict[Tuple[int, int], List[int]] = {}
    node_point: Dict[Tuple[int, int], Point] = {}

    for i, (a, b) in enumerate(segments):
        ka = _quantize(a, eps)
        kb = _quantize(b, eps)
        edges.append((ka, kb, a, b, False))
        node_to_edges.setdefault(ka, []).append(i)
        node_to_edges.setdefault(kb, []).append(i)
        node_point.setdefault(ka, a)
        node_point.setdefault(kb, b)

    def extend(chain: List[Point], end_key: Tuple[int, int], prepend: bool) -> Tuple[List[Point], Tuple[int, int]]:
        while True:
            candidates = node_to_edges.get(end_key, [])
            next_idx = -1
            for ei in candidates:
                if not edges[ei][4]:
                    next_idx = ei
                    break
            if next_idx < 0:
                return chain, end_key

            ka, kb, pa, pb, _ = edges[next_idx]
            edges[next_idx] = (ka, kb, pa, pb, True)

            if end_key == ka:
                p_next = pb
                end_key = kb
            else:
                p_next = pa
                end_key = ka

            if prepend:
                chain.insert(0, p_next)
            else:
                chain.append(p_next)

    polylines: List[List[Point]] = []

    for i, (ka, kb, pa, pb, used) in enumerate(edges):
        if used:
            continue
        edges[i] = (ka, kb, pa, pb, True)
        chain = [pa, pb]

        chain, tail_key = extend(chain, kb, prepend=False)
        chain, head_key = extend(chain, ka, prepend=True)

        if len(chain) >= 3:
            dx = chain[0][0] - chain[-1][0]
            dy = chain[0][1] - chain[-1][1]
            if math.hypot(dx, dy) <= close_eps:
                chain[-1] = chain[0]
        polylines.append(chain)

    return polylines


def _polygon_area(poly: Sequence[Point]) -> float:
    if len(poly) < 4:
        return 0.0
    s = 0.0
    for i in range(len(poly) - 1):
        x1, y1 = poly[i]
        x2, y2 = poly[i + 1]
        s += x1 * y2 - x2 * y1
    return 0.5 * s


def _rdp(points: Sequence[Point], epsilon: float) -> List[Point]:
    if len(points) <= 2:
        return list(points)

    x1, y1 = points[0]
    x2, y2 = points[-1]
    dx = x2 - x1
    dy = y2 - y1

    dmax = -1.0
    index = -1
    denom = math.hypot(dx, dy)

    for i in range(1, len(points) - 1):
        x0, y0 = points[i]
        if denom < 1e-12:
            d = math.hypot(x0 - x1, y0 - y1)
        else:
            d = abs(dy * x0 - dx * y0 + x2 * y1 - y2 * x1) / denom
        if d > dmax:
            index = i
            dmax = d

    if dmax > epsilon:
        left = _rdp(points[: index + 1], epsilon)
        right = _rdp(points[index:], epsilon)
        return left[:-1] + right

    return [points[0], points[-1]]


def _simplify_closed(poly: Sequence[Point], epsilon: float = 0.4) -> List[Point]:
    if len(poly) < 4:
        return list(poly)
    core = list(poly[:-1])
    if len(core) < 3:
        return list(poly)
    simplified = _rdp(core + [core[0]], epsilon)
    if len(simplified) < 4:
        return list(poly)
    if simplified[0] != simplified[-1]:
        simplified.append(simplified[0])
    return simplified


def find_contours_iso(
    field: np.ndarray,
    level: float,
    min_area_px2: float = 4.0,
    simplify_epsilon_px: float = 0.4,
) -> List[List[Point]]:
    """
    Marching-squares iso-contour extraction returning stitched, closed loops.
    Coordinates are in pixel space with sub-pixel interpolation.
    """
    if field.ndim != 2:
        raise ValueError("field must be 2D")

    h, w = field.shape
    if h < 2 or w < 2:
        return []

    segments: List[Segment] = []
    for y in range(h - 1):
        for x in range(w - 1):
            segments.extend(_cell_segments(field, x, y, level))

    raw_polys = _stitch_segments(segments)

    out: List[List[Point]] = []
    for poly in raw_polys:
        if len(poly) < 4:
            continue
        if poly[0] != poly[-1]:
            continue
        area = abs(_polygon_area(poly))
        if area < min_area_px2:
            continue
        simp = _simplify_closed(poly, simplify_epsilon_px)
        out.append(simp)

    return out


def find_contours_binary(binary: np.ndarray) -> List[List[Point]]:
    """Compatibility wrapper for existing callers using binary masks."""
    return find_contours_iso(binary.astype(np.float32), level=0.5)
