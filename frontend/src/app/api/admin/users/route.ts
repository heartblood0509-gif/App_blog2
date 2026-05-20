import { callRpc, withAdminRpc } from "@/lib/server/auth/admin-api";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const statusFilter = url.searchParams.get("status");
  return withAdminRpc(
    request,
    callRpc("admin_list_users", { p_status: statusFilter || null }),
  );
}
