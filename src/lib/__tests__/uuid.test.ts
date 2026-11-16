import { describe, expect, it, jest } from "@jest/globals";

import { uuidV4 } from "@/lib/uuid";

// Node's WebCrypto provides getRandomValues in tests; the polyfill is for Hermes.
jest.mock("react-native-get-random-values", () => ({}));

describe("uuidV4", () => {
  it("is a lower-case RFC 4122 version 4 uuid", () => {
    for (let i = 0; i < 50; i++) {
      expect(uuidV4()).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
    }
  });

  it("does not repeat", () => {
    const ids = new Set(Array.from({ length: 1000 }, () => uuidV4()));
    expect(ids.size).toBe(1000);
  });
});
