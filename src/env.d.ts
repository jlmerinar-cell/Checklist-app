interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  readonly VITE_CALENDAR_HOOK_URL?: string;
  readonly VITE_CALENDAR_HOOK_TOKEN?: string;
  readonly VITE_PUBLIC_HOSTNAME?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
