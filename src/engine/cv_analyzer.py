#!/usr/bin/env python3
"""
NoKabin Real Computer Vision Analyzer (Phase 4)
Analyzes 1-3 kitchen photographs using NumPy & Pillow to extract structural zones,
cabinet door seam cadence, dominant upper/lower paint colors, lighting warmth,
and candidate appliance/opening detections with explicit confidence scores.

Note: Monocular photographs alone cannot guarantee exact metric dimensions;
extracted visual structure must be fused with customer-supplied wall & height dimensions.
"""
import json
import sys
import numpy as np
from PIL import Image


def rgb_to_hex(rgb):
    r, g, b = [int(max(0, min(255, round(v)))) for v in rgb]
    return f"#{r:02x}{g:02x}{b:02x}"


def dominant_median_rgb(patch):
    if patch.size == 0:
        return [150, 130, 110]
    flat = patch.reshape(-1, 3)
    lum = 0.299 * flat[:, 0] + 0.587 * flat[:, 1] + 0.114 * flat[:, 2]
    valid = flat[(lum > 28) & (lum < 238)]
    if len(valid) < 20:
        valid = flat
    med = np.median(valid, axis=0)
    return [float(med[0]), float(med[1]), float(med[2])]


def analyze_single_image(img_path, index):
    with Image.open(img_path) as im:
        im_rgb = im.convert("RGB")
        orig_w, orig_h = im_rgb.size
        resized = im_rgb.resize((320, 240), Image.Resampling.BILINEAR)
        arr = np.asarray(resized, dtype=np.float32)

    h, w, _ = arr.shape
    lum = 0.299 * arr[:, :, 0] + 0.587 * arr[:, :, 1] + 0.114 * arr[:, :, 2]

    # Ambient lighting stats & warm/cool balance
    mean_lum = float(np.mean(lum))
    warmth = float(np.mean(arr[:, :, 0] - arr[:, :, 2]))  # positive = warm tone
    sat = np.max(arr, axis=2) - np.min(arr, axis=2)

    # Vertical structural profile: locate countertop horizontal edge near middle band (y in 40%..68%)
    gy = np.abs(np.diff(lum, axis=0))
    row_energy = np.mean(gy[:, int(w * 0.1):int(w * 0.9)], axis=1)
    mid_start, mid_end = int(h * 0.40), int(h * 0.68)
    counter_row = int(mid_start + np.argmax(row_energy[mid_start:mid_end]))
    counter_y_ratio = round(counter_row / h, 3)

    # Upper zone: 12% .. counter_y - 14%; Lower zone: counter_y + 4% .. 88%
    upper_y0, upper_y1 = int(h * 0.12), max(int(h * 0.22), int(counter_row - h * 0.14))
    lower_y0, lower_y1 = min(int(h * 0.80), int(counter_row + h * 0.04)), int(h * 0.88)

    upper_patch = arr[upper_y0:upper_y1, int(w * 0.12):int(w * 0.88)]
    lower_patch = arr[lower_y0:lower_y1, int(w * 0.12):int(w * 0.88)]

    upper_rgb = dominant_median_rgb(upper_patch)
    lower_rgb = dominant_median_rgb(lower_patch)

    # Detect vertical door seams in lower cabinet band via vertical gradient peaks
    gx = np.abs(np.diff(lum[lower_y0:lower_y1, :], axis=1))
    col_energy = np.mean(gx, axis=0)
    thresh = float(np.mean(col_energy) + 0.85 * np.std(col_energy))
    seam_peaks = []
    min_gap = 18
    for x in range(int(w * 0.08), int(w * 0.92)):
        if col_energy[x] > thresh and (not seam_peaks or x - seam_peaks[-1] >= min_gap):
            seam_peaks.append(x)
    estimated_bays = max(3, min(8, len(seam_peaks) + 1))

    # Candidate structural component & appliance heuristics (normalized x in [0..1])
    components = []
    zone_conf_base = 0.82 if mean_lum > 45 and np.std(lum) > 20 else 0.62

    # Split horizontal space into 5 vertical slices to locate major tall/appliances
    slices = 5
    sw = w // slices
    fridge_slice = None
    max_tall_score = -1.0
    for s in range(slices):
        x0, x1 = s * sw, (s + 1) * sw
        tall_patch_lum = lum[int(h * 0.16):int(h * 0.82), x0:x1]
        tall_patch_sat = sat[int(h * 0.16):int(h * 0.82), x0:x1]
        # Fridge/stainless tall unit tends to be uniform low-saturation vertical column
        uniformity = 1.0 / (1.0 + float(np.std(tall_patch_lum)) / 25.0)
        low_sat = 1.0 if float(np.mean(tall_patch_sat)) < 28.0 else 0.35
        score = uniformity * low_sat
        if score > max_tall_score:
            max_tall_score = score
            fridge_slice = s

    fridge_side = "left" if (fridge_slice is not None and fridge_slice <= 1) else ("right" if fridge_slice is not None and fridge_slice >= 3 else "left")

    # Dark cooktop glass zone near counter top
    ct_band_lum = lum[max(0, counter_row - 8):min(h, counter_row + 8), :]
    slice_darkness = [float(np.mean(ct_band_lum[:, s * sw:(s + 1) * sw])) for s in range(slices)]
    stove_slice = int(np.argmin(slice_darkness))
    stove_pos_norm = round((stove_slice + 0.5) / slices, 2)

    # Bright overexposed patch in backsplash/upper wall -> potential window opening
    window_detected = False
    window_x_norm = 0.5
    upper_bright = lum[int(h * 0.18):int(counter_row), :]
    bright_cols = np.mean(upper_bright > 228, axis=0)
    if float(np.max(bright_cols)) > 0.45:
        window_detected = True
        window_x_norm = round(float(np.argmax(bright_cols)) / w, 2)

    components.append({
        "id": f"photo{index+1}_wall_back",
        "type": "wall",
        "confidence": round(min(0.95, zone_conf_base + 0.08), 2),
    })
    components.append({
        "id": f"photo{index+1}_upper_zone",
        "type": "upper_cabinets",
        "colorHex": rgb_to_hex(upper_rgb),
        "estimatedBays": max(2, estimated_bays - 1),
        "confidence": round(zone_conf_base, 2),
    })
    components.append({
        "id": f"photo{index+1}_lower_zone",
        "type": "base_cabinets",
        "colorHex": rgb_to_hex(lower_rgb),
        "estimatedBays": estimated_bays,
        "confidence": round(min(0.94, zone_conf_base + 0.05), 2),
    })
    components.append({
        "id": f"photo{index+1}_countertop",
        "type": "countertop",
        "yRatio": counter_y_ratio,
        "confidence": round(zone_conf_base, 2),
    })
    components.append({
        "id": f"photo{index+1}_fridge_cue",
        "type": "fridge",
        "sideHint": fridge_side,
        "confidence": 0.72 if max_tall_score > 0.35 else 0.52,
    })
    components.append({
        "id": f"photo{index+1}_stove_cue",
        "type": "stove",
        "xNorm": stove_pos_norm,
        "confidence": 0.74,
    })
    if window_detected:
        components.append({
            "id": f"photo{index+1}_window_cue",
            "type": "window",
            "xNorm": window_x_norm,
            "confidence": 0.68,
        })

    return {
        "index": index,
        "resolution": {"width": orig_w, "height": orig_h},
        "lighting": {
            "meanBrightness": round(mean_lum, 1),
            "warmthDelta": round(warmth, 1),
            "toneLabel": "گرم" if warmth > 8 else ("سرد" if warmth < -5 else "خنثی"),
        },
        "dominantColors": {
            "upperHex": rgb_to_hex(upper_rgb),
            "lowerHex": rgb_to_hex(lower_rgb),
        },
        "counterYRatio": counter_y_ratio,
        "estimatedBays": estimated_bays,
        "fridgeSideHint": fridge_side,
        "stoveXNorm": stove_pos_norm,
        "windowDetected": window_detected,
        "windowXNorm": window_x_norm,
        "components": components,
        "overallConfidence": round(zone_conf_base, 2),
    }


def main():
    paths = sys.argv[1:]
    if not paths:
        print(json.dumps({"ok": False, "error": "No image paths provided"}))
        sys.exit(1)

    per_photo = []
    for idx, p in enumerate(paths):
        try:
            per_photo.append(analyze_single_image(p, idx))
        except Exception as exc:
            per_photo.append({"index": idx, "error": str(exc), "overallConfidence": 0.0, "components": []})

    valid_photos = [p for p in per_photo if "error" not in p]
    if not valid_photos:
        print(json.dumps({"ok": False, "error": "All uploaded images failed CV analysis", "perPhoto": per_photo}))
        sys.exit(2)

    avg_bays = int(round(np.mean([p["estimatedBays"] for p in valid_photos])))
    avg_conf = float(np.mean([p["overallConfidence"] for p in valid_photos]))
    # Cross-angle consistency boost when multiple angles supplied
    multi_angle_bonus = 0.06 if len(valid_photos) >= 2 else 0.0
    reconciled_conf = round(min(0.95, avg_conf + multi_angle_bonus), 2)

    fridge_votes = [p["fridgeSideHint"] for p in valid_photos]
    fridge_side = max(set(fridge_votes), key=fridge_votes.count)
    window_detected = any(p["windowDetected"] for p in valid_photos)

    result = {
        "ok": True,
        "photosAnalyzed": len(valid_photos),
        "perPhoto": per_photo,
        "reconciled": {
            "upperColorHex": valid_photos[0]["dominantColors"]["upperHex"],
            "lowerColorHex": valid_photos[0]["dominantColors"]["lowerHex"],
            "lightingTone": valid_photos[0]["lighting"]["toneLabel"],
            "estimatedCabinetBays": avg_bays,
            "fridgeSideHint": fridge_side,
            "stoveXNorm": valid_photos[0]["stoveXNorm"],
            "windowDetected": window_detected,
            "averageConfidence": reconciled_conf,
            "requiresCustomerDimensions": True,
        },
    }
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
