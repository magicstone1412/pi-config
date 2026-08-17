---
description: Configure this project for super.engineering worktrees and development
argument-hint: "[additional requirements]"
---
Read `~/.pi/agent/skills/setup-superconductor-project/SKILL.md` and follow it in the current repository.

Configure repo-owned Superconductor project scripts for managed-worktree setup and the default development server. Derive commands from lockfiles, manifests, existing scripts, and framework help; do not guess. Validate the config, setup command, runtime state, and service reachability when applicable. Do not create a worktree, commit, push, or leave a test server running unless explicitly requested.

Additional requirements:
${ARGUMENTS:-none}
