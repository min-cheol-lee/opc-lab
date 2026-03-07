# litopc Educational Template Spec

## Goal
- Make template names immediately understandable to non-specialists.
- Keep the cases credible enough that students and early-career lithography engineers recognize real OPC hotspots.
- Preserve internal compatibility for saved scenarios and benchmark assets where practical.

## Naming Strategy
- UI labels should be short and intuitive.
- Internal template IDs should remain stable unless there is a strong compatibility reason to add a new ID.
- "OPC" should stay visible in labels because it improves technical clarity and premium positioning.

## Template Mapping

| UI Label | Internal ID | Role | Recommended Tool |
| --- | --- | --- | --- |
| Isolated Line | `ISO_LINE` | baseline line-print case | DUV \| 193 nm Dry |
| Dense L/S | `DENSE_LS` | pitch sensitivity case | DUV \| 193 nm Immersion |
| Square | `CONTACT_RAW` | simple corner-rounding hotspot | DUV \| 193 nm Dry |
| Square OPC | `CONTACT_OPC_SERIF` | serif-based square compensation | DUV \| 193 nm Dry |
| L-Shape | `L_CORNER_RAW` | line-end pullback + elbow rounding hotspot | DUV \| 193 nm Dry |
| L-Shape OPC | `L_CORNER_OPC_SERIF` | hammerhead + serif + assist-bar educational correction | DUV \| 193 nm Dry |
| Stepped Interconnect | `STAIRCASE` | EUV jog-chain edge-placement hotspot | EUV \| 13.5 nm Low-NA |
| Stepped Interconnect OPC | `STAIRCASE_OPC` | EUV jog-chain with local bias and assist features | EUV \| 13.5 nm Low-NA |

## Compatibility Notes
- `CONTACT_RAW` and `CONTACT_OPC_SERIF` stay unchanged internally and are relabeled in the UI as `Square` and `Square OPC`.
- `L_CORNER_RAW` and `L_CORNER_OPC_SERIF` are reused as the new L-shape benchmark pair.
- `STAIRCASE` is retained as the raw stepped-interconnect ID.
- `STAIRCASE_OPC` is a new internal ID because the old app had no paired OPC variant for the staircase family.

## Recommended Defaults

### Square / Square OPC
- Purpose: show intuitive corner rounding and the effect of serif pads on a simple 2D feature.
- Default width: `116 nm`
- Default serif size for OPC: `28 nm`
- Intended behavior:
  - raw square prints with rounded corners
  - OPC square restores corner fullness and effective CD

### L-Shape / L-Shape OPC
- Purpose: show line-end pullback, outer-corner rounding, and elbow distortion in a pattern that looks like a real OPC hotspot rather than a toy line segment.
- Default raw target:
  - horizontal arm length: `470 nm`
  - vertical arm length: `432 nm`
  - arm width: `92 nm`
- Default OPC features:
  - horizontal arm extension: `+26 nm`
  - vertical arm extension: `+30 nm`
  - local width bias: `+14 nm`
  - left hammerhead: `28 x 124 nm`
  - bottom hammerhead: `146 x 28 nm`
  - outer serif pad size: `18 nm`
- Intended behavior:
  - raw L-shape should visibly lose line-end length and round the elbow
  - OPC case should look deliberately engineered, not like a mirrored copy

### Stepped Interconnect / Stepped Interconnect OPC
- Purpose: replace the generic staircase with a more believable jog-chain case that is useful for EUV education.
- Default raw target:
  - line thickness: `88 nm`
  - jog run: `180 nm`
  - jog rise: `110 nm`
  - tracks: `1`
- Default OPC features:
  - local width bias: `+12 nm`
  - end extension: `24 nm`
  - corner serif pads: `18 nm`
- Intended behavior:
  - raw stepped interconnect should show corner rounding, necking, and tip loss
  - OPC case should demonstrate local biasing and assist placement without pretending to be sign-off curvilinear OPC

## Intentional Limits
- True `mousebite` style subtraction is not represented in the built-in template generator yet.
- The current template system is still rectangle-based for consistency with the existing educational model.
- If negative notches or true cut-ins are required, the next product step should be boolean custom editing or polygon-mask templates.

## Product Follow-Up
- Add target-vs-contour error overlay for hotspot education.
- Add boolean subtract support in custom mask editing so users can build real `mousebite` and notch structures.
- Add rule-based `suggest OPC` actions:
  - line-end hotspot -> hammerhead suggestion
  - corner hotspot -> serif suggestion
  - isolated feature shrink -> local bias suggestion
  - narrow-gap instability -> assist-bar suggestion
