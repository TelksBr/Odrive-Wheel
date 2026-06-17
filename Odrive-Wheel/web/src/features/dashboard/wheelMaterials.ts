import * as THREE from 'three';
import type { WheelRenderSettings } from './wheelRenderQuality';

const TEXTURE_BASES = [
  '/models/wheel/textures/',
  '/models/textures/',
];

interface MaterialPreset {
  color: number;
  metalness: number;
  roughness: number;
  envMapIntensity: number;
}

const PRESETS: Record<string, MaterialPreset> = {
  'Material.001': { color: 0x3a3a42, metalness: 0.82, roughness: 0.38, envMapIntensity: 1.0 },
  'Material.002': { color: 0x0c0c10, metalness: 0.2, roughness: 0.28, envMapIntensity: 0.55 },
  'Material.003': { color: 0x52525c, metalness: 0.9, roughness: 0.32, envMapIntensity: 1.05 },
  'Material.004': { color: 0x888890, metalness: 0.05, roughness: 0.72, envMapIntensity: 0.45 },
};

const DEFAULT_PRESET: MaterialPreset = {
  color: 0x6a6a72,
  metalness: 0.25,
  roughness: 0.5,
  envMapIntensity: 0.4,
};

type MapKind = 'BaseColor' | 'Normal' | 'Roughness' | 'Metallic';

interface MaterialQualityOptions {
  maxAnisotropy: number;
  normalScale: number;
}

const DEFAULT_QUALITY: MaterialQualityOptions = {
  maxAnisotropy: 4,
  normalScale: 1,
};

function presetFor(name: string): MaterialPreset {
  return PRESETS[name] ?? DEFAULT_PRESET;
}

function textureCandidates(materialName: string, kind: MapKind): string[] {
  const stem = `OMPDIREKSYON_${materialName}_${kind}`;
  const names = [`${stem}.png`, `${stem}.jpg`, `${stem}.jpeg`];
  return TEXTURE_BASES.flatMap((base) => names.map((name) => `${base}${name}`));
}

function configureTexture(tex: THREE.Texture, path: string, maxAnisotropy: number): void {
  tex.colorSpace = kindColorSpace(path);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = maxAnisotropy;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
}

function loadFirstAvailable(
  loader: THREE.TextureLoader,
  paths: string[],
  maxAnisotropy: number,
  onLoad: (tex: THREE.Texture) => void,
): void {
  let index = 0;
  const tryNext = () => {
    if (index >= paths.length) {
      return;
    }
    const path = paths[index++];
    loader.load(
      path,
      (tex) => {
        configureTexture(tex, path, maxAnisotropy);
        onLoad(tex);
      },
      undefined,
      tryNext,
    );
  };
  tryNext();
}

function kindColorSpace(path: string): THREE.ColorSpace {
  if (path.includes('Normal') || path.includes('Roughness') || path.includes('Metallic')) {
    return THREE.NoColorSpace;
  }
  return THREE.SRGBColorSpace;
}

function applyNormalScale(mat: THREE.MeshStandardMaterial, normalScale: number): void {
  if (mat.normalMap) {
    mat.normalScale.set(normalScale, normalScale);
  }
}

function phongToStandard(
  src: THREE.MeshPhongMaterial,
  quality: MaterialQualityOptions,
): THREE.MeshStandardMaterial {
  const preset = presetFor(src.name);
  const dst = new THREE.MeshStandardMaterial({
    name: src.name,
    color: src.map ? new THREE.Color(0xffffff) : new THREE.Color(preset.color),
    map: src.map ?? null,
    normalMap: src.normalMap ?? src.bumpMap ?? null,
    transparent: src.transparent,
    opacity: src.opacity,
    side: src.side,
    metalness: preset.metalness,
    roughness: preset.roughness,
    envMapIntensity: preset.envMapIntensity,
  });
  if (src.normalMap || src.bumpMap) {
    dst.normalScale.copy(src.normalScale);
  }
  applyNormalScale(dst, quality.normalScale);
  if (dst.map) {
    dst.map.colorSpace = THREE.SRGBColorSpace;
    dst.map.anisotropy = quality.maxAnisotropy;
  }
  return dst;
}

function applyPbrMaps(
  mat: THREE.MeshStandardMaterial,
  loader: THREE.TextureLoader,
  quality: MaterialQualityOptions,
): void {
  const name = mat.name;
  if (!name) {
    return;
  }
  const preset = presetFor(name);

  loadFirstAvailable(loader, textureCandidates(name, 'BaseColor'), quality.maxAnisotropy, (tex) => {
    mat.map = tex;
    mat.color.set(0xffffff);
    mat.needsUpdate = true;
  });
  loadFirstAvailable(loader, textureCandidates(name, 'Normal'), quality.maxAnisotropy, (tex) => {
    mat.normalMap = tex;
    applyNormalScale(mat, quality.normalScale);
    mat.needsUpdate = true;
  });
  loadFirstAvailable(loader, textureCandidates(name, 'Roughness'), quality.maxAnisotropy, (tex) => {
    mat.roughnessMap = tex;
    mat.roughness = preset.roughness;
    mat.needsUpdate = true;
  });
  loadFirstAvailable(loader, textureCandidates(name, 'Metallic'), quality.maxAnisotropy, (tex) => {
    mat.metalnessMap = tex;
    mat.metalness = preset.metalness;
    mat.needsUpdate = true;
  });
}

function fallbackMaterial(name: string): THREE.MeshStandardMaterial {
  const preset = presetFor(name);
  return new THREE.MeshStandardMaterial({
    name,
    color: preset.color,
    metalness: preset.metalness,
    roughness: preset.roughness,
    envMapIntensity: preset.envMapIntensity,
  });
}

function upgradeMaterial(
  mat: THREE.Material,
  loader: THREE.TextureLoader,
  quality: MaterialQualityOptions,
): THREE.MeshStandardMaterial {
  if (mat instanceof THREE.MeshPhongMaterial) {
    const upgraded = phongToStandard(mat, quality);
    applyPbrMaps(upgraded, loader, quality);
    return upgraded;
  }

  if (mat instanceof THREE.MeshStandardMaterial) {
    const preset = presetFor(mat.name);
    if (mat.map) {
      mat.color.set(0xffffff);
    } else {
      mat.color.set(preset.color);
    }
    mat.metalness = preset.metalness;
    mat.roughness = preset.roughness;
    mat.envMapIntensity = preset.envMapIntensity;
    applyPbrMaps(mat, loader, quality);
    return mat;
  }

  return fallbackMaterial(mat.name || 'Material');
}

function materialQualityFromSettings(
  settings: WheelRenderSettings,
  maxAnisotropyCap: number,
): MaterialQualityOptions {
  return {
    maxAnisotropy: Math.min(settings.maxAnisotropy, maxAnisotropyCap),
    normalScale: settings.normalScale,
  };
}

/** Upgrade FBX Phong materials to PBR Standard and bind Substance textures when present. */
export function configureWheelMaterials(
  root: THREE.Object3D,
  settings?: WheelRenderSettings,
  maxAnisotropyCap = 8,
): void {
  const quality = settings
    ? materialQualityFromSettings(settings, maxAnisotropyCap)
    : DEFAULT_QUALITY;
  const loader = new THREE.TextureLoader();

  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) {
      return;
    }

    const materials = Array.isArray(child.material) ? child.material : [child.material];
    const upgraded = materials.map((mat) => upgradeMaterial(mat, loader, quality));
    child.material = Array.isArray(child.material) ? upgraded : upgraded[0];
  });
}

/** Re-apply texture filtering / normal strength when render quality changes. */
export function applyWheelRenderQuality(
  root: THREE.Object3D,
  settings: WheelRenderSettings,
  maxAnisotropyCap: number,
): void {
  const quality = materialQualityFromSettings(settings, maxAnisotropyCap);

  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) {
      return;
    }

    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const mat of materials) {
      if (!(mat instanceof THREE.MeshStandardMaterial)) {
        continue;
      }

      applyNormalScale(mat, quality.normalScale);

      for (const tex of [mat.map, mat.normalMap, mat.roughnessMap, mat.metalnessMap]) {
        if (!tex) {
          continue;
        }
        tex.anisotropy = quality.maxAnisotropy;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.needsUpdate = true;
      }
      mat.needsUpdate = true;
    }
  });
}
