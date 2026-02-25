from ..models import Preset

# 공개 정보 기반 “Educational preset”
PRESETS = {
    "DUV_193_DRY": Preset(
        preset_id="DUV_193_DRY",
        title="DUV 193nm Dry (Educational)",
        description="Baseline DUV dry preset for visualization.",
        wavelength_nm=193.0,
        na=0.93,          # educational typical value (not calibrated)
        sigma=0.7,
        is_immersion=False,
        blur_sensitivity=1.0,
    ),
    "DUV_193_IMM": Preset(
        preset_id="DUV_193_IMM",
        title="DUV 193nm Immersion (Pro, Educational)",
        description="Immersion preset (Pro).",
        wavelength_nm=193.0,
        na=1.35,          # educational typical value (not calibrated)
        sigma=0.7,
        is_immersion=True,
        blur_sensitivity=1.0,
    ),
    "EUV_LNA": Preset(
        preset_id="EUV_LNA",
        title="EUV 13.5nm Low-NA 0.33 (Educational)",
        description="Low-NA EUV preset (Free).",
        wavelength_nm=13.5,
        na=0.33,
        sigma=0.7,
        is_immersion=False,
        blur_sensitivity=1.2,
    ),
    "EUV_HNA": Preset(
        preset_id="EUV_HNA",
        title="EUV 13.5nm High-NA 0.55 (Pro, Educational)",
        description="High-NA EUV preset (Pro). More focus-sensitive in this educational model.",
        wavelength_nm=13.5,
        na=0.55,
        sigma=0.7,
        is_immersion=False,
        blur_sensitivity=1.8,
    ),
}
