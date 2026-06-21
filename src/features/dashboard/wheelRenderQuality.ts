export interface WheelRenderSettings {
  maxDpr: number;
  antialias: boolean;
  toneMappingExposure: number;
  environmentIntensity: number;
  maxAnisotropy: number;
  normalScale: number;
  /** PMREM cube size — higher = sharper reflections, more GPU cost. */
  envMapResolution: 256 | 512 | 1024;
}

/** Fixed low-quality preset — fast load, minimal GPU use. */
export const WHEEL_RENDER_SETTINGS: WheelRenderSettings = {
  maxDpr: 1,
  antialias: false,
  toneMappingExposure: 1,
  environmentIntensity: 1,
  maxAnisotropy: 1,
  normalScale: 1,
  envMapResolution: 256,
};
