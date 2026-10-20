import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
function encryptionKey() {
  const key = process.env["NOTION_TOKEN_ENCRYPTION_KEY"]?.trim();
  if (!key || !/^[a-f\d]{64}$/i.test(key))
    throw new Error(
      "Configure NOTION_TOKEN_ENCRYPTION_KEY no servidor: uma chave de 32 bytes em hexadecimal (64 caracteres).",
    );
  return Buffer.from(key, "hex");
}
export function sealNotionToken(
  value: { accessToken: string; refreshToken?: string },
  userId: string,
) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from(`gstudy-notion:v1:${userId}`));
  const data = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    data.toString("base64url"),
  ].join(".");
}
export function openNotionToken(
  value: string,
  userId: string,
): { accessToken: string; refreshToken?: string } {
  const key = encryptionKey();
  try {
    const [version, iv, tag, data] = value.split(".");
    if (version !== "v1" || !iv || !tag || !data) throw new Error();
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
    decipher.setAAD(Buffer.from(`gstudy-notion:v1:${userId}`));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    const token = JSON.parse(
      Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString(
        "utf8",
      ),
    );
    if (typeof token.accessToken !== "string" || !token.accessToken) throw new Error();
    return token;
  } catch {
    throw new Error(
      "A conexão do Notion precisa ser refeita. Conecte o Notion novamente nas configurações.",
    );
  }
}
