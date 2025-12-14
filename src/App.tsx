import { useMemo, useRef, useState } from "react";
import { Routes, Route } from "react-router-dom";
import { Button } from "./components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card";
import { Input } from "./components/ui/input";
import TransferPage from "./pages/TransferPage";

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
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const value = bytes / Math.pow(k, i);
  return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${sizes[i]}`;
}

const API_BASE =
  (import.meta.env.VITE_API_URL as string | undefined) ??
  "https://swift-transfer-be-829099680012.europe-west1.run.app";

function UploadPage() {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [files, setFiles] = useState<SelectedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);

  const [status, setStatus] = useState<string>("");
  const [error, setError] = useState<string>("");

  const [shareUrl, setShareUrl] = useState<string>("");

  // Email UI (apare doar după shareUrl)
  const [emailTo, setEmailTo] = useState("");
  const [emailMsg, setEmailMsg] = useState("");
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [emailStatus, setEmailStatus] = useState<string>("");

  // UI polish states
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadedCount, setUploadedCount] = useState(0);
  const [copyHint, setCopyHint] = useState<string>("");

  const totalSize = useMemo(
    () => files.reduce((sum, f) => sum + f.file.size, 0),
    [files]
  );

  const totalCount = files.length;

  const progressPct = useMemo(() => {
    if (!totalCount) return 0;
    return Math.round((uploadedCount / totalCount) * 100);
  }, [uploadedCount, totalCount]);

  function resetShareAndEmail() {
    setShareUrl("");
    setEmailStatus("");
    setCopyHint("");
  }

  function addFiles(list: FileList | null) {
    if (!list) return;

    resetShareAndEmail();

    const incoming = Array.from(list);

    // evităm duplicate simple (name + size)
    const existingKeys = new Set(files.map((f) => `${f.file.name}__${f.file.size}`));

    const mapped: SelectedFile[] = incoming
      .filter((file) => !existingKeys.has(`${file.name}__${file.size}`))
      .map((file) => ({
        file,
        id: crypto.randomUUID(),
      }));

    if (!mapped.length) return;

    setFiles((prev) => [...prev, ...mapped]);
  }

  function removeFile(id: string) {
    resetShareAndEmail();
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }

  function clearAll() {
    resetShareAndEmail();
    setError("");
    setStatus("");
    setUploadedCount(0);
    setFiles([]);
    setEmailTo("");
    setEmailMsg("");
  }

  function openFilePicker() {
    inputRef.current?.click();
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    if (isUploading || isFinalizing || isSendingEmail) return;

    if (e.dataTransfer?.files?.length) {
      addFiles(e.dataTransfer.files);
    }
  }

  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (isUploading || isFinalizing || isSendingEmail) return;
    setIsDragOver(true);
  }

  function onDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }

  async function handleUpload() {
    setError("");
    setStatus("");
    setEmailStatus("");
    setShareUrl("");
    setCopyHint("");
    setUploadedCount(0);

    if (!files.length) {
      setError("Selectează cel puțin un fișier.");
      return;
    }

    setIsUploading(true);

    try {
      // 1) init transfer
      setStatus("Initializing transfer...");
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

      setStatus(`Uploading ${initJson.uploads.length} file(s)...`);

      // 2) upload to signed URLs
      for (let i = 0; i < initJson.uploads.length; i++) {
        const upload = initJson.uploads[i];
        const file = files[i]?.file;
        if (!file) continue;

        setStatus(`Uploading ${i + 1}/${initJson.uploads.length}: ${file.name}`);

        const putRes = await fetch(upload.uploadUrl, {
          method: "PUT",
          headers: {
            "Content-Type": file.type || "application/octet-stream",
          },
          body: file,
        });

        if (!putRes.ok) {
          const text = await putRes.text();
          throw new Error(`Upload failed for ${file.name}: ${putRes.status} ${text}`);
        }

        setUploadedCount((prev) => prev + 1);
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

  async function handleCopyLink() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopyHint("Copied!");
      setTimeout(() => setCopyHint(""), 1200);
    } catch {
      setCopyHint("Copy failed");
      setTimeout(() => setCopyHint(""), 1500);
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

      // Extragem transferId din shareUrl (ultimul segment)
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

  const busy = isUploading || isFinalizing || isSendingEmail;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
      <Card className="w-full max-w-3xl bg-slate-900/60 border-slate-800">
        <CardHeader className="space-y-2">
          <CardTitle className="text-2xl">Swift Transfer 🚀</CardTitle>
          <p className="text-sm text-slate-300">
            Încarcă fișiere, primești link de share, apoi poți trimite pe email.
          </p>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Dropzone */}
          <div
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            className={[
              "rounded-xl border border-dashed p-5 transition",
              isDragOver ? "border-slate-300 bg-slate-950/60" : "border-slate-800 bg-slate-950/40",
              busy ? "opacity-70" : "",
            ].join(" ")}
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <div className="text-sm font-medium">
                  Drag & drop aici sau alege fișiere
                </div>
                <div className="text-xs text-slate-400">
                  {totalCount ? (
                    <>
                      {totalCount} fișier(e) • {formatBytes(totalSize)}
                    </>
                  ) : (
                    <>Nu ai selectat fișiere încă.</>
                  )}
                </div>
              </div>

              <div className="flex gap-2">
                <input
                  ref={inputRef}
                  className="hidden"
                  type="file"
                  multiple
                  onChange={(e) => addFiles(e.target.files)}
                />

                <Button variant="secondary" onClick={openFilePicker} disabled={busy}>
                  Choose files
                </Button>

                <Button onClick={handleUpload} disabled={busy || !files.length}>
                  {isUploading ? "Uploading..." : isFinalizing ? "Finalizing..." : "Upload"}
                </Button>
              </div>
            </div>

            {/* Progress */}
            {totalCount > 0 && (isUploading || isFinalizing) && (
              <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>
                    Progress: {uploadedCount}/{totalCount}
                  </span>
                  <span>{progressPct}%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className="h-full bg-slate-200/80"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* File list + actions */}
          {files.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-sm text-slate-300">
                  Selected files
                </div>
                <Button variant="ghost" onClick={clearAll} disabled={busy}>
                  Clear all
                </Button>
              </div>

              <div className="space-y-2">
                {files.map((f) => (
                  <div
                    key={f.id}
                    className="flex items-center justify-between rounded-md border border-slate-800 bg-slate-950/40 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <div className="truncate">{f.file.name}</div>
                      <div className="text-xs text-slate-400">
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

          {/* Status / Error */}
          {status && (
            <div className="rounded-md border border-slate-800 bg-slate-950/40 p-3 text-sm">
              {status}
            </div>
          )}

          {error && (
            <div className="rounded-md border border-red-900 bg-red-950/40 p-3 text-sm text-red-200">
              {error}
            </div>
          )}

          {/* Share link card */}
          {shareUrl && (
            <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="font-medium text-green-400">✅ Share link</div>
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => window.open(shareUrl, "_blank")}>
                    Open
                  </Button>
                  <Button onClick={handleCopyLink} disabled={!shareUrl}>
                    Copy
                  </Button>
                </div>
              </div>

              {copyHint && (
                <div className="text-xs text-slate-300">{copyHint}</div>
              )}

              <input
                value={shareUrl}
                readOnly
                className="w-full rounded-md border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100"
              />

              {/* Email UI appears only after shareUrl */}
              <div className="pt-2 border-t border-slate-800 space-y-2">
                <div className="text-sm font-medium text-slate-200">
                  Send share link by email
                </div>

                <div className="flex flex-col sm:flex-row gap-2">
                  <Input
                    placeholder="recipient@email.com"
                    value={emailTo}
                    onChange={(e) => setEmailTo(e.target.value)}
                    disabled={isSendingEmail}
                  />
                  <Button
                    onClick={handleSendEmail}
                    disabled={isSendingEmail || !emailTo.trim()}
                  >
                    {isSendingEmail ? "Sending..." : "Send"}
                  </Button>
                </div>

                <Input
                  placeholder="Optional message..."
                  value={emailMsg}
                  onChange={(e) => setEmailMsg(e.target.value)}
                  disabled={isSendingEmail}
                />

                {emailStatus && (
                  <div className="text-xs text-slate-300">{emailStatus}</div>
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

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<UploadPage />} />
      <Route path="/t/:transferId" element={<TransferPage />} />
    </Routes>
  );
}
