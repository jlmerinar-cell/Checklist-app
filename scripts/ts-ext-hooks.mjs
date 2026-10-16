/**
 * Node's type-stripping loader does not add .ts the way Vite does.
 * Checklist modules import each other without extensions. This resolve hook
 * is only for unit tests.
 */
export async function resolve(specifier, context, nextResolve) {
  const bare =
    (specifier.startsWith("./") || specifier.startsWith("../")) && !/\.[cm]?[jt]s$/.test(specifier);
  if (!bare) return nextResolve(specifier, context);
  try {
    return await nextResolve(`${specifier}.ts`, context);
  } catch {
    return nextResolve(specifier, context);
  }
}
