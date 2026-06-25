const MONO = "var(--font-ibm-mono, 'IBM Plex Mono', monospace)";

/**
 * Shared editorial paper motif used across the landing page and the dashboard:
 * a subtle film-grain overlay plus monospace corner registration marks.
 * Render inside a `position: relative` container; it is purely decorative.
 */
export function PaperTexture({ grainZIndex = 6, marksZIndex = 4 }: { grainZIndex?: number; marksZIndex?: number }) {
  return (
    <>
      {/* film grain */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          zIndex: grainZIndex,
          mixBlendMode: "multiply",
          opacity: 0.05,
          backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>")`,
        }}
      />

      {/* corner registration marks */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 26,
          pointerEvents: "none",
          zIndex: marksZIndex,
          color: "rgba(28,26,22,0.28)",
          fontFamily: MONO,
        }}
      >
        <span style={{ position: "absolute", top: 0, left: 0, fontSize: 16, lineHeight: 1 }}>+</span>
        <span style={{ position: "absolute", top: 0, right: 0, fontSize: 16, lineHeight: 1 }}>+</span>
        <span style={{ position: "absolute", bottom: 0, left: 0, fontSize: 16, lineHeight: 1 }}>+</span>
        <span style={{ position: "absolute", bottom: 0, right: 0, fontSize: 16, lineHeight: 1 }}>+</span>
      </div>
    </>
  );
}
