"use client";

import { SignIn } from "@clerk/nextjs";
import { PaperTexture } from "@/components/ui/PaperTexture";

export default function SignInPage() {
  return (
    <div
      className="relative min-h-screen flex items-center justify-center p-4"
      style={{
        background:
          "radial-gradient(120% 90% at 50% 18%, #F6F2EB 0%, #EFE9DF 46%, #E6DECF 100%)",
      }}
    >
      <PaperTexture grainZIndex={1} marksZIndex={1} />

      {/* Ambient warm glow */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 h-96 w-96 rounded-full bg-clay/10 blur-3xl" />
        <div className="absolute top-1/3 -left-20 h-72 w-72 rounded-full bg-cream-300/50 blur-3xl" />
      </div>

      <div className="relative z-10 flex flex-col items-center gap-8 w-full max-w-md">
        {/* Branding */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink text-cream-100 text-sm font-black shadow-lg shadow-ink/20">
            OV
          </div>
          <div>
            <p className="text-lg font-bold text-ink leading-tight">OralVerse</p>
            <p className="text-xs text-ink-40 leading-tight">Orthodontic CAD Platform</p>
          </div>
        </div>

        <SignIn
          appearance={{
            variables: {
              colorBackground: "#FCFAF6",
              colorInputBackground: "#FFFFFF",
              colorPrimary: "#C2613D",
              colorText: "#1C1A16",
              colorTextSecondary: "#8C8576",
              colorInputText: "#1C1A16",
              colorNeutral: "#DBD3C5",
              borderRadius: "12px",
              fontFamily: "inherit",
            },
            elements: {
              rootBox: "w-full",
              card: "shadow-2xl shadow-ink/15 border border-line bg-surface",
              headerTitle: "text-ink",
              headerSubtitle: "text-ink-40",
              socialButtonsBlockButton:
                "border-line bg-surface-raised text-ink-70 hover:bg-cream-200",
              dividerLine: "bg-line",
              dividerText: "text-ink-40",
              formFieldLabel: "text-ink-70",
              formFieldInput:
                "bg-surface-raised border-line text-ink focus:border-clay",
              formButtonPrimary:
                "bg-ink hover:bg-ink/90 text-cream-100 font-semibold",
              footerActionLink: "text-clay-dark hover:text-clay",
              identityPreviewText: "text-ink-70",
              identityPreviewEditButton: "text-clay-dark",
            },
          }}
        />
      </div>
    </div>
  );
}
