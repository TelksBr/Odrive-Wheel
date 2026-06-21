import * as THREE from 'three';

function disposeMaterial(material: THREE.Material | THREE.Material[]): void {
  const materials = Array.isArray(material) ? material : [material];
  for (const mat of materials) {
    for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap'] as const) {
      const tex = (mat as THREE.MeshStandardMaterial)[key];
      tex?.dispose();
    }
    mat.dispose();
  }
}

/** Release GPU buffers for a loaded wheel scene graph. */
export function disposeWheelObject(root: THREE.Object3D): void {
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) {
      return;
    }
    child.geometry?.dispose();
    if (child.material) {
      disposeMaterial(child.material);
    }
  });
}
