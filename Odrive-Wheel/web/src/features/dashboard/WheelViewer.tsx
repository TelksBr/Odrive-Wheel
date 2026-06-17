import { memo, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { PerspectiveCamera } from '@react-three/drei';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import * as THREE from 'three';
import { useAppState } from '../../app/AppState';
import { translate } from '../../i18n/messages';
import { configureWheelMaterials } from './wheelMaterials';
import {
  loadWheelRenderQuality,
  saveWheelRenderQuality,
  WHEEL_QUALITY_ORDER,
  wheelRenderSettings,
  type WheelRenderQuality,
  type WheelRenderSettings,
} from './wheelRenderQuality';

const WHEEL_MODEL = '/models/wheel.fbx';
const WHEEL_TEXTURES = '/models/wheel/textures/';

useLoader.preload(FBXLoader, WHEEL_MODEL, (loader) => {
  loader.setResourcePath(WHEEL_TEXTURES);
});

interface WheelViewerProps {
  positionDegRef: React.MutableRefObject<number | null>;
  connected: boolean;
  height?: number;
}

const BG = new THREE.Color(0x050508);

function WheelEnvironment({ settings }: { settings: WheelRenderSettings }) {
  const { gl, scene } = useThree();

  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    pmrem.compileEquirectangularShader();

    const room = new RoomEnvironment();
    const envMap = pmrem.fromScene(room, 0.04, 0.1, 100, {
      size: settings.envMapResolution,
    }).texture;
    scene.environment = envMap;
    if ('environmentIntensity' in scene) {
      (scene as THREE.Scene & { environmentIntensity: number }).environmentIntensity =
        settings.environmentIntensity;
    }

    room.dispose();

    return () => {
      scene.environment = null;
      envMap.dispose();
      pmrem.dispose();
    };
  }, [gl, scene, settings.envMapResolution, settings.environmentIntensity]);

  return null;
}

function WheelRendererSetup({ settings }: { settings: WheelRenderSettings }) {
  const { gl } = useThree();

  useEffect(() => {
    const dpr = Math.min(window.devicePixelRatio, settings.maxDpr);
    gl.setPixelRatio(dpr);
    gl.toneMappingExposure = settings.toneMappingExposure;
  }, [gl, settings]);

  return null;
}

function WheelMesh({
  positionDegRef,
  settings,
}: {
  positionDegRef: React.MutableRefObject<number | null>;
  settings: WheelRenderSettings;
}) {
  const { gl } = useThree();
  const fbx = useLoader(FBXLoader, WHEEL_MODEL, (loader) => {
    loader.setResourcePath(WHEEL_TEXTURES);
  });
  const groupRef = useRef<THREE.Group>(null);
  const maxAnisotropy = gl.capabilities.getMaxAnisotropy();

  const scale = useMemo(() => {
    fbx.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;

      if (child.geometry instanceof THREE.BufferGeometry) {
        const merged = mergeVertices(child.geometry);
        merged.computeVertexNormals();
        child.geometry = merged;
      }
    });

    const box = new THREE.Box3().setFromObject(fbx);
    const center = box.getCenter(new THREE.Vector3());
    fbx.position.sub(center);
    const size = box.getSize(new THREE.Vector3()).length();
    return size > 0 ? 1.6 / size : 1;
  }, [fbx]);

  useEffect(() => {
    configureWheelMaterials(fbx, settings, maxAnisotropy);
  }, [fbx, settings, maxAnisotropy]);

  useFrame(() => {
    if (!groupRef.current) return;
    const deg = positionDegRef.current;
    if (deg === null) return;
    groupRef.current.rotation.z = (deg * Math.PI) / 180;
  });

  return (
    <group ref={groupRef} scale={scale}>
      <group rotation={[Math.PI / 2, 0, 0]}>
        <primitive object={fbx} />
      </group>
    </group>
  );
}

function WheelPlaceholder() {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (ref.current) ref.current.rotation.z = clock.elapsedTime * 0.4;
  });
  return (
    <group>
      <mesh ref={ref}>
        <torusGeometry args={[0.72, 0.055, 16, 64]} />
        <meshStandardMaterial color="#5a5a66" metalness={0.55} roughness={0.32} />
      </mesh>
      {[0, 120, 240].map((a) => (
        <mesh key={a} rotation={[0, 0, (a * Math.PI) / 180]}>
          <boxGeometry args={[0.06, 1.35, 0.04]} />
          <meshStandardMaterial color="#3a3a46" metalness={0.6} roughness={0.4} />
        </mesh>
      ))}
      <mesh>
        <cylinderGeometry args={[0.1, 0.1, 0.08, 24]} />
        <meshStandardMaterial color="#666672" metalness={0.9} roughness={0.15} />
      </mesh>
    </group>
  );
}

const WheelScene = memo(function WheelScene({
  positionDegRef,
  connected,
  settings,
}: {
  positionDegRef: React.MutableRefObject<number | null>;
  connected: boolean;
  settings: WheelRenderSettings;
}) {
  const bgSet = useRef(false);
  useFrame(({ scene }) => {
    if (!bgSet.current) {
      scene.background = BG;
      bgSet.current = true;
    }
  });

  return (
    <>
      <PerspectiveCamera makeDefault position={[0, 0, 2.65]} fov={36} />
      <WheelRendererSetup settings={settings} />
      <WheelEnvironment settings={settings} />

      <Suspense fallback={<WheelPlaceholder />}>
        <WheelMesh positionDegRef={positionDegRef} settings={settings} />
      </Suspense>

      {!connected && (
        <mesh>
          <planeGeometry args={[6, 6]} />
          <meshBasicMaterial color={BG} transparent opacity={0.6} />
        </mesh>
      )}
    </>
  );
});

const QUALITY_LABEL_KEYS: Record<WheelRenderQuality, 'wheelQualityLow' | 'wheelQualityMedium' | 'wheelQualityHigh' | 'wheelQualityUltra'> = {
  low: 'wheelQualityLow',
  medium: 'wheelQualityMedium',
  high: 'wheelQualityHigh',
  ultra: 'wheelQualityUltra',
};

export const WheelViewer = memo(function WheelViewer({
  positionDegRef,
  connected,
  height = 340,
}: WheelViewerProps) {
  const { state } = useAppState();
  const [quality, setQuality] = useState<WheelRenderQuality>(loadWheelRenderQuality);
  const settings = useMemo(() => wheelRenderSettings(quality), [quality]);

  const onQualityChange = useCallback((next: WheelRenderQuality) => {
    setQuality(next);
    saveWheelRenderQuality(next);
  }, []);

  return (
    <div
      className="wheel-viewer"
      style={{ height, position: 'relative', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}
    >
      <div className="wheel-quality-bar">
        <label className="wheel-quality-label" htmlFor="wheel-render-quality">
          {translate(state.locale, 'wheelQualityLabel')}
        </label>
        <select
          id="wheel-render-quality"
          className="wheel-quality-select"
          value={quality}
          onChange={(event) => onQualityChange(event.target.value as WheelRenderQuality)}
          title={translate(state.locale, 'wheelQualityHint')}
        >
          {WHEEL_QUALITY_ORDER.map((id) => (
            <option key={id} value={id}>
              {translate(state.locale, QUALITY_LABEL_KEYS[id])}
            </option>
          ))}
        </select>
      </div>

      <Canvas
        key={`${quality}-${settings.antialias}`}
        frameloop="always"
        dpr={[1, settings.maxDpr]}
        gl={{
          antialias: settings.antialias,
          alpha: false,
          powerPreference: 'high-performance',
          stencil: false,
          depth: true,
          failIfMajorPerformanceCaveat: false,
        }}
        onCreated={({ gl }) => {
          gl.setPixelRatio(Math.min(window.devicePixelRatio, settings.maxDpr));
          gl.outputColorSpace = THREE.SRGBColorSpace;
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = settings.toneMappingExposure;
          gl.domElement.addEventListener('webglcontextlost', (e) => {
            e.preventDefault();
          });
        }}
      >
        <WheelScene positionDegRef={positionDegRef} connected={connected} settings={settings} />
      </Canvas>

      {!connected && (
        <div className="wheel-viewer-overlay">
          <span className="wheel-viewer-overlay-label">
            {translate(state.locale, 'wheelNoConnection')}
          </span>
        </div>
      )}
    </div>
  );
});
