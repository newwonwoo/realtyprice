# Troubleshooting Codex Cloud Git Diff Errors

## Error

```text
failed to compute git diff to remote for cwd: "C:\\Users\\82108\\Documents\\부동산"
```

## What it usually means

Codex Cloud needs to compare the local working branch with a remote branch. This error commonly appears when the local repository has no `origin` remote, the current branch has no upstream tracking branch, or the repository has not been pushed to the remote yet.

## Quick checks

Run these commands from the repository root:

```bash
git status
git remote -v
git branch -vv
```

If `git remote -v` prints nothing, add a remote repository first. If `git branch -vv` does not show an upstream branch such as `[origin/main]` or `[origin/work]`, set the upstream by pushing the current branch.

## Fix

### 1. Add a remote if one is missing

Replace the URL with your GitHub repository URL:

```bash
git remote add origin https://github.com/<your-user>/<your-repo>.git
```

If `origin` already exists but points to the wrong URL, update it:

```bash
git remote set-url origin https://github.com/<your-user>/<your-repo>.git
```

### 2. Push the current branch and set upstream

For the current branch:

```bash
git push -u origin HEAD
```

Or, if you want to use a specific branch name:

```bash
git push -u origin main
```

### 3. Retry Codex Cloud

After the branch has a remote upstream, retry the Codex Cloud task. Codex should then be able to compute the diff against the remote branch.

## Notes for Windows paths with Korean folder names

The Korean path itself is not necessarily the problem. If Git works normally in that folder, Codex can usually handle it. Still, if the error continues after setting the remote/upstream, try moving or cloning the project into an ASCII-only path such as:

```text
C:\Users\82108\Documents\realtyprice
```

Then retry the same Git remote and push steps from the new folder.
