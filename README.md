## Panotour

Panotour is a Next.js application for managing and serving panorama tour projects.

## Development

Run the development server:

```bash
npm run dev
```

Open http://localhost:3000 in the browser.

For live server-side saving, copy `.env.example` into your environment file and set at least `EDIT_SECRET`.

## Storage Modes

The app supports both local disk and Vercel Blob.

- If `PROJECTS_STORAGE_PATH` is set, project files are written to that directory.
- If `PROJECTS_STORAGE_PATH` is not set and `BLOB_READ_WRITE_TOKEN` exists, project files are written to Blob.
- Reads always try local storage first, then Blob.

Example production local path:

```bash
PROJECTS_STORAGE_PATH=/var/www/panotour-data/projects
```

## Documentation

- [Self-hosted Nginx deployment](docs/nginx-self-hosted.md)
- [Beginner step-by-step Nginx deployment](docs/nginx-step-by-step-beginner.md)
- [Modeler workflow guide](docs/modeler-workflow.md)
- [What we built and why](docs/what-we-built.md)
- [Push / release checklist](docs/push-release-checklist.md)

## Deployment Templates

- `.env.production.example`
- `.env.vercel`
- `deploy/systemd/panotour.service.example`
- `deploy/nginx/panotour.conf.example`
