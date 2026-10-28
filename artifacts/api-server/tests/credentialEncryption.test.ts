import assert from "node:assert/strict";
import { test } from "node:test";
import { encryptCredential, decryptCredential } from "../src/lib/credentialEncryption.ts";

test("credentials round-trip, use distinct nonces, and are bound to the user", () => {
  process.env.EMAIL_CREDENTIAL_ENCRYPTION_KEY = "ab".repeat(32);
  const encrypted = encryptCredential("mail-secret", "user-a");
  assert.equal(decryptCredential(encrypted, "user-a"), "mail-secret");
  assert.notEqual(encrypted, encryptCredential("mail-secret", "user-a"));
  assert.ok(!encrypted.includes("mail-secret"));
  assert.throws(() => decryptCredential(encrypted, "user-b"));
  const parts = encrypted.split(":");
  parts[4] = (parts[4].startsWith("00") ? "ff" : "00") + parts[4].slice(2);
  assert.throws(() => decryptCredential(parts.join(":"), "user-a"));
  process.env.EMAIL_CREDENTIAL_ENCRYPTION_KEY = "cd".repeat(32);
  assert.throws(() => decryptCredential(encrypted, "user-a"));
});

test("plaintext, malformed ciphertext, and missing keys are rejected", () => {
  assert.throws(() => decryptCredential("legacy-password", "user-a"));
  assert.throws(() => decryptCredential("enc:v1:invalid:invalid:invalid", "user-a"));
  delete process.env.EMAIL_CREDENTIAL_ENCRYPTION_KEY;
  assert.throws(() => encryptCredential("secret", "user-a"));
  process.env.EMAIL_CREDENTIAL_ENCRYPTION_KEY = "not-a-key";
  assert.throws(() => encryptCredential("secret", "user-a"));
});
