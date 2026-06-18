const COOKIE_NAME = "labrador_access";
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function getEnv(name) {
  try {
    if (globalThis.Netlify?.env?.get) {
      return globalThis.Netlify.env.get(name);
    }
  } catch (error) {
    // Ignore and try Deno below.
  }

  try {
    return Deno.env.get(name);
  } catch (error) {
    return undefined;
  }
}

function parseCookies(header) {
  const cookies = new Map();

  for (const part of (header || "").split(";")) {
    const index = part.indexOf("=");
    if (index === -1) {
      continue;
    }

    cookies.set(part.slice(0, index).trim(), part.slice(index + 1).trim());
  }

  return cookies;
}

function base64url(bytes) {
  let binary = "";
  const values = new Uint8Array(bytes);

  for (const value of values) {
    binary += String.fromCharCode(value);
  }

  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function decodeBase64url(value) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(normalized.length + ((4 - normalized.length % 4) % 4), "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function safeEqual(left, right) {
  if (left.length !== right.length) {
    return false;
  }

  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }

  return mismatch === 0;
}

async function sign(payload, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));

  return base64url(signature);
}

async function hasValidSession(request) {
  const secret = getEnv("PROJECT_ACCESS_SECRET");

  if (!secret) {
    return false;
  }

  const token = parseCookies(request.headers.get("Cookie")).get(COOKIE_NAME);

  if (!token) {
    return false;
  }

  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return false;
  }

  const expectedSignature = await sign(parts[0], secret);
  if (!safeEqual(expectedSignature, parts[1])) {
    return false;
  }

  try {
    const session = JSON.parse(decoder.decode(decodeBase64url(parts[0])));
    const now = Math.floor(Date.now() / 1000);
    return session.v === 1 && Number.isFinite(session.exp) && session.exp > now;
  } catch (error) {
    return false;
  }
}

export default async function projectGate(request) {
  if (await hasValidSession(request)) {
    return;
  }

  const requestUrl = new URL(request.url);
  const accessUrl = new URL("/acceso.html", request.url);
  accessUrl.searchParams.set("next", `${requestUrl.pathname}${requestUrl.search}`);

  return Response.redirect(accessUrl, 302);
}
