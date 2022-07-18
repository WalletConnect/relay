import * as crypto from "crypto";
import * as encoding from "@walletconnect/encoding";

export class HttpError extends Error {
  public statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
  }
}

export function assertType(obj: any, key: string, type = "string", status = 400) {
  if (!obj[key] || typeof obj[key] !== type) {
    throw new HttpError(`Missing or invalid "${key}" param`, status);
  }
}

export function generateRandomBytes32(): string {
  return encoding.bufferToHex(crypto.randomBytes(32));
}

export function sha256(data: string): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

export function isFloat(num: number): boolean {
  return num % 1 !== 0;
}

function padTo2Digits(num: number): string {
  return num.toString().padStart(2, "0");
}

export function formatDate(date: Date): string {
  return (
    [date.getFullYear(), padTo2Digits(date.getMonth() + 1), padTo2Digits(date.getDate())].join(
      "-",
    ) +
    " " +
    [
      padTo2Digits(date.getHours()),
      padTo2Digits(date.getMinutes()),
      padTo2Digits(date.getSeconds()),
    ].join(":")
  );
}

export function redisMessageHash(topic: string, message: string): string {
  return sha256(`${topic}${message}`);
}
