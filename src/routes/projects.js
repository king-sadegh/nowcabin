const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');
const config = require('../config');
const { db } = require('../db');
const { upload, cleanupFiles } = require('../upload');
const { hashScene } = require('../engine/kitchenSchema');
const { exportKitchenSceneToGLB } = require('../engine/glbExporter');
const { calculateKitchenPricing } = require('../engine/pricingEngine');
const { parseNaturalLanguageToOperations, applyStructuredOperations } = require('../engine/changeEngine');
const { reconstructKitchenFromPhotosAndDimensions } = require('../engine/sceneReconstructor');
const { GLB_DIR, enqueueRenderJob, retryRenderJob } = require('../workers/renderQueue');
const { enqueueGeminiProjectJob } = require('../workers/geminiQueue');
const { getActiveImageModel } = require('../engine/geminiImageEditor');

const router = express.Router();

function computeFileSha256(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function buildTracePayloadFromScene(projectId, versionNum, sceneHash, scene, cvAnalysis) {
  const generatedModelId = `proj${projectId}_v${versionNum}_${sceneHash}`;
  const detectedLayout = scene.dimensions?.layoutType || cvAnalysis?.reconciled?.layoutHint || '';
  const detectedCabinets = (scene.cabinets || []).map((c) => ({
    id: c.id,
    kind: c.kind,
    row: c.row,
    width: c.size?.width,
    position: c.position,
    doorsCount: c.doors?.length || 0,
  }));
  const detectedAppliances = (scene.appliances || []).map((a) => ({
    id: a.id,
    type: a.type,
    position: a.position,
  }));
  const detectedDimensions = {
    width: scene.dimensions?.width,
    depth: scene.dimensions?.depth,
    ceilingHeight: scene.dimensions?.ceilingHeight,
    layoutType: scene.dimensions?.layoutType,
  };
  const sceneParameters = {
    source: scene.metadata?.source,
    cabinetCount: scene.cabinets?.length || 0,
    openingsCount: scene.openings?.length || 0,
    upperColor: scene.materials?.upperColor,
    lowerColor: scene.materials?.lowerColor,
    countertopId: scene.materials?.countertopId,
    backsplashId: scene.materials?.backsplashId,
    underCabinetLed: Boolean(scene.lighting?.underCabinetLed),
  };
  return {
    generatedModelId,
    detectedLayout,
    detectedCabinets,
    detectedAppliances,
    detectedDimensions,
    sceneParameters,
  };
}

function buildStructuredOpsFromRequestBody(body = {}, existingScene = null) {
  const ops = [];
  if (body.paletteHex || body.paletteName || body.paletteUpperHex || body.paletteLowerHex) {
    ops.push({
      op: 'change_cabinet_color',
      target: 'all',
      upperColor: body.paletteUpperHex || body.paletteHex,
      lowerColor: body.paletteLowerHex || body.paletteHex,
      label: body.paletteName || 'رنگ انتخابی از کالیته',
    });
  }
  if (body.handleId) {
    ops.push({ op: 'change_handle', handleId: body.handleId });
  }
  if (body.countertopId) {
    ops.push({ op: 'change_countertop', countertopId: body.countertopId });
  }
  if (body.backsplashId) {
    ops.push({ op: 'change_backsplash', backsplashId: body.backsplashId });
  }
  if (body.extendUpperToCeiling === true || body.extendUpperToCeiling === 'true') {
    ops.push({ op: 'extend_upper_to_ceiling' });
  }
  if (body.addCoffeeBar === true || body.addCoffeeBar === 'true') {
    ops.push({ op: 'add_coffee_bar', placementHint: 'right_of_fridge' });
  } else if ((body.addCoffeeBar === false || body.addCoffeeBar === 'false') && existingScene?.coffeeBars?.some((c) => c.id === 'cb_main')) {
    ops.push({ op: 'remove_component', componentId: 'cb_main' });
  }
  if (body.addIsland === true || body.addIsland === 'true') {
    ops.push({ op: 'add_island' });
  } else if ((body.addIsland === false || body.addIsland === 'false') && existingScene?.islands?.some((i) => i.id === 'island_main')) {
    ops.push({ op: 'remove_component', componentId: 'island_main' });
  }
  if (body.addLighting === true || body.addLighting === 'true') {
    ops.push({ op: 'add_lighting', underCabinetLed: true });
  } else if ((body.addLighting === false || body.addLighting === 'false') && existingScene?.lighting?.underCabinetLed === true) {
    ops.push({ op: 'add_lighting', underCabinetLed: false });
  }
  if (body.changeText) {
    ops.push(...parseNaturalLanguageToOperations(body.changeText));
  }
  if (Array.isArray(body.operations)) {
    ops.push(...body.operations);
  }
  return ops;
}

function saveSceneVersionAndGLB(projectId, versionNum, scene, { changeRequestText = '', operations = [], cvAnalysis = null } = {}) {
  const sceneHash = hashScene(scene);
  const { glbBuffer } = exportKitchenSceneToGLB(scene);
  const glbFilename = `proj${projectId}-v${versionNum}-${sceneHash}.glb`;
  const glbAbsPath = path.join(GLB_DIR, glbFilename);
  fs.writeFileSync(glbAbsPath, glbBuffer);
  const glbPublicUrl = `/uploads/glb/${glbFilename}`;

  const pricing = calculateKitchenPricing(scene);

  db.prepare(
    `INSERT INTO kitchen_scene_versions (
       project_id, version_num, scene_hash, scene_json, validation_json,
       change_request_text, operations_json, glb_path, pricing_json
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    projectId,
    versionNum,
    sceneHash,
    JSON.stringify(scene),
    JSON.stringify(scene.validation || {}),
    changeRequestText,
    JSON.stringify(operations),
    glbPublicUrl,
    JSON.stringify(pricing)
  );

  const trace = buildTracePayloadFromScene(projectId, versionNum, sceneHash, scene, cvAnalysis);
  db.prepare(
    `UPDATE kitchen_projects
     SET current_version = ?,
         detected_kitchen_layout = ?,
         detected_cabinets_json = ?,
         detected_appliances_json = ?,
         detected_dimensions_json = ?,
         scene_parameters_json = ?,
         generated_model_id = ?,
         updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    versionNum,
    trace.detectedLayout,
    JSON.stringify(trace.detectedCabinets),
    JSON.stringify(trace.detectedAppliances),
    JSON.stringify(trace.detectedDimensions),
    JSON.stringify(trace.sceneParameters),
    trace.generatedModelId,
    projectId
  );

  return { sceneHash, glbUrl: glbPublicUrl, pricing, trace };
}

function formatProjectResponse(projectRow) {
  const photos = JSON.parse(projectRow.customer_photos_json || '[]');
  const dimensions = JSON.parse(projectRow.dimensions_json || '{}');
  const cvAnalysis = projectRow.cv_analysis_json ? JSON.parse(projectRow.cv_analysis_json) : null;
  const missingDimensions = JSON.parse(projectRow.missing_dimensions_json || '[]');
  const processingSteps = JSON.parse(projectRow.processing_steps_json || '[]');

  const latestVersion = db
    .prepare(`SELECT * FROM kitchen_scene_versions WHERE project_id = ? AND version_num = ?`)
    .get(projectRow.id, projectRow.current_version);

  const latestJob = db
    .prepare(`SELECT * FROM render_jobs WHERE project_id = ? ORDER BY id DESC LIMIT 1`)
    .get(projectRow.id);

  const versions = db
    .prepare(`SELECT version_num, scene_hash, change_request_text, glb_path, pricing_json, created_at FROM kitchen_scene_versions WHERE project_id = ? ORDER BY version_num DESC`)
    .all(projectRow.id)
    .map((v) => ({
      versionNum: v.version_num,
      sceneHash: v.scene_hash,
      changeRequestText: v.change_request_text,
      glbUrl: v.glb_path,
      pricing: JSON.parse(v.pricing_json || '{}'),
      createdAt: v.created_at,
    }));

  const processingTrace = {
    project_id: projectRow.id,
    uploaded_image_ids: JSON.parse(projectRow.uploaded_image_ids_json || '[]'),
    uploaded_image_hashes: JSON.parse(projectRow.uploaded_image_hashes_json || '[]'),
    image_analysis_result: cvAnalysis?.reconciled || null,
    detected_kitchen_layout: projectRow.detected_kitchen_layout || '',
    detected_cabinets: JSON.parse(projectRow.detected_cabinets_json || '[]'),
    detected_appliances: JSON.parse(projectRow.detected_appliances_json || '[]'),
    detected_dimensions: JSON.parse(projectRow.detected_dimensions_json || '{}'),
    scene_parameters: JSON.parse(projectRow.scene_parameters_json || '{}'),
    generated_model_id: projectRow.generated_model_id || '',
    model_version: projectRow.current_version,
    render_job_id: latestJob?.id || null,
    output_image_paths: JSON.parse(projectRow.output_image_paths_json || '[]'),
  };

  return {
    ok: true,
    project: {
      id: projectRow.id,
      title: projectRow.title,
      status: projectRow.status,
      photos,
      dimensions,
      cvAnalysis,
      missingDimensions,
      currentVersion: projectRow.current_version,
      validation: latestVersion ? JSON.parse(latestVersion.validation_json || '{}') : null,
      pricing: latestVersion ? JSON.parse(latestVersion.pricing_json || '{}') : null,
      glbUrl: latestVersion?.glb_path || null,
      processingSteps,
      processingTrace,
      job: latestJob
        ? {
            id: latestJob.id,
            status: latestJob.status,
            stepLabel: latestJob.step_label,
            attempts: latestJob.attempts,
            errorMessage: latestJob.error_message || '',
            renders: JSON.parse(latestJob.renders_json || '[]'),
          }
        : null,
      versions,
      createdAt: projectRow.created_at,
      updatedAt: projectRow.updated_at,
    },
  };
}

// POST /api/projects — Upload up to 3 photos + dimensions + optional initial changes
router.post('/', upload.array('photos', 3), async (req, res) => {
  const files = req.files || [];
  try {
    if (files.length === 0) {
      return res.status(400).json({
        error: 'برای ساخت مدل اختصاصی آشپزخانه، لطفاً حداقل ۱ عکس واقعی از آشپزخانه خود بارگذاری کنید.',
      });
    }

    let dimsInput = {};
    if (req.body?.dimensions) {
      dimsInput = typeof req.body.dimensions === 'string' ? JSON.parse(req.body.dimensions) : req.body.dimensions;
    } else {
      dimsInput = {
        wallLengthMeters: req.body?.wallLengthMeters,
        sideWallMeters: req.body?.sideWallMeters,
        ceilingHeightMeters: req.body?.ceilingHeightMeters,
        layoutType: req.body?.layoutType || undefined,
        fridgePosition: req.body?.fridgePosition || undefined,
        sinkPosition: req.body?.sinkPosition || undefined,
        stovePosition: req.body?.stovePosition || undefined,
        hasWindow: req.body?.hasWindow === 'true' || req.body?.hasWindow === true,
        condition: req.body?.condition || 'MDF / چوب سالم',
      };
    }

    const imagePaths = files.map((f) => f.path);
    const uploadedImageIds = files.map((f) => f.filename);
    const uploadedImageHashes = files.map((f) => computeFileSha256(f.path));
    const savedPhotos = files.map((f, idx) => ({
      id: uploadedImageIds[idx],
      hash: uploadedImageHashes[idx],
      url: `/uploads/${f.filename}`,
      absPath: f.path,
      originalName: f.originalname,
      sizeKB: Math.round(f.size / 1024),
    }));

    const processingSteps = [
      { key: 'receive_photos', label: 'دریافت تصاویر', status: 'completed', detail: `${files.length} تصویر دریافت شد`, at: new Date().toISOString() },
    ];

    const recon = await reconstructKitchenFromPhotosAndDimensions({
      imagePaths,
      dimensionsInput: dimsInput,
    });

    processingSteps.push(
      {
        key: 'analyze_kitchen',
        label: 'تحلیل آشپزخانه',
        status: recon.cvAnalysis?.ok ? 'completed' : 'failed',
        detail: recon.cvAnalysis?.ok
          ? `تشخیص ${recon.cvAnalysis.reconciled?.estimatedCabinetBays || 0} دهنه کابینت و نور ${recon.cvAnalysis.reconciled?.lightingTone || 'طبیعی'}`
          : 'تحلیل تصویر ناموفق بود',
        at: new Date().toISOString(),
      },
      {
        key: 'extract_layout',
        label: 'استخراج چیدمان',
        status: 'completed',
        detail: `چیدمان: ${recon.scene?.dimensions?.layoutType || dimsInput.layoutType || recon.cvAnalysis?.reconciled?.layoutHint || 'نامشخص'}`,
        at: new Date().toISOString(),
      }
    );

    if (!recon.approved) {
      processingSteps.push(
        { key: 'build_3d_model', label: 'ساخت مدل سه‌بعدی', status: 'waiting', detail: 'نیازمند تکمیل ابعاد اصلی', at: new Date().toISOString() },
        { key: 'validate_model', label: 'بررسی صحت مدل', status: 'waiting', detail: 'در انتظار تکمیل ابعاد', at: new Date().toISOString() },
        { key: 'final_renders', label: 'تولید تصاویر نهایی', status: 'waiting', detail: 'در انتظار تایید مدل', at: new Date().toISOString() }
      );
    }

    const projInsert = db
      .prepare(
        `INSERT INTO kitchen_projects (
           user_id, title, status, customer_photos_json, uploaded_image_ids_json, uploaded_image_hashes_json,
           dimensions_json, cv_analysis_json, missing_dimensions_json, processing_steps_json
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        req.user?.id || null,
        String(req.body?.title || 'پروژه بازسازی آشپزخانه').trim(),
        recon.approved ? 'validated' : 'needs_dimensions',
        JSON.stringify(savedPhotos),
        JSON.stringify(uploadedImageIds),
        JSON.stringify(uploadedImageHashes),
        JSON.stringify(dimsInput),
        recon.cvAnalysis ? JSON.stringify(recon.cvAnalysis) : null,
        JSON.stringify(recon.missingDimensions || []),
        JSON.stringify(processingSteps)
      );

    const projectId = Number(projInsert.lastInsertRowid);

    if (!recon.approved) {
      return res.status(200).json({
        ok: true,
        projectId,
        needsClarification: true,
        missingDimensions: recon.missingDimensions,
        clarificationQuestions: recon.clarificationQuestions,
        cvAnalysis: recon.cvAnalysis,
        processingSteps,
        message: 'لطفاً اندازه دقیق موارد مشخص‌شده را وارد کنید تا مدل سه‌بعدی با اطمینان ساخته شود.',
      });
    }

    let finalScene = recon.scene;
    let opsApplied = [];
    let changeNote = String(req.body?.changeText || '');
    const initialOps = buildStructuredOpsFromRequestBody(req.body);
    let alternatives = [];
    let rejected = [];

    if (initialOps.length > 0) {
      const mutRes = applyStructuredOperations(finalScene, initialOps);
      finalScene = mutRes.scene;
      opsApplied = mutRes.applied;
      alternatives = mutRes.alternatives;
      rejected = mutRes.rejected;
    }

    processingSteps.push(
      {
        key: 'build_3d_model',
        label: 'ساخت مدل سه‌بعدی',
        status: 'completed',
        detail: `${finalScene.cabinets.length} یونیت کابینت و ${finalScene.appliances.length} تجهیز`,
        at: new Date().toISOString(),
      },
      {
        key: 'validate_model',
        label: 'بررسی صحت مدل',
        status: finalScene.validation?.approved ? 'completed' : 'failed',
        detail: finalScene.validation?.approved ? 'کنترل هندسی و عدم تداخل تایید شد' : 'خطا در کنترل هندسی',
        at: new Date().toISOString(),
      }
    );

    db.prepare(`UPDATE kitchen_projects SET processing_steps_json = ? WHERE id = ?`).run(
      JSON.stringify(processingSteps),
      projectId
    );

    const { sceneHash, glbUrl, pricing, trace } = saveSceneVersionAndGLB(projectId, 1, finalScene, {
      changeRequestText: changeNote,
      operations: initialOps,
      cvAnalysis: recon.cvAnalysis,
    });

    const job = enqueueRenderJob({ projectId, versionNum: 1, sceneHash });
    const updatedRow = db.prepare('SELECT processing_steps_json, output_image_paths_json FROM kitchen_projects WHERE id = ?').get(projectId);

    res.status(201).json({
      ok: true,
      projectId,
      needsClarification: false,
      approved: true,
      version: 1,
      sceneHash,
      glbUrl,
      pricing,
      validation: finalScene.validation,
      cvAnalysis: recon.cvAnalysis,
      appliedChanges: opsApplied,
      rejectedChanges: rejected,
      alternatives,
      processingSteps: JSON.parse(updatedRow?.processing_steps_json || '[]'),
      processingTrace: {
        ...trace,
        project_id: projectId,
        uploaded_image_ids: uploadedImageIds,
        uploaded_image_hashes: uploadedImageHashes,
        model_version: 1,
        render_job_id: job.id,
        output_image_paths: JSON.parse(updatedRow?.output_image_paths_json || '[]'),
      },
      job: {
        id: job.id,
        status: job.status,
        stepLabel: job.step_label,
        renders: JSON.parse(job.renders_json || '[]'),
      },
    });
  } catch (err) {
    cleanupFiles(files);
    res.status(400).json({ error: err.message || 'خطا در ایجاد پروژه هوشمند آشپزخانه.' });
  }
});

// POST /api/projects/:id/dimensions — Supply missing dimensions & auto-construct model
router.post('/:id/dimensions', async (req, res) => {
  try {
    const projectId = Number(req.params.id);
    const project = db.prepare('SELECT * FROM kitchen_projects WHERE id = ?').get(projectId);
    if (!project) return res.status(404).json({ error: 'پروژه یافت نشد.' });

    const prevDims = JSON.parse(project.dimensions_json || '{}');
    const mergedDims = { ...prevDims, ...(req.body || {}) };
    const photos = JSON.parse(project.customer_photos_json || '[]');
    const imagePaths = photos.map((p) => p.absPath).filter((p) => p && fs.existsSync(p));

    const recon = await reconstructKitchenFromPhotosAndDimensions({
      imagePaths,
      dimensionsInput: mergedDims,
      sceneId: `proj_${projectId}`,
    });

    db.prepare(
      `UPDATE kitchen_projects SET dimensions_json = ?, missing_dimensions_json = ?, status = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(
      JSON.stringify(mergedDims),
      JSON.stringify(recon.missingDimensions || []),
      recon.approved ? 'validated' : 'needs_dimensions',
      projectId
    );

    if (!recon.approved) {
      return res.json({
        ok: true,
        projectId,
        needsClarification: true,
        missingDimensions: recon.missingDimensions,
        clarificationQuestions: recon.clarificationQuestions,
      });
    }

    const nextVer = (project.current_version || 0) + 1;
    const { sceneHash, glbUrl, pricing } = saveSceneVersionAndGLB(projectId, nextVer, recon.scene, {
      changeRequestText: 'تکمیل ابعاد و ساخت مدل تاییدشده',
    });
    const job = enqueueRenderJob({ projectId, versionNum: nextVer, sceneHash });

    res.json({
      ok: true,
      projectId,
      needsClarification: false,
      approved: true,
      version: nextVer,
      sceneHash,
      glbUrl,
      pricing,
      job: {
        id: job.id,
        status: job.status,
        stepLabel: job.step_label,
        renders: JSON.parse(job.renders_json || '[]'),
      },
    });
  } catch (err) {
    res.status(400).json({ error: err.message || 'خطا در ثبت ابعاد جدید.' });
  }
});

// POST /api/projects/:id/changes — Apply natural language or palette/addon renovation changes cleanly
router.post('/:id/changes', (req, res) => {
  try {
    const projectId = Number(req.params.id);
    const project = db.prepare('SELECT * FROM kitchen_projects WHERE id = ?').get(projectId);
    if (!project) return res.status(404).json({ error: 'پروژه یافت نشد.' });

    const latestVersion = db
      .prepare(`SELECT * FROM kitchen_scene_versions WHERE project_id = ? AND version_num = ?`)
      .get(projectId, project.current_version);
    if (!latestVersion) {
      return res.status(400).json({ error: 'ابتدا باید مدل هندسی پروژه با ابعاد کامل ساخته شود.' });
    }

    const baseScene = JSON.parse(latestVersion.scene_json);
    const ops = buildStructuredOpsFromRequestBody(req.body || {}, baseScene);
    if (ops.length === 0) {
      return res.status(400).json({ error: 'هیچ تغییر معتبری از درخواست شما استخراج نشد؛ لطفاً تغییر مدنظر را واضح‌تر بنویسید یا از کالیته انتخاب کنید.' });
    }

    const mutRes = applyStructuredOperations(baseScene, ops);
    if (!mutRes.report.valid) {
      return res.status(400).json({
        error: 'تغییرات درخواستی با محدودیت‌های هندسی آشپزخانه تداخل دارد.',
        errors: mutRes.report.errors,
        rejected: mutRes.rejected,
        alternatives: mutRes.alternatives,
      });
    }

    const nextVer = project.current_version + 1;
    const { sceneHash, glbUrl, pricing } = saveSceneVersionAndGLB(projectId, nextVer, mutRes.scene, {
      changeRequestText: String(req.body?.changeText || req.body?.paletteName || ''),
      operations: ops,
    });

    const job = enqueueRenderJob({ projectId, versionNum: nextVer, sceneHash });

    res.json({
      ok: true,
      projectId,
      version: nextVer,
      sceneHash,
      glbUrl,
      pricing,
      layoutPreserved: mutRes.layoutPreserved,
      appliedChanges: mutRes.applied,
      rejectedChanges: mutRes.rejected,
      alternatives: mutRes.alternatives,
      job: {
        id: job.id,
        status: job.status,
        stepLabel: job.step_label,
        renders: JSON.parse(job.renders_json || '[]'),
      },
    });
  } catch (err) {
    res.status(400).json({ error: err.message || 'خطا در اعمال تغییرات.' });
  }
});

// POST /api/projects/:id/retry — Retry failed render job
router.post('/:id/retry', (req, res) => {
  const projectId = Number(req.params.id);
  const job = retryRenderJob(projectId);
  if (!job) return res.status(404).json({ error: 'کاری برای تلاش مجدد یافت نشد.' });
  res.json({
    ok: true,
    job: {
      id: job.id,
      status: job.status,
      stepLabel: job.step_label,
    },
  });
});

// GET /api/projects/gemini/config — Non-sensitive status of Gemini Image Editing engine
router.get('/gemini/config', (req, res) => {
  const configured = Boolean(process.env.GEMINI_API_KEY || config.GEMINI_API_KEY);
  res.json({
    ok: true,
    configured,
    activeModel: getActiveImageModel(),
    supportedModels: config.GEMINI_SUPPORTED_IMAGE_MODELS,
  });
});

// POST /api/projects/gemini-edit — Upload 1-3 real kitchen photos & edit each via Google Gemini (Nano Banana)
router.post('/gemini-edit', upload.array('photos', 3), async (req, res) => {
  const files = req.files || [];
  try {
    const apiKey = process.env.GEMINI_API_KEY || config.GEMINI_API_KEY;
    if (!apiKey) {
      cleanupFiles(files);
      return res.status(503).json({
        error: 'کلید GEMINI_API_KEY در تنظیمات سرور وارد نشده است. لطفاً کلید API را در Environment سرور تنظیم کنید.',
        missingApiKey: true,
      });
    }

    if (files.length === 0) {
      return res.status(400).json({
        error: 'لطفاً حداقل ۱ عکس واقعی از آشپزخانه خود بارگذاری کنید.',
      });
    }

    const uploadedImageIds = files.map((f) => f.filename);
    const uploadedImageHashes = files.map((f) => computeFileSha256(f.path));
    const savedPhotos = files.map((f, idx) => ({
      id: uploadedImageIds[idx],
      hash: uploadedImageHashes[idx],
      url: `/uploads/${f.filename}`,
      absPath: f.path,
      originalName: f.originalname,
      sizeKB: Math.round(f.size / 1024),
    }));

    const options = {
      cabinetColor: req.body?.cabinetColor || 'cream',
      cabinetColorHex: req.body?.cabinetColorHex || '',
      upperColor: req.body?.upperColor || '',
      upperColorHex: req.body?.upperColorHex || '',
      lowerColor: req.body?.lowerColor || '',
      lowerColorHex: req.body?.lowerColorHex || '',
      materialType: req.body?.materialType || 'Satin/Matte architectural polyurethane cabinet paint',
      countertopMaterial: req.body?.countertopMaterial || 'unchanged',
      handleStyle: req.body?.handleStyle || 'unchanged',
      designStyle: req.body?.designStyle || 'modern',
      changeBacksplash: req.body?.changeBacksplash === 'true' || req.body?.changeBacksplash === true,
      addCoffeeBar: req.body?.addCoffeeBar === 'true' || req.body?.addCoffeeBar === true,
      customRequests: req.body?.customRequests || '',
    };

    const modelOverride = req.body?.modelName || undefined;

    const projInsert = db
      .prepare(
        `INSERT INTO kitchen_projects (
           user_id, title, status, customer_photos_json, uploaded_image_ids_json, uploaded_image_hashes_json,
           scene_parameters_json, processing_steps_json
         ) VALUES (?, ?, 'gemini_queued', ?, ?, ?, ?, ?)`
      )
      .run(
        req.user?.id || null,
        String(req.body?.title || 'بازسازی تصویری با Gemini Nano Banana').trim(),
        JSON.stringify(savedPhotos),
        JSON.stringify(uploadedImageIds),
        JSON.stringify(uploadedImageHashes),
        JSON.stringify({ mode: 'gemini_image_editing', model: getActiveImageModel(modelOverride), options }),
        JSON.stringify([
          { key: 'receive_photos', label: 'دریافت تصاویر', status: 'completed', detail: `${files.length} تصویر دریافت شد` },
          { key: 'analyze_kitchen', label: 'تحلیل تصویر با Gemini', status: 'in_progress', detail: 'در صف پردازش...' },
          { key: 'gemini_edit', label: 'ویرایش فوتورئال Nano Banana', status: 'waiting', detail: '' },
          { key: 'qa_check', label: 'کنترل کیفیت حفظ ساختار', status: 'waiting', detail: '' },
        ])
      );

    const projectId = Number(projInsert.lastInsertRowid);
    enqueueGeminiProjectJob({ projectId, photos: savedPhotos, options, modelOverride });

    res.status(202).json({
      ok: true,
      projectId,
      status: 'gemini_queued',
      activeModel: getActiveImageModel(modelOverride),
      photos: savedPhotos.map((p) => ({ id: p.id, url: p.url })),
    });
  } catch (err) {
    cleanupFiles(files);
    res.status(400).json({ error: err.message || 'خطا در شروع پردازش تصویر با Gemini.' });
  }
});

// GET /api/projects/:id — Poll project state, job progress, multi-angle renders, and pricing
router.get('/:id', (req, res) => {
  const projectId = Number(req.params.id);
  const project = db.prepare('SELECT * FROM kitchen_projects WHERE id = ?').get(projectId);
  if (!project) return res.status(404).json({ error: 'پروژه یافت نشد.' });
  res.json(formatProjectResponse(project));
});

module.exports = router;
