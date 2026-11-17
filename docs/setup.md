# Local Setup Guide

## Prerequisites
- Node.js 22+
- npm 10+

## Installation
```bash
npm install
npx prisma generate
npx prisma db push
npx playwright install chromium
```

## Running Locally (Offline Demo Mode)
```bash
AI_PROVIDER=mock npm run dev
```
Open `http://localhost:3000` for **AI Test Architect**, or `http://localhost:3000/demo-insurance` for the **Veridian P&C Insurance Demo**.

## Running with Google Gemini
Set `GEMINI_API_KEY` in your environment (or `.env`) and set `AI_PROVIDER=gemini` (or `auto`):
```bash
GEMINI_API_KEY=your_key_here GEMINI_MODEL=gemini-4-hydrogen AI_PROVIDER=gemini npm run dev
```

## Verification Commands
```bash
npm run lint
npm run test:unit
npm run test:integration
npm run test:e2e
```
