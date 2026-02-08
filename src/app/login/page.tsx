"use client";

import { signIn } from "next-auth/react";
import { useEffect, useState } from "react";

export default function LoginPage() {
  const [demoMode, setDemoMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check if in demo mode
  useEffect(() => {
    const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
    setDemoMode(isDemoMode);
  }, []);

  // Read `error` query param on the client to avoid Suspense/CSR bailout
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      setError(params.get("error"));
    } catch (e) {
      setError(null);
    }
  }, []);

  const handleDemoSignIn = async () => {
    setLoading(true);
    await signIn("demo", {
      redirect: true,
      callbackUrl: "/dashboard",
      demo: "true",
    });
  };

  const handleStravaSignIn = async () => {
    setLoading(true);
    await signIn("strava", {
      redirect: true,
      callbackUrl: "/dashboard",
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-2xl p-8 max-w-md w-full">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">
            Interval Training Tracker
          </h1>
          <p className="text-gray-600">
            Track your interval training progress with Strava
          </p>
          {demoMode && (
            <div className="mt-3 bg-blue-50 border border-blue-200 text-blue-700 px-3 py-2 rounded-lg text-sm">
              📊 Demo Mode: Using sample data
            </div>
          )}
        </div>

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">
            {error}
          </div>
        )}

        <button
          onClick={demoMode ? handleDemoSignIn : handleStravaSignIn}
          disabled={loading}
          className="w-full bg-orange-500 text-white py-3 rounded-lg font-semibold hover:bg-orange-600 transition mb-4 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Signing in..." : demoMode ? "Enter Demo Mode" : "Sign in with Strava"}
        </button>

        <div className="text-center text-sm text-gray-600">
          <p>
            This app will help you analyze your interval training sessions and track
            your progress over time.
          </p>
        </div>
      </div>
    </div>
  );
}
