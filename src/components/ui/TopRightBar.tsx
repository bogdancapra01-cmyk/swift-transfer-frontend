import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export function TopRightBar({
  userEmail,
  onSignOut,
}: {
  userEmail?: string | null;
  onSignOut: () => void;
}) {
  return (
    // ✅ OUTER CONTAINER: centered on mobile, top-right on md+
    <div
      className="
        fixed top-4 z-50
        left-1/2 -translate-x-1/2
        md:left-auto md:translate-x-0 md:right-6
        flex items-center
      "
    >
      {/* ✅ INNER PILL */}
      <div className="flex items-center gap-2 sm:gap-3 rounded-xl border border-slate-800 bg-slate-900/35 backdrop-blur-xl px-3 sm:px-4 py-2 shadow-2xl max-w-[95vw]">
        {/* Email (hide on very small screens if needed) */}
        {userEmail ? (
          <div className="text-sm text-slate-200/90 truncate max-w-[140px] sm:max-w-[240px]">
            {userEmail}
          </div>
        ) : (
          <div className="text-sm text-slate-200/60">Not signed in</div>
        )}

        <Link to="/">
          <Button variant="secondary">Home</Button>
        </Link>

        <Link to="/my-uploads">
          <Button variant="secondary">My uploads</Button>
        </Link>

        <Button variant="secondary" onClick={onSignOut}>
          Sign out
        </Button>
      </div>
    </div>
  );
}
