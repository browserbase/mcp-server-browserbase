const byteToHex: string[] = Array.from({ length: 256 }, (_, index) =>
  index.toString(16).padStart(2, "0"),
);

function formatUuid(bytes: Uint8Array): string {
  return (
    byteToHex[bytes[0]] +
    byteToHex[bytes[1]] +
    byteToHex[bytes[2]] +
    byteToHex[bytes[3]] +
    "-" +
    byteToHex[bytes[4]] +
    byteToHex[bytes[5]] +
    "-" +
    byteToHex[bytes[6]] +
    byteToHex[bytes[7]] +
    "-" +
    byteToHex[bytes[8]] +
    byteToHex[bytes[9]] +
    "-" +
    byteToHex[bytes[10]] +
    byteToHex[bytes[11]] +
    byteToHex[bytes[12]] +
    byteToHex[bytes[13]] +
    byteToHex[bytes[14]] +
    byteToHex[bytes[15]]
  );
}

export function randomUUID(): string {
  if (typeof globalThis !== "undefined") {
    const cryptoObj = globalThis.crypto;
    if (cryptoObj?.randomUUID) {
      return cryptoObj.randomUUID();
    }
    if (cryptoObj?.getRandomValues) {
      const bytes = new Uint8Array(16);
      cryptoObj.getRandomValues(bytes);
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      return formatUuid(bytes);
    }
  }

  let timestamp = Date.now();
  let perf =
    typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now() * 1000
      : 0;

  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    let random = Math.random() * 16;
    if (timestamp > 0) {
      random = (timestamp + random) % 16;
      timestamp = Math.floor(timestamp / 16);
    } else {
      random = (perf + random) % 16;
      perf = Math.floor(perf / 16);
    }
    const value = char === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}
