import { getServerSession } from "next-auth";
import { authOptions } from "../../lib/auth";
import { redirect } from "next/navigation";
import DashboardClient from "../../components/DashboardClient";

export const revalidate = 0; // Disable static generation for this page

export default async function DashboardPage() {
  console.log("🔵 [Dashboard Page] Loading...");
  
  const session = await getServerSession(authOptions);
  console.log("📋 [Dashboard Page] Session retrieved:", {
    hasSession: !!session,
    hasAccessToken: !!session?.accessToken,
    user: session?.user?.email,
  });

  if (!session) {
    console.log("❌ [Dashboard Page] No session found, redirecting to /login");
    redirect("/login");
  }

  if (!session.accessToken) {
    console.error("❌ [Dashboard Page] Session exists but no accessToken");
    redirect("/login");
  }

  console.log("✅ [Dashboard Page] Session valid, rendering DashboardClient");

  return (
    <>
      <DashboardClient />
    </>
  );
}
