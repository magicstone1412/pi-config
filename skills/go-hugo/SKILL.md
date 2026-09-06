---
name: go-hugo
description: Creates, configures, authors, themes, and deploys Hugo sites. Use when asked to "create a Hugo site", "configure Hugo", "write Hugo content", "add a Hugo theme", "use Hugo Modules", "configure module mounts", "deploy Hugo to GitHub Pages", or "troubleshoot Hugo". Covers Hugo configuration, Markdown content, templates, data files, themes, modules, mounts, and GitHub Actions.
compatibility: Requires Hugo. Go is required for Hugo Modules. GitHub Actions deployment requires a Git repository and GitHub configuration.
---

# Go Hugo

Build and maintain Hugo sites using Hugo-native conventions. Inspect the existing site and load only the reference needed for the request.

## Step 1: Inspect the site

1. Identify the site root, repository instructions, Hugo configuration, content directories, layouts, themes, and data files.
2. Check the Hugo version with `hugo version` before relying on version-specific behavior.
3. Preserve the site's existing configuration format and theme conventions.
4. Avoid adding a theme, module, mount, workflow, or dependency unless the request requires it.

## Step 2: Classify the request

| Request | Read this reference |
|---|---|
| Initialize a site, configure settings, front matter, URLs, content structure, archetypes, local server, or production build | `${CLAUDE_SKILL_ROOT}/references/hugo-fundamentals.md` |
| Write Markdown, shortcodes, render hooks, taxonomies, page bundles, or page resources | `${CLAUDE_SKILL_ROOT}/references/hugo-content-authoring.md` |
| Use `data/`, `.Site.Data`, generated content, remote data, or structured datasets | `${CLAUDE_SKILL_ROOT}/references/hugo-data-templates.md` |
| Install or customize a theme, use Hugo Pipes, or configure Hugo Modules for themes | `${CLAUDE_SKILL_ROOT}/references/hugo-themes-manager.md` |
| Configure `module.mounts` or combine content from multiple directories | `${CLAUDE_SKILL_ROOT}/references/hugo-module-mounts.md` |
| Deploy to GitHub Pages, configure Actions, caching, previews, permissions, or path filters | `${CLAUDE_SKILL_ROOT}/references/hugo-github-actions.md` |

Read the selected reference before editing or answering. Read more than one only when the request crosses categories.

## Step 3: Implement the smallest change

1. Follow the selected reference and the site's existing patterns.
2. Use Hugo-native configuration, templates, shortcodes, data files, and modules before introducing custom tooling.
3. Keep content, layouts, configuration, and deployment changes scoped to the request.
4. Do not rewrite generated output or vendor dependencies unless explicitly required.
5. For deployment or destructive operations, confirm the target environment and credentials before acting.

## Step 4: Validate

Run the smallest applicable checks:

| Change | Validation |
|---|---|
| Configuration, content, templates, or theme changes | `hugo --gc --minify` |
| Local behavior or navigation | `hugo server` and inspect the affected route |
| GitHub Actions changes | Validate YAML, inspect the workflow paths and permissions, then run the production build |
| Module or mount changes | `hugo mod graph` when modules are involved, then run the production build |

Fix validation failures and run the relevant check again. Report the command and result.

## Expected result

Return a concise summary containing:

- Files changed and the behavior affected.
- Reference guide(s) used.
- Validation command(s) run and their result.
- Any prerequisite or deployment step that still needs user action.

Finish only when the site builds successfully or the remaining failure is clearly reported with its cause.
