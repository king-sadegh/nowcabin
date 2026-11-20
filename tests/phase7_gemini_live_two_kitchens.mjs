import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { editSingleKitchenPhoto } = require('../src/engine/geminiImageEditor');

async function main() {
  if (!process.env.GEMINI_API_KEY) {
    console.error('ERROR: GEMINI_API_KEY is not set in environment. Please export GEMINI_API_KEY first.');
    process.exit(1);
  }

  const photo1 = fs.existsSync('/home/antigravity/469685.jpeg')
    ? '/home/antigravity/469685.jpeg'
    : path.resolve('public/assets/before-1.jpg');
  const photo2 = path.resolve('public/assets/before-2.jpg');

  console.log('Running Live Gemini Image Editing Test on Two Real Kitchens...');
  console.log('Kitchen 1:', photo1);
  console.log('Kitchen 2:', photo2);

  const res1 = await editSingleKitchenPhoto({
    projectId: 9001,
    imageId: 'live_kitchen_1',
    imagePath: photo1,
    imageIndex: 0,
    totalImages: 1,
    options: {
      cabinetColor: 'cream',
      handleStyle: 'black',
      designStyle: 'neoclassical',
    },
  });

  const res2 = await editSingleKitchenPhoto({
    projectId: 9002,
    imageId: 'live_kitchen_2',
    imagePath: photo2,
    imageIndex: 0,
    totalImages: 1,
    options: {
      cabinetColor: 'olive_green',
      upperColor: 'white',
      countertopMaterial: 'marble',
      handleStyle: 'gold',
      designStyle: 'modern',
    },
  });

  console.log('Kitchen 1 Result:', {
    model: res1.modelName,
    timeMs: res1.generationTimeMs,
    costUsd: res1.estimatedCostUsd,
    outputUrl: res1.outputUrl,
    qa: res1.qaResult,
  });

  console.log('Kitchen 2 Result:', {
    model: res2.modelName,
    timeMs: res2.generationTimeMs,
    costUsd: res2.estimatedCostUsd,
    outputUrl: res2.outputUrl,
    qa: res2.qaResult,
  });
}

main().catch((err) => {
  console.error('LIVE TEST FAILED:', err);
  process.exit(1);
});
