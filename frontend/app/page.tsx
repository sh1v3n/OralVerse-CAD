import Link from "next/link";

const MONO = "var(--font-ibm-mono, 'IBM Plex Mono', monospace)";
const SANS = "var(--font-hanken, 'Hanken Grotesk', system-ui, sans-serif)";

export default function LandingPage() {
  return (
    <main
      style={{
        position: "relative",
        minHeight: "100vh",
        width: "100%",
        background:
          "radial-gradient(120% 90% at 50% 18%, #F6F2EB 0%, #EFE9DF 46%, #E6DECF 100%)",
        color: "#1C1A16",
        fontFamily: SANS,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* film grain */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          zIndex: 6,
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
          zIndex: 4,
          color: "rgba(28,26,22,0.28)",
          fontFamily: MONO,
        }}
      >
        <span style={{ position: "absolute", top: 0, left: 0, fontSize: 16, lineHeight: 1 }}>+</span>
        <span style={{ position: "absolute", top: 0, right: 0, fontSize: 16, lineHeight: 1 }}>+</span>
        <span style={{ position: "absolute", bottom: 0, left: 0, fontSize: 16, lineHeight: 1 }}>+</span>
        <span style={{ position: "absolute", bottom: 0, right: 0, fontSize: 16, lineHeight: 1 }}>+</span>
      </div>

      {/* NAV */}
      <nav
        style={{
          position: "relative",
          zIndex: 5,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 24,
          padding: "26px clamp(24px,5vw,64px)",
        }}
      >
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <span style={{ fontSize: 21, fontWeight: 700, letterSpacing: "-0.03em" }}>
            OralVerse
          </span>
          <span
            style={{
              fontFamily: MONO,
              fontSize: 10.5,
              letterSpacing: "0.16em",
              color: "#8C8576",
              textTransform: "uppercase",
            }}
          >
            AI&nbsp;Orthodontic&nbsp;CAD
          </span>
        </div>

        {/* Nav links */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 34,
            fontSize: 14.5,
            color: "#46413A",
          }}
        >
          {["Platform", "Workflow", "Clinics", "Pricing"].map((label) => (
            <a key={label} href="#" style={{ opacity: 0.85, textDecoration: "none", color: "inherit" }}>
              {label}
            </a>
          ))}
        </div>

        {/* Auth CTAs */}
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <Link
            href="/sign-in"
            style={{ fontSize: 14.5, color: "#46413A", opacity: 0.85, textDecoration: "none" }}
          >
            Sign in
          </Link>
          <Link
            href="/sign-up"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "11px 20px",
              borderRadius: 999,
              background: "#1C1A16",
              color: "#F2EEE7",
              fontSize: 14,
              fontWeight: 500,
              boxShadow:
                "0 1px 0 rgba(255,255,255,0.18) inset, 0 6px 18px rgba(28,26,22,0.18)",
              textDecoration: "none",
            }}
          >
            Sign up
          </Link>
        </div>
      </nav>

      {/* HERO */}
      <section
        style={{
          position: "relative",
          zIndex: 3,
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          padding: "18px clamp(20px,5vw,64px) 56px",
        }}
      >
        {/* Headline */}
        <div style={{ animation: "arc-rise 0.7s ease both" }}>
          <p
            style={{
              margin: "0 0 22px",
              fontFamily: MONO,
              fontSize: 12,
              letterSpacing: "0.26em",
              textTransform: "uppercase",
              color: "#8C8576",
            }}
          >
            For Orthodontists &amp; Dentists
          </p>
          <h1
            style={{
              margin: 0,
              fontWeight: 600,
              letterSpacing: "-0.035em",
              lineHeight: 0.98,
              fontSize: "clamp(2.6rem,7vw,5.4rem)",
              color: "#1C1A16",
            }}
          >
            Every aligner,
            <br />
            planned to the micron.
          </h1>
        </div>

        {/* 3D centerpiece */}
        <div
          style={{
            position: "relative",
            margin: "clamp(14px,3vh,34px) 0 clamp(20px,3vh,36px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {/* studio glow */}
          <div
            aria-hidden
            style={{
              position: "absolute",
              width: "min(720px,86vw)",
              height: "min(560px,52vh)",
              borderRadius: "50%",
              background:
                "radial-gradient(closest-side, #FFFFFF 0%, rgba(255,255,255,0.6) 38%, rgba(255,255,255,0) 72%)",
              filter: "blur(6px)",
              animation: "arc-glow 9s ease-in-out infinite",
              zIndex: 0,
            }}
          />
          {/* ground shadow */}
          <div
            aria-hidden
            style={{
              position: "absolute",
              bottom: "-6%",
              width: "min(420px,60vw)",
              height: 42,
              borderRadius: "50%",
              background:
                "radial-gradient(closest-side, rgba(28,26,22,0.28), rgba(28,26,22,0))",
              filter: "blur(7px)",
              zIndex: 0,
            }}
          />
          {/* Sketchfab iframe */}
          <div style={{ position: "relative", zIndex: 1 }}>
            <iframe
              title="Dental Aligner — live 3D"
              src="https://sketchfab.com/models/7076c62b5bcb455eb146990265d2e072/embed?autospin=0.4&autostart=1&preload=1&transparent=1&dnt=1&ui_infos=0&ui_controls=0&ui_stop=0&ui_inspector=0&ui_watermark=0&ui_watermark_link=0&ui_ar=0&ui_help=0&ui_settings=0&ui_vr=0&ui_fullscreen=0&ui_annotations=0&ui_loading=0&ui_hint=0"
              allow="autoplay; fullscreen; xr-spatial-tracking"
              allowFullScreen
              style={{
                display: "block",
                width: "min(660px,84vw)",
                height: "min(480px,52vh)",
                background: "transparent",
                borderRadius: 20,
                border: 0,
              }}
            />
          </div>
          {/* caption */}
          <span
            style={{
              position: "absolute",
              bottom: -30,
              left: "50%",
              transform: "translateX(-50%)",
              fontFamily: MONO,
              fontSize: 10.5,
              letterSpacing: "0.18em",
              color: "#A39B8B",
              whiteSpace: "nowrap",
            }}
          >
            LIVE 3D — DRAG TO ROTATE
          </span>
        </div>

        {/* Subtext + CTAs */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 26,
            animation: "arc-rise 0.9s ease both",
          }}
        >
          <p
            style={{
              margin: 0,
              maxWidth: 580,
              fontSize: "clamp(1rem,1.6vw,1.18rem)",
              lineHeight: 1.5,
              color: "#5A5448",
            }}
          >
            OralVerse turns a single intraoral scan into a fully staged treatment
            plan — proposed by AI, refined and approved by you.
          </p>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 20,
              flexWrap: "wrap",
              justifyContent: "center",
            }}
          >
            <Link
              href="/sign-up"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 10,
                padding: "15px 28px",
                borderRadius: 999,
                background: "#1C1A16",
                color: "#F2EEE7",
                fontSize: 15.5,
                fontWeight: 500,
                boxShadow:
                  "0 1px 0 rgba(255,255,255,0.18) inset, 0 10px 28px rgba(28,26,22,0.22)",
                textDecoration: "none",
              }}
            >
              Get started
            </Link>
            <a
              href="#"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 11,
                fontSize: 15.5,
                fontWeight: 500,
                color: "#1C1A16",
                textDecoration: "none",
              }}
            >
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 34,
                  height: 34,
                  borderRadius: "50%",
                  border: "1px solid rgba(28,26,22,0.28)",
                }}
              >
                <span
                  style={{
                    width: 0,
                    height: 0,
                    borderLeft: "8px solid #1C1A16",
                    borderTop: "5px solid transparent",
                    borderBottom: "5px solid transparent",
                    marginLeft: 2,
                  }}
                />
              </span>
              Watch the 2-min demo
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
