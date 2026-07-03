import { describe, expect, it } from "vitest";
import {
  CREDENTIALS_CIPHERTEXT_PREFIX,
  decryptLoginCredentials,
  encryptLoginCredentials,
  isEncryptedCredentialsPayload,
} from "@/lib/provisioning/crypto";

describe("credential encryption", () => {
  it("round-trips credentials with versioned ciphertext prefix", () => {
    const original = {
      username: "trader@example.com",
      password: "secure-pass-123",
      loginUrl: "https://app.example.com/login",
    };

    const encrypted = encryptLoginCredentials(original);
    expect(encrypted.startsWith(CREDENTIALS_CIPHERTEXT_PREFIX)).toBe(true);
    expect(isEncryptedCredentialsPayload(encrypted)).toBe(true);

    const decrypted = decryptLoginCredentials(encrypted);
    expect(decrypted).toEqual(original);
  });

  it("rejects invalid ciphertext", () => {
    expect(() => decryptLoginCredentials("not-encrypted")).toThrow();
  });
});
