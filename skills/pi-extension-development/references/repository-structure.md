# Pi Extension Repository Structure

## Contents

- Canonical tree
- Package manifest
- Local loading
- Vite+ files
- Git ignore rules
- Documentation requirements

## Canonical tree

Use this baseline and omit only resources the package genuinely does not need:

```text
pi-example/
├── .editorconfig
├── .gitignore
├── .pi/
│   ├── settings.json
│   └── skills/
│       └── release/
│           └── SKILL.md
├── .vite-hooks/
│   └── pre-commit
├── pi-extension/
│   └── example/
│       └── index.ts
├── skills/                    # only when the package teaches an agent workflow
│   └── example/
│       └── SKILL.md
├── LICENSE
├── README.md
├── package-lock.json
├── package.json
└── vite.config.ts
```

Keep runtime extension files under `pi-extension/<name>/`. Keep package-delivered skills under `skills/`. Reserve `.pi/skills/` for checkout-local development and release workflows.

## Package manifest

Use `package.json` as a Pi manifest, not as evidence of npm publication:

```json
{
  "name": "pi-example",
  "version": "0.1.0",
  "private": true,
  "description": "Focused description",
  "keywords": ["pi-package"],
  "license": "MIT",
  "author": "OWNER",
  "repository": {
    "type": "git",
    "url": "https://github.com/OWNER/pi-example"
  },
  "type": "module",
  "scripts": {
    "check": "vp check",
    "format": "vp fmt --write",
    "format:check": "vp fmt --check",
    "lint": "vp lint"
  },
  "devDependencies": {
    "vite-plus": "<installed compatible range>"
  },
  "peerDependencies": {
    "@earendil-works/pi-coding-agent": "*",
    "typebox": "*"
  },
  "pi": {
    "extensions": ["./pi-extension/example/index.ts"],
    "skills": ["./skills/example/SKILL.md"]
  }
}
```

Add only Pi packages actually imported. Pi-provided packages belong in `peerDependencies`; runtime third-party packages belong in `dependencies`; development-only packages belong in `devDependencies`.

Create or update dependencies through `vp add`, `vp remove`, and `vp install`. Commit the lockfile. Do not add npm publishing configuration.

## Local loading

Use `.pi/settings.json` to shadow an installed Git copy while developing:

```json
{
  "packages": [
    {
      "source": "git:github.com/OWNER/pi-example",
      "extensions": [],
      "skills": []
    }
  ],
  "extensions": ["../pi-extension/example/index.ts"],
  "skills": ["../skills/example/SKILL.md"]
}
```

Paths are relative to `.pi/settings.json`. Omit `skills` when the package has none.

Also document explicit loading:

```bash
pi -e ./pi-extension/example/index.ts --skill ./skills/example/SKILL.md
```

## Vite+ files

The global `vp` command requires a local `vite-plus` development dependency to resolve `vite.config.ts`.

Use `vite.config.ts`:

```ts
import { defineConfig } from "vite-plus";

export default defineConfig({
  fmt: {
    ignorePatterns: ["node_modules/**", ".vite-hooks/**", ".pi/**"],
  },
  lint: {
    ignorePatterns: ["node_modules/**", ".vite-hooks/**", ".pi/**"],
  },
  staged: {
    "*.{js,mjs,cjs,ts,tsx,json,md}": "vp check --fix",
  },
});
```

Use `.editorconfig`:

```ini
root = true

[*]
charset = utf-8
end_of_line = lf
indent_style = space
indent_size = 2
insert_final_newline = true
trim_trailing_whitespace = true
max_line_length = 100

[*.md]
trim_trailing_whitespace = false
```

Use executable `.vite-hooks/pre-commit`:

```sh
vp staged
```

Install the hook shim once per clone:

```bash
chmod +x .vite-hooks/pre-commit
vp config --no-agent
```

Run `vp check --fix` once after adding Vite+ so the initial source follows the formatter.

## Git ignore rules

Use:

```gitignore
node_modules/
.pi/*
!.pi/settings.json
!.pi/skills/
.DS_Store
```

Vite+ generates `.vite-hooks/_/`; its generated nested `.gitignore` keeps the shim out of the repository.

## Documentation requirements

README must include:

1. One-paragraph purpose and tool/resource list.
2. Git install command; explicitly state that the project is not published to npm.
3. Runtime prerequisites and permissions.
4. Safe usage examples.
5. Local setup with `vp install` and `vp config --no-agent`.
6. `vp check`, `vp check --fix`, `vp fmt --check`, and `vp lint` commands.
7. Explicit and `.pi/settings.json` local-loading behavior.
8. Verification command that loads the Pi package without an agent turn.
9. Manual release skill invocation.
10. License and upstream attribution where applicable.
