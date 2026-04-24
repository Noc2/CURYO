"use client";

interface PosterOrbSceneProps {
  className?: string;
  title?: string;
  animated?: boolean;
}

export function PosterOrbScene({
  className = "h-full w-full",
  title = "Poster-inspired Curyo orb",
  animated = true,
}: PosterOrbSceneProps) {
  const wrapperClassName = [className, "poster-orb-scene", animated ? "poster-orb-scene--animated" : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={wrapperClassName} role={title ? "img" : undefined} aria-label={title || undefined}>
      <div className="poster-orb-scene__background" aria-hidden="true" />

      <style jsx>{`
        .poster-orb-scene {
          --poster-orb-scene-y: 12%;
          --poster-orb-scene-scale: 0.98;

          position: relative;
          display: block;
          height: 100%;
          width: 100%;
          isolation: isolate;
          overflow: visible;
        }

        .poster-orb-scene__background {
          position: absolute;
          z-index: 1;
          inset: -40%;
          pointer-events: none;
          background-image: url("/launch/curyo-v2-orb-hero-background.webp");
          background-position: center;
          background-repeat: no-repeat;
          background-size: contain;
          transform: translateY(var(--poster-orb-scene-y)) scale(var(--poster-orb-scene-scale));
          transform-origin: 50% 52%;
        }

        .poster-orb-scene--animated .poster-orb-scene__background {
          animation: poster-orb-scene-float 14s ease-in-out infinite;
          will-change: transform;
        }

        @keyframes poster-orb-scene-float {
          0%,
          100% {
            transform: translateY(var(--poster-orb-scene-y)) scale(var(--poster-orb-scene-scale));
          }

          50% {
            transform: translateY(calc(var(--poster-orb-scene-y) - 12px)) scale(1.01);
          }
        }
      `}</style>
    </div>
  );
}
