import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The page and API routes read the pipeline's output from data/ at runtime, so it has to ship
  // with every serverless function.
  outputFileTracingIncludes: { '/**': ['./data/**/*'] },
};

export default nextConfig;
