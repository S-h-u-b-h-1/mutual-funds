export function siteUrl(env = process.env) {
  const configured = env.SITE_URL || env.NEXT_PUBLIC_SITE_URL || (env.VERCEL_ENV === "production" ? null : env.NEXTAUTH_URL);
  const candidate = env.VERCEL_ENV === "preview" && env.VERCEL_URL
    ? `https://${env.VERCEL_URL}` : configured || "https://mf-pulse.vercel.app";
  const url = new URL(candidate);
  if (!["https:", "http:"].includes(url.protocol)) throw new Error("Invalid site URL protocol");
  return url.origin;
}
