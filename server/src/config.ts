import path from 'path';

const isProd = process.env.NODE_ENV === 'production';

function requireSecret(): string {
    const secret = process.env.JWT_SECRET;
    if (secret && secret.length >= 16) return secret;
    if (isProd) {
        throw new Error('JWT_SECRET must be set (16+ characters) in production');
    }
    console.warn('[config] JWT_SECRET not set - using an insecure development secret');
    return 'dev-only-insecure-secret';
}

export const JWT_SECRET = requireSecret();

// Where webcam snapshots are stored. Point UPLOADS_DIR at a persistent volume
// (or an in-country storage mount) in production; the default is ./uploads.
export const UPLOADS_DIR = process.env.UPLOADS_DIR
    ? path.resolve(process.env.UPLOADS_DIR)
    : path.join(__dirname, '../uploads');
