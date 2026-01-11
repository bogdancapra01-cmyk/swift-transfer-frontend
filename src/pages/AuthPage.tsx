import { useState } from "react";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from "firebase/auth";
import { auth } from "../lib/firebase";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { useLocation, useNavigate } from "react-router-dom";



export default function AuthPage() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [status, setStatus] = useState<string>("");
  const navigate = useNavigate();
  const location = useLocation() as any;
  const from = location?.state?.from ?? "/";


  async function handleSubmit() {
    setStatus("");
    try {
      if (!email.trim() || !pass.trim()) {
        setStatus("Insert email + password");
        return;
      }

      if (mode === "login") {
        await signInWithEmailAndPassword(auth, email.trim(), pass);
        setStatus("✅ Logged in");
        navigate(from, { replace: true });
      } else {
        await createUserWithEmailAndPassword(auth, email.trim(), pass);
        setStatus("✅ Account created");
      }
    } catch (e: any) {
      setStatus(e?.message ?? "Auth failed");
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
      <Card className="w-full max-w-md bg-slate-900/35 border-slate-800 backdrop-blur-xl shadow-2xl">
        <CardContent className="p-7 space-y-4">
          <div className="text-xl font-semibold">
            {mode === "login" ? "Sign in" : "Create account"}
          </div>

          <div className="space-y-2">
            <div className="text-xs text-slate-300/80">Email</div>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="text-slate-100 placeholder:text-slate-500"
            />
          </div>

          <div className="space-y-2">
            <div className="text-xs text-slate-300/80">Password</div>
            <Input
              type="password"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              className="text-slate-100 placeholder:text-slate-500"
            />
          </div>

          <Button onClick={handleSubmit} className="w-full">
            {mode === "login" ? "Sign in" : "Sign up"}
          </Button>

          <Button
            variant="secondary"
            onClick={() => setMode(mode === "login" ? "signup" : "login")}
            className="w-full"
          >
            {mode === "login" ? "Need an account? Sign up" : "Have an account? Sign in"}
          </Button>

          {status && (
            <div className="rounded-md border border-slate-800 bg-slate-950/30 p-3 text-sm text-slate-100">
              {status}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
