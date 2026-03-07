from ..models import Preset

# Educational presets. These are intended for explanation and relative behavior,
# not sign-off calibration.
PRESETS = {
    "DUV_193_DRY": Preset(
        preset_id="DUV_193_DRY",
        title="DUV | 193 nm Dry",
        description="Baseline 193 nm dry educational preset.",
        wavelength_nm=193.0,
        na=0.93,
        sigma=0.7,
        is_immersion=False,
        blur_sensitivity=1.0,
    ),
    "DUV_193_IMM": Preset(
        preset_id="DUV_193_IMM",
        title="DUV | 193 nm Immersion",
        description="Higher-NA 193 nm immersion educational preset.",
        wavelength_nm=193.0,
        na=1.35,
        sigma=0.7,
        is_immersion=True,
        blur_sensitivity=1.0,
    ),
    "EUV_LNA": Preset(
        preset_id="EUV_LNA",
        title="EUV | 13.5 nm Low-NA",
        description="Low-NA EUV educational preset.",
        wavelength_nm=13.5,
        na=0.33,
        sigma=0.7,
        is_immersion=False,
        blur_sensitivity=1.2,
    ),
    "EUV_HNA": Preset(
        preset_id="EUV_HNA",
        title="EUV | 13.5 nm High-NA",
        description="High-NA EUV educational preset with stronger focus sensitivity.",
        wavelength_nm=13.5,
        na=0.55,
        sigma=0.7,
        is_immersion=False,
        blur_sensitivity=1.8,
    ),
}
