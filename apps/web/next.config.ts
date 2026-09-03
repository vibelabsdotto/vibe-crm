import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Monorepo: npm hoists deps zum Repo-Root — standalone-Tracing muss von dort ausgehen.
  outputFileTracingRoot: path.join(__dirname, "../../"),
};

export default nextConfig;
