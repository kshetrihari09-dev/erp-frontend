# MediERP — Security & HTTPS Deployment Guide

## What changed and why

| Area | Before | After |
|---|---|---|
| Config | `process.env.*` scattered everywhere | `src/config/index.js` — single source |
| Rate limiting | None | `express-rate-limit` on all API routes |
| Auth throttle | None | 10 req/15min on login/OTP/register |
| HTTPS | HTTP only | Self-signed (dev), Let's Encrypt (prod) |
| Security headers | Helmet defaults | Helmet + CSP + HSTS + Permissions-Policy |
| HTTPS redirect | None | 301 redirect in production |
| Request tracing | None | `X-Request-Id` on every request |
| Environment | Single `.env` | Separate dev / staging / production files |
| Graceful shutdown | None | SIGTERM/SIGINT closes DB pool cleanly |
| Nginx | None | Dev (mkcert) and production (Let's Encrypt) configs |

---

## File placement

```
BillingSoftware/
│
├── erp-unified-backend/
│   ├── src/
│   │   ├── config/
│   │   │   └── index.js              ← NEW (replaces scattered process.env)
│   │   ├── middleware/
│   │   │   └── security.js           ← NEW (rate limit, HTTPS redirect, headers)
│   │   └── server.js                 ← REPLACE (uses new config + security)
│   ├── nginx/
│   │   ├── nginx.development.conf    ← NEW
│   │   └── nginx.production.conf     ← NEW
│   ├── scripts/
│   │   └── gen-certs.sh              ← NEW
│   ├── package.json                  ← REPLACE (adds express-rate-limit)
│   ├── .env.development              ← NEW (was .env)
│   ├── .env.staging                  ← NEW
│   └── .env.production               ← NEW
│
└── erp-enterprise-full/
    ├── src/
    │   └── config/
    │       └── env.ts                ← REPLACE (adds port + HTTPS awareness)
    ├── vite.config.ts                ← REPLACE (adds host, optional HTTPS)
    ├── .env.development              ← REPLACE (was .env.development)
    ├── .env.staging                  ← NEW
    └── .env.production               ← REPLACE
```

---

## Step 1 — Install the new backend dependency

```bash
cd erp-unified-backend
npm install express-rate-limit
```

---

## Step 2 — Copy all files

Drop each file from the zip into the path shown in the table above.

---

## Step 3 — Development (HTTP, no extra setup)

This is the default. Nothing changes for your normal dev workflow.

```bash
# Backend
cd erp-unified-backend
node src/server.js          # or: npm run dev

# Frontend
cd erp-enterprise-full
npm run dev
```

HTTP works fine for desktop. The QR scanner works on desktop. For mobile camera, see Step 4.

---

## Step 4 — Development with HTTPS (needed for mobile camera)

Android Chrome requires HTTPS even on LAN to access `getUserMedia` (the camera). If you scan a QR code on your phone and the camera doesn't start, this is why.

### 4a. Install mkcert

| OS | Command |
|---|---|
| macOS | `brew install mkcert` |
| Ubuntu 22.04+ | `sudo apt install mkcert` |
| Windows | `choco install mkcert` |
| Any | https://github.com/FiloSottile/mkcert/releases |

### 4b. Generate certificates

```bash
cd BillingSoftware        # the parent folder
chmod +x erp-unified-backend/scripts/gen-certs.sh
./erp-unified-backend/scripts/gen-certs.sh
```

The script:
- Detects your LAN IP automatically
- Installs the root CA into your browser's trust store
- Generates `certs/localhost.pem` and `certs/localhost-key.pem` in both projects

### 4c. Enable HTTPS

Create `erp-enterprise-full/.env.local` (gitignored, overrides `.env.development`):

```env
VITE_HTTPS=true
VITE_API_BASE_URL=https://localhost:5000/api/v1
```

Create `erp-unified-backend/.env.local`:

```env
HTTPS=true
```

### 4d. Trust on Android (one-time)

```bash
# Find the CA root file
$(mkcert -CAROOT)/rootCA.pem
```

1. Email or ADB-transfer `rootCA.pem` to your phone
2. Settings → Security → Install certificate → CA certificate
3. Tap the file and trust it
4. Now `https://192.168.1.x:3000/scan` works with camera on Android

### 4e. Alternative: use Nginx (simpler for mobile)

Instead of enabling HTTPS in Node directly, run Nginx in front:

```bash
# Install Nginx
sudo apt install nginx        # Linux
brew install nginx            # macOS

# Edit the cert paths in nginx.development.conf, then:
sudo nginx -c /path/to/erp-unified-backend/nginx/nginx.development.conf

# Everything is now at https://192.168.1.x/
# Vite runs on :3000, Express on :5000 — Nginx handles HTTPS termination
```

---

## Step 5 — Staging deployment (VPS or Render)

### Option A: Render.com (easiest — no VPS needed)

1. Create a **Web Service** for the backend
2. Set **Build Command**: `npm install`
3. Set **Start Command**: `NODE_ENV=staging node src/server.js`
4. Add **Environment Variables** in the Render dashboard (copy from `.env.staging`)
5. Render provides HTTPS automatically on `*.onrender.com`

For the frontend, create a **Static Site**:
1. **Build Command**: `npm run build`
2. **Publish Directory**: `dist`
3. Set environment variables from `.env.staging`

### Option B: VPS (Ubuntu 22.04)

```bash
# 1. Install Node + Nginx
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs nginx certbot python3-certbot-nginx

# 2. Clone/upload your project
git clone your-repo /opt/medierp
cd /opt/medierp/erp-unified-backend

# 3. Install deps and create .env
npm install
cp .env.staging .env          # then fill in real values with nano .env

# 4. Run migrations
NODE_ENV=staging npm run migrate

# 5. Start with PM2
npm install -g pm2
pm2 start src/server.js --name medierp-staging --env staging
pm2 save
pm2 startup

# 6. Build frontend and serve from Express (or copy to /var/www)
cd /opt/medierp/erp-enterprise-full
npm install
npm run build                  # outputs to dist/
# Then configure Express to serve dist/ (see Step 7)
```

---

## Step 6 — Production deployment (VPS + Nginx + Let's Encrypt)

### 6a. DNS

Point your domain at the VPS:
```
medierp.app     A   <VPS IP>
www.medierp.app A   <VPS IP>
```

Wait for DNS propagation (5-60 minutes).

### 6b. Backend

```bash
cd /opt/medierp/erp-unified-backend

# Create production .env
cp .env.production .env
nano .env                      # fill in DATABASE_URL, JWT_SECRET, etc.

# Generate real JWT secrets
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
# (run twice — one for JWT_SECRET, one for JWT_REFRESH_SECRET)

# Install deps
npm install --omit=dev

# Run migrations
NODE_ENV=production npm run migrate

# Start with PM2
pm2 start src/server.js --name medierp --env production
pm2 save
pm2 startup
```

### 6c. Frontend build

```bash
cd /opt/medierp/erp-enterprise-full

# Set production env
cp .env.production .env.local    # then edit VITE_API_BASE_URL to your domain

npm install
npm run build                    # outputs to dist/
```

Copy `dist/` to where Express serves it, or configure a separate static host.

### 6d. Nginx + Let's Encrypt

```bash
# Install config
sudo cp erp-unified-backend/nginx/nginx.production.conf \
        /etc/nginx/sites-available/medierp

# Edit domain and paths
sudo nano /etc/nginx/sites-available/medierp
# Replace all REPLACE_WITH_YOUR_DOMAIN with medierp.app

# Enable site
sudo ln -s /etc/nginx/sites-available/medierp /etc/nginx/sites-enabled/medierp
sudo rm -f /etc/nginx/sites-enabled/default

# Test config
sudo nginx -t

# Get certificate
sudo certbot --nginx -d medierp.app -d www.medierp.app

# Reload
sudo systemctl reload nginx

# Test auto-renewal
sudo certbot renew --dry-run
```

Certbot installs a cron job that renews certificates automatically before they expire.

### 6e. Firewall

```bash
sudo ufw allow 22/tcp      # SSH
sudo ufw allow 80/tcp      # HTTP (for ACME challenge + redirect)
sudo ufw allow 443/tcp     # HTTPS
sudo ufw deny 5000/tcp     # Block direct Node access — all traffic via Nginx
sudo ufw enable
```

---

## Step 7 — Serve SPA from Express in production

Add this to `server.js` after all API routes (already in the provided version):

```js
// In production, Express serves the built React SPA
if (config.isProd) {
  const distPath = path.join(__dirname, '..', '..', 'erp-enterprise-full', 'dist')
  app.use(express.static(distPath))
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'))
  })
}
```

This means a single domain serves both the API and the SPA — no separate static host needed.

---

## Security checklist

### Before going to production

- [ ] `JWT_SECRET` is a random 64-char hex string (not the dev placeholder)
- [ ] `JWT_REFRESH_SECRET` is a different random 64-char hex string
- [ ] `DB_PASSWORD` / `DATABASE_URL` uses a strong password
- [ ] `BCRYPT_ROUNDS` is at least 14 in production
- [ ] `NODE_ENV=production` is set
- [ ] Port 5000 is firewalled (all traffic goes through Nginx on 443)
- [ ] `CORS_ORIGIN` lists only your production domain
- [ ] Let's Encrypt certificate is installed and auto-renewal is tested
- [ ] HSTS header is active (`Strict-Transport-Security`)
- [ ] Security headers pass: https://securityheaders.com
- [ ] TLS grade is A+: https://www.ssllabs.com/ssltest/

### Rate limits in production (from `.env.production`)

| Route group | Limit |
|---|---|
| All API routes | 100 req / 15 min per IP |
| Auth (login/OTP) | 10 req / 15 min per IP |
| Scanner poll | 100 req / 15 min per IP |
| Nginx auth zone | 10 req/min burst 5 |
| Nginx API zone | 60 req/min burst 20 |
| Nginx scanner zone | 120 req/min burst 30 |

Adjust `RATE_LIMIT_MAX` / `AUTH_RATE_LIMIT_MAX` in `.env.production` if legitimate usage hits these limits.

---

## Mixed-content checklist

Mixed content (HTTPS page loading HTTP resources) is blocked by browsers. After switching to HTTPS:

1. `VITE_API_BASE_URL` must start with `https://` in staging/production `.env` files ✓
2. The QR URL built by `useScannerSession.ts` uses `window.location.protocol` ✓ (inherits https automatically)
3. `MobileScannerPage.getApiBase()` uses `window.location.protocol` ✓
4. Uploaded images are served through Nginx which inherits HTTPS ✓
5. No hardcoded `http://` URLs exist in the frontend code ✓

---

## Environment variable summary

### Backend (`erp-unified-backend/.env.*`)

| Variable | Dev default | Required in prod |
|---|---|---|
| `NODE_ENV` | `development` | `production` |
| `PORT` | `5000` | `5000` |
| `DATABASE_URL` | — | ✅ |
| `JWT_SECRET` | dev placeholder | ✅ 64-char random |
| `JWT_REFRESH_SECRET` | dev placeholder | ✅ 64-char random |
| `CORS_ORIGIN` | localhost origins | ✅ your domain |
| `HTTPS` | `false` | `false` (Nginx terminates TLS) |
| `BCRYPT_ROUNDS` | `10` | `14` |
| `RATE_LIMIT_MAX` | `500` | `100` |
| `AUTH_RATE_LIMIT_MAX` | `50` | `10` |

### Frontend (`erp-enterprise-full/.env.*`)

| Variable | Dev default | Required in prod |
|---|---|---|
| `VITE_API_BASE_URL` | `http://localhost:5000/api/v1` | ✅ `https://api.yourdomain.app/api/v1` |
| `VITE_FRONTEND_PORT` | `3000` | `443` |
| `VITE_BACKEND_PORT` | `5000` | `443` |
| `VITE_APP_ENV` | `development` | `production` |
| `VITE_SHOW_DEV_BADGE` | `true` | `false` |
| `VITE_ENABLE_API_LOGS` | `true` | `false` |
| `VITE_HTTPS` | `false` | not needed (Nginx) |
