const DELETE_INVALIDATION_PREFIXES = [
  "/companies",
  "/fields",
  "/production-units",
  "/products",
  "/warehouses",
  "/files",
  "/field-notes",
  "/jobs",
] as const;

export function shouldInvalidateCompanyDeleteQuery(
  queryKey: readonly unknown[],
): boolean {
  const root = queryKey[0];
  if (root === "extractions") return true;
  if (typeof root !== "string") return false;
  return DELETE_INVALIDATION_PREFIXES.some((prefix) => root.startsWith(prefix));
}

export function isCompanyScopedTabId(
  tabId: string,
  companyIds: readonly string[],
): boolean {
  return companyIds.some((companyId) => {
    const exactIds = [
      `company:${companyId}`,
      `company-${companyId}`,
      `fields-${companyId}`,
      `pu-${companyId}`,
      `products-${companyId}`,
      `field-notes-${companyId}`,
      `jobs-${companyId}`,
    ];
    return exactIds.includes(tabId) || tabId.startsWith(`jobs-${companyId}-`);
  });
}
