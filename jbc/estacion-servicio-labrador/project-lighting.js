export function installProjectLighting({ viewer, THREE } = {}) {
  if (!viewer || !THREE) {
    console.warn(
      "JBC project lighting was not installed: missing viewer or THREE.",
    );
    return null;
  }

  const scene = viewer.scene.scene;
  const cameraTarget = new THREE.Vector3();
  const cameraDirection = new THREE.Vector3();

  const hemisphere = new THREE.HemisphereLight(0xffffff, 0x25343a, 2.35);
  hemisphere.name = "JBC model hemisphere light";
  scene.add(hemisphere);

  const ambient = new THREE.AmbientLight(0xffffff, 0.6);
  ambient.name = "JBC model ambient fill";
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(0xffffff, 1.3);
  sun.name = "JBC model fixed key light";
  sun.position.set(492760, 1106460, 1510);
  sun.castShadow = false;
  scene.add(sun);

  const headlightTarget = new THREE.Object3D();
  headlightTarget.name = "JBC model headlight target";
  scene.add(headlightTarget);

  const headlight = new THREE.DirectionalLight(0xffffff, 0.85);
  headlight.name = "JBC model camera headlight";
  headlight.castShadow = false;
  headlight.target = headlightTarget;
  scene.add(headlight);

  function updateHeadlight() {
    const camera = viewer.scene.getActiveCamera();
    if (!camera) return;

    camera.getWorldPosition(cameraTarget);
    camera.getWorldDirection(cameraDirection);

    headlight.position.copy(cameraTarget);
    headlightTarget.position
      .copy(cameraTarget)
      .add(cameraDirection.multiplyScalar(1000));
    headlightTarget.updateMatrixWorld();
  }

  updateHeadlight();
  viewer.addEventListener("update", updateHeadlight);

  return {
    hemisphere,
    ambient,
    sun,
    headlight,
    headlightTarget,
    dispose() {
      viewer.removeEventListener("update", updateHeadlight);
      scene.remove(hemisphere, ambient, sun, headlight, headlightTarget);
    },
  };
}
