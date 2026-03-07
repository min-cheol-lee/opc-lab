# GitHub Pages Low-Cost Launch Playbook

Date: 2026-02-25

## Goal
- Publish an `litopc` branded landing page at near-zero initial cost.
- Route traffic from the landing page to the real simulator app and start monetization experiments.

## What is already prepared in this repository
- Pages deployment workflow:
  - `.github/workflows/github-pages.yml`
- Static landing page assets:
  - `marketing-pages/index.html`
  - `marketing-pages/styles.css`
  - `marketing-pages/site-config.js`
  - `marketing-pages/site.js`

## 1) First required change
1. Update `marketing-pages/site-config.js`:
   - `simulatorUrl`
   - Example: `https://app.litopc-sim.com/litopc`

## 2) Enable GitHub Pages
1. Open the GitHub repository.
2. Go to `Settings` -> `Pages`.
3. Under `Build and deployment`, set Source to `GitHub Actions`.
4. Push to `main`.
5. Confirm `Deploy GitHub Pages` succeeds in `Actions`.
6. Verify deployment URL:
   - Default: `https://<username>.github.io/<repo>/`
   - If repo name is `<username>.github.io`: `https://<username>.github.io/`

## 3) Attach an litopc custom domain
If no domain is purchased yet:
- Start with the default GitHub URL (zero domain cost).

If a domain is already purchased:
1. Decide the landing address:
   - Recommended: `www.litopc-sim.com`
2. Create `marketing-pages/CNAME` with one line:
   - `www.litopc-sim.com`
3. In GitHub `Settings` -> `Pages`, set the same custom domain.
4. Configure DNS:
   - `www` -> `CNAME` -> `<username>.github.io`
5. Enable HTTPS (`Enforce HTTPS`).

## 4) Practical low-cost monetization architecture
1. GitHub Pages: marketing landing only (free)
2. Real simulator app:
   - Frontend: Vercel free tier
   - Backend: Railway/Render low-cost tier
3. Landing page CTA (`Launch Simulator`) redirects to the live simulator.

Why this works:
- Keeps a clean branded entry URL
- Minimizes infrastructure cost before revenue scales
- Keeps marketing/SEO pages free

## 5) Two-week post-launch optimization checklist
1. Track landing page top CTA click-through rate.
2. Track in-app `upgrade_prompt_clicked`.
3. Keep free limits strict, but make upgrade value proposition explicit.
4. Run weekly landing A/B updates:
   - Value proposition headline
   - CTA copy

## 6) Common mistakes
1. Trying to host backend services on GitHub Pages
   - Pages is static hosting only.
2. Forgetting to set `simulatorUrl`
   - CTA will not route correctly.
3. Ignoring DNS propagation time
   - Custom domain propagation can take minutes to hours.
