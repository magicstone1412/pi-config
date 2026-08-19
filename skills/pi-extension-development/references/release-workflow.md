# Git-backed Pi Extension Release Workflow

Use this workflow only after the user explicitly invokes a release operation and identifies a version or bump type.

## 1. Resolve version and range

Read:

```bash
jq -r .version package.json
git tag --sort=-v:refname | head -5
git log "$(git tag --sort=-v:refname | head -1)..HEAD" --oneline --no-merges
```

Ask for `patch`, `minor`, `major`, or an exact SemVer when absent. Never infer a release version.

## 2. Require a clean verified candidate

```bash
git status --short
vp install
vp check
pi --no-extensions -e "$PWD" --no-skills --list-models '__release_load_check__'
```

Stop on a dirty worktree or failed check.

## 3. Prepare notes

Group conventional commits into Features, Bug fixes, Performance, Documentation, and Other changes. Omit empty sections.

Start notes with Git install commands:

````markdown
Install this version:

```bash
pi install git:github.com/OWNER/REPO@v<VERSION>
```

Or latest:

```bash
pi install git:github.com/OWNER/REPO
```
````

Do not publish to npm.

## 4. Bump package files

Edit only version fields in `package.json` and `package-lock.json`. Do not run `npm version`; it creates an uncontrolled commit and tag.

Run `vp check` again. Read and follow the global `commit` skill, then create:

```text
chore(release): v<VERSION>
```

## 5. Tag and publish

```bash
git tag "v<VERSION>"
git push origin HEAD
git push origin "v<VERSION>"
gh release create "v<VERSION>" \
  --repo OWNER/REPO \
  --title "v<VERSION>" \
  --notes-file /tmp/REPO-release-notes.md
```

Remove the temporary notes file.

## 6. Verify

```bash
gh release view "v<VERSION>" --repo OWNER/REPO
git status --short
git rev-parse HEAD
```

Report tag, release URL, release commit SHA, and verification evidence.

## Repository-local skill

Each extension repository should include a manual-only `.pi/skills/release/SKILL.md` that specializes this workflow with its owner, repository, tests, install command, and release-note examples. Set `disable-model-invocation: true` so releases require an explicit `/skill:release ...` invocation.
