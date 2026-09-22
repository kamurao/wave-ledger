import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pg"],
  // Without this, route-handler responses carry an ETag, and the platform then
  // evaluates a request's `If-Match` against it under RFC 9110 and rewrites the
  // response to 412 — after the write has already committed. See parseIfMatch.
  generateEtags: false,
};

export default nextConfig;
