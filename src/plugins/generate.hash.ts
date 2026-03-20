import crypto from "crypto";

export function generateHash(data: Record<string, any>, apiKey: string) {
  const raw = Object.keys(data)
    .sort()
    .map((key) => `${key}=${data[key]}`)
    .join("&");

  return crypto
    .createHmac("sha512", apiKey)
    .update(raw)
    .digest("hex");
}