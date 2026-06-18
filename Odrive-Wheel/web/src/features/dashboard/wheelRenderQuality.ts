export type WheelRenderQuality = 'low' | 'medium' | 'high' | 'ultra';

export interface WheelRenderSettings {
  id: WheelRenderQuality;
  maxDpr: number;
  antialias: boolean;
  toneMappingExposure: number;
  environmentIntensity: number;
  maxAnisotropy: number;
  normalScale: number;
  /** PMREM cube size — higher = sharper reflections, more GPU cost. */
  envMapResolution: 256 | 512 | 1024;
}

export const WHEEL_QUALITY_PRESETS: Record<WheelRenderQuality, WheelRenderSettings> = {
  low: {
    id: 'low',
    maxDpr: 1,
    antialias: false,
    toneMappingExposure: 1,
    environmentIntensity: 1,
    maxAnisotropy: 1,
    normalScale: 1,
    envMapResolution: 256,
  },
  medium: {
    id: 'medium',
    maxDpr: 1.5,
    antialias: true,
    toneMappingExposure: 1.05,
    environmentIntensity: 1.15,
    maxAnisotropy: 4,
    normalScale: 1,
    envMapResolution: 512,
  },
  high: {
    id: 'high',
    maxDpr: 2,
    antialias: true,
    toneMappingExposure: 1.08,
    environmentIntensity: 1.2,
    maxAnisotropy: 8,
    normalScale: 1.15,
    envMapResolution: 1024,
  },
  ultra: {
    id: 'ultra',
    maxDpr: 2,
    antialias: true,
    toneMappingExposure: 1.1,
    environmentIntensity: 1.28,
    maxAnisotropy: 8,
    normalScale: 1.25,
    envMapResolution: 512,
  },
};

export const WHEEL_QUALITY_ORDER: WheelRenderQuality[] = ['low', 'medium', 'high', 'ultra'];

const STORAGE_KEY = 'odrive-wheel-render-quality';

export function loadWheelRenderQuality(): WheelRenderQuality {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved && saved in WHEEL_QUALITY_PRESETS) {
    return saved as WheelRenderQuality;
  }
  return 'medium';
}

export function saveWheelRenderQuality(quality: WheelRenderQuality): void {
  localStorage.setItem(STORAGE_KEY, quality);
}

export function wheelRenderSettings(quality: WheelRenderQuality): WheelRenderSettings {
  return WHEEL_QUALITY_PRESETS[quality];
}
