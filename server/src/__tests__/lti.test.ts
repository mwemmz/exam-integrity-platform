import test from 'node:test';
import assert from 'node:assert/strict';
import { sign, verifySignature, checkFreshness, pct, replaceResultXml } from '../lib/lti';

// Known OAuth 1.0a example (RFC 5849 section 3.4.1): base string/percent-encoding rules.
test('percent-encoding follows RFC 3986', () => {
    assert.equal(pct("a b!*'()"), 'a%20b%21%2A%27%28%29');
});

test('signature verifies and detects tampering', () => {
    const params: Record<string, string> = {
        oauth_consumer_key: 'key', oauth_nonce: 'n1', oauth_timestamp: '1700000000',
        oauth_signature_method: 'HMAC-SHA1', oauth_version: '1.0',
        lti_message_type: 'basic-lti-launch-request', lis_person_contact_email_primary: 'a@b.com'
    };
    const url = 'https://api.example.com/api/lti/launch';
    params.oauth_signature = sign('POST', url, params, 'secret');
    assert.ok(verifySignature('POST', url, params, 'secret'));
    assert.ok(!verifySignature('POST', url, params, 'wrong'));
    assert.ok(!verifySignature('POST', url, { ...params, lis_person_contact_email_primary: 'x@y.com' }, 'secret'));
});

test('stale timestamps and replayed nonces are rejected', () => {
    const now = 1_700_000_000_000;
    const p = { oauth_consumer_key: 'k', oauth_nonce: 'abc', oauth_timestamp: String(now / 1000) };
    assert.ok(checkFreshness(p, now));
    assert.ok(!checkFreshness(p, now)); // replay
    assert.ok(!checkFreshness({ ...p, oauth_nonce: 'def', oauth_timestamp: String(now / 1000 - 4000) }, now));
});

test('grade XML is clamped to 0..1', () => {
    assert.match(replaceResultXml('sid', 1.7), /<textString>1\.0000<\/textString>/);
    assert.match(replaceResultXml('sid', 0.456), /<textString>0\.4560<\/textString>/);
});
