import dns from "node:dns/promises";
import net from "node:net";

export function isPrivateIp(ip: string): boolean {
  const clean = ip.trim().toLowerCase();

  // IPv4-mapped IPv6 (ex: ::ffff:127.0.0.1)
  if (clean.startsWith("::ffff:")) {
    const rest = clean.slice(7);
    if (rest.includes(".")) {
      return isPrivateIp(rest);
    }
  }

  const ipType = net.isIP(clean);
  if (ipType === 0) {
    // Não é um IP numérico
    return false;
  }

  // IPv4
  if (ipType === 4) {
    const parts = clean.split(".");
    if (parts.length !== 4) return true;
    const nums = parts.map((p) => Number(p));
    if (nums.some((n) => isNaN(n) || n < 0 || n > 255)) return true;

    const [a, b, c] = nums;

    // 0.0.0.0/8 (Rede atual)
    if (a === 0) return true;
    // 10.0.0.0/8 (Privada)
    if (a === 10) return true;
    // 127.0.0.0/8 (Loopback / Localhost)
    if (a === 127) return true;
    // 169.254.0.0/16 (Link-local / Metadados de nuvem como 169.254.169.254)
    if (a === 169 && b === 254) return true;
    // 172.16.0.0/12 (Privada: 172.16.0.0 - 172.31.255.255)
    if (a === 172 && b >= 16 && b <= 31) return true;
    // 192.168.0.0/16 (Privada)
    if (a === 192 && b === 168) return true;
    // 100.64.0.0/10 (CGNAT)
    if (a === 100 && b >= 64 && b <= 127) return true;
    // 192.0.0.0/24
    if (a === 192 && b === 0 && c === 0) return true;
    // 192.0.2.0/24 (TEST-NET-1)
    if (a === 192 && b === 0 && c === 2) return true;
    // 198.51.100.0/24 (TEST-NET-2)
    if (a === 198 && b === 51 && c === 100) return true;
    // 203.0.113.0/24 (TEST-NET-3)
    if (a === 203 && b === 0 && c === 113) return true;
    // 224.0.0.0/4 (Multicast)
    if (a >= 224 && a <= 239) return true;
    // 240.0.0.0/4 (Reservado / Broadcast)
    if (a >= 240) return true;

    return false;
  }

  // IPv6
  if (ipType === 6) {
    // ::1 (Loopback)
    if (clean === "::1" || clean === "0:0:0:0:0:0:0:1") return true;
    // :: (Não especificado)
    if (clean === "::" || clean === "0:0:0:0:0:0:0:0") return true;

    const firstWord = clean.split(":")[0];
    const firstHex = parseInt(firstWord || "0", 16);

    // fe80::/10 (Link-local) -> 0xfe80 - 0xfebf
    if ((firstHex & 0xffc0) === 0xfe80) return true;
    // fc00::/7 (ULA / Unique Local) -> 0xfc00 - 0xfdff
    if ((firstHex & 0xfe00) === 0xfc00) return true;
    // ff00::/8 (Multicast)
    if ((firstHex & 0xff00) === 0xff00) return true;

    return false;
  }

  return true;
}

export interface SafeFetchOptions {
  timeoutMs?: number;
  maxRedirects?: number;
  maxBytes?: number;
  dnsLookup?: (hostname: string) => Promise<string[]>;
  fetchFn?: typeof fetch;
}

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_MAX_REDIRECTS = 3;
const DEFAULT_MAX_BYTES = 1_048_576; // ~1 MB

export async function validateSafeUrl(
  inputUrl: string,
  dnsLookup?: (hostname: string) => Promise<string[]>,
): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(inputUrl);
  } catch {
    throw new Error("URL inválida.");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Protocolo não permitido. Utilize apenas http ou https.");
  }

  const hostname = parsed.hostname.toLowerCase();
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    throw new Error("Acesso a endereços locais ou internos não é permitido.");
  }

  // Se o próprio hostname for um IP numérico privado:
  if (isPrivateIp(hostname)) {
    throw new Error("Acesso a endereços de rede privada ou local bloqueado por segurança.");
  }

  let addresses: string[] = [];
  if (dnsLookup) {
    addresses = await dnsLookup(hostname);
  } else {
    try {
      const resolved = await dns.lookup(hostname, { all: true });
      addresses = resolved.map((r) => r.address);
    } catch {
      throw new Error(`Não foi possível resolver o domínio "${hostname}".`);
    }
  }

  if (addresses.length === 0) {
    throw new Error(`Nenhum endereço IP encontrado para o domínio "${hostname}".`);
  }

  for (const addr of addresses) {
    if (isPrivateIp(addr)) {
      throw new Error("Acesso a endereços de rede privada ou local bloqueado por segurança.");
    }
  }

  return parsed;
}

export async function safeFetch(
  rawUrl: string,
  options: SafeFetchOptions = {},
): Promise<{ text: string; finalUrl: string; response: Response }> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const doFetch = options.fetchFn ?? fetch;

  let currentUrl = rawUrl;
  let redirectsCount = 0;

  while (true) {
    const validatedUrl = await validateSafeUrl(currentUrl, options.dnsLookup);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await doFetch(validatedUrl.href, {
        headers: {
          "User-Agent": "GStudyBot/1.0 (+https://gstudy.app)",
          Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        },
        redirect: "manual",
        signal: controller.signal,
      });
    } catch (err: unknown) {
      clearTimeout(timeout);
      if (err instanceof Error && err.name === "AbortError") {
        throw new Error("A requisição demorou muito para responder (tempo limite esgotado).");
      }
      throw new Error("Falha ao conectar ao servidor do link fornecido.");
    } finally {
      clearTimeout(timeout);
    }

    // Tratamento de redirecionamentos manuais
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      if (redirectsCount >= maxRedirects) {
        await response.body?.cancel();
        throw new Error("Limite máximo de redirecionamentos excedido.");
      }
      const location = response.headers.get("location");
      if (!location) {
        await response.body?.cancel();
        throw new Error("Redirecionamento sem cabeçalho Location.");
      }
      await response.body?.cancel();
      currentUrl = new URL(location, validatedUrl).href;
      redirectsCount++;
      continue;
    }

    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`Não foi possível abrir o link: status ${response.status}.`);
    }

    const contentType = response.headers.get("content-type") || "";
    if (
      !contentType.toLowerCase().includes("text/html") &&
      !contentType.toLowerCase().includes("application/xhtml+xml")
    ) {
      await response.body?.cancel();
      throw new Error("O link fornecido não aponta para uma página HTML válida.");
    }

    // Leitura em stream até maxBytes
    if (!response.body) {
      return { text: "", finalUrl: validatedUrl.href, response };
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytesRead = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          const remaining = maxBytes - bytesRead;
          if (value.byteLength > remaining) {
            chunks.push(value.subarray(0, remaining));
            bytesRead += remaining;
            await reader.cancel();
            break;
          } else {
            chunks.push(value);
            bytesRead += value.byteLength;
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    const totalBuffer = new Uint8Array(bytesRead);
    let offset = 0;
    for (const chunk of chunks) {
      totalBuffer.set(chunk, offset);
      offset += chunk.byteLength;
    }

    const decoder = new TextDecoder("utf-8", { fatal: false, ignoreBOM: true });
    const text = decoder.decode(totalBuffer);

    return {
      text,
      finalUrl: validatedUrl.href,
      response,
    };
  }
}
