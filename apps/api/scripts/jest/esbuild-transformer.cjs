/**
 * Jest transformer for ESM-only packages (better-auth ships .mjs without a
 * CJS build; its deps like @noble/*, jose, kysely are ESM-only too).
 *
 * Converts ESM syntax to CJS via esbuild so Jest's script runtime can execute
 * the code. Additionally rewrites literal dynamic imports (`import("x")`) to
 * lazy `require`s: Jest's CJS runtime cannot execute dynamic import() without
 * --experimental-vm-modules, and better-auth's core does `import("node:async_hooks")`
 * at init time (see better-auth issue #5111). For node builtins/CJS deps the
 * require-based form is semantically equivalent here.
 */
const esbuild = require('esbuild');

const DYNAMIC_IMPORT_RE = /\bimport\(\s*(['"])([^'"\n]+)\1\s*\)/g;

module.exports = {
  process(sourceText, sourcePath) {
    const { code, warnings } = esbuild.transformSync(sourceText, {
      loader: 'js',
      format: 'cjs',
      target: 'node22',
      sourcefile: sourcePath,
    });
    for (const warning of warnings) {
      console.warn(`[esbuild-transformer] ${sourcePath}: ${warning.text}`);
    }
    const rewritten = code.replace(
      /\bimport\(\s*(?:\/\*[^*]*\*\/\s*)*(['"])([^'"\n]+)\1\s*\)/g,
      (_match, quote, specifier) =>
        `Promise.resolve().then(() => require(${quote}${specifier}${quote}))`,
    );
    return { code: rewritten };
  },
};
