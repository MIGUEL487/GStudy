import { defineConfig } from "nitro/config";

export default defineConfig({
  compressPublicAssets: true,
  // Ship the server's JavaScript dependencies inside the Vercel function.
  // Keep Nitro's host detection, routes and Lovable preset intact.
  noExternals: process.env["VERCEL"] === "1" || process.env["NITRO_PRESET"] === "vercel",
  vercel: {
    regions: ["gru1"],
    functions: {
      maxDuration: 60,
    },
  },
});
