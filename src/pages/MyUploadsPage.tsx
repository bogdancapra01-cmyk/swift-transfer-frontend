import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { API_BASE_URL } from "../config";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function MyUploadsPage() {
  const { getIdToken } = useAuth();
  const [uploads, setUploads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchUploads() {
      setLoading(true);
      setError(null);

      try {
        const token = await getIdToken();

        // Debug: vezi dacă există token (în consola browserului)
        console.log(
          "MyUploads token:",
          token?.slice?.(0, 20),
          token ? "(has token)" : "(NO token)"
        );

        if (!token) {
          throw new Error("No ID token (user not ready / not logged in).");
        }

        const res = await fetch(`${API_BASE_URL}/api/transfers/my`, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!res.ok) {
          // încearcă să citești un mesaj JSON dacă există
          let msg = `HTTP ${res.status}`;
          try {
            const body = await res.json();
            if (body?.error) msg = `${msg} - ${body.error}`;
          } catch {
            // ignore parse errors
          }
          throw new Error(msg);
        }

        const data = await res.json();
        if (!cancelled) setUploads(data.transfers || []);
      } catch (err: any) {
        console.error("Failed to load uploads:", err);
        if (!cancelled) setError(err?.message || "Failed to load uploads");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchUploads();

    return () => {
      cancelled = true;
    };
  }, [getIdToken]);

  if (loading) return <p>Loading...</p>;

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold">My uploads</h1>

      {error && (
        <p className="text-sm text-red-500">
          {error}
        </p>
      )}

      {!error && uploads.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No uploads yet. Go to Upload and create your first transfer.
        </p>
      )}

      {uploads.map((t) => (
        <Card key={t.id} className="p-4 flex justify-between items-center">
          <div>
            <p className="font-medium">{t.files?.length || 0} files</p>
            <p className="text-sm text-muted-foreground">
              Expires: {t.expiresAt ? new Date(t.expiresAt).toLocaleString() : "—"}
            </p>
          </div>

          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => navigator.clipboard.writeText(t.shareUrl)}
              disabled={!t.shareUrl}
            >
              Copy link
            </Button>

            <Button
              onClick={() => window.open(t.shareUrl, "_blank", "noopener,noreferrer")}
              disabled={!t.shareUrl}
            >
              Open
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}
