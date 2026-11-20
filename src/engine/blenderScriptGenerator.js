// Generates a standalone Blender Cycles Python script (bpy) for production Blender Render Workers
// Consumes the exact same KitchenScene JSON so Blender output matches WebGL PBR & GLB geometry 1:1.

const { COUNTERTOP_MATERIALS, BACKSPLASH_MATERIALS, HANDLE_STYLES } = require('./materials');

function hexToFloatRGB(hex) {
  const clean = String(hex || '#d7cec2').replace('#', '');
  const full = clean.length === 3 ? clean.replace(/(.)/g, '$1$1') : clean;
  const num = parseInt(full, 16) || 0;
  return [
    Number((((num >> 16) & 255) / 255).toFixed(4)),
    Number((((num >> 8) & 255) / 255).toFixed(4)),
    Number(((num & 255) / 255).toFixed(4)),
  ];
}

function generateBlenderCyclesScript(scene, outputDir = '/tmp/blender_renders') {
  const payload = {
    sceneId: scene.sceneId,
    version: scene.version,
    dimensions: scene.dimensions,
    cabinets: scene.cabinets,
    countertops: scene.countertops,
    backsplashes: scene.backsplashes,
    appliances: scene.appliances,
    coffeeBars: scene.coffeeBars,
    islands: scene.islands,
    lighting: scene.lighting,
    cameras: scene.cameras,
    materials: {
      upperRgb: hexToFloatRGB(scene.materials?.upperColor),
      lowerRgb: hexToFloatRGB(scene.materials?.lowerColor),
      counterRgb: hexToFloatRGB((COUNTERTOP_MATERIALS[scene.materials?.countertopId] || COUNTERTOP_MATERIALS.quartz_white_veined).hex),
      backsplashRgb: hexToFloatRGB((BACKSPLASH_MATERIALS[scene.materials?.backsplashId] || BACKSPLASH_MATERIALS.calacatta_slab).hex),
      handleRgb: hexToFloatRGB((HANDLE_STYLES[scene.materials?.handleId] || HANDLE_STYLES.matte_black).hex),
    },
    outputDir,
  };

  return `import bpy
import json
import math
import os

SCENE_DATA = json.loads(r'''${JSON.stringify(payload)}''')

def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def make_principled_mat(name, rgb, roughness=0.35, metallic=0.02):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (rgb[0], rgb[1], rgb[2], 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    return mat

def add_box(name, cx, bottom_y, cz, w, h, d, rot_y, mat):
    # Note: KitchenScene Y-up -> Blender Z-up mapping: (X, Z, Y)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(cx, cz, bottom_y + h / 2.0))
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = (w, d, h)
    obj.rotation_euler = (0.0, 0.0, rot_y)
    obj.data.materials.append(mat)
    return obj

def build_scene():
    clear_scene()
    os.makedirs(SCENE_DATA["outputDir"], exist_ok=True)
    dims = SCENE_DATA["dimensions"]
    W, D, H = dims["width"], dims["depth"], dims["ceilingHeight"]
    mats = SCENE_DATA["materials"]

    mat_wall = make_principled_mat("WallMat", (0.93, 0.90, 0.86), 0.85, 0.0)
    mat_floor = make_principled_mat("FloorMat", (0.80, 0.77, 0.72), 0.45, 0.02)
    mat_upper = make_principled_mat("UpperCabMat", mats["upperRgb"], 0.34, 0.02)
    mat_lower = make_principled_mat("LowerCabMat", mats["lowerRgb"], 0.34, 0.02)
    mat_ct = make_principled_mat("CounterMat", mats["counterRgb"], 0.16, 0.04)
    mat_bs = make_principled_mat("BacksplashMat", mats["backsplashRgb"], 0.18, 0.02)
    mat_handle = make_principled_mat("HandleMat", mats["handleRgb"], 0.35, 0.8)
    mat_steel = make_principled_mat("SteelMat", (0.76, 0.78, 0.80), 0.25, 0.85)
    mat_wood = make_principled_mat("WoodMat", (0.48, 0.32, 0.18), 0.48, 0.02)

    add_box("Floor", W / 2, -0.05, D / 2, W, 0.05, D, 0, mat_floor)
    add_box("Ceiling", W / 2, H, D / 2, W, 0.05, D, 0, mat_wall)
    add_box("WallBack", W / 2, 0, -0.075, W, H, 0.15, 0, mat_wall)
    add_box("WallLeft", -0.075, 0, D / 2, D, H, 0.15, math.pi / 2, mat_wall)
    add_box("WallRight", W + 0.075, 0, D / 2, D, H, 0.15, math.pi / 2, mat_wall)

    for cab in SCENE_DATA.get("cabinets", []):
        cx, cy, cz = cab["position"]
        s = cab["size"]
        m = mat_upper if cab["kind"] == "upper" else mat_lower
        add_box(cab["id"], cx, cy, cz, s["width"], s["height"], s["depth"], cab.get("rotationY", 0), m)

    for ct in SCENE_DATA.get("countertops", []):
        cx, cy, cz = ct["position"]
        s = ct["size"]
        add_box(ct["id"], cx, cy, cz, s["width"], s["height"], s["depth"], ct.get("rotationY", 0), mat_ct)

    for bs in SCENE_DATA.get("backsplashes", []):
        cx, cy, cz = bs["position"]
        s = bs["size"]
        add_box(bs["id"], cx, cy, cz, s["width"], s["height"], s["depth"], bs.get("rotationY", 0), mat_bs)

    for app in SCENE_DATA.get("appliances", []):
        cx, cy, cz = app["position"]
        s = app["size"]
        add_box(app["id"], cx, cy, cz, s["width"], s["height"], s["depth"], app.get("rotationY", 0), mat_steel)

    for cb in SCENE_DATA.get("coffeeBars", []):
        cx, cy, cz = cb["position"]
        s = cb["size"]
        add_box(cb["id"] + "_base", cx, 0, cz, s["width"], 0.86, s["depth"], 0, mat_lower)
        add_box(cb["id"] + "_wood", cx, 0.90, 0.02, s["width"], 1.25, 0.03, 0, mat_wood)

    for isl in SCENE_DATA.get("islands", []):
        cx, cy, cz = isl["position"]
        s = isl["size"]
        add_box(isl["id"] + "_body", cx, 0, cz, s["width"], s["height"] - 0.04, s["depth"] - 0.04, 0, mat_lower)
        add_box(isl["id"] + "_top", cx, s["height"] - 0.04, cz, s["width"] + 0.04, 0.04, s["depth"] + 0.04, 0, mat_ct)

    # Interior area light
    bpy.ops.object.light_add(type='AREA', location=(W / 2, D * 0.45, H - 0.1))
    area = bpy.context.active_object
    area.data.energy = 260
    area.data.size = 2.2

    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 96
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 960

    for cam_spec in SCENE_DATA.get("cameras", []):
        bpy.ops.object.camera_add(location=(cam_spec["position"][0], cam_spec["position"][2], cam_spec["position"][1]))
        cam_obj = bpy.context.active_object
        cam_obj.name = cam_spec["id"]
        target = bpy.data.objects.new(cam_spec["id"] + "_target", None)
        bpy.context.collection.objects.link(target)
        target.location = (cam_spec["target"][0], cam_spec["target"][2], cam_spec["target"][1])
        cns = cam_obj.constraints.new(type='TRACK_TO')
        cns.target = target
        cns.track_axis = 'TRACK_NEGATIVE_Z'
        cns.up_axis = 'UP_Y'
        scene.camera = cam_obj
        scene.render.filepath = os.path.join(SCENE_DATA["outputDir"], cam_spec["id"] + ".png")
        bpy.ops.render.render(write_still=True)

if __name__ == "__main__":
    build_scene()
`;
}

module.exports = {
  generateBlenderCyclesScript,
};
