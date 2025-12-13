import { useMemo, useState } from "react";
import { Button } from "./components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card";
import { Input } from "./components/ui/input";
import { Label } from "./components/ui/label";

type SelectedFile = {
  file: File;
  id: string;
};

function formatBytes(bytes: number) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const value = bytes / Math.pow(k, i);
  return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${sizes[i]}`;
}

export default function App() {
  const [files, setFiles] = useState<SelectedFile[]>([]);
  const totalSize = useMemo(
  () => files.reduce<number>((sum, f) => sum + f.file.size, 0),
  [files]
  );

  function addFiles(list: FileList | null) {
    if (!list) return;
    const incoming = Array.from(list).map((file) => ({
      file,
      id: crypto.randomUUID(),
    }));
    setFiles((prev) => [...prev, ...incoming]);
  }

  function removeFile(id: string) {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
      <Card className="w-full max-w-2xl bg-slate-900/60 border-slate-800">
        <CardHeader>
          <CardTitle className="text-2xl">Swift Transfer</CardTitle>
          <p className="text-sm text-slate-300">
            Upload documents and generate a shareable link.
          </p>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="file">Select files</Label>
            <Input
              id="file"
              type="file"
              multiple
              onChange={(e) => addFiles(e.target.files)}
            />
            <p className="text-xs text-slate-400">
              Supported: pdf, png, jpg, xlsx, docx etc.
            </p>
          </div>

          <div className="rounded-lg border border-slate-800 p-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Selected files</p>
              <p className="text-xs text-slate-400">
                {files.length} files • {formatBytes(totalSize)}
              </p>
            </div>

            {files.length === 0 ? (
              <p className="text-sm text-slate-400 mt-2">
                No files selected yet.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {files.map(({ file, id }) => (
                  <li
                    key={id}
                    className="flex items-center justify-between rounded-md bg-slate-950/50 border border-slate-800 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="text-sm truncate">{file.name}</p>
                      <p className="text-xs text-slate-400">
                        {formatBytes(file.size)}
                      </p>
                    </div>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => removeFile(id)}
                    >
                      Remove
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex gap-2">
            <Button
              className="flex-1"
              disabled={files.length === 0}
              onClick={() => alert("Next: connect to backend upload API")}
            >
              Upload & Generate Link
            </Button>
            <Button
              variant="secondary"
              onClick={() => setFiles([])}
              disabled={files.length === 0}
            >
              Clear
            </Button>
          </div>

          <p className="text-xs text-slate-400">
            Next step: connect this button to the backend endpoint that uploads
            files to Cloud Storage and creates a share token in Firestore.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
