import type { ReactNode } from "react";
import { GlowBackground } from "@/components/ui/GlowBackground";

export function PageShell({
  children,
  maxWidth = "max-w-4xl",
}: {
  children: ReactNode;
  maxWidth?: string;
}) {
  return (
    <GlowBackground>
      {/* top padding = spațiu sub TopRightBar fixed */}
      <div className="min-h-screen">
        <div className={`mx-auto w-full ${maxWidth} px-6 pt-28 sm:pt-32 pb-10`}>
          {children}
        </div>
      </div>
    </GlowBackground>
  );
}
