export function buildCompanyArchiveLink(companyId: string, companyName: string): string {
  const searchParams = new URLSearchParams({
    companyId,
    companyName,
  });
  return `${process.env.FRONTEND_URL}/archivio?${searchParams.toString()}`;
}
