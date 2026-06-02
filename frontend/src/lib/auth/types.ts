export type ProfileStatus = "pending" | "active" | "blocked" | "expired";

export type ProfileRole = "user" | "admin";

export type DeviceAuthStatus =
  | "authorized"
  | "device_limit"
  | "superseded"
  | ProfileStatus
  | "error";

export interface AuthConfigResponse {
  auth_required: boolean;
  configured: boolean;
  supabase_url: string | null;
  supabase_anon_key: string | null;
  redirect_to: string;
}

export interface DeviceInfo {
  device_id: string;
  device_name: string;
  platform: string;
  app_version: string;
}

export interface RegisteredDevice {
  device_id: string;
  device_name: string;
  platform: string;
  app_version?: string | null;
  registered_at: string;
  last_seen_at: string | null;
}

export interface DeviceAuthResponse {
  ok: boolean;
  status: DeviceAuthStatus;
  message?: string;
  user_email?: string | null;
  profile_status?: ProfileStatus | null;
  profile_role?: ProfileRole | null;
  current_device_id?: string;
  devices?: RegisteredDevice[];
  next_replacement_at?: string | null;
}
