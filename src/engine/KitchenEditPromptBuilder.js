const CABINET_COLOR_MAP = {
  white: { labelEn: 'Warm Silk White polyurethane paint (#f5f3ee)', hex: '#f5f3ee' },
  cream: { labelEn: 'Warm Ivory Cream polyurethane paint (#f2eadc)', hex: '#f2eadc' },
  greige: { labelEn: 'Warm Greige polyurethane paint (#cfc5b8)', hex: '#cfc5b8' },
  warm_gray: { labelEn: 'Warm Taupe Gray polyurethane paint (#9b9288)', hex: '#9b9288' },
  light_gray: { labelEn: 'Soft Silver Light Gray polyurethane paint (#c7cdd1)', hex: '#c7cdd1' },
  brown: { labelEn: 'Rich Mocha Brown polyurethane paint (#6e5544)', hex: '#6e5544' },
  olive_green: { labelEn: 'Matte Olive Sage Green polyurethane paint (#637568)', hex: '#637568' },
};

const COUNTERTOP_MAP = {
  light_stone: 'Light warm quartz/stone countertop',
  dark_stone: 'Dark charcoal granite/stone countertop',
  marble: 'White Calacatta veined marble countertop',
  wood: 'Natural light oak butcher-block wood countertop',
  plain: 'Clean solid matte neutral countertop',
};

const HANDLE_MAP = {
  black: 'Matte black modern bar handles',
  gold: 'Brushed champagne gold/brass handles',
  silver: 'Satin brushed nickel/silver handles',
  hidden: 'Hidden integrated recessed / handleless J-pull doors (remove protruding handles)',
  unchanged: 'Preserve the exact existing cabinet handles unchanged',
};

const STYLE_MAP = {
  modern: 'Clean contemporary modern architectural finish with crisp lines',
  classic: 'Timeless classic framed cabinetry aesthetic',
  neoclassical: 'Refined neoclassical Shaker-bevel cabinetry aesthetic',
  minimal: 'Ultra-clean minimalist architectural finish',
};

class KitchenEditPromptBuilder {
  static resolveColorDescription(colorKey, customHex) {
    if (customHex && /^#[0-9a-f]{6}$/i.test(customHex)) {
      const preset = CABINET_COLOR_MAP[colorKey];
      return preset ? preset.labelEn : `Custom polyurethane paint color ${customHex.toUpperCase()}`;
    }
    if (CABINET_COLOR_MAP[colorKey]) {
      return CABINET_COLOR_MAP[colorKey].labelEn;
    }
    return colorKey ? `Polyurethane cabinet paint (${colorKey})` : 'Warm Ivory Cream polyurethane paint (#f2eadc)';
  }

  /**
   * Builds a per-photo, customer-specific editing prompt incorporating structured vision analysis,
   * requested renovation parameters, reference-image instructions, and optional QA retry feedback.
   */
  static build({
    imageIndex = 0,
    totalImages = 1,
    analysis = {},
    options = {},
    qaFeedback = '',
  } = {}) {
    const {
      cabinetColor = 'cream',
      cabinetColorHex = '',
      upperColor = '',
      upperColorHex = '',
      lowerColor = '',
      lowerColorHex = '',
      materialType = 'Satin/Matte architectural polyurethane cabinet finish',
      countertopMaterial = 'unchanged',
      handleStyle = 'unchanged',
      designStyle = 'modern',
      changeBacksplash = false,
      addCoffeeBar = false,
      customRequests = '',
    } = options;

    const baseColorDesc = this.resolveColorDescription(cabinetColor, cabinetColorHex);
    const resolvedUpperDesc =
      upperColor || upperColorHex
        ? this.resolveColorDescription(upperColor, upperColorHex)
        : baseColorDesc;
    const resolvedLowerDesc =
      lowerColor || lowerColorHex
        ? this.resolveColorDescription(lowerColor, lowerColorHex)
        : baseColorDesc;

    const requestedLines = [];
    if (resolvedUpperDesc === resolvedLowerDesc) {
      requestedLines.push(`- Repaint ALL upper wall cabinets and lower base cabinets (doors, drawer fronts, visible frames, and toe-kicks) in ${resolvedLowerDesc} with ${materialType}.`);
    } else {
      requestedLines.push(`- Repaint ALL lower base cabinets in ${resolvedLowerDesc} with ${materialType}.`);
      requestedLines.push(`- Repaint ALL upper wall cabinets in ${resolvedUpperDesc} with ${materialType}.`);
    }

    requestedLines.push(`- Design aesthetic: ${STYLE_MAP[designStyle] || STYLE_MAP.modern}.`);

    if (handleStyle && handleStyle !== 'unchanged') {
      requestedLines.push(`- Cabinet hardware/handles: Replace existing handles with ${HANDLE_MAP[handleStyle] || handleStyle}.`);
    } else {
      requestedLines.push(`- Cabinet hardware/handles: ${HANDLE_MAP.unchanged}.`);
    }

    const unchangedItems = ['walls', 'ceiling', 'floor'];

    if (countertopMaterial && countertopMaterial !== 'unchanged' && COUNTERTOP_MAP[countertopMaterial]) {
      requestedLines.push(`- Countertop: Refinish/replace the existing countertop surface with ${COUNTERTOP_MAP[countertopMaterial]}, keeping its exact footprint, sink cutout, and stove cutout.`);
    } else {
      unchangedItems.push('countertop');
    }

    if (changeBacksplash) {
      requestedLines.push('- Backsplash: Upgrade the backsplash area between upper and lower cabinets to clean modern ceramic/stone tile while keeping its exact wall boundaries.');
    } else {
      unchangedItems.push('backsplash');
    }

    if (addCoffeeBar) {
      requestedLines.push('- Coffee Bar (cautious localized addition): Only if clear open counter/wall space exists without blocking appliances, doors, or windows, subtly style a compact coffee-bar corner with a small espresso machine and neat shelf; do NOT alter room walls or remove any existing cabinet unit.');
    }

    if (customRequests && String(customRequests).trim()) {
      requestedLines.push(`- Additional customer request: ${String(customRequests).trim()}`);
    }

    requestedLines.push(`- Elements that MUST remain unchanged: ${unchangedItems.join(', ')}, plus all appliances (fridge, sink, faucet, stove, oven, hood), windows, and doors.`);

    // Observed scene context from Gemini Vision analysis
    const sceneContextLines = [];
    if (analysis && typeof analysis === 'object' && Object.keys(analysis).length > 0) {
      if (analysis.kitchenShape) sceneContextLines.push(`- Observed layout: ${analysis.kitchenShape}`);
      if (analysis.cameraAngle || analysis.perspective) {
        sceneContextLines.push(`- Camera & perspective: ${analysis.cameraAngle || ''} ${analysis.perspective || ''}`.trim());
      }
      if (analysis.doorCountEstimate || analysis.drawerCountEstimate) {
        sceneContextLines.push(`- Approximate cabinetry count to preserve: ~${analysis.doorCountEstimate || 'existing'} doors, ~${analysis.drawerCountEstimate || 'existing'} drawers`);
      }
      if (analysis.appliancesSummary) sceneContextLines.push(`- Fixed appliances & openings: ${analysis.appliancesSummary}`);
      if (analysis.lighting) sceneContextLines.push(`- Existing lighting: ${analysis.lighting}`);
    }

    const referenceNote =
      totalImages > 1
        ? `\nMULTI-ANGLE CONSISTENCY NOTE:\nImage 1 (primary photo #${imageIndex + 1} of ${totalImages}) is the ONLY photo to edit and return. Any additional attached photos are secondary reference views of this SAME kitchen—use them solely to keep paint tone, hardware, and material finish consistent across angles. Do NOT merge views or output a different angle.`
        : '';

    const retryNote = qaFeedback
      ? `\nCORRECTION FROM QUALITY CHECK (MUST FIX IN THIS ATTEMPT):\n${qaFeedback}`
      : '';

    return `You are a professional architectural kitchen renovation photo editor.

EDIT THE PROVIDED REAL KITCHEN PHOTOGRAPH. Do not create a different kitchen.

The uploaded photograph is the primary and authoritative visual reference.

Your task is to realistically renovate the existing kitchen while preserving its original identity, architecture, geometry, camera perspective and spatial layout.

STRICT PRESERVATION RULES:

1. Preserve the original camera position, viewing angle, perspective and framing.
2. Preserve the exact room architecture and wall arrangement.
3. Preserve the original locations of windows, doors and openings.
4. Preserve the original positions of the refrigerator, sink, stove, oven and hood.
5. Preserve the existing cabinet layout, cabinet dimensions, number of cabinet units, door divisions and drawer arrangement as closely as possible.
6. Do not invent additional walls, windows, doors or kitchen appliances.
7. Do not redesign the entire room.
8. Do not replace the original kitchen with a generic showroom kitchen.
9. Keep the floor, ceiling, walls and backsplash unchanged unless explicitly requested.
10. Preserve realistic shadows, lighting direction and photographic perspective.
${sceneContextLines.length > 0 ? `\nOBSERVED KITCHEN STRUCTURE IN THIS PHOTO:\n${sceneContextLines.join('\n')}\n` : ''}${referenceNote}
REQUESTED RENOVATION:

${requestedLines.join('\n')}

VISUAL QUALITY:

Produce a highly photorealistic architectural renovation photograph.

Use realistic polyurethane cabinet paint, physically plausible material reflections, natural surface textures, realistic edge details and believable lighting.

The result must look like a real photograph taken after the actual kitchen renovation.

IMPORTANT:

The final result must remain recognizably the same kitchen shown in the input photograph.

Change only the requested elements.

Do not return a 3D modeling screenshot, CAD visualization, illustration or generic kitchen design.
${retryNote}
Return the edited image.`;
  }
}

module.exports = {
  KitchenEditPromptBuilder,
  CABINET_COLOR_MAP,
  COUNTERTOP_MAP,
  HANDLE_MAP,
  STYLE_MAP,
};
