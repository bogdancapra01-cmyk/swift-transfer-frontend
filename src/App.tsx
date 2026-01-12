import { useEffect, useMemo, useState } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Button } from "./components/ui/button";
import { Card, CardContent } from "./components/ui/card";
import { Input } from "./components/ui/input";
import TransferPage from "./pages/TransferPage";
import AuthPage from "./pages/AuthPage";
import MyUploadsPage from "./pages/MyUploadsPage";
import { TopRightBar } from "@/components/ui/TopRightBar";
import { PageShell } from "@/components/ui/PageShell";



// Firebase
import { getAuth, signOut, onAuthStateChanged } from "firebase/auth";
import type { User } from "firebase/auth";

// Logo (Upload Page)
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
  "https://api.swift-transfer.app";

/** Small auth gate */
function RequireAuth({ children }: { children: React.ReactNode }) {
  const auth = getAuth();
  const location = useLocation();
  const [user, setUser] = useState<User | null>(auth.currentUser);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsub();
  }, [auth]);

  if (loading) return null; // keep it simple; no UI change
  if (!user) return <Navigate to="/auth" replace state={{ from: location.pathname }} />;

  return <>{children}</>;
}

function UploadPage() {
  const auth = getAuth();
  const userEmail = auth.currentUser?.email ?? "";

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

  function clearAll() {
    setShareUrl("");
    setFiles([]);
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
      const token = await auth.currentUser?.getIdToken?.();

      const initPayload = {
        files: files.map((f) => ({
          name: f.file.name,
          type: f.file.type || "application/octet-stream",
          size: f.file.size,
        })),
      };

      const initRes = await fetch(`${API_BASE}/api/transfers/init`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
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

      const token = await auth.currentUser?.getIdToken?.();

      setIsSendingEmail(true);

      const res = await fetch(`${API_BASE}/api/transfers/${transferId}/email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
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

  async function handleSignOut() {
    await signOut(auth);
  }

  return (
  <>
    {/* TOP RIGHT: email + sign out */}
    <TopRightBar userEmail={userEmail} onSignOut={handleSignOut} />

    <PageShell maxWidth="max-w-4xl">
      {/* păstrăm exact ce aveai deja, doar schimbăm wrapper-ul exterior */}
      <Card className="relative w-full max-w-3xl bg-slate-900/35 border-slate-800 backdrop-blur-xl shadow-2xl">
        <CardContent className="p-8 space-y-6">
          {/* LOGO */}
          <div className="flex justify-center pt-2">
            <img
              src={logo}
              alt="Swift Transfer"
              className="h-36 sm:h-44 md:h-52 lg:h-60 w-auto opacity-95 select-none"
              draggable={false}
            />
          </div>

          <div className="text-center text-sm md:text-base text-slate-200/90">
            Upload files, generate a share link, and send it via email.
          </div>

          <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
            <div className="flex-1">
              {/* Choose files */}
              <div className="flex-1">
                <label
                  htmlFor="file-upload"
                  className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-slate-700 bg-slate-950/30 px-6 py-6 text-center transition hover:border-indigo-400 hover:bg-slate-900/40"
                >
                  <div className="text-lg font-medium text-slate-100">
                    Choose files
                  </div>
                  <div className="mt-1 text-sm text-slate-300/80">
                    Click to select files or drag & drop
                  </div>
                </label>

                <input
                  id="file-upload"
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => addFiles(e.target.files)}
                />
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={handleUpload} disabled={isUploading || isFinalizing}>
                {isUploading
                  ? "Uploading..."
                  : isFinalizing
                  ? "Finalizing..."
                  : "Upload"}
              </Button>

              <Button
                variant="secondary"
                onClick={clearAll}
                disabled={isUploading || isFinalizing || (!files.length && !shareUrl)}
              >
                Clear all
              </Button>
            </div>
          </div>

          <div className="text-sm text-slate-200/80">
            {files.length} file(s) • {formatBytes(totalSize)}
          </div>

          {files.length > 0 && (
            <div className="space-y-2">
              {files.map((f) => (
                <div
                  key={f.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/20 px-4 py-3"
                >
                  <div className="min-w-0">
                    <div className="truncate text-slate-100">{f.file.name}</div>
                    <div className="text-xs text-slate-300/80">
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
            <div className="rounded-lg border border-slate-800 bg-slate-950/25 p-4 text-sm text-slate-100">
              {status}
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-900/60 bg-red-950/30 p-4 text-sm text-red-100">
              {error}
            </div>
          )}

          {shareUrl && (
            <div className="rounded-xl border border-slate-800 bg-slate-950/20 p-4 space-y-3">
              <div className="font-medium text-emerald-300">✅ Share link</div>

              <div className="flex flex-col md:flex-row items-stretch md:items-center gap-2">
                <input
                  value={shareUrl}
                  readOnly
                  className="flex-1 rounded-md border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100"
                />

                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    onClick={() =>
                      window.open(shareUrl, "_blank", "noopener,noreferrer")
                    }
                  >
                    Open
                  </Button>
                  <Button onClick={() => navigator.clipboard.writeText(shareUrl)}>
                    Copy
                  </Button>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-800/70 space-y-2">
                <div className="text-sm text-slate-200/90 font-medium">
                  Send share link by email
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  <Input
                    value={emailTo}
                    onChange={(e) => setEmailTo(e.target.value)}
                    placeholder="recipient@email.com"
                    className="md:col-span-1 text-slate-100 placeholder:text-slate-400"
                  />
                  <Input
                    value={emailMsg}
                    onChange={(e) => setEmailMsg(e.target.value)}
                    placeholder="Optional message..."
                    className="md:col-span-2 text-slate-100 placeholder:text-slate-400"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    onClick={handleSendEmail}
                    disabled={isSendingEmail || !emailTo.trim()}
                  >
                    {isSendingEmail ? "Sending..." : "Send"}
                  </Button>

                  {emailStatus && (
                    <div className="text-sm text-slate-200/80">{emailStatus}</div>
                  )}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </PageShell>
  </>
);

}

export default function App() {
  return (
    <Routes>
      {/* Default: requires auth; otherwise redirect to /auth */}
      <Route
        path="/"
        element={
          <RequireAuth>
            <UploadPage />
          </RequireAuth>
        }
      />

      {/* Auth page */}
      <Route path="/auth" element={<AuthPage />} />

      {/* Transfer page (public) */}
      <Route path="/t/:transferId" element={<TransferPage />} />


      {/* My uploads (protected) */}
      <Route
        path="/my-uploads"
        element={
          <RequireAuth>
            <MyUploadsPage />
          </RequireAuth>
        }
      />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

