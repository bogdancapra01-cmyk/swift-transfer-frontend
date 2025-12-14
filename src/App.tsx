import { useMemo, useState } from "react";
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
  const [files, setFiles] = useState<SelectedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [error, setError] = useState<string>("");

  const [shareUrl, setShareUrl] = useState<string>("");

  // Email share UI
  const [emailTo, setEmailTo] = useState("");
  const [emailMsg, setEmailMsg] = useState("");
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [emailStatus, setEmailStatus] = useState<string>("");

  const [isFinalizing, setIsFinalizing] = useState(false);

  const totalSize = useMemo(
    () => files.reduce((sum, f) => sum + f.file.size, 0),
    [files]
  );

  function resetShareAndEmailUI() {
    setShareUrl("");
    setEmailStatus("");
    setEmailTo("");
    setEmailMsg("");
  }

  function addFiles(list: FileList | null) {
    if (!list) return;

    resetShareAndEmailUI();

    const incoming: SelectedFile[] = Array.from(list).map((file) => ({
      file,
      id: crypto.randomUUID(),
    }));
    setFiles((prev) => [...prev, ...incoming]);
  }

  function removeFile(id: string) {
    resetShareAndEmailUI();
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }

  async function handleUpload() {
    setError("");
    setStatus("");
    resetShareAndEmailUI();

    if (!files.length) {
      setError("Selectează cel puțin un fișier.");
      return;
    }

    setIsUploading(true);

    try {
      // 1) init transfer (get signed upload URLs)
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

      // 2) upload each file directly to GCS using signed URL
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

      // 3) COMPLETE transfer (mark ready + get shareUrl)
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

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
      <Card className="w-full max-w-2xl bg-slate-900/60 border-slate-800">
        <CardHeader>
          <CardTitle className="text-2xl">Swift Transfer 🚀</CardTitle>
          <p className="text-sm text-slate-300">
            Încarcă fișiere și generăm link-uri de upload (pasul următor: share
            link + email).
          </p>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Input
              type="file"
              multiple
              onChange={(e) => addFiles(e.target.files)}
            />
            <Button onClick={handleUpload} disabled={isUploading || isFinalizing}>
              {isUploading
                ? "Uploading..."
                : isFinalizing
                ? "Finalizing..."
                : "Upload"}
            </Button>
          </div>

          <div className="text-sm text-slate-300">
            {files.length} fișier(e) • {formatBytes(totalSize)}
          </div>

          {files.length > 0 && (
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
                    disabled={isUploading || isFinalizing}
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          )}

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

          {/* Share link + email (only after upload) */}
          {shareUrl && (
            <div className="rounded-md border border-slate-800 bg-slate-950/40 p-3 text-sm space-y-3">
              <div className="font-medium text-green-400">✅ Share link</div>

              <div className="flex items-center gap-2">
                <input
                  value={shareUrl}
                  readOnly
                  className="flex-1 rounded-md border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100"
                />
                <Button
                  onClick={() => navigator.clipboard.writeText(shareUrl)}
                  disabled={!shareUrl}
                >
                  Copy
                </Button>
              </div>

              <div className="h-px bg-slate-800" />

              <div className="space-y-2">
                <div className="font-medium text-slate-200">📧 Share via email</div>

                <input
                  value={emailTo}
                  onChange={(e) => setEmailTo(e.target.value)}
                  placeholder="ex: nume@email.com"
                  className="w-full rounded-md border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100"
                />

                <textarea
                  value={emailMsg}
                  onChange={(e) => setEmailMsg(e.target.value)}
                  placeholder="(opțional) Mesaj"
                  rows={3}
                  className="w-full resize-none rounded-md border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100"
                />

                <div className="flex items-center gap-2">
                  <Button
                    onClick={handleSendEmail}
                    disabled={isSendingEmail || !emailTo.trim()}
                  >
                    {isSendingEmail ? "Sending..." : "Send"}
                  </Button>

                  {emailStatus && (
                    <div className="text-xs text-slate-300 break-words">
                      {emailStatus}
                    </div>
                  )}
                </div>
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
