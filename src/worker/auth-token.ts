export abstract class SupabaseAuthToken {
  abstract getUserId(): string;
  abstract getToken(): string;

  static fromString = createFromString;
}

function createFromString(token: string): SupabaseAuthToken {
  const userId = decodeUserId(token);

  if (!userId) {
    throw new Error("failed-to-extract-user-id-from-token");
  }

  return {
    getUserId: () => userId,
    getToken: () => token,
  };
}

function decodeUserId(token: string) {
  const parts = token.split(".");
  if (parts.length < 2) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(base64UrlToBase64(parts[1]), "base64").toString("utf-8"),
    ) as Record<string, unknown>;

    const userId = payload.sub ?? payload.user_id;
    return typeof userId === "string" && userId.length > 0 ? userId : null;
  } catch {
    return null;
  }
}

function base64UrlToBase64(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4;

  if (padding === 0) {
    return normalized;
  }

  return normalized + "=".repeat(4 - padding);
}
