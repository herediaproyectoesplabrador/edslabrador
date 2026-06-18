export function installTexturedModelPicking({
	viewer,
	THREE,
	modelName = "Modelo texturizado",
	preferPointcloud = true
} = {}) {
	if (!viewer || !THREE || !window.Potree?.Utils?.getMousePointCloudIntersection) {
		console.warn("JBC textured model picking was not installed: missing viewer, THREE, or Potree.Utils.");
		return null;
	}

	const utils = window.Potree.Utils;
	const installed = utils.__jbcTexturedModelPicking;
	if (installed) {
		return installed;
	}

	const originalGetIntersection = utils.getMousePointCloudIntersection.bind(utils);
	const cameraPosition = new THREE.Vector3();
	const raycaster = new THREE.Raycaster();

	function getVisiblePointclouds(pointclouds = []) {
		return pointclouds.filter(pointcloud => pointcloud?.visible !== false);
	}

	function isMeasurementMarkerDrag(activeViewer) {
		const dragObject = activeViewer?.inputHandler?.drag?.object;
		if (!dragObject) return false;

		const scene = activeViewer.scene;
		const measurements = scene?.measurements || [];
		const profiles = scene?.profiles || [];

		return measurements.some(measure => measure.spheres?.includes(dragObject))
			|| profiles.some(profile => profile.spheres?.includes(dragObject));
	}

	function isMaterialVisible(material) {
		if (Array.isArray(material)) {
			return material.some(item => item?.visible !== false);
		}

		return material?.visible !== false;
	}

	function collectVisibleMeshes(group) {
		const meshes = [];

		group.traverse(object => {
			if (!object.isMesh || object.visible === false || !isMaterialVisible(object.material)) {
				return;
			}

			meshes.push(object);
		});

		return meshes;
	}

	function getTexturedModelIntersection(mouse, camera, activeViewer) {
		const renderer = activeViewer?.renderer;
		const domElement = renderer?.domElement;
		const scene = activeViewer?.scene?.scene;
		const group = scene?.getObjectByName(modelName);

		if (!mouse || !camera || !domElement || !group || group.visible === false) {
			return null;
		}

		group.updateMatrixWorld(true);

		const meshes = collectVisibleMeshes(group);
		if (meshes.length === 0) {
			return null;
		}

		const normalizedMouse = {
			x: (mouse.x / domElement.clientWidth) * 2 - 1,
			y: -(mouse.y / domElement.clientHeight) * 2 + 1
		};

		raycaster.setFromCamera(normalizedMouse, camera);

		const intersections = raycaster.intersectObjects(meshes, true);
		const intersection = intersections.find(hit => hit?.object?.visible !== false);
		if (!intersection) {
			return null;
		}

		const location = intersection.point.clone();
		camera.getWorldPosition(cameraPosition);

		return {
			location,
			distance: cameraPosition.distanceTo(location),
			pointcloud: null,
			point: {
				position: location.clone()
			}
		};
	}

	function patchedGetMousePointCloudIntersection(mouse, camera, activeViewer, pointclouds = null, params = {}) {
		const currentViewer = activeViewer || viewer;
		const currentPointclouds = getVisiblePointclouds(pointclouds ?? currentViewer?.scene?.pointclouds ?? []);
		const pointcloudHit = currentPointclouds.length > 0
			? originalGetIntersection(mouse, camera, currentViewer, currentPointclouds, params)
			: null;

		if (pointcloudHit && preferPointcloud) {
			return pointcloudHit;
		}

		if (!isMeasurementMarkerDrag(currentViewer)) {
			return pointcloudHit;
		}

		const meshHit = getTexturedModelIntersection(mouse, camera, currentViewer);
		if (!pointcloudHit || !meshHit) {
			return pointcloudHit || meshHit;
		}

		return meshHit.distance < pointcloudHit.distance ? meshHit : pointcloudHit;
	}

	const api = {
		modelName,
		preferPointcloud,
		originalGetIntersection,
		restore() {
			utils.getMousePointCloudIntersection = originalGetIntersection;
			delete utils.__jbcTexturedModelPicking;
		}
	};

	utils.getMousePointCloudIntersection = patchedGetMousePointCloudIntersection;
	utils.__jbcTexturedModelPicking = api;

	return api;
}
