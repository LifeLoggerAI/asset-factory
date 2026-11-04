// Legacy tenant-ID-to-JWT issuance is deliberately retired.
// A caller-supplied tenantId is not proof of tenant ownership.
// Use the authenticated canonical Studio API instead of minting a token here.
export default function handler(_req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Allow', '');
    return res.status(410).json({ error: 'Legacy token issuance is disabled.' });
}
