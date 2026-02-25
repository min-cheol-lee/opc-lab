import numpy as np


def _pupil_filter(grid: int, cutoff: float) -> np.ndarray:
    """
    Simple circular pupil in frequency domain.
    cutoff is normalized in [0, 0.5] roughly (educational).
    """
    fy = np.fft.fftfreq(grid)  # [-0.5, 0.5)
    fx = np.fft.fftfreq(grid)
    FX, FY = np.meshgrid(fx, fy)
    R = np.sqrt(FX**2 + FY**2)
    return (R <= cutoff).astype(np.float32)


def coherent_imaging_intensity(
    mask: np.ndarray,
    na: float,
    wavelength_nm: float,
    focus: float,
    blur_sensitivity: float,
    nm_per_pixel: float,
) -> np.ndarray:
    """
    Educational coherent imaging proxy:
    - Apply pupil low-pass (NA/lambda proxy)
    - Apply focus blur proxy (extra attenuation at high frequency)
    - Apply diffraction blur linked to lambda/NA
    """
    grid = mask.shape[0]

    # Physics-inspired cutoff in FFT normalized cycles/pixel:
    # coherent cutoff ~ NA / lambda [cycles/nm]
    # convert to cycles/pixel with nm_per_pixel.
    fc_nm = na / max(wavelength_nm, 1e-6)
    cutoff = np.clip(fc_nm * max(nm_per_pixel, 1e-6), 0.003, 0.49)

    # Additional diffraction blur in pixel domain:
    # sigma_nm scales with Rayleigh-like term (lambda / NA), then converted to pixels.
    # Tuned to keep the model educational but prevent non-physical DUV over-resolution.
    sigma_nm = 0.10 * (wavelength_nm / max(na, 1e-6))
    sigma_px = sigma_nm / max(nm_per_pixel, 1e-6)

    pupil = _pupil_filter(grid, cutoff=cutoff)

    # Focus/blur proxy: higher focus => more blur for the demo
    # Hi-NA preset uses higher blur_sensitivity => more focus sensitivity
    blur_strength = (focus ** 1.5) * 0.08 * blur_sensitivity  # tunable
    fy = np.fft.fftfreq(grid)
    fx = np.fft.fftfreq(grid)
    FX, FY = np.meshgrid(fx, fy)
    R2 = FX**2 + FY**2
    focus_filter = np.exp(-R2 / (1e-6 + blur_strength)).astype(np.float32) if blur_strength > 0 else 1.0

    # Gaussian MTF in frequency domain: exp(-2*pi^2*sigma_px^2*f^2)
    # where f^2 = fx^2 + fy^2 = R2
    diffraction_filter = np.exp(-2.0 * (np.pi ** 2) * (sigma_px ** 2) * R2).astype(np.float32)

    F = np.fft.fft2(mask)
    G = F * pupil * focus_filter * diffraction_filter
    field = np.fft.ifft2(G)
    intensity = np.abs(field) ** 2

    # Keep absolute-scale intensity (open field ~= 1.0).
    # This avoids per-pattern normalization that can make sub-resolution features
    # look falsely printable at moderate thresholds.
    intensity = np.clip(intensity, 0.0, 1.0)
    return intensity.astype(np.float32)
