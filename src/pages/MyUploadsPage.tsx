import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { API_BASE_URL } from "../config";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import logo from "@/assets/logo.png";
import { TopRightBar } from "@/components/ui/TopRightBar";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";




type Transfer = any;

export default function MyUploadsPage() {
  const { getIdToken } = useAuth();
  const [uploads, setUploads] = useState<Transfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();
  const userEmail = user?.email ?? null;

  async function handleSignOut() {
  await signOut(auth);
}


  useEffect(() => {
    let cancelled = false;

    async function fetchUploads() {
      setLoading(true);
      setError(null);

      try {
        const token = await getIdToken();
        if (!token) throw new Error("Not authenticated");

        const res = await fetch(`${API_BASE_URL}/api/transfers/my`, {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) {
          let msg = `HTTP ${res.status}`;
          try {
            const body = await res.json();
            if (body?.error) msg = `${msg} - ${body.error}`;
          } catch {}
          throw new Error(msg);
        }

        const data = await res.json();
        if (!cancelled) setUploads(data.transfers || []);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Failed to load uploads");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchUploads();
    return () => {
      cancelled = true;
    };
  }, [getIdToken]);

  const now = Date.now();

  const normalized = useMemo(() => {
    return (uploads || []).map((t: any) => {
      const id = t.transferId || t.id;
      const shareUrl = t.shareUrl || `${window.location.origin}/t/${id}`;
      const expiresAtMs =
        typeof t.expiresAt === "number"
          ? t.expiresAt
          : t.expiresAt?.toMillis?.() ?? null;
      const createdAtMs =
       typeof t.createdAt === "number"
        ? t.createdAt
        : t.createdAt?.toMillis?.() ?? null;



      const statusRaw = (t.status || "draft").toLowerCase();
      const isExpired = expiresAtMs ? expiresAtMs < now : false;

      let status: "ready" | "draft" | "expired" = "draft";
      if (isExpired) status = "expired";
      else if (statusRaw === "ready") status = "ready";

      return {
        ...t,
        _id: id,
        _shareUrl: shareUrl,
        _expiresAtMs: expiresAtMs,
        _createdAtMs: createdAtMs,
        _status: status,
      };
    });
  }, [uploads, now]);

  async function handleCopy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // fallback (rare)
      const ta = document.createElement("textarea");
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
  }


  return (
    <div className="min-h-screen bg-[#050816] text-white">
      {/* glow background */}
      <TopRightBar userEmail={userEmail} onSignOut={handleSignOut} />
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(99,102,241,0.22),transparent_40%),radial-gradient(circle_at_70%_10%,rgba(56,189,248,0.16),transparent_35%),radial-gradient(circle_at_50%_90%,rgba(168,85,247,0.16),transparent_40%)]" />

      <div className="relative mx-auto max-w-4xl px-4 py-10">
        {/* header */}
        <div className="mb-6 flex flex-col items-center gap-3">
         <img
    src={logo}
    alt="Swift Transfer"
    className="h-36 sm:h-44 md:h-52 lg:h-60 w-auto opacity-95 select-none"
  />

  <h1 className="text-3xl font-semibold tracking-tight">
    My uploads
  </h1>

  <p className="text-sm text-white/60 text-center">
    Your recent transfers. Copy a link or open the download page.
  </p>
</div>


        {/* main card */}
        <Card className="border-white/10 bg-white/5 backdrop-blur-md">
          <div className="p-4 sm:p-6">
            {loading && <p className="text-sm text-white/70">Loading...</p>}

            {!loading && error && (
              <p className="text-sm text-red-300">{error}</p>
            )}

            {!loading && !error && normalized.length === 0 && (
              <p className="text-sm text-white/60">
                No uploads yet. Go to Home/Upload and create your first transfer link.
              </p>
            )}

            {!loading && !error && normalized.length > 0 && (
              <div className="space-y-3">
                {normalized.map((t: any) => {
                  const filesCount = t.files?.length || 0;
                  const expiresLabel = t._expiresAtMs
                    ? new Date(t._expiresAtMs).toLocaleString()
                    : "—";
                  const createdLabel = t._createdAtMs
                    ? new Date(t._createdAtMs).toLocaleString()
                    : "—";


                  const pill =
                    t._status === "ready"
                      ? "bg-emerald-500/15 text-emerald-200 border-emerald-500/20"
                      : t._status === "expired"
                      ? "bg-red-500/15 text-red-200 border-red-500/20"
                      : "bg-yellow-500/15 text-yellow-200 border-yellow-500/20";

                  const pillText =
                    t._status === "ready"
                      ? "Ready"
                      : t._status === "expired"
                      ? "Expired"
                      : "Draft";

                  return (
                    <div
                      key={t._id}
                      className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <div className="relative mx-auto w-full max-w-4xl">


                          <span className="text-base font-medium text-white/90">
                            {filesCount} file{filesCount === 1 ? "" : "s"}
                          </span>
                          <span
                            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${pill}`}
                          >
                            {pillText}
                          </span>
                        </div>

                        <div className="mt-1 text-sm text-white/60">
                         Created: {createdLabel}
                        </div>
                        <div className="text-sm text-white/60">
                         Expires: {expiresLabel}
                        </div>


                        <div className="mt-1 text-xs text-white/40 truncate">
                          {t._shareUrl}
                        </div>
                      </div>

                      <div className="flex gap-2 sm:flex-shrink-0">
                        <Button
                          variant="secondary"
                          onClick={() => handleCopy(t._shareUrl)}
                          className="bg-white/10 hover:bg-white/15 text-white"
                        >
                          Copy link
                        </Button>

                        <Button
                          onClick={() =>
                            window.open(t._shareUrl, "_blank", "noopener,noreferrer")
                          }
                          className="bg-indigo-500/80 hover:bg-indigo-500 text-white"
                        >
                          Open
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
