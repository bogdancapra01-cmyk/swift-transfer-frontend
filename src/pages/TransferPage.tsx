import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";

type TransferFile = {
  name: string;
  type: string;
  size: number;
  objectPath: string;
};

type TransferResponse = {
  ok: boolean;
  transferId: string;
  status: string;
  createdAt: number;
  completedAt: number | null;
  expiresAt: number | null;
  files: TransferFile[];
};

const API_BASE =
  (import.meta.env.VITE_API_URL as string | undefined) ??
  "https://swift-transfer-be-829099680012.europe-west1.run.app";

function formatBytes(bytes: number) {
  if (!bytes) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const value = bytes / Math.pow(k, i);
  return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${sizes[i]}`;
}

export default function TransferPage() {
  const { transferId } = useParams();
  const [data, setData] = useState<TransferResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");

  const totalSize = useMemo(() => {
    if (!data?.files?.length) return 0;
    return data.files.reduce((sum, f) => sum + (f.size ?? 0), 0);
  }, [data]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        setLoading(true);
        setError("");

        if (!transferId) {
          throw new Error("Missing transferId in URL.");
        }

        const res = await fetch(`${API_BASE}/api/transfers/${transferId}`);
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`Failed to load transfer (${res.status}): ${text}`);
        }

        const json = (await res.json()) as TransferResponse;

        if (!cancelled) {
          setData(json);
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Unknown error");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [transferId]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
      <Card className="w-full max-w-2xl bg-slate-900/60 border-slate-800">
        <CardHeader className="space-y-2">
          <CardTitle className="text-2xl">Swift Transfer 📥</CardTitle>
          <div className="text-xs text-slate-400 break-all">
            Transfer: {transferId}
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Link to="/">
              <Button variant="secondary">← Back</Button>
            </Link>

            {data?.files?.length ? (
              <div className="text-sm text-slate-300">
                {data.files.length} fișier(e) • {formatBytes(totalSize)}
              </div>
            ) : null}
          </div>

          {loading && (
            <div className="rounded-md border border-slate-800 bg-slate-950/40 p-3 text-sm">
              Loading transfer...
            </div>
          )}

          {error && (
            <div className="rounded-md border border-red-900 bg-red-950/40 p-3 text-sm text-red-200">
              {error}
            </div>
          )}

          {!loading && !error && data && (
            <div className="space-y-2">
              {data.status && (
                <div className="text-sm text-slate-300">
                  Status: <span className="text-slate-100">{data.status}</span>
                </div>
              )}

              {data.expiresAt ? (
                <div className="text-xs text-slate-400">
                  Expires: {new Date(data.expiresAt).toLocaleString()}
                </div>
              ) : null}

              <div className="mt-3 space-y-2">
                {data.files?.length ? (
                  data.files.map((f, idx) => (
                    <div
                      key={f.objectPath ?? `${f.name}-${idx}`}
                      className="flex items-center justify-between rounded-md border border-slate-800 bg-slate-950/40 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <div className="truncate">{f.name}</div>
                        <div className="text-xs text-slate-400">
                          {formatBytes(f.size)}
                        </div>
                      </div>

                      {/* NEXT STEP: aici punem download link */}
                      <Button variant="secondary" disabled>
                        Download (next)
                      </Button>
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-slate-300">
                    No files found for this transfer.
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="text-xs text-slate-500">API: {API_BASE}</div>
        </CardContent>
      </Card>
    </div>
  );
}
