import { callRpc, withAdminRpc } from "@/lib/server/auth/admin-api";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? Number.parseInt(limitParam, 10) : 200;
  return withAdminRpc(
    request,
    callRpc("admin_list_audit_log", { p_limit: Number.isFinite(limit) ? limit : 200 }),
  );
}
