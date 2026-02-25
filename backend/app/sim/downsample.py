import numpy as np

def downsample_to_256(img: np.ndarray, target: int = 256) -> np.ndarray:
    """
    Fast nearest downsample for heatmap payload.
    Default remains 256 for compatibility.
    """
    target = int(max(64, min(1024, target)))
    h, w = img.shape
    ys = (np.linspace(0, h - 1, target)).astype(int)
    xs = (np.linspace(0, w - 1, target)).astype(int)
    return img[np.ix_(ys, xs)].astype(np.float32)
