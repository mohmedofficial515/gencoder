# Build and Deployment Documentation

## Overview

Cline has a comprehensive build and deployment pipeline that produces artifacts for multiple platforms: VS Code extension, CLI tool, and JetBrains plugin. The build system uses esbuild for fast compilation, npm for packaging, and GitHub Actions for CI/CD.

## Build System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Source Code                              │
│              (TypeScript, React, Protobuf)                   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Build Steps                               │
│  1. Generate protobuf bindings (npm run protos)             │
│  2. Compile TypeScript (tsc / esbuild)                      │
│  3. Bundle webview UI (Vite)                                │
│  4. Copy assets                                             │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│ VS Code      │      │ CLI          │      │ JetBrains    │
│ Extension    │      │ Binary       │      │ Plugin       │
└──────────────┘      └──────────────┘      └──────────────┘
```

## Build Scripts

### Main Package.json Scripts

```json
{
  "scripts": {
    // Proto generation
    "protos": "node scripts/build-proto.mjs",
    
    // TypeScript compilation
    "compile": "esbuild ./src/extension.ts --bundle --outfile=dist/extension.js --external:vscode --format=cjs --platform=node",
    "watch": "esbuild ./src/extension.ts --bundle --outfile=dist/extension.js --external:vscode --format=cjs --platform=node --watch",
    
    // Webview build
    "build:webview": "cd webview-ui && npm run build",
    "watch:webview": "cd webview-ui && npm run dev",
    
    // Full build
    "build": "npm run protos && npm run compile && npm run build:webview",
    
    // Packaging
    "package": "vsce package --no-dependencies",
    "package:cli": "cd cli && npm run build && npm pack",
    
    // Publishing
    "publish": "vsce publish --no-dependencies",
    "publish:nightly": "node scripts/publish-nightly.mjs"
  }
}
```

## VS Code Extension Build

### esbuild Configuration

```javascript
// esbuild.mjs
import esbuild from "esbuild"
import { copy } from "esbuild-plugin-copy"

const isProduction = process.env.NODE_ENV === "production"

await esbuild.build({
  entryPoints: ["src/extension.ts"],
  bundle: true,
  outfile: "dist/extension.js",
  external: ["vscode"],
  format: "cjs",
  platform: "node",
  target: "node16",
  minify: isProduction,
  sourcemap: !isProduction,
  plugins: [
    copy({
      assets: {
        from: ["./assets/**/*"],
        to: ["./dist/assets"],
      },
    }),
  ],
})
```

### VSIX Packaging

```json
// .vscodeignore
.git/
.gitignore
.vscode/
.vscode-test/
node_modules/
src/
tsconfig.json
.eslintrc.json
webview-ui/node_modules/
webview-ui/src/
webview-ui/index.html
webview-ui/vite.config.ts
*.vsix
```

### Package Properties

```json
// package.json (VS Code extension)
{
  "name": "cline",
  "displayName": "Cline",
  "publisher": "cline",
  "version": "1.0.0",
  "engines": {
    "vscode": "^1.85.0"
  },
  "categories": ["AI", "Programming Languages"],
  "activationEvents": ["onStartupFinished"],
  "main": "./dist/extension.js",
  "contributes": {
    "commands": [
      {
        "command": "cline.plusButton",
        "title": "New Task"
      }
    ],
    "viewsContainers": {
      "activitybar": [
        {
          "id": "cline",
          "title": "Cline",
          "icon": "assets/icons/icon.svg"
        }
      ]
    }
  }
}
```

## CLI Build

### esbuild Configuration for CLI

```javascript
// cli/esbuild.mts
import esbuild from "esbuild"
import { builtinModules } from "node:module"

await esbuild.build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  outfile: "dist/cli.js",
  platform: "node",
  target: "node18",
  format: "esm",
  minify: true,
  banner: {
    js: "#!/usr/bin/env node\n",
  },
  external: builtinModules,
})
```

### CLI Packaging

```json
// cli/package.json
{
  "name": "@cline/cli",
  "version": "1.0.0",
  "bin": {
    "cline": "./dist/cli.js"
  },
  "files": ["dist", "README.md", "LICENSE"],
  "publishConfig": {
    "access": "public"
  }
}
```

## Webview Build (Vite)

### Vite Configuration

```javascript
// webview-ui/vite.config.ts
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import path from "path"

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, "index.html"),
      },
      output: {
        entryFileNames: "assets/[name].js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: "assets/[name].[ext]",
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
})
```

### Webview Integration

```typescript
// In extension.ts
function getWebviewContent(webview: vscode.Webview, extensionUri: vscode.Uri) {
  const isDev = process.env.NODE_ENV === "development"
  
  if (isDev) {
    // Development: load from localhost
    return `<!DOCTYPE html>
      <html>
        <body>
          <script src="http://localhost:5173/src/main.tsx" type="module"></script>
        </body>
      </html>`
  } else {
    // Production: load from dist
    const distPath = vscode.Uri.joinPath(extensionUri, "webview-ui", "dist")
    const indexPath = vscode.Uri.joinPath(distPath, "index.html")
    return webview.asWebviewUri(indexPath).toString()
  }
}
```

## Build Pipeline

### Development Build

```bash
# Full development build with watch mode
npm run watch

# In another terminal
npm run watch:webview

# Run extension
# Press F5 in VS Code
```

### Production Build

```bash
# Clean previous builds
rm -rf dist webview-ui/dist

# Generate protobuf bindings
npm run protos

# Build extension
npm run compile

# Build webview
npm run build:webview

# Package VSIX
npm run package
```

## Continuous Integration (GitHub Actions)

### Build Workflow

```yaml
# .github/workflows/build.yml
name: Build

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
          
      - name: Install dependencies
        run: npm ci
        
      - name: Install webview dependencies
        run: cd webview-ui && npm ci
        
      - name: Generate protobufs
        run: npm run protos
        
      - name: Build extension
        run: npm run compile
        
      - name: Build webview
        run: npm run build:webview
        
      - name: Package VSIX
        run: npm run package
        
      - name: Upload artifacts
        uses: actions/upload-artifact@v3
        with:
          name: cline-vsix
          path: ./*.vsix
```

### Release Workflow

```yaml
# .github/workflows/release.yml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Build
        run: |
          npm ci
          cd webview-ui && npm ci
          cd ..
          npm run protos
          npm run compile
          npm run build:webview
          
      - name: Package VSIX
        run: npm run package
        
      - name: Package CLI
        run: cd cli && npm run build && npm pack
        
      - name: Create Release
        uses: softprops/action-gh-release@v1
        with:
          files: |
            *.vsix
            cli/*.tgz
          draft: false
          prerelease: false
          
      - name: Publish to VS Code Marketplace
        run: npm run publish
        env:
          VSCE_PAT: ${{ secrets.VSCE_PAT }}
          
      - name: Publish to npm
        run: |
          cd cli
          npm publish
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

## Nightly Builds

### Nightly Release Script

```javascript
// scripts/publish-nightly.mjs
import { execSync } from "child_process"
import fs from "fs"

const version = JSON.parse(fs.readFileSync("package.json", "utf8")).version
const nightlyVersion = `${version}-nightly.${Date.now()}`

// Update version
execSync(`npm version ${nightlyVersion} --no-git-tag-version`)

// Build
execSync("npm run build")

// Package
execSync("vsce package --no-dependencies")

// Publish to Open VSX
execSync("ovsx publish -p $OVSX_TOKEN")

// Upload to GitHub Release
execSync(`gh release upload nightly-${nightlyVersion} *.vsix`)
```

## Environment Configuration

### Development Environment

```bash
# .env.development
NODE_ENV=development
DEBUG=true
WEBVIEW_PORT=5173
```

### Production Environment

```bash
# .env.production
NODE_ENV=production
DEBUG=false
TELEMETRY_ENABLED=true
```

## Docker Build (Optional)

### Dockerfile for CLI

```dockerfile
# Dockerfile
FROM node:18-alpine

WORKDIR /app

COPY cli/package*.json ./
RUN npm ci --only=production

COPY cli/dist ./dist
COPY cli/node_modules ./node_modules

ENTRYPOINT ["node", "dist/cli.js"]
```

### Build Docker Image

```bash
docker build -t cline/cli:latest .
docker run -it cline/cli:latest "Write a React component"
```

## Performance Optimizations

### Build Caching

```javascript
// esbuild.mjs with cache
const cacheDir = ".esbuild-cache"

await esbuild.build({
  // ... other options
  incremental: true,
  cache: {
    directory: cacheDir,
  },
})
```

### Parallel Builds

```json
{
  "scripts": {
    "build:parallel": "npm run protos & npm run compile & npm run build:webview"
  }
}
```

### Tree Shaking

```javascript
// esbuild.mjs
{
  treeShaking: true,
  ignoreAnnotations: false,
}
```

## Troubleshooting

### Common Build Issues

1. **Protobuf generation fails**
   ```bash
   # Ensure buf is installed
   npm install -g @bufbuild/buf
   
   # Regenerate
   npm run protos
   ```

2. **Webview build fails**
   ```bash
   # Clear cache
   cd webview-ui
   rm -rf node_modules/.vite
   npm run build
   ```

3. **VSIX packaging fails**
   ```bash
   # Check .vscodeignore
   npx vsce ls
   
   # Verify manifest
   npx vsce verify
   ```

## Security Considerations

### Signing Extensions

```bash
# Sign VSIX with private key
vsce sign --keyFile private-key.pem --pat $VSCE_PAT
```

### Dependency Scanning

```yaml
# .github/workflows/security.yml
name: Security Scan

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Run Snyk
        run: npx snyk test
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
```

## Related Files

- `package.json` - Main build scripts
- `esbuild.mjs` - Extension build configuration
- `webview-ui/vite.config.ts` - Webview build
- `cli/esbuild.mts` - CLI build
- `scripts/build-proto.mjs` - Proto generation
- `.github/workflows/build.yml` - CI pipeline
- `.github/workflows/release.yml` - Release pipeline