# Migrating from npm to pnpm

## Why pnpm?
- 2–3× faster installs (hard-links packages instead of copying)
- Strict dependency isolation prevents phantom dependencies
- Single lockfile per project, not workspace root confusion
- Uses ~60% less disk space

## Steps to migrate

### 1. Install pnpm globally (one-time)
```bash
npm install -g pnpm@9
# or via corepack (recommended)
corepack enable
corepack prepare pnpm@9.15.4 --activate
```

### 2. Delete the npm lockfile and node_modules
```bash
cd kryptoke
rm package-lock.json
rm -rf node_modules
```

### 3. Install with pnpm
```bash
pnpm install
```
This generates `pnpm-lock.yaml` automatically.

### 4. Run the dev server
```bash
pnpm dev
```

## Daily commands (replace npm with pnpm)
| npm | pnpm |
|-----|------|
| `npm install` | `pnpm install` |
| `npm install <pkg>` | `pnpm add <pkg>` |
| `npm install -D <pkg>` | `pnpm add -D <pkg>` |
| `npm run dev` | `pnpm dev` |
| `npm run build` | `pnpm build` |
| `npm uninstall <pkg>` | `pnpm remove <pkg>` |
| `npm ci` (CI) | `pnpm install --frozen-lockfile` |

## Important: commit pnpm-lock.yaml, delete package-lock.json
```bash
git add pnpm-lock.yaml
git rm package-lock.json
git commit -m "chore: migrate from npm to pnpm"
```
