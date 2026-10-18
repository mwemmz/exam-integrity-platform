// Minimal LTI 1.1 provider support so Moodle (External tool) and other LMSs can launch exams
// and receive grades back (Basic Outcomes "replaceResult"). Signing is OAuth 1.0a HMAC-SHA1.
import crypto from 'crypto';

export const pct = (v: string): string =>
    encodeURIComponent(v).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());

export function baseString(method: string, url: string, params: Record<string, string>): string {
    const norm = Object.keys(params)
        .filter(k => k !== 'oauth_signature')
        .sort()
        .map(k => `${pct(k)}=${pct(params[k])}`)
        .join('&');
    return [method.toUpperCase(), pct(url), pct(norm)].join('&');
}

export function sign(method: string, url: string, params: Record<string, string>, secret: string): string {
    return crypto.createHmac('sha1', `${pct(secret)}&`).update(baseString(method, url, params)).digest('base64');
}

export function verifySignature(method: string, url: string, params: Record<string, string>, secret: string): boolean {
    const given = params.oauth_signature;
    if (!given) return false;
    const expected = sign(method, url, params, secret);
    const a = Buffer.from(given);
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Replay protection: remember nonces for the timestamp window.
const WINDOW_SECONDS = 300;
const seen = new Map<string, number>();

export function checkFreshness(params: Record<string, string>, nowMs = Date.now()): boolean {
    const ts = Number(params.oauth_timestamp);
    if (!Number.isFinite(ts) || Math.abs(nowMs / 1000 - ts) > WINDOW_SECONDS) return false;
    for (const [n, t] of seen) if (nowMs - t > WINDOW_SECONDS * 1000) seen.delete(n);
    const key = `${params.oauth_consumer_key}:${params.oauth_nonce}`;
    if (!params.oauth_nonce || seen.has(key)) return false;
    seen.set(key, nowMs);
    return true;
}

export function replaceResultXml(sourcedId: string, grade: number): string {
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const g = Math.max(0, Math.min(1, grade)).toFixed(4);
    return `<?xml version="1.0" encoding="UTF-8"?>
<imsx_POXEnvelopeRequest xmlns="http://www.imsglobal.org/services/ltiv1p1/xsd/imsoms_v1p0">
  <imsx_POXHeader><imsx_POXRequestHeaderInfo><imsx_version>V1.0</imsx_version><imsx_messageIdentifier>${crypto.randomUUID()}</imsx_messageIdentifier></imsx_POXRequestHeaderInfo></imsx_POXHeader>
  <imsx_POXBody><replaceResultRequest><resultRecord>
    <sourcedGUID><sourcedId>${esc(sourcedId)}</sourcedId></sourcedGUID>
    <result><resultScore><language>en</language><textString>${g}</textString></resultScore></result>
  </resultRecord></replaceResultRequest></imsx_POXBody>
</imsx_POXEnvelopeRequest>`;
}

export async function postGrade(serviceUrl: string, consumerKey: string, secret: string, sourcedId: string, grade: number): Promise<boolean> {
    const body = replaceResultXml(sourcedId, grade);
    const params: Record<string, string> = {
        oauth_consumer_key: consumerKey,
        oauth_nonce: crypto.randomBytes(16).toString('hex'),
        oauth_signature_method: 'HMAC-SHA1',
        oauth_timestamp: String(Math.floor(Date.now() / 1000)),
        oauth_version: '1.0',
        oauth_body_hash: crypto.createHash('sha1').update(body).digest('base64')
    };
    params.oauth_signature = sign('POST', serviceUrl, params, secret);
    const auth = 'OAuth ' + Object.entries(params).map(([k, v]) => `${pct(k)}="${pct(v)}"`).join(', ');
    const res = await fetch(serviceUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/xml', Authorization: auth },
        body
    });
    const text = await res.text();
    return res.ok && /success/i.test(text);
}
