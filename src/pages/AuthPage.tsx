import { useState } from "react";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
} from "firebase/auth";
import { auth } from "../lib/firebase";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { useLocation, useNavigate } from "react-router-dom";
import { GlowBackground } from "@/components/ui/GlowBackground";

// ✅ logo (same as Upload page)
import logo from "../assets/logo.png";

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

  async function handleGoogleSignIn() {
    setStatus("");
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      setStatus("✅ Logged in with Google");
      navigate(from, { replace: true });
    } catch (e: any) {
      setStatus(e?.message ?? "Google sign-in failed");
    }
  }

  return (
    <GlowBackground>
      <div className="flex items-center justify-center p-6">
        <Card className="w-full max-w-md bg-slate-900/35 border-slate-800 backdrop-blur-xl shadow-2xl">
          <CardContent className="p-7 space-y-4">
            {/* ✅ LOGO (same size as Upload page) */}
            <div className="flex justify-center pb-1">
              <img
                src={logo}
                alt="Swift Transfer"
                className="h-36 sm:h-44 md:h-52 lg:h-60 w-auto opacity-95 select-none"
                draggable={false}
              />
            </div>

            {/* ✅ Title */}
            <div className="text-xl font-semibold text-white text-center">
              {mode === "login" ? "Sign in" : "Create account"}
            </div>

            {/* ✅ Google sign-in */}
            <Button
            variant="secondary"
            onClick={handleGoogleSignIn}
            className="w-full flex items-center justify-center gap-3"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 48 48"
              className="h-5 w-5"
            >
              <path
                fill="#FFC107"
                d="M43.6 20.5H42V20H24v8h11.3C33.7 32.4 29.3 35 24 35c-6.1 0-11-4.9-11-11s4.9-11 11-11c2.8 0 5.3 1 7.2 2.8l5.7-5.7C33.4 6.1 28.9 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20c10.5 0 19-8.5 19-19 0-1.3-.1-2.5-.4-3.5z"
              />
              <path
                fill="#FF3D00"
                d="M6.3 14.7l6.6 4.8C14.7 16.2 19 13 24 13c2.8 0 5.3 1 7.2 2.8l5.7-5.7C33.4 6.1 28.9 4 24 4c-7.7 0-14.3 4.3-17.7 10.7z"
              />
              <path
                fill="#4CAF50"
                d="M24 44c4.9 0 9.3-1.9 12.6-5l-6.2-5.2C28.8 34.9 26.5 35.7 24 35c-5.3 0-9.8-3.6-11.3-8.5l-6.5 5C9.6 39.6 16.3 44 24 44z"
              />
              <path
                fill="#1976D2"
                d="M43.6 20.5H42V20H24v8h11.3c-1 2.7-3 5-5.6 6.5l6.2 5.2C39.5 36.1 43 30.7 43 25c0-1.3-.1-2.5-.4-3.5z"
              />
            </svg>

            <span>Continue with Google</span>
              </Button>


            {/* separator */}
            <div className="flex items-center gap-3 py-1">
              <div className="h-px flex-1 bg-slate-800/80" />
              <div className="text-xs text-slate-300/70">or</div>
              <div className="h-px flex-1 bg-slate-800/80" />
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
              {mode === "login"
                ? "Need an account? Sign up"
                : "Have an account? Sign in"}
            </Button>

            {status && (
              <div className="rounded-md border border-slate-800 bg-slate-950/30 p-3 text-sm text-slate-100">
                {status}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </GlowBackground>
  );
}
