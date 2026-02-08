import { getServerSession } from "next-auth";
import { authOptions } from "../../lib/auth";
import { redirect } from "next/navigation";
import DashboardClient from "../../components/DashboardClient";

export const revalidate = 0; // Disable static generation for this page

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/login");
  }

  return (
    <>
      <DashboardClient />
    </>
  );
}
