import { useMemo, useState } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Button } from "./components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card";
import { Input } from "./components/ui/input";
import TransferPage from "./pages/TransferPage";
import AuthPage from "./pages/AuthPage";
import { useAuth } from "./lib/auth";
import { signOut } from "firebase/auth";
import { auth } from "./lib/firebase";
import type { ReactElement } from "react";

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
  "https://api.swift-transfer.app";

function RequireAuth({ children }: { children: ReactElement }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
        <div className="rounded-md border border-slate-800 bg-slate-900/40 px-4 py-3 text-sm">
          Checking session...
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace state={{ from: location.pathname }} />;
  }

  return children;
}


function UploadPage() {
  const { user, getIdToken } = useAuth();


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
    const incoming: SelectedFile[] = Array.from(list).map((file) => ({
      file,
      id: crypto.randomUUID(),
    }));
    setFiles((prev) => [...prev, ...incoming]);
  }

  function removeFile(id: string) {
    setShareUrl("");
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }

  async function handleUpload() {
    setError("");
    setStatus("");
    setShareUrl("");

    if (!files.length) {
      setError("Selectează cel puțin un fișier.");
      return;
    }

    setIsUploading(true);

    try {
      const initPayload = {
        files: files.map((f) => ({
          name: f.file.name,
          type: f.file.type || "application/octet-stream",
          size: f.file.size,
        })),
      };

      const token = await getIdToken();
      if (!token) throw new Error("Not authenticated.");
      const initRes = await fetch(`${API_BASE}/api/transfers/init`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },

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

      setIsFinalizing(true);
      setStatus("Finalizing transfer (generating share link)...");

      const completeRes = await fetch(`${API_BASE}/api/transfers/complete`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
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

      const token = await getIdToken();
      if (!token) throw new Error("Not authenticated.");

      const res = await fetch(`${API_BASE}/api/transfers/${transferId}/email`, {
        method: "POST",
        headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        },
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
      <Card className="w-full max-w-2xl bg-slate-900/35 border-slate-800 backdrop-blur-xl shadow-2xl">
        <CardHeader className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-2xl">Swift Transfer</CardTitle>

            <div className="flex items-center gap-2">
              <div className="text-xs text-slate-300/80 hidden sm:block">
                {user?.email}
              </div>
              <Button
                variant="secondary"
                onClick={() => signOut(auth)}
                className="h-9"
              >
                Sign out
              </Button>
            </div>
          </div>

          <p className="text-sm text-slate-200/80">
            Încarcă fișiere și generăm share link + email.
          </p>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Input type="file" multiple onChange={(e) => addFiles(e.target.files)} />
            <Button onClick={handleUpload} disabled={isUploading || isFinalizing}>
              {isUploading ? "Uploading..." : isFinalizing ? "Finalizing..." : "Upload"}
            </Button>
          </div>

          <div className="text-sm text-slate-200/80">
            {files.length} fișier(e) • {formatBytes(totalSize)}
          </div>

          {files.length > 0 && (
            <div className="space-y-2">
              {files.map((f) => (
                <div
                  key={f.id}
                  className="flex items-center justify-between rounded-md border border-slate-800 bg-slate-950/30 px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="truncate text-slate-100">{f.file.name}</div>
                    <div className="text-xs text-slate-300/70">
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
            <div className="rounded-md border border-slate-800 bg-slate-950/30 p-3 text-sm text-slate-100">
              {status}
            </div>
          )}

          {error && (
            <div className="rounded-md border border-red-900 bg-red-950/40 p-3 text-sm text-red-200">
              {error}
            </div>
          )}

          {/* Share link + Email UI */}
          {shareUrl && (
            <div className="rounded-md border border-slate-800 bg-slate-950/30 p-4 text-sm space-y-3">
              <div className="font-medium text-green-400">✅ Share link</div>

              <div className="flex items-center gap-2">
                <input
                  value={shareUrl}
                  readOnly
                  className="flex-1 rounded-md border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100"
                />
                <Button onClick={() => navigator.clipboard.writeText(shareUrl)}>
                  Copy
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                <div className="space-y-1">
                  <div className="text-xs text-slate-300/80">Send to email</div>
                  <Input
                    value={emailTo}
                    onChange={(e) => setEmailTo(e.target.value)}
                    placeholder="name@example.com"
                    className="text-slate-100 placeholder:text-slate-500"
                  />
                </div>

                <div className="space-y-1">
                  <div className="text-xs text-slate-300/80">Optional message</div>
                  <Input
                    value={emailMsg}
                    onChange={(e) => setEmailMsg(e.target.value)}
                    placeholder="Short message..."
                    className="text-slate-100 placeholder:text-slate-500"
                  />
                </div>
              </div>

              <Button onClick={handleSendEmail} disabled={isSendingEmail}>
                {isSendingEmail ? "Sending..." : "Send email"}
              </Button>

              {emailStatus && (
                <div className="text-xs text-slate-300/80">{emailStatus}</div>
              )}
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
      <Route path="/auth" element={<AuthPage />} />

      <Route
        path="/"
        element={
          <RequireAuth>
            <UploadPage />
          </RequireAuth>
        }
      />

      <Route
        path="/t/:transferId"
        element={
          <RequireAuth>
            <TransferPage />
          </RequireAuth>
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
