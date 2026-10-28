import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";

function key(): Buffer {
  const value = process.env.EMAIL_CREDENTIAL_ENCRYPTION_KEY ?? "";
  if (!/^[a-fA-F0-9]{64}$/.test(value)) {
    throw new Error("EMAIL_CREDENTIAL_ENCRYPTION_KEY must contain 64 hexadecimal characters");
  }
  return Buffer.from(value, "hex");
}

export function encryptCredential(value: string, userId: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(userId));
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return ["enc", "v1", iv.toString("hex"), cipher.getAuthTag().toString("hex"), encrypted.toString("hex")].join(":");
}

export function decryptCredential(value: string, userId: string): string {
  const parts = value.split(":");
  if (parts.length !== 5 || parts[0] !== "enc" || parts[1] !== "v1" ||
      !/^[a-f0-9]{24}$/.test(parts[2]) || !/^[a-f0-9]{32}$/.test(parts[3]) ||
      !/^(?:[a-f0-9]{2})*$/.test(parts[4])) {
    throw new Error("Email credentials must be reconnected");
  }
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(parts[2], "hex"));
  decipher.setAAD(Buffer.from(userId));
  decipher.setAuthTag(Buffer.from(parts[3], "hex"));
  return Buffer.concat([decipher.update(Buffer.from(parts[4], "hex")), decipher.final()]).toString("utf8");
}
