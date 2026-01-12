export function GlowBackground({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#050816] text-white">
      {/* glow / faded background */}
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(99,102,241,0.22),transparent_40%),radial-gradient(circle_at_70%_10%,rgba(56,189,248,0.16),transparent_35%),radial-gradient(circle_at_50%_90%,rgba(168,85,247,0.16),transparent_40%)]" />

      <div className="relative">
        {children}
      </div>
    </div>
  );
}
