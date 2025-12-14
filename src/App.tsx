import { useMemo, useRef, useState } from "react";
import { Routes, Route } from "react-router-dom";
import { Button } from "./components/ui/button";
import { Card, CardContent } from "./components/ui/card";
import { Input } from "./components/ui/input";
import TransferPage from "./pages/TransferPage";
import logo from "./assets/logo.png";

type SelectedFile = {
  file: File;
  id: string;
};

type InitResponse = {
  transferId: string;
  uploads: Array<{
    objectPath: string;
    uploadUrl: string;
  }>;
};

type CompleteResponse = {
  shareUrl: string;
};

function formatBytes(bytes: number) {
  if (!bytes) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const value = bytes / Math.pow(k, i);
  return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${sizes[i]}`;
}

const API_BASE =
  (import.meta.env.VITE_API_URL as string | undefined) ??
  "https://api.swift-transfer.app";

function UploadPage() {
  const [files, setFiles] = useState<SelectedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [error, setError] = useState<string>("");

  const [shareUrl, setShareUrl] = useState<string>("");
  const [emailTo, setEmailTo] = useState("");
  const [emailMsg, setEmailMsg] = useState("");
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [emailStatus, setEmailStatus] = useState<string>("");

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const totalSize = useMemo(
    () => files.reduce((sum, f) => sum + f.file.size, 0),
    [files]
  );

  function addFiles(list: FileList | null) {
    if (!list) return;

    setShareUrl("");
    setEmailStatus("");

    const incoming: SelectedFile[] = Array.from(list).map((file) => ({
      file,
      id: crypto.randomUUID(),
    }));

    setFiles((prev) => [...prev, ...incoming]);
  }

  function removeFile(id: string) {
    setShareUrl("");
    setEmailStatus("");
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }

  function clearAll() {
    setFiles([]);
    setShareUrl("");
    setStatus("");
    setError("");
    setEmailStatus("");
    setEmailTo("");
    setEmailMsg("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleUpload() {
    setError("");
    setStatus("");
    setShareUrl("");
    setEmailStatus("");

    if (!files.length) {
      setError("Selectează cel puțin un fișier.");
      return;
    }

    setIsUploading(true);

    try {
      // 1) init transfer
      const initPayload = {
        files: files.map((f) => ({
          name: f.file.name,
          type: f.file.type || "application/octet-stream",
          size: f.file.size,
        })),
      };

      const initRes = await fetch(`${API_BASE}/api/transfers/init`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(initPayload),
      });

      if (!initRes.ok) {
        const text = await initRes.text();
        throw new Error(`Init failed (${initRes.status}): ${text}`);
      }

      const initJson = (await initRes.json()) as InitResponse;

      if (!initJson.uploads?.length) {
        throw new Error("Init response missing uploads.");
      }

      setStatus(`Init OK. Uploading ${initJson.uploads.length} file(s)...`);

      // 2) upload each file to GCS signed URL
      for (let i = 0; i < initJson.uploads.length; i++) {
        const upload = initJson.uploads[i];
        const file = files[i]?.file;
        if (!file) continue;

        const putRes = await fetch(upload.uploadUrl, {
          method: "PUT",
          headers: {
            "Content-Type": file.type || "application/octet-stream",
          },
          body: file,
        });

        if (!putRes.ok) {
          const text = await putRes.text();
          throw new Error(
            `Upload failed for ${file.name}: ${putRes.status} ${text}`
          );
        }

        setStatus(`Uploaded ${i + 1}/${initJson.uploads.length}: ${file.name}`);
      }

      // 3) complete transfer
      setIsFinalizing(true);
      setStatus("Finalizing transfer (generating share link)...");

      const completeRes = await fetch(`${API_BASE}/api/transfers/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transferId: initJson.transferId,
          files: files.map((f, i) => ({
            name: f.file.name,
            type: f.file.type || "application/octet-stream",
            size: f.file.size,
            objectPath: initJson.uploads[i]?.objectPath,
          })),
        }),
      });

      if (!completeRes.ok) {
        const text = await completeRes.text();
        throw new Error(`Complete failed (${completeRes.status}): ${text}`);
      }

      const completeJson = (await completeRes.json()) as CompleteResponse;

      if (!completeJson.shareUrl) {
        throw new Error("Complete response missing shareUrl.");
      }

      setShareUrl(completeJson.shareUrl);
      setStatus("✅ Upload complete. Share link generated!");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setIsFinalizing(false);
      setIsUploading(false);
    }
  }

  async function handleSendEmail() {
    try {
      setEmailStatus("");
      setError("");

      if (!shareUrl) {
        setEmailStatus("Nu există share link încă.");
        return;
      }
      if (!emailTo.trim()) {
        setEmailStatus("Introdu o adresă de email.");
        return;
      }

      const transferId = shareUrl.split("/").filter(Boolean).pop();
      if (!transferId) {
        setEmailStatus("Nu pot extrage transferId din shareUrl.");
        return;
      }

      setIsSendingEmail(true);

      const res = await fetch(`${API_BASE}/api/transfers/${transferId}/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: emailTo.trim(),
          message: emailMsg.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Email failed (${res.status}): ${text}`);
      }

      setEmailStatus("✅ Email trimis!");
    } catch (e: unknown) {
      setEmailStatus(e instanceof Error ? e.message : "Email failed");
    } finally {
      setIsSendingEmail(false);
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    addFiles(e.dataTransfer.files);
  }

  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }

  function onDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }

  const busy = isUploading || isFinalizing;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
      <div className="pointer-events-none fixed inset-0 opacity-40">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(99,102,241,0.25),transparent_55%),radial-gradient(circle_at_80%_30%,rgba(56,189,248,0.18),transparent_60%),radial-gradient(circle_at_50%_80%,rgba(168,85,247,0.12),transparent_60%)]" />
      </div>

      <Card className="relative w-full max-w-3xl bg-slate-900/35 border-slate-800 backdrop-blur-xl shadow-2xl">
        <CardContent className="p-8 space-y-6">
          {/* LOGO (mai mare) */}
          <div className="flex items-center justify-center">
            <img
              src={logo}
              alt="Swift Transfer"
              className="h-14 md:h-16 w-auto opacity-95 select-none"
              draggable={false}
            />
          </div>

          <div className="text-center text-slate-100/90">
            Încarcă fișiere, primești link de share, apoi poți trimite pe email.
          </div>

          {/* DROP ZONE (mai mare) */}
          <div
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            className={[
              "rounded-xl border-2 border-dashed p-10 md:p-12 transition",
              isDragOver
                ? "border-indigo-400/70 bg-indigo-500/10"
                : "border-slate-700/70 bg-slate-950/20",
            ].join(" ")}
          >
            <div className="text-center space-y-5">
              <div className="text-slate-100 font-medium">
                Drag & drop fișiere aici sau alege manual
              </div>

              {/* INPUT ascuns + buton vizibil */}
              <div className="flex flex-col md:flex-row items-center justify-center gap-3">
                <input
                  ref={fileInputRef}
                  id="filePicker"
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => addFiles(e.target.files)}
                />

                <label htmlFor="filePicker">
                  <Button
                    type="button"
                    variant="secondary"
                    className="cursor-pointer"
                    disabled={busy}
                    asChild
                  >
                    <span>Select files</span>
                  </Button>
                </label>

                <Button onClick={handleUpload} disabled={busy || !files.length}>
                  {isUploading
                    ? "Uploading..."
                    : isFinalizing
                    ? "Finalizing..."
                    : "Upload"}
                </Button>

                <Button
                  type="button"
                  variant="secondary"
                  onClick={clearAll}
                  disabled={busy && files.length > 0}
                >
                  Clear all
                </Button>
              </div>

              <div className="text-sm text-slate-200/80">
                {files.length} fișier(e) • {formatBytes(totalSize)}
              </div>
            </div>
          </div>

          {/* FILE LIST */}
          {files.length > 0 && (
            <div className="space-y-2">
              <div className="text-sm text-slate-200/90">Selected files</div>

              <div className="space-y-2">
                {files.map((f) => (
                  <div
                    key={f.id}
                    className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/25 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-slate-100">
                        {f.file.name}
                      </div>
                      <div className="text-xs text-slate-300/80">
                        {formatBytes(f.file.size)}
                      </div>
                    </div>

                    <Button
                      variant="secondary"
                      onClick={() => removeFile(f.id)}
                      disabled={busy}
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* STATUS / ERROR */}
          {status && (
            <div className="rounded-lg border border-slate-800 bg-slate-950/25 p-4 text-sm text-slate-100">
              {status}
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-900/60 bg-red-950/30 p-4 text-sm text-red-100">
              {error}
            </div>
          )}

          {/* SHARE LINK + EMAIL (doar după upload) */}
          {shareUrl && (
            <div className="space-y-4 rounded-xl border border-slate-800 bg-slate-950/25 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-slate-100 font-medium">✅ Share link</div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => window.open(shareUrl, "_blank", "noopener,noreferrer")}
                  >
                    Open
                  </Button>
                  <Button
                    onClick={() => navigator.clipboard.writeText(shareUrl)}
                  >
                    Copy
                  </Button>
                </div>
              </div>

              <div className="text-xs text-slate-200/80 break-all">
                {shareUrl}
              </div>

              <div className="pt-2 border-t border-slate-800/70">
                <div className="text-sm text-slate-100 font-medium mb-2">
                  Share via email
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <Input
                    value={emailTo}
                    onChange={(e) => setEmailTo(e.target.value)}
                    placeholder="recipient@email.com"
                    disabled={isSendingEmail}
                  />

                  <Input
                    value={emailMsg}
                    onChange={(e) => setEmailMsg(e.target.value)}
                    placeholder="Optional message…"
                    disabled={isSendingEmail}
                  />

                  <Button
                    onClick={handleSendEmail}
                    disabled={isSendingEmail}
                  >
                    {isSendingEmail ? "Sending..." : "Send"}
                  </Button>
                </div>

                {emailStatus && (
                  <div className="mt-3 text-sm text-slate-100/90">
                    {emailStatus}
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<UploadPage />} />
      <Route path="/t/:transferId" element={<TransferPage />} />
    </Routes>
  );
}
