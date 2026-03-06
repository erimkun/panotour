# Self-Hosted Nginx Deployment

This document describes how to deploy the application on your own Linux server with Nginx and local project storage.

## 1. Recommended Directory Layout

Use two separate directories.

- Application code: `/var/www/panotour-app`
- Persistent project data: `/var/www/panotour-data/projects`

This separation prevents project files from being lost during code deploys.

## 2. Server Requirements

- Node.js 20+
- npm 10+
- Nginx
- A Linux user that can read the app folder and write to the data folder

## 3. Upload the Project

Copy the repository to:

```bash
/var/www/panotour-app
```

Then install dependencies and build:

```bash
cd /var/www/panotour-app
npm ci
npm run build
```

## 4. Create the Persistent Data Folder

```bash
sudo mkdir -p /var/www/panotour-data/projects
sudo chown -R www-data:www-data /var/www/panotour-data
sudo chmod -R 775 /var/www/panotour-data
```

If you use another service user instead of `www-data`, replace it accordingly.

## 5. Configure Environment Variables

Create a production env file. Example:

Template file in repo:

```text
.env.production.example
```

```env
NODE_ENV=production
PORT=3000
PROJECTS_STORAGE_PATH=/var/www/panotour-data/projects
EDIT_SECRET=strong-editor-password
ADMIN_PASSWORD=strong-admin-password
```

Optional Blob support:

```env
BLOB_READ_WRITE_TOKEN=vercel_blob_token_here
```

Write precedence is:

1. `PROJECTS_STORAGE_PATH` if set
2. Blob if local path is not set and Blob token exists
3. Default local path under `public/projects` if neither is set

Read precedence is:

1. Local storage path
2. Blob

## 6. Run the App Process

You do not need PM2. `systemd` is enough and usually cleaner.

Example service file:

Template file in repo:

```text
deploy/systemd/panotour.service.example
```

```ini
[Unit]
Description=Panotour Next.js App
After=network.target

[Service]
Type=simple
WorkingDirectory=/var/www/panotour-app
ExecStart=/usr/bin/npm run start
Restart=always
RestartSec=5
User=www-data
EnvironmentFile=/var/www/panotour-app/.env.production

[Install]
WantedBy=multi-user.target
```

Enable and start it:

```bash
sudo systemctl daemon-reload
sudo systemctl enable panotour
sudo systemctl start panotour
sudo systemctl status panotour
```

## 7. Configure Nginx

Use Nginx as reverse proxy.

Template file in repo:

```text
deploy/nginx/panotour.conf.example
```

```nginx
server {
    listen 80;
    server_name your-domain.com;

    client_max_body_size 2G;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Important:

- `client_max_body_size` must be large enough for your panorama ZIP uploads.
- The app can serve `/projects/...` itself, so an extra Nginx `alias` is optional.
- If you want Nginx to serve assets directly, you can still add an `alias` for `/projects/` to `/var/www/panotour-data/projects/`.

Optional direct static serving:

```nginx
location /projects/ {
    alias /var/www/panotour-data/projects/;
    expires 7d;
    add_header Cache-Control "public, max-age=604800, immutable";
}
```

## 8. First Production Checklist

1. Open `/admin`
2. Login with `ADMIN_PASSWORD`
3. Upload a test ZIP
4. Confirm that files appear under `/var/www/panotour-data/projects/<projectCode>`
5. Open `/<projectCode>` and verify the project loads
6. Open `/<projectCode>/edit` and verify save works with `EDIT_SECRET`
7. Test zipless project creation from `/admin`

## 9. Updating the App Code Later

When you deploy a new code version:

```bash
cd /var/www/panotour-app
git pull
npm ci
npm run build
sudo systemctl restart panotour
```

Your project files remain untouched because they live outside the app folder.

## 10. Backup Strategy

Back up at least:

- `/var/www/panotour-data/projects`
- your `.env.production`

Suggested backup methods:

- nightly `rsync`
- daily `tar.gz`
- snapshot at the VPS or disk level

## 11. Common Failure Cases

If uploads fail:

- check `client_max_body_size`
- check disk permissions on `/var/www/panotour-data`
- check service user write access

If saving config fails:

- verify `EDIT_SECRET`
- verify rate-limit files can be written
- check app logs with `journalctl -u panotour -f`

If projects do not load:

- verify `PROJECTS_STORAGE_PATH`
- verify `config.json` exists under the project folder
- verify image filenames match those in `config.json`
