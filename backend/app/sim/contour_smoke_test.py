import numpy as np

from .contour import find_contours_iso


def _blur3(img: np.ndarray, n: int = 8) -> np.ndarray:
    out = img.astype(np.float32).copy()
    for _ in range(n):
        p = np.pad(out, ((1, 1), (1, 1)), mode="edge")
        out = (
            p[:-2, :-2] + p[:-2, 1:-1] + p[:-2, 2:]
            + p[1:-1, :-2] + p[1:-1, 1:-1] + p[1:-1, 2:]
            + p[2:, :-2] + p[2:, 1:-1] + p[2:, 2:]
        ) / 9.0
    return out


def run_smoke_test() -> None:
    field = np.zeros((96, 96), dtype=np.float32)
    field[24:72, 30:66] = 1.0
    field = _blur3(field, n=8)

    loops = find_contours_iso(field, level=0.5)
    assert len(loops) >= 1, "No contour loops found"
    assert all(len(lp) >= 4 for lp in loops), "Loop too short"
    assert all(lp[0] == lp[-1] for lp in loops), "Loop is not closed"
    print(f"OK: {len(loops)} closed loop(s)")


if __name__ == "__main__":
    run_smoke_test()
