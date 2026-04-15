const FilmGrain = () => (
  <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 9999, opacity: 0.04 }}>
    <svg width="100%" height="100%">
      <filter id="grain">
        <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" />
      </filter>
      <rect width="100%" height="100%" filter="url(#grain)" />
    </svg>
  </div>
);

export default FilmGrain;
