import { useEffect, useRef } from 'react';
import { AppLogo } from './AppIcon';

interface LiveAppLogoProps {
  size?: number;
  connected: boolean;
  positionDegRef: React.MutableRefObject<number | null>;
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function LiveAppLogo({ size = 32, connected, positionDegRef }: LiveAppLogoProps) {
  const iconRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!connected || prefersReducedMotion()) {
      if (iconRef.current) {
        iconRef.current.style.transform = '';
      }
      return undefined;
    }

    let raf = 0;
    const loop = () => {
      const el = iconRef.current;
      const deg = positionDegRef.current;
      if (el && deg !== null) {
        el.style.transform = `rotate(${-deg}deg)`;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      if (iconRef.current) {
        iconRef.current.style.transform = '';
      }
    };
  }, [connected, positionDegRef]);

  return (
    <div className="brand-logo">
      <AppLogo ref={iconRef} size={size} className="brand-logo-icon" />
    </div>
  );
}
