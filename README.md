# TasteLab

A four-language Seoul food discovery website: Chinese, Korean, Japanese and English.

- Search restaurants by name, neighbourhood, cuisine, dishes and occasion.
- Real restaurant information, source links, photography and map directions.
- Guest recommendations with 1–4 photos and an administrator review queue.
- Approved recommendations appear publicly; pending submissions stay private.

## Source and data

This repository contains the website source, restaurant catalogue and local photo assets. Research provenance and category coverage are retained in `data/`. Guest submissions, photos and moderation history are stored in the owner's **private TasteLab-Data repository**, never in this public source repository.

## Runtime

The frontend is in `public/` and the root HTML in `ui/index.html`. The Vinext server exposes `/api/community/*`. Production runs on Sites / Cloudflare Workers. See `deployment/README.md` for configuration and administrator access.

Required encrypted environment values: `GITHUB_DATA_TOKEN`, `GITHUB_DATA_REPO`, `GUEST_SIGNING_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH`, `ADMIN_PASSWORD_SALT`. Never commit credentials. A repository-scoped Contents read/write token must only access the private data repository.

## Local development

Use Node.js 22.13 or newer, install dependencies, then run `npm run dev`. For a production build run `npm run build`. Administrator identity is checked on the server using the site's own password form and signed cookie; a frontend switch cannot grant moderation access.

## Editorial policy

Restaurant data is sourced and dated. Menu prices, hours and availability can change. Brand dish photography is labelled separately from branch interior photos. No invented customer reviews or ratings are supplied.
