export type BackendError = { code?: string; message?: string } | null | undefined;

export function isMissingSchema(error: BackendError): boolean {
  return Boolean(
    error &&
    (["PGRST205", "PGRST202", "PGRST204", "42P01", "42703", "42883"].includes(error.code ?? "") ||
      /schema cache|does not exist/i.test(error.message ?? "")),
  );
}

export function backendErrorMessage(error: BackendError, fallback: string): string {
  if (isMissingSchema(error))
    return "Este recurso está aguardando uma atualização. O restante do seu espaço continua disponível.";
  if (error?.code === "23505")
    return "Este registro já existe. Atualize a lista antes de tentar novamente.";
  if (error?.code === "42501")
    return "Você não tem acesso a esta ação. Confira sua sessão e tente novamente.";
  return fallback;
}
