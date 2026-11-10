/** Browser-only: a stable per-phone ID plus the phone details the browser exposes. Call from effects. */
export function getDeviceId(): string {
  const key = "voli-device-id";
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}

type UAData = {
  platform?: string;
  getHighEntropyValues?: (h: string[]) => Promise<{ model?: string; platformVersion?: string; brands?: { brand: string }[] }>;
};

export async function getDeviceDetails() {
  const nav = navigator as Navigator & { userAgentData?: UAData; connection?: { effectiveType?: string; type?: string } };
  const ua = navigator.userAgent;
  let model = "", osVersion = "", brand = "";
  let platform = nav.userAgentData?.platform ?? "";
  try {
    const hi = await nav.userAgentData?.getHighEntropyValues?.(["model", "platformVersion"]);
    model = hi?.model ?? "";
    osVersion = hi?.platformVersion ?? "";
  } catch { /* not supported */ }
  const android = ua.match(/Android\s([\d.]+);\s*([^;)]+?)(?:\sBuild|\))/);
  if (android) {
    platform ||= "Android";
    osVersion ||= android[1] ?? "";
    model ||= android[2]?.trim() ?? "";
  }
  const ios = ua.match(/(iPhone|iPad).*?OS\s([\d_]+)/);
  if (ios) {
    platform ||= "iOS";
    model ||= ios[1] ?? "";
    brand = "Apple";
    osVersion ||= (ios[2] ?? "").replace(/_/g, ".");
  }
  platform ||= navigator.platform ?? "";
  const connection = nav.connection?.type ?? nav.connection?.effectiveType ?? "";
  return { platform, model, brand, osVersion, connection };
}

let ipPromise: Promise<string> | null = null;

/** Public IP via api.ipify.org, capped at ~1.5s so app start is never delayed; "" on failure. */
export function getPublicIp(timeoutMs = 1500): Promise<string> {
  if (ipPromise) return ipPromise;
  ipPromise = (async () => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch("https://api.ipify.org?format=json", { signal: ctrl.signal, cache: "no-store" });
      const json = (await res.json()) as { ip?: string };
      return json.ip ?? "";
    } catch {
      ipPromise = null; // allow retry next time
      return "";
    } finally {
      clearTimeout(timer);
    }
  })();
  return ipPromise;
}

/** Browser name + version from the user agent. */
export function getBrowserName(): string {
  const ua = navigator.userAgent;
  const rules: [RegExp, string][] = [
    [/EdgA?\/([\d.]+)/, "Edge"], [/OPR\/([\d.]+)/, "Opera"], [/SamsungBrowser\/([\d.]+)/, "Samsung Internet"],
    [/CriOS\/([\d.]+)/, "Chrome"], [/FxiOS\/([\d.]+)/, "Firefox"], [/Firefox\/([\d.]+)/, "Firefox"],
    [/Chrome\/([\d.]+)/, "Chrome"], [/Version\/([\d.]+).*Safari/, "Safari"],
  ];
  for (const [re, name] of rules) {
    const m = ua.match(re);
    if (m) return `${name} ${m[1]?.split(".")[0] ?? ""}`.trim();
  }
  return "";
}

/** Network kind (wifi/cellular/4g…) as far as the browser reveals it. Carrier names aren't exposed to web pages. */
export function getNetworkInfo(): { network: string; carrier: string } {
  const c = (navigator as Navigator & { connection?: { type?: string; effectiveType?: string } }).connection;
  const parts = [c?.type, c?.effectiveType].filter(Boolean) as string[];
  return { network: parts.join(" / ") || (navigator.onLine ? "online" : "offline"), carrier: "" };
}
