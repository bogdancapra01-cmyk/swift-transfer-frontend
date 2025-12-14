import { useMemo, useState } from "react";
import { Routes, Route } from "react-router-dom";
import { Button } from "./components/ui/button";
import { Card, CardContent, CardHeader } from "./components/ui/card";
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
  const [emailTo, setEmailTo] = useState("");
  const [emailMsg, setEmailMsg] = useState("");
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [emailStatus, setEmailStatus] = useState<string>("");

  const [isFinalizing, setIsFinalizing] = useState(false);

  const totalSize = useMemo(
    () => files.reduce((sum, f) => sum + f.file.size, 0),
    [files]
  );

  function addFiles(list: FileList | null) {
    if (!list) return;

    setShareUrl("");
    setEmailStatus("");
    setError("");

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
      <Card
        className="w-full max-w-2xl
                   bg-slate-900/60 backdrop-blur
                   border border-slate-800
                   shadow-2xl rounded-2xl"
      >
        <CardHeader className="space-y-3">
          <div className="flex justify-center">
            <img src={logo} alt="Swift Transfer" className="h-14 md:h-16" />
          </div>

          <p className="text-sm text-white/90 text-center">
            Încarcă fișiere, primești link de share, apoi poți trimite pe email.
          </p>
        </CardHeader>

        <CardContent className="space-y-5">
          {/* Dropzone / picker */}
          <div
            className="border-2 border-dashed border-slate-700 rounded-xl p-6 md:p-8
                       bg-slate-950/40 hover:border-indigo-500 transition
                       flex flex-col items-center gap-4 text-center"
          >
            <p className="text-white/80 text-sm">
              Drag & drop fișiere aici sau alege manual
            </p>

            <Input
              type="file"
              multiple
              onChange={(e) => addFiles(e.target.files)}
              className="max-w-xs text-white"
            />

            <div className="flex items-center gap-2">
              <Button
                onClick={handleUpload}
                disabled={isUploading || isFinalizing}
              >
                {isUploading
                  ? "Uploading..."
                  : isFinalizing
                  ? "Finalizing..."
                  : "Upload"}
              </Button>

              <Button
                variant="secondary"
                onClick={clearAll}
                disabled={isUploading || isFinalizing || files.length === 0}
              >
                Clear all
              </Button>
            </div>

            <div className="text-xs text-white/60">
              {files.length} fișier(e) • {formatBytes(totalSize)}
            </div>
          </div>

          {/* Selected files */}
          {files.length > 0 && (
            <div className="space-y-2">
              <div className="text-sm text-white/80">Selected files</div>

              {files.map((f) => (
                <div
                  key={f.id}
                  className="flex items-center justify-between rounded-md
                             border border-slate-800 bg-slate-950/40 px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="truncate text-white">{f.file.name}</div>
                    <div className="text-xs text-white/60">
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

          {/* Status / error */}
          {status && (
            <div className="rounded-md border border-slate-800 bg-slate-950/40 p-3 text-sm text-white">
              {status}
            </div>
          )}

          {error && (
            <div className="rounded-md border border-red-900 bg-red-950/40 p-3 text-sm text-red-200">
              {error}
            </div>
          )}

          {/* Share link */}
          {shareUrl && (
            <div className="rounded-md border border-slate-800 bg-slate-950/40 p-3 text-sm space-y-3">
              <div className="font-medium text-green-400">✅ Share link</div>

              <div className="flex items-center gap-2">
                <input
                  value={shareUrl}
                  readOnly
                  className="flex-1 rounded-md border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-white"
                />
                <Button
                  onClick={() => navigator.clipboard.writeText(shareUrl)}
                  disabled={!shareUrl}
                >
                  Copy
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => window.open(shareUrl, "_blank", "noopener,noreferrer")}
                >
                  Open
                </Button>
              </div>

              {/* Email */}
              <div className="pt-2 border-t border-slate-800 space-y-2">
                <div className="text-sm text-white/80 font-medium">
                  Send share link by email
                </div>

                <div className="flex flex-col gap-2">
                  <Input
                    value={emailTo}
                    onChange={(e) => setEmailTo(e.target.value)}
                    placeholder="recipient@email.com"
                  />
                  <textarea
                    value={emailMsg}
                    onChange={(e) => setEmailMsg(e.target.value)}
                    placeholder="Optional message..."
                    className="min-h-[84px] rounded-md border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-white placeholder:text-white/40"
                  />

                  <Button
                    onClick={handleSendEmail}
                    disabled={isSendingEmail}
                    className="self-start"
                  >
                    {isSendingEmail ? "Sending..." : "Send"}
                  </Button>

                  {emailStatus && (
                    <div className="text-xs text-white/70">{emailStatus}</div>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="text-xs text-white/40">API: {API_BASE}</div>
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
