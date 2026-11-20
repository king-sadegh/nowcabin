// Expandable PBR Material Library for KitchenScene, Three.js WebGL & Blender Cycles

const CABINET_FINISHES = {
  cashmere_beige: {
    id: 'cashmere_beige',
    nameFa: 'بژ کشمیری (NP N 1859P)',
    upperHex: '#e6dfd3',
    lowerHex: '#c4b7a6',
    roughness: 0.34,
    metalness: 0.02,
    textureType: 'polyurethane_satin',
  },
  bone_cream: {
    id: 'bone_cream',
    nameFa: 'کرم استخوانی گرم (NP OW 1012)',
    upperHex: '#f4efe6',
    lowerHex: '#e3dacb',
    roughness: 0.32,
    metalness: 0.02,
    textureType: 'polyurethane_satin',
  },
  warm_greige: {
    id: 'warm_greige',
    nameFa: 'گریژ گرم دو رنگ (NP N 1864T)',
    upperHex: '#dcd3c7',
    lowerHex: '#a39585',
    roughness: 0.34,
    metalness: 0.02,
    textureType: 'polyurethane_satin',
  },
  warm_taupe: {
    id: 'warm_taupe',
    nameFa: 'تاپه گرم (Warm Taupe)',
    upperHex: '#cec5b8',
    lowerHex: '#8c7f70',
    roughness: 0.36,
    metalness: 0.02,
    textureType: 'polyurethane_matte',
  },
  silver_mist: {
    id: 'silver_mist',
    nameFa: 'طوسی نقره‌ای ملایم (Silver Mist)',
    upperHex: '#d8dde0',
    lowerHex: '#7c878e',
    roughness: 0.33,
    metalness: 0.03,
    textureType: 'polyurethane_satin',
  },
  eucalyptus_green: {
    id: 'eucalyptus_green',
    nameFa: 'سبز اکالیپتوس (Eucalyptus)',
    upperHex: '#e8ece9',
    lowerHex: '#697d72',
    roughness: 0.38,
    metalness: 0.02,
    textureType: 'polyurethane_matte',
  },
  classic_navy: {
    id: 'classic_navy',
    nameFa: 'سرمه‌ای نئوکلاسیک (Classic Navy)',
    upperHex: '#ece8e1',
    lowerHex: '#2f3e4e',
    roughness: 0.35,
    metalness: 0.03,
    textureType: 'polyurethane_satin',
  },
  mocha_modern: {
    id: 'mocha_modern',
    nameFa: 'قهوه‌ای موکا مدرن (Mocha)',
    upperHex: '#e5dacb',
    lowerHex: '#6e5544',
    roughness: 0.36,
    metalness: 0.02,
    textureType: 'polyurethane_satin',
  },
  old_oak_wood: {
    id: 'old_oak_wood',
    nameFa: 'چوب قهوه‌ای قدیمی (وضعیت فعلی)',
    upperHex: '#7d5233',
    lowerHex: '#6e4529',
    roughness: 0.56,
    metalness: 0.04,
    textureType: 'oak_wood',
  },
  natural_light_oak: {
    id: 'natural_light_oak',
    nameFa: 'روکش بلوط روشن طبیعی',
    upperHex: '#c8a679',
    lowerHex: '#b89364',
    roughness: 0.48,
    metalness: 0.02,
    textureType: 'oak_wood',
  },
};

const COUNTERTOP_MATERIALS = {
  quartz_white_veined: {
    id: 'quartz_white_veined',
    nameFa: 'کوارتز سفید رگه‌دار گرم',
    hex: '#f4f0e8',
    veinHex: '#b8aa96',
    roughness: 0.16,
    metalness: 0.05,
    textureType: 'marble_veined',
  },
  light_wood_butcher: {
    id: 'light_wood_butcher',
    nameFa: 'طرح چوب بلوط روشن',
    hex: '#cfa97a',
    veinHex: '#9d7649',
    roughness: 0.44,
    metalness: 0.02,
    textureType: 'oak_wood',
  },
  calacatta_gold: {
    id: 'calacatta_gold',
    nameFa: 'سنگ ماربل کالاکاتا گلد',
    hex: '#faf7f2',
    veinHex: '#c69e5d',
    roughness: 0.14,
    metalness: 0.06,
    textureType: 'marble_veined',
  },
  charcoal_granite: {
    id: 'charcoal_granite',
    nameFa: 'گرانیت مشکی / طوسی تیره',
    hex: '#36393d',
    veinHex: '#595f66',
    roughness: 0.22,
    metalness: 0.08,
    textureType: 'terrazzo_stone',
  },
  standard_beige_stone: {
    id: 'standard_beige_stone',
    nameFa: 'سنگ کرم بژ کلاسیک',
    hex: '#cbbba4',
    veinHex: '#a39178',
    roughness: 0.28,
    metalness: 0.04,
    textureType: 'marble_veined',
  },
};

const BACKSPLASH_MATERIALS = {
  warm_subway_tile: {
    id: 'warm_subway_tile',
    nameFa: 'کاشی ساب‌وی کرم گرم',
    hex: '#ebe3d5',
    groutHex: '#c4b8a6',
    roughness: 0.24,
    textureType: 'subway_tile',
  },
  calacatta_slab: {
    id: 'calacatta_slab',
    nameFa: 'اسلب یکپارچه ماربل گرم + لاین نوری',
    hex: '#f6f1e7',
    veinHex: '#bda583',
    roughness: 0.15,
    textureType: 'marble_veined',
  },
  sage_ceramic_tile: {
    id: 'sage_ceramic_tile',
    nameFa: 'سرامیک زیتونی ملایم',
    hex: '#cad4cc',
    groutHex: '#9ea8a0',
    roughness: 0.25,
    textureType: 'subway_tile',
  },
};

const HANDLE_STYLES = {
  matte_black: {
    id: 'matte_black',
    nameFa: 'مشکی مات مدرن',
    hex: '#222224',
    roughness: 0.42,
    metalness: 0.65,
    shape: 'bar',
  },
  brushed_brass: {
    id: 'brushed_brass',
    nameFa: 'طلایی برس‌خورده (شامپاینی)',
    hex: '#c59d54',
    roughness: 0.28,
    metalness: 0.88,
    shape: 'bar',
  },
  satin_nickel: {
    id: 'satin_nickel',
    nameFa: 'استیل نقره‌ای ساتن',
    hex: '#b9bec4',
    roughness: 0.26,
    metalness: 0.85,
    shape: 'bar',
  },
  dark_bronze: {
    id: 'dark_bronze',
    nameFa: 'برنز تیره آنتیک',
    hex: '#4f4032',
    roughness: 0.36,
    metalness: 0.78,
    shape: 'bar',
  },
};

function findColorMatch(query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return null;

  if (/کرم|استخوانی|cream|ivory|alabaster/.test(q)) {
    return { upperHex: '#f4efe6', lowerHex: '#e3dacb', nameFa: 'کرم استخوانی گرم', finishId: 'bone_cream' };
  }
  if (/سفید|white|نوردیک/.test(q)) {
    return { upperHex: '#f6f4ef', lowerHex: '#ebe7de', nameFa: 'سفید گرم ابریشمی', finishId: 'bone_cream' };
  }
  if (/کشمیری|بژ|cashmere|beige/.test(q)) {
    return { upperHex: '#e6dfd3', lowerHex: '#c4b7a6', nameFa: 'بژ کشمیری', finishId: 'cashmere_beige' };
  }
  if (/گریژ|greige/.test(q)) {
    return { upperHex: '#dcd3c7', lowerHex: '#a39585', nameFa: 'گریژ گرم', finishId: 'warm_greige' };
  }
  if (/تاپه|taupe/.test(q)) {
    return { upperHex: '#cec5b8', lowerHex: '#8c7f70', nameFa: 'تاپه گرم', finishId: 'warm_taupe' };
  }
  if (/طوسی|نقره‌ای|خاکستری|gray|grey|silver/.test(q)) {
    return { upperHex: '#d8dde0', lowerHex: '#7c878e', nameFa: 'طوسی نقره‌ای', finishId: 'silver_mist' };
  }
  if (/سبز|اکالیپتوس|زیتونی|سیج|green|sage/.test(q)) {
    return { upperHex: '#e8ece9', lowerHex: '#697d72', nameFa: 'سبز اکالیپتوس', finishId: 'eucalyptus_green' };
  }
  if (/سرمه‌ای|آبی|navy|blue/.test(q)) {
    return { upperHex: '#ece8e1', lowerHex: '#2f3e4e', nameFa: 'سرمه‌ای نئوکلاسیک', finishId: 'classic_navy' };
  }
  if (/موکا|قهوه‌ای|mocha|brown/.test(q)) {
    return { upperHex: '#e5dacb', lowerHex: '#6e5544', nameFa: 'موکا مدرن', finishId: 'mocha_modern' };
  }
  if (/^#[0-9a-f]{6}$/i.test(q)) {
    return { upperHex: q, lowerHex: q, nameFa: `رنگ سفارشی (${q.toUpperCase()})`, finishId: 'custom' };
  }
  return null;
}

module.exports = {
  CABINET_FINISHES,
  COUNTERTOP_MATERIALS,
  BACKSPLASH_MATERIALS,
  HANDLE_STYLES,
  findColorMatch,
};
