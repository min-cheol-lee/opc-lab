from typing import Dict, List, Tuple

from ..models import RectShape, TemplateID


def _fit_dense_line_count_in_fov(cd_nm: float, pitch_nm: float, requested_n: int, fov_nm: float) -> int:
    cd = max(0.0, float(cd_nm))
    pitch = abs(float(pitch_nm))
    n_req = max(1, int(requested_n))
    fov = max(1e-6, float(fov_nm))
    if pitch < 1e-9:
        return 1
    if fov <= cd:
        return 1
    max_n = int((fov - cd) // pitch) + 1
    return max(1, min(n_req, max_n))


def template_to_shapes(template_id: TemplateID, p: Dict[str, float]) -> Tuple[List[RectShape], float]:
    """
    Returns (shapes, fov_nm). All geometry in nm.
    Coordinate system: x right, y up. Origin at (0,0) bottom-left of FOV.
    """
    # default field of view for MVP
    fov_nm = float(p.get("fov_nm", 1100.0))
    cx = fov_nm * 0.5
    cy = fov_nm * 0.5

    shapes: List[RectShape] = []

    if template_id == "ISO_LINE":
        cd = float(p.get("cd_nm", 80.0))
        h = float(p.get("length_nm", 900.0))
        shapes.append(RectShape(x_nm=cx - cd / 2, y_nm=cy - h / 2, w_nm=cd, h_nm=h))

    elif template_id == "DENSE_LS":
        cd = float(p.get("cd_nm", 60.0))
        pitch = float(p.get("pitch_nm", 140.0))
        n_req = int(p.get("n_lines", 7))
        n = _fit_dense_line_count_in_fov(cd, pitch, n_req, fov_nm)
        h = float(p.get("length_nm", 900.0))
        start = cx - (n - 1) * pitch / 2
        for i in range(n):
            x = start + i * pitch - cd / 2
            shapes.append(RectShape(x_nm=x, y_nm=cy - h / 2, w_nm=cd, h_nm=h))

    elif template_id == "LINE_END_RAW":
        cd = float(p.get("cd_nm", 80.0))
        h = float(p.get("length_nm", 900.0))
        shapes.append(RectShape(x_nm=cx - cd / 2, y_nm=cy - h / 2, w_nm=cd, h_nm=h))

    elif template_id == "LINE_END_OPC_HAMMER":
        cd = float(p.get("cd_nm", 80.0))
        h = float(p.get("length_nm", 900.0))
        hammer_w = float(p.get("hammer_w_nm", max(1.8 * cd, cd + 40.0)))
        hammer_h = float(p.get("hammer_h_nm", max(0.35 * cd, 24.0)))
        x = cx - cd / 2
        y = cy - h / 2
        shapes.append(RectShape(x_nm=x, y_nm=y, w_nm=cd, h_nm=h))
        # top/bottom hammerheads
        shapes.append(RectShape(x_nm=cx - hammer_w / 2, y_nm=y + h - hammer_h / 2, w_nm=hammer_w, h_nm=hammer_h))
        shapes.append(RectShape(x_nm=cx - hammer_w / 2, y_nm=y - hammer_h / 2, w_nm=hammer_w, h_nm=hammer_h))

    elif template_id == "L_CORNER" or template_id == "L_CORNER_RAW":
        arm = float(p.get("arm_nm", 700.0))
        cd = float(p.get("cd_nm", 80.0))
        shapes.append(RectShape(x_nm=cx - arm / 2, y_nm=cy - cd / 2, w_nm=arm, h_nm=cd))
        shapes.append(RectShape(x_nm=cx - cd / 2, y_nm=cy - arm / 2, w_nm=cd, h_nm=arm))

    elif template_id == "L_CORNER_OPC_SERIF":
        arm = float(p.get("arm_nm", 700.0))
        cd = float(p.get("cd_nm", 80.0))
        serif = float(p.get("serif_nm", max(0.4 * cd, 20.0)))
        xh = cx - arm / 2
        yh = cy - cd / 2
        xv = cx - cd / 2
        yv = cy - arm / 2
        shapes.append(RectShape(x_nm=xh, y_nm=yh, w_nm=arm, h_nm=cd))
        shapes.append(RectShape(x_nm=xv, y_nm=yv, w_nm=cd, h_nm=arm))
        # outer-corner serif pads (educational)
        shapes.append(RectShape(x_nm=xh - serif / 2, y_nm=yh - serif / 2, w_nm=serif, h_nm=serif))
        shapes.append(RectShape(x_nm=xh + arm - serif / 2, y_nm=yh - serif / 2, w_nm=serif, h_nm=serif))
        shapes.append(RectShape(x_nm=xh - serif / 2, y_nm=yh + cd - serif / 2, w_nm=serif, h_nm=serif))
        shapes.append(RectShape(x_nm=xh + arm - serif / 2, y_nm=yh + cd - serif / 2, w_nm=serif, h_nm=serif))
        shapes.append(RectShape(x_nm=xv - serif / 2, y_nm=yv - serif / 2, w_nm=serif, h_nm=serif))
        shapes.append(RectShape(x_nm=xv - serif / 2, y_nm=yv + arm - serif / 2, w_nm=serif, h_nm=serif))
        shapes.append(RectShape(x_nm=xv + cd - serif / 2, y_nm=yv - serif / 2, w_nm=serif, h_nm=serif))
        shapes.append(RectShape(x_nm=xv + cd - serif / 2, y_nm=yv + arm - serif / 2, w_nm=serif, h_nm=serif))

    elif template_id == "CONTACT" or template_id == "CONTACT_RAW":
        w = float(p.get("w_nm", p.get("cd_nm", 80.0)))
        shapes.append(RectShape(x_nm=cx - w / 2, y_nm=cy - w / 2, w_nm=w, h_nm=w))

    elif template_id == "CONTACT_OPC_SERIF":
        w = float(p.get("w_nm", p.get("cd_nm", 80.0)))
        serif = float(p.get("serif_nm", max(0.35 * w, 20.0)))
        half = w / 2
        shapes.append(RectShape(x_nm=cx - half, y_nm=cy - half, w_nm=w, h_nm=w))
        # diagonal serif pads to counter contact rounding (educational)
        shapes.append(RectShape(x_nm=cx - half - serif / 2, y_nm=cy - half - serif / 2, w_nm=serif, h_nm=serif))
        shapes.append(RectShape(x_nm=cx + half - serif / 2, y_nm=cy - half - serif / 2, w_nm=serif, h_nm=serif))
        shapes.append(RectShape(x_nm=cx - half - serif / 2, y_nm=cy + half - serif / 2, w_nm=serif, h_nm=serif))
        shapes.append(RectShape(x_nm=cx + half - serif / 2, y_nm=cy + half - serif / 2, w_nm=serif, h_nm=serif))

    elif template_id == "STAIRCASE":
        # (A) straight edge approximated by Manhattan staircase
        step_w = float(p.get("step_w_nm", 40.0))
        step_h = float(p.get("step_h_nm", 40.0))
        n = int(p.get("n_steps", 12))
        thickness = float(p.get("thickness_nm", p.get("cd_nm", 80.0)))  # line thickness
        # build a staircase wall by stacking rectangles
        x0 = cx - (n * step_w) / 2
        y0 = cy - (n * step_h) / 2
        for i in range(n):
            # each step: a rect segment
            shapes.append(RectShape(x_nm=x0 + i * step_w, y_nm=y0 + i * step_h, w_nm=step_w, h_nm=thickness))
            shapes.append(RectShape(x_nm=x0 + i * step_w, y_nm=y0 + i * step_h, w_nm=thickness, h_nm=step_h))
    else:
        # fallback: simple contact
        w = float(p.get("w_nm", p.get("cd_nm", 80.0)))
        shapes.append(RectShape(x_nm=cx - w / 2, y_nm=cy - w / 2, w_nm=w, h_nm=w))

    # Phase 1: simple rule-based SRAF appended as extra rectangles
    # (Free: on/off + size + offset)
    sraf_on = bool(p.get("sraf_on", 0.0) >= 0.5)
    if sraf_on:
        sraf_w = float(p.get("sraf_w_nm", 30.0))
        sraf_off = float(p.get("sraf_offset_nm", 80.0))
        # very simple: place two SRAFs left/right of the bounding box centerline
        shapes.append(RectShape(x_nm=cx - sraf_off - sraf_w / 2, y_nm=cy - sraf_w / 2, w_nm=sraf_w, h_nm=sraf_w))
        shapes.append(RectShape(x_nm=cx + sraf_off - sraf_w / 2, y_nm=cy - sraf_w / 2, w_nm=sraf_w, h_nm=sraf_w))

    return shapes, fov_nm
