import { callRpc, withAdminRpc } from "@/lib/server/auth/admin-api";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return withAdminRpc(request, callRpc("admin_list_user_devices", { p_user_id: id }));
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return withAdminRpc(request, callRpc("admin_reset_user_devices", { p_user_id: id }));
}
