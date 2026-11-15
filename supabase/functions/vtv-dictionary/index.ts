import { handlePreview } from "../../../lib/vua-tieng-viet/preview-handler.ts";
import { createDictionaryAdapter } from "./adapter.ts";

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Promise<Response>): void;
};

Deno.serve(async (request) => {
  const secret = Deno.env.get("ADMIN_JWT_SECRET") ?? "";
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const origins = (Deno.env.get("VTV_ALLOWED_ORIGINS") ?? "").split(",").map((item) => item.trim()).filter(Boolean);
  return handlePreview(request, {
    secret: url && serviceKey ? secret : "",
    origins,
    now: () => Math.floor(Date.now() / 1000),
    ...createDictionaryAdapter(url, serviceKey),
  });
});
