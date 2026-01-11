import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { getAuth } from "firebase/auth";

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

type DownloadUrlResponse = {
  ok: boolean;
  url?: string;
  error?: string;
};

const API_BASE =
  (import.meta.env.VITE_API_URL as string | undefined) ??
  "https://api.swift-transfer.app";

function formatBytes(bytes: number) {
  if (!bytes) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const value = bytes / Math.pow(k, i);
  return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${sizes[i]}`;
}

function formatDate(ts: number) {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return "";
  }
}

function StatusPill({ status }: { status?: string }) {
  const s = (status || "").toLowerCase();
  const cls =
    s === "ready"
      ? "bg-emerald-500/15 text-emerald-200 border-emerald-500/30"
      : s === "draft"
      ? "bg-amber-500/15 text-amber-200 border-amber-500/30"
      : "bg-slate-500/15 text-slate-200 border-slate-500/30";

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs ${cls}`}
    >
      {status || "unknown"}
    </span>
  );
}

function fileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase();
  if (!ext) return "📄";
  if (["png", "jpg", "jpeg", "webp", "gif", "svg"].includes(ext)) return "🖼️";
  if (["pdf"].includes(ext)) return "📕";
  if (["zip", "rar", "7z"].includes(ext)) return "🗜️";
  if (["mp4", "mov", "mkv", "avi"].includes(ext)) return "🎬";
  if (["mp3", "wav", "flac"].includes(ext)) return "🎵";
  if (["doc", "docx"].includes(ext)) return "📝";
  if (["xls", "xlsx", "csv"].includes(ext)) return "📊";
  return "📄";
}

async function getIdTokenSafe(): Promise<string | null> {
  const auth = getAuth();
  const user = auth.currentUser;
  if (!user) return null;

  try {
    // true = force refresh (evită token expirat)
    return await user.getIdToken(true);
  } catch {
    return null;
  }
}

// ✅ download helper: fetch + blob so Authorization header is sent
async function downloadBlobWithAuth(url: string, filename: string) {
  const token = await getIdTokenSafe();
  if (!token) throw new Error("You must be signed in to download.");

  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Download failed (${res.status}): ${text}`);
  }

  const blob = await res.blob();
  const blobUrl = window.URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();

  window.URL.revokeObjectURL(blobUrl);
}

export default function TransferPage() {
  const { transferId } = useParams();
  const [data, setData] = useState<TransferResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");

  const [downloadingIndex, setDownloadingIndex] = useState<number | null>(null);
  const [downloadingAll, setDownloadingAll] = useState(false);

  const totalSize = useMemo(() => {
    if (!data?.files?.length) return 0;
    return data.files.reduce((sum, f) => sum + (f.size ?? 0), 0);
  }, [data]);

  const isExpired = useMemo(() => {
    if (!data?.expiresAt) return false;
    return Date.now() > data.expiresAt;
  }, [data?.expiresAt]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        setLoading(true);
        setError("");

        if (!transferId) throw new Error("Missing transferId in URL.");

        const token = await getIdTokenSafe();

        const res = await fetch(`${API_BASE}/api/transfers/${transferId}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });

        if (!res.ok) {
          const text = await res.text();
          throw new Error(`Failed to load transfer (${res.status}): ${text}`);
        }

        const json = (await res.json()) as TransferResponse;

        if (!cancelled) setData(json);
      } catch (e: unknown) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Unknown error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [transferId]);

  async function handleDownload(idx: number) {
    try {
      setError("");
      if (!transferId) throw new Error("Missing transferId in URL.");

      setDownloadingIndex(idx);

      const token = await getIdTokenSafe();

      const res = await fetch(
        `${API_BASE}/api/transfers/${transferId}/files/${idx}/download`,
        {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        }
      );

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Download link failed (${res.status}): ${text}`);
      }

      const json = (await res.json()) as DownloadUrlResponse;
      if (!json.url) throw new Error(json.error || "Missing download url.");

      // ✅ Previously: window.open(json.url...) (couldn't send auth headers)
      // ✅ Now: fetch the file with Authorization and trigger a real download
      const filename = data?.files?.[idx]?.name || `file-${idx + 1}`;
      await downloadBlobWithAuth(json.url, filename);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Download failed");
    } finally {
      setDownloadingIndex(null);
    }
  }

  // ✅ Download all as ZIP - uses fetch + blob so we can send Authorization header
  async function handleDownloadAllZip() {
    try {
      setError("");
      if (!transferId) return;

      setDownloadingAll(true);

      const token = await getIdTokenSafe();

      const res = await fetch(
        `${API_BASE}/api/transfers/${transferId}/download.zip`,
        {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        }
      );

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`ZIP download failed (${res.status}): ${text}`);
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = `swift-transfer-${transferId}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();

      window.URL.revokeObjectURL(url);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "ZIP download failed");
    } finally {
      setTimeout(() => setDownloadingAll(false), 400);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
      {/* subtle background glow */}
      <div className="pointer-events-none fixed inset-0 opacity-40">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(99,102,241,0.22),transparent_55%),radial-gradient(circle_at_85%_30%,rgba(56,189,248,0.14),transparent_60%),radial-gradient(circle_at_50%_85%,rgba(168,85,247,0.10),transparent_60%)]" />
      </div>

      <Card className="relative w-full max-w-3xl bg-slate-900/35 border-slate-800 backdrop-blur-xl shadow-2xl">
        <CardContent className="p-8 space-y-6">
          {/* Header */}
          <div className="flex flex-col gap-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-2xl font-semibold text-slate-100">
                  Transfer
                </div>
                <div className="text-xs text-slate-300/80 break-all">
                  {transferId}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <StatusPill status={data?.status} />
              </div>
            </div>

            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <Link to="/">
                <Button variant="secondary">← Back</Button>
              </Link>

              {data?.files?.length ? (
                <div className="text-sm text-slate-200/80">
                  {data.files.length} file(s) • {formatBytes(totalSize)}
                </div>
              ) : null}
            </div>
          </div>

          {/* Loading / error */}
          {loading && (
            <div className="rounded-lg border border-slate-800 bg-slate-950/25 p-4 text-sm text-slate-100">
              Loading transfer...
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-900/60 bg-red-950/30 p-4 text-sm text-red-100">
              {error}
            </div>
          )}

          {/* Meta */}
          {!loading && !error && data && (
            <div className="rounded-xl border border-slate-800 bg-slate-950/20 p-4 space-y-2">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                <div className="text-sm text-slate-200/85">
                  Created:{" "}
                  <span className="text-slate-100">
                    {formatDate(data.createdAt)}
                  </span>
                </div>

                {data.expiresAt ? (
                  <div className="text-sm text-slate-200/85">
                    Expires:{" "}
                    <span
                      className={isExpired ? "text-red-200" : "text-slate-100"}
                    >
                      {formatDate(data.expiresAt)}
                    </span>
                  </div>
                ) : null}
              </div>

              {isExpired && (
                <div className="text-sm text-red-200">
                  ⚠️ This transfer is expired.
                </div>
              )}

              {/* Download all */}
              <div className="pt-3 border-t border-slate-800/70 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div className="text-sm text-slate-200/85">
                  You can download files individually or all at once as a single
                  .zip archive.
                </div>

                <Button
                  variant="secondary"
                  onClick={handleDownloadAllZip}
                  disabled={isExpired || !data?.files?.length || downloadingAll}
                >
                  {downloadingAll ? "Preparing..." : "Download all (ZIP)"}
                </Button>
              </div>
            </div>
          )}

          {/* Files list */}
          {!loading && !error && data && (
            <div className="space-y-2">
              <div className="text-sm text-slate-200/90 font-medium">Files</div>

              {data.files?.length ? (
                <div className="space-y-2">
                  {data.files.map((f, idx) => (
                    <div
                      key={f.objectPath ?? `${f.name}-${idx}`}
                      className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/20 px-4 py-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="text-xl">{fileIcon(f.name)}</div>
                        <div className="min-w-0">
                          <div className="truncate text-slate-100">{f.name}</div>
                          <div className="text-xs text-slate-300/80">
                            {formatBytes(f.size)}
                          </div>
                        </div>
                      </div>

                      <Button
                        variant="secondary"
                        onClick={() => handleDownload(idx)}
                        disabled={downloadingIndex === idx || isExpired}
                      >
                        {downloadingIndex === idx ? "Generating..." : "Download"}
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-slate-800 bg-slate-950/25 p-4 text-sm text-slate-200/80">
                  No files found for this transfer.
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
