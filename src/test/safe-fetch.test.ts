import { describe, expect, it, vi } from "vitest";
import { isPrivateIp, safeFetch, validateSafeUrl } from "../lib/safe-fetch.server";

describe("isPrivateIp", () => {
  it("detecta IPs de loopback", () => {
    expect(isPrivateIp("127.0.0.1")).toBe(true);
    expect(isPrivateIp("127.0.0.254")).toBe(true);
    expect(isPrivateIp("::1")).toBe(true);
  });

  it("detecta redes privadas RFC 1918", () => {
    expect(isPrivateIp("10.0.0.1")).toBe(true);
    expect(isPrivateIp("10.255.255.255")).toBe(true);
    expect(isPrivateIp("172.16.0.1")).toBe(true);
    expect(isPrivateIp("172.31.255.255")).toBe(true);
    expect(isPrivateIp("192.168.0.1")).toBe(true);
    expect(isPrivateIp("192.168.1.100")).toBe(true);
  });

  it("detecta link-local e metadata de nuvem (169.254.169.254)", () => {
    expect(isPrivateIp("169.254.169.254")).toBe(true);
    expect(isPrivateIp("169.254.1.1")).toBe(true);
  });

  it("detecta IPv6 privadas, link-local e ULA", () => {
    expect(isPrivateIp("fe80::1")).toBe(true);
    expect(isPrivateIp("fc00::1")).toBe(true);
    expect(isPrivateIp("fd12:3456:789a::1")).toBe(true);
    expect(isPrivateIp("::ffff:127.0.0.1")).toBe(true);
    expect(isPrivateIp("::ffff:10.0.0.1")).toBe(true);
  });

  it("permite IPs públicos legítimos", () => {
    expect(isPrivateIp("8.8.8.8")).toBe(false);
    expect(isPrivateIp("1.1.1.1")).toBe(false);
    expect(isPrivateIp("142.250.190.46")).toBe(false);
  });
});

describe("validateSafeUrl", () => {
  it("rejeita protocolos não-http", async () => {
    await expect(validateSafeUrl("file:///etc/passwd")).rejects.toThrow("Protocolo não permitido");
    await expect(validateSafeUrl("ftp://example.com")).rejects.toThrow("Protocolo não permitido");
    await expect(validateSafeUrl("javascript:alert(1)")).rejects.toThrow("Protocolo não permitido");
  });

  it("rejeita localhost e domínios internos", async () => {
    await expect(validateSafeUrl("http://localhost/secret")).rejects.toThrow("Acesso a endereços locais ou internos");
    await expect(validateSafeUrl("http://app.internal")).rejects.toThrow("Acesso a endereços locais ou internos");
    await expect(validateSafeUrl("http://server.local")).rejects.toThrow("Acesso a endereços locais ou internos");
  });

  it("rejeita URLs com IPs privados diretos", async () => {
    await expect(validateSafeUrl("http://127.0.0.1:8080")).rejects.toThrow("segurança");
    await expect(validateSafeUrl("http://169.254.169.254/latest/meta-data")).rejects.toThrow("segurança");
    await expect(validateSafeUrl("http://10.0.0.1/admin")).rejects.toThrow("segurança");
    await expect(validateSafeUrl("http://192.168.1.1/router")).rejects.toThrow("segurança");
  });

  it("rejeita domínios que resolvem para IPs privados", async () => {
    const mockLookup = vi.fn().mockResolvedValue(["127.0.0.1"]);
    await expect(validateSafeUrl("http://evil-domain.com", mockLookup)).rejects.toThrow("segurança");
  });

  it("aceita domínios públicos", async () => {
    const mockLookup = vi.fn().mockResolvedValue(["93.184.216.34"]);
    const url = await validateSafeUrl("https://example.com/artigo", mockLookup);
    expect(url.href).toBe("https://example.com/artigo");
  });
});

describe("safeFetch", () => {
  it("bloqueia requisição direta para IP de metadata ou loopback", async () => {
    await expect(safeFetch("http://169.254.169.254/latest/meta-data")).rejects.toThrow("segurança");
    await expect(safeFetch("http://localhost:3000")).rejects.toThrow("Acesso a endereços locais");
    await expect(safeFetch("http://10.0.0.1")).rejects.toThrow("segurança");
  });

  it("bloqueia redirecionamento para IP privado", async () => {
    const mockLookup = vi
      .fn()
      .mockImplementation(async (host: string) => {
        if (host === "public.com") return ["93.184.216.34"];
        if (host === "internal.net") return ["192.168.1.5"];
        return ["127.0.0.1"];
      });

    const mockFetch = vi.fn().mockImplementation(async (url: string) => {
      if (url === "https://public.com/redirect") {
        return new Response(null, {
          status: 302,
          headers: { location: "http://internal.net/secret" },
        });
      }
      return new Response("ok", { status: 200, headers: { "content-type": "text/html" } });
    });

    await expect(
      safeFetch("https://public.com/redirect", {
        dnsLookup: mockLookup,
        fetchFn: mockFetch,
      }),
    ).rejects.toThrow("segurança");
  });

  it("rejeita resposta não-HTML", async () => {
    const mockLookup = vi.fn().mockResolvedValue(["93.184.216.34"]);
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ secret: "data" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(
      safeFetch("https://example.com/api", {
        dnsLookup: mockLookup,
        fetchFn: mockFetch,
      }),
    ).rejects.toThrow("O link fornecido não aponta para uma página HTML válida.");
  });

  it("rejeita após mais de 3 redirecionamentos", async () => {
    const mockLookup = vi.fn().mockResolvedValue(["93.184.216.34"]);
    let hops = 0;
    const mockFetch = vi.fn().mockImplementation(async () => {
      hops++;
      return new Response(null, {
        status: 302,
        headers: { location: `https://example.com/hop-${hops}` },
      });
    });

    await expect(
      safeFetch("https://example.com/hop-0", {
        dnsLookup: mockLookup,
        fetchFn: mockFetch,
      }),
    ).rejects.toThrow("Limite máximo de redirecionamentos excedido.");
  });

  it("lê com sucesso uma página HTML válida e limita stream a ~1 MB", async () => {
    const mockLookup = vi.fn().mockResolvedValue(["93.184.216.34"]);
    const htmlBody = "<html><body><h1>Página de Estudos</h1><p>Conteúdo relevante</p></body></html>";
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(htmlBody, {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      }),
    );

    const result = await safeFetch("https://example.com/estudos", {
      dnsLookup: mockLookup,
      fetchFn: mockFetch,
    });

    expect(result.text).toBe(htmlBody);
    expect(result.finalUrl).toBe("https://example.com/estudos");
  });
});
