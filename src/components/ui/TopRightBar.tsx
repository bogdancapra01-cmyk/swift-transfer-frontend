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
    <div className="fixed top-6 right-6 z-50 flex items-center gap-3">
      <div className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/35 backdrop-blur-xl px-4 py-2 shadow-2xl">
        {userEmail ? (
          <div className="text-sm text-slate-200/90 truncate max-w-[240px]">
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
