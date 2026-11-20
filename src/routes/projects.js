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

const router = express.Router();

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

function saveSceneVersionAndGLB(projectId, versionNum, scene, { changeRequestText = '', operations = [] } = {}) {
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

  db.prepare(`UPDATE kitchen_projects SET current_version = ?, updated_at = datetime('now') WHERE id = ?`).run(
    versionNum,
    projectId
  );

  return { sceneHash, glbUrl: glbPublicUrl, pricing };
}

function formatProjectResponse(projectRow) {
  const photos = JSON.parse(projectRow.customer_photos_json || '[]');
  const dimensions = JSON.parse(projectRow.dimensions_json || '{}');
  const cvAnalysis = projectRow.cv_analysis_json ? JSON.parse(projectRow.cv_analysis_json) : null;
  const missingDimensions = JSON.parse(projectRow.missing_dimensions_json || '[]');

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
    let dimsInput = {};
    if (req.body?.dimensions) {
      dimsInput = typeof req.body.dimensions === 'string' ? JSON.parse(req.body.dimensions) : req.body.dimensions;
    } else {
      dimsInput = {
        wallLengthMeters: req.body?.wallLengthMeters,
        sideWallMeters: req.body?.sideWallMeters,
        ceilingHeightMeters: req.body?.ceilingHeightMeters,
        layoutType: req.body?.layoutType || 'l_shape',
        fridgePosition: req.body?.fridgePosition || 'left',
        condition: req.body?.condition || 'MDF / چوب سالم',
      };
    }

    const imagePaths = files.map((f) => f.path);
    const savedPhotos = files.map((f) => ({
      url: `/uploads/${f.filename}`,
      absPath: f.path,
      originalName: f.originalname,
      sizeKB: Math.round(f.size / 1024),
    }));

    const recon = await reconstructKitchenFromPhotosAndDimensions({
      imagePaths,
      dimensionsInput: dimsInput,
    });

    const projInsert = db
      .prepare(
        `INSERT INTO kitchen_projects (
           user_id, title, status, customer_photos_json, dimensions_json,
           cv_analysis_json, missing_dimensions_json
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        req.user?.id || null,
        String(req.body?.title || 'پروژه بازسازی آشپزخانه').trim(),
        recon.approved ? 'validated' : 'needs_dimensions',
        JSON.stringify(savedPhotos),
        JSON.stringify(dimsInput),
        recon.cvAnalysis ? JSON.stringify(recon.cvAnalysis) : null,
        JSON.stringify(recon.missingDimensions || [])
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

    const { sceneHash, glbUrl, pricing } = saveSceneVersionAndGLB(projectId, 1, finalScene, {
      changeRequestText: changeNote,
      operations: initialOps,
    });

    const job = enqueueRenderJob({ projectId, versionNum: 1, sceneHash });

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

// GET /api/projects/:id — Poll project state, job progress, multi-angle renders, and pricing
router.get('/:id', (req, res) => {
  const projectId = Number(req.params.id);
  const project = db.prepare('SELECT * FROM kitchen_projects WHERE id = ?').get(projectId);
  if (!project) return res.status(404).json({ error: 'پروژه یافت نشد.' });
  res.json(formatProjectResponse(project));
});

module.exports = router;
