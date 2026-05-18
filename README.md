# Sales Budget App

Personal sales income and budget scenario planner built with React + TypeScript + Vite + Tailwind.

## Run locally

```bash
npm install
npm run dev
```

The Vite dev server is configured to bind to `0.0.0.0:4173` for cloud preview environments.

## Static production build

```bash
npm run build
```

This creates a deployable static site in `dist/`.

## Easiest no-code deploy: Vercel (recommended)

This repo is now preconfigured for Vercel with `vercel.json`.

### Exact steps (click-by-click)

1. Push this repo to GitHub.
2. Go to [https://vercel.com/new](https://vercel.com/new).
3. Click **Continue with GitHub** and authorize if prompted.
4. Select this repository (`sales-budget-app`).
5. On the import screen, keep defaults (Vercel should detect **Vite** automatically).
6. Click **Deploy**.
7. Wait for build to finish, then click **Visit** to open your live app URL.

For future updates:
- Push commits to your default branch.
- Vercel auto-redeploys.

## Alternative no-code deploy: GitHub Pages

1. In GitHub, open your repository.
2. Click **Settings** → **Pages**.
3. Under **Source**, select **GitHub Actions**.
4. Add a workflow that runs `npm ci`, `npm run build`, and publishes `dist/`.
5. After the workflow finishes, your site URL appears in the Pages section.

## Commission validation examples

Progressive (marginal) tiers produce:
- $8,000 GP -> $380 commission
- $15,000 GP -> $900 commission
- $30,000 GP -> $2,300 commission
