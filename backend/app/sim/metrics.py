import numpy as np
from typing import Optional

def estimate_cd_simple(binary: np.ndarray, nm_per_pixel: float) -> Optional[float]:
    """
    MVP CD: measure per-feature width at center row (rough).
    For dense patterns, returns median contiguous run width.
    """
    h, w = binary.shape
    y = h // 2
    row = binary[y, :]
    on = row > 0.5
    if not np.any(on):
        return None

    widths = []
    i = 0
    while i < w:
        if not on[i]:
            i += 1
            continue
        j = i
        while j + 1 < w and on[j + 1]:
            j += 1
        widths.append(j - i + 1)
        i = j + 1

    if not widths:
        return None

    cd_px = float(np.median(np.array(widths, dtype=np.float32)))
    return cd_px * nm_per_pixel
