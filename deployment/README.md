# GitHub-backed production storage

Production guest records, photos and moderation history live in the private repository `a1141114a/TasteLab-Data`.
The service rejects a non-private data repository and never ships a GitHub token to the browser.

Required hosted secrets: GITHUB_DATA_TOKEN (fine-grained token, only TasteLab-Data, Contents read/write), GUEST_SIGNING_SECRET, ADMIN_USERNAME, ADMIN_PASSWORD_HASH, ADMIN_PASSWORD_SALT.
Required hosted variable: GITHUB_DATA_REPO=a1141114a/TasteLab-Data.

A guest submission writes original records and image blobs in one Git commit; the branch update must succeed before the UI reports success.
Concurrent updates retry against the newest branch head. Pending records/photos are only served to the original guest session and the signed-in administrator.
The administrator uses the website's own username/password form at /#moderation. The server checks a salted PBKDF2-SHA256 password hash (100,000 iterations), never a plaintext password. A signed, Secure, HttpOnly, SameSite=Strict cookie expires after 12 hours. Changing the configured password hash invalidates prior sessions. Failed login attempts are limited using a private GitHub record (eight attempts per network address per 15 minutes). External identity headers do not grant administrator privileges.

The original local SQLite/R2 adapter is retained only for isolated verification, gated by ALLOW_LOCAL_SQLITE_TESTING=true AND a loopback hostname.
Production never falls back to that adapter or to browser-only submission storage.
