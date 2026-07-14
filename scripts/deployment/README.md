# PropPredict deployment with Sakana Fugu

[Sakana Fugu](https://sakana.ai/fugu/) is a multi-agent orchestration API exposed as an
OpenAI-compatible endpoint. PropPredict uses it as a **deployment review assistant** —
Fugu analyzes `docker-compose.yml`, Dockerfiles, env vars, and feature-specific configs,
then returns a structured deployment plan.

Fugu does **not** host or deploy the app itself. It helps validate production readiness,
surface risks, and generate step-by-step deploy checklists.

## Setup

### 1. Create a Sakana API key

1. Sign in at [console.sakana.ai](https://console.sakana.ai/get-started)
2. Create an API key and copy it (shown once)
3. Export it in your shell or add to `.env`:

```bash
export SAKANA_API_KEY=sk-your-key-here
```

> **Security:** Never commit `SAKANA_API_KEY` to git. Add it as a Cursor Cloud Agent
> secret or CI secret variable instead of pasting it in chat.

### 2. Install script dependencies

The deployment scripts use `httpx`, already in `backend/requirements.txt`:

```bash
pip install httpx
```

### 3. Verify connectivity

```bash
python scripts/deployment/agent.py verify
```

Expected output:

```
Sakana Fugu connection OK
Model: fugu
Response: ok
```

## Usage

### General docker-compose deployment review

```bash
python scripts/deployment/agent.py review --task deploy
```

### Live feed / WebSocket scaling review

```bash
python scripts/deployment/agent.py review --task live-feed --model fugu-ultra
```

### Kalshi integration rollout review

```bash
python scripts/deployment/agent.py review --task kalshi
```

## Output format

Fugu returns JSON with:

| Field | Description |
| --- | --- |
| `summary` | One-line assessment |
| `healthy` | `true` if safe to proceed |
| `risks` | Production risks to address |
| `preflight_checks` | Commands/checks before deploy |
| `deploy_steps` | Ordered steps (optional shell commands) |
| `post_deploy_checks` | Health probes after deploy |
| `env_vars_required` | Secrets and config to set |

## Codex CLI integration (optional)

Sakana also ships a Codex profile for interactive agent sessions:

```bash
curl -fsSL https://sakana.ai/fugu/install | bash
SAKANA_API_KEY=sk-... codex-fugu
```

Use this for exploratory deployment work; the `agent.py` script is better for
repeatable CI-style reviews.

## Cursor Cloud Agents

To have a Cloud Agent use Fugu for deployment tasks:

1. Add `SAKANA_API_KEY` as an agent secret in Cursor settings
2. Ask the agent to run `python scripts/deployment/agent.py review --task <name>`
3. The agent can execute recommended `deploy_steps` after your approval
