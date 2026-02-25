import numpy as np

from ..models import SimRequest, SimResponse, Metrics, Polyline, IntensityPayload
from .presets import PRESETS
from .templates import template_to_shapes
from .rasterize import rasterize_shapes
from .optics import coherent_imaging_intensity
from .contour import find_contours_iso
from .metrics import estimate_cd_simple
from .downsample import downsample_to_256

def _min_printable_cd_nm(wavelength_nm: float, na: float, is_immersion: bool) -> float:
    """
    Educational Rayleigh-style CD floor:
      CD_min ~= k1 * lambda / NA
    k1 values are intentionally conservative for this toy model.
    """
    if wavelength_nm >= 100.0:  # DUV regime
        # Industry-like educational guardrail:
        # dry generally less capable than immersion.
        k1 = 0.26 if is_immersion else 0.28
    else:  # EUV regime
        # Industry-like educational guardrail:
        # low-NA EUV is given a more conservative k1 than high-NA EUV.
        k1 = 0.30 if na <= 0.40 else 0.26
    return k1 * wavelength_nm / max(na, 1e-6)

def _requested_cd_nm(req: SimRequest) -> float | None:
    p = req.mask.params_nm
    if not p:
        return None
    t = req.mask.template_id
    if t in {"CONTACT", "CONTACT_RAW", "CONTACT_OPC_SERIF"}:
        return float(p.get("w_nm", p.get("cd_nm", 0.0))) or None
    if t == "STAIRCASE":
        return float(p.get("thickness_nm", p.get("cd_nm", 0.0))) or None
    return float(p.get("cd_nm", 0.0)) or None


def _feature_span_ratio(shapes, fov_nm: float) -> float:
    """
    Returns max(feature_width, feature_height) / fov.
    Used to adapt PRO heatmap payload resolution for very small patterns.
    """
    if not shapes:
        return 1.0
    min_x = min(float(s.x_nm) for s in shapes)
    min_y = min(float(s.y_nm) for s in shapes)
    max_x = max(float(s.x_nm + s.w_nm) for s in shapes)
    max_y = max(float(s.y_nm + s.h_nm) for s in shapes)
    span = max(max_x - min_x, max_y - min_y)
    return float(span / max(float(fov_nm), 1e-6))


def _pro_intensity_target(req: SimRequest, shapes, fov_nm: float) -> int:
    """
    Adaptive intensity payload target:
    - default 512 for speed
    - bump for tiny features to improve 3D readability
    """
    grid = int(req.grid)
    ratio = _feature_span_ratio(shapes, fov_nm)

    if ratio <= 0.12:
        target = 768
    elif ratio <= 0.20:
        target = 640
    else:
        target = 512

    return min(grid, target)

def run_simulation(req: SimRequest) -> SimResponse:
    preset = PRESETS[req.preset_id]

    # 1) Build shapes (TEMPLATE -> shapes) or use CUSTOM shapes
    if req.mask.mode == "TEMPLATE":
        shapes, fov_nm = template_to_shapes(req.mask.template_id, req.mask.params_nm)
    else:
        shapes = req.mask.shapes
        fov_nm = req.mask.params_nm.get("fov_nm", 1100.0)  # fallback

    grid = int(req.grid)
    nm_per_pixel = float(fov_nm) / float(grid)

    # 2) Rasterize mask (binary amplitude for MVP)
    mask = rasterize_shapes(shapes, grid=grid, nm_per_pixel=nm_per_pixel)

    # 3) Imaging (coherent intensity proxy)
    intensity = coherent_imaging_intensity(
        mask,
        na=preset.na,
        wavelength_nm=preset.wavelength_nm,
        focus=req.focus,
        blur_sensitivity=preset.blur_sensitivity,
        nm_per_pixel=nm_per_pixel,
    )

    # 4) Threshold -> binary printed region
    # dose is treated as an absolute aerial-intensity threshold [0,1].
    thr = float(req.dose)
    printed = (intensity >= thr).astype(np.uint8)

    # 5) Contours from iso-level on intensity field (sub-pixel marching squares)
    contours_px = find_contours_iso(intensity, level=thr)

    contours_nm = []
    for poly in contours_px:
        pts_nm = [{"x": float(x * nm_per_pixel), "y": float(y * nm_per_pixel)} for x, y in poly]
        contours_nm.append(Polyline(points_nm=pts_nm))

    # 6) Simple metrics + printability guard (DUV/EUV)
    cd_nm = estimate_cd_simple(printed, nm_per_pixel=nm_per_pixel)
    cd_floor = _min_printable_cd_nm(
        wavelength_nm=preset.wavelength_nm,
        na=preset.na,
        is_immersion=preset.is_immersion,
    )
    req_cd = _requested_cd_nm(req)

    # In this educational model, sub-Rayleigh features are treated as non-printing.
    if req_cd is not None and req_cd < cd_floor:
        contours_nm = []
        cd_nm = None

    metrics = Metrics(cd_nm=cd_nm)

    # 7) Optional intensity payload (Pro heatmap)
    payload = None
    if req.return_intensity and req.plan == "PRO":
        # Use a higher heatmap payload for PRO so small features remain readable in 3D.
        target = _pro_intensity_target(req, shapes, fov_nm)
        small = downsample_to_256(intensity, target=target)
        payload = IntensityPayload(
            w=int(small.shape[1]),
            h=int(small.shape[0]),
            vmin=float(np.min(small)),
            vmax=float(np.max(small)),
            data=[float(v) for v in small.flatten()],
        )

    return SimResponse(
        grid_used=grid,
        nm_per_pixel=nm_per_pixel,
        contours_nm=contours_nm,
        metrics=metrics,
        intensity=payload,
    )
