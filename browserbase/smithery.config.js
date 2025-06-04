/**
 * @type {import('esbuild').BuildOptions}
 */
export default {
  esbuild: {
    // Mark playwright-core as external to prevent bundling
    // This avoids the relative path resolution issue in Docker
    external: ["playwright-core"],
  }
}
