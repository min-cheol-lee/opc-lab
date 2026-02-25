
import numpy as np
from typing import List
from ..models import Shape

def _rasterize_rect(mask: np.ndarray, s, grid: int, nm_per_pixel: float) -> None:
    x0 = int(max(0, round(s.x_nm / nm_per_pixel)))
    y0 = int(max(0, round(s.y_nm / nm_per_pixel)))
    x1 = int(min(grid, round((s.x_nm + s.w_nm) / nm_per_pixel)))
    y1 = int(min(grid, round((s.y_nm + s.h_nm) / nm_per_pixel)))
    if x1 > x0 and y1 > y0:
        mask[y0:y1, x0:x1] = 1.0

def _rasterize_polygon(mask: np.ndarray, points_nm, grid: int, nm_per_pixel: float) -> None:
    pts = [(float(p.x_nm / nm_per_pixel), float(p.y_nm / nm_per_pixel)) for p in points_nm]
    if len(pts) < 3:
        return

    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    min_x = max(0, int(np.floor(min(xs))))
    max_x = min(grid - 1, int(np.ceil(max(xs))))
    min_y = max(0, int(np.floor(min(ys))))
    max_y = min(grid - 1, int(np.ceil(max(ys))))
    if max_x < min_x or max_y < min_y:
        return

    n = len(pts)
    for yi in range(min_y, max_y + 1):
        y = yi + 0.5
        x_intersections = []
        for i in range(n):
            x1, y1 = pts[i]
            x2, y2 = pts[(i + 1) % n]
            if (y1 <= y < y2) or (y2 <= y < y1):
                t = (y - y1) / (y2 - y1)
                x = x1 + t * (x2 - x1)
                x_intersections.append(x)

        if len(x_intersections) < 2:
            continue

        x_intersections.sort()
        for j in range(0, len(x_intersections) - 1, 2):
            xa = x_intersections[j]
            xb = x_intersections[j + 1]
            if xb <= xa:
                continue
            x_start = max(min_x, int(np.floor(xa)))
            x_end = min(max_x, int(np.ceil(xb)))
            for xi in range(x_start, x_end + 1):
                xc = xi + 0.5
                if xa <= xc < xb:
                    mask[yi, xi] = 1.0

def rasterize_shapes(shapes: List[Shape], grid: int, nm_per_pixel: float) -> np.ndarray:
    """
    Rasterize supported shapes into a binary mask array (float32).
    mask[y, x] in [0,1]
    """
    mask = np.zeros((grid, grid), dtype=np.float32)
    for s in shapes:
        if getattr(s, "type", "rect") == "rect":
            _rasterize_rect(mask, s, grid=grid, nm_per_pixel=nm_per_pixel)
        elif getattr(s, "type", "") == "polygon":
            _rasterize_polygon(mask, s.points_nm, grid=grid, nm_per_pixel=nm_per_pixel)
    return mask
