const crypto = require("crypto");

const COOKIE_NAME = "labrador_access";
const DEFAULT_NEXT = "/jbc/estacion-servicio-labrador/";
const DEFAULT_MAX_AGE_SECONDS = 8 * 60 * 60;

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}

function sign(payload, secret) {
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function normalizeNext(value) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    return DEFAULT_NEXT;
  }

  if (value.startsWith("/.netlify/") || value.startsWith("/netlify/")) {
    return DEFAULT_NEXT;
  }

  return value;
}

function parseBody(event) {
  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body || "", "base64").toString("utf8")
    : event.body || "";
  const contentType = event.headers["content-type"] || event.headers["Content-Type"] || "";

  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(rawBody || "{}");
    } catch (error) {
      return {};
    }
  }

  return Object.fromEntries(new URLSearchParams(rawBody));
}

function codeMatches(inputCode) {
  const code = String(inputCode || "").trim();
  const expectedHash = process.env.PROJECT_ACCESS_CODE_HASH;
  const expectedCode = process.env.PROJECT_ACCESS_CODE;

  if (!code) {
    return false;
  }

  if (expectedHash) {
    const actualHash = crypto.createHash("sha256").update(code).digest("hex");
    return safeEqual(actualHash, expectedHash.trim().toLowerCase());
  }

  if (expectedCode) {
    return safeEqual(code, expectedCode);
  }

  return false;
}

function getMaxAge() {
  const configured = Number(process.env.PROJECT_SESSION_MAX_AGE_SECONDS);
  return Number.isFinite(configured) && configured > 0
    ? Math.floor(configured)
    : DEFAULT_MAX_AGE_SECONDS;
}

function makeSessionCookie(secret) {
  const maxAge = getMaxAge();
  const now = Math.floor(Date.now() / 1000);
  const payload = base64url(JSON.stringify({
    v: 1,
    iat: now,
    exp: now + maxAge
  }));
  const signature = sign(payload, secret);

  return `${COOKIE_NAME}=${payload}.${signature}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

function wantsJson(event) {
  const accept = event.headers.accept || event.headers.Accept || "";
  return accept.includes("application/json");
}

function response(statusCode, body, headers = {}) {
  return {
    statusCode,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      ...headers
    },
    body: JSON.stringify(body)
  };
}

exports.handler = async (event) => {
  const secret = process.env.PROJECT_ACCESS_SECRET;

  if (event.httpMethod === "GET" && event.queryStringParameters?.logout === "1") {
    return {
      statusCode: 302,
      headers: {
        "Cache-Control": "no-store",
        "Location": "/acceso.html",
        "Set-Cookie": `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`
      },
      body: ""
    };
  }

  if (event.httpMethod !== "POST") {
    return response(405, { message: "Metodo no permitido." }, { "Allow": "POST" });
  }

  if (!secret || (!process.env.PROJECT_ACCESS_CODE_HASH && !process.env.PROJECT_ACCESS_CODE)) {
    return response(503, { message: "Acceso no configurado en Netlify." });
  }

  const body = parseBody(event);
  const next = normalizeNext(body.next);

  if (!codeMatches(body.code)) {
    if (wantsJson(event)) {
      return response(401, { message: "Codigo incorrecto." });
    }

    return {
      statusCode: 303,
      headers: {
        "Cache-Control": "no-store",
        "Location": `/acceso.html?error=1&next=${encodeURIComponent(next)}`
      },
      body: ""
    };
  }

  const cookie = makeSessionCookie(secret);

  if (wantsJson(event)) {
    return response(200, { redirect: next }, { "Set-Cookie": cookie });
  }

  return {
    statusCode: 303,
    headers: {
      "Cache-Control": "no-store",
      "Location": next,
      "Set-Cookie": cookie
    },
    body: ""
  };
};
