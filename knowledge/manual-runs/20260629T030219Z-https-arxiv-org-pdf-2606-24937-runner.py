import json
import os
import subprocess
import urllib.parse
import urllib.request
from pathlib import Path

EDOKAI_DIR = Path('/Users/junaidahmed/Downloads/edokai')
URL = 'https://arxiv.org/pdf/2606.24937'
PROMPT = "EDOKAI MANUAL TELEGRAM LINK INGEST LOOP — LOOP-ENGINEERED RUN\n\nUser manually shared this source for Edokai:\nhttps://arxiv.org/pdf/2606.24937\n\nWorking directory: /Users/junaidahmed/Downloads/edokai\nRequired skill to load/follow if available: edokai-dkg-loop-engineering\nAlso follow: research-intelligence-workflows and software-development-workflows.\n\nPurpose:\nGrow Edokai's dynamic knowledge graph from this single high-priority manual source and then immediately run the concept-world builder.\n\nLoop-engineering contract:\n1. Single goal: source-grounded DKG update + concept-world routing from this URL.\n2. Non-goals: do not redesign Edokai, do not touch secrets/auth/infra, do not fabricate citations, do not publish/commit unless explicitly asked.\n3. State: read and update LOOP.md, loop-budget.md, loop-run-log.md, knowledge/edokai-dkg.json, knowledge/concept-world-index.json, and knowledge/inbox.jsonl as applicable.\n4. Budget: inspect the primary URL first; only follow up to 8 secondary links if needed.\n5. Maker/checker: after extracting facts, verify source provenance and JSON validity before writing final state.\n6. Router self-improvement: do not default every new cluster into the nearest umbrella. If a source introduces a coherent learning cluster with its own problem framing, mechanism pipeline, runtime path, and evaluation axis, create/promote a macro world and record the router lesson in routing_history. Concrete learned rule: RAG/GraphRAG/hybrid retrieval/re-ranking/index construction/query-focused summarization belongs in a Retrieval-Augmented Generation world, not generic LLM Systems & Serving, unless the source is strictly about low-level inference serving infrastructure.\n7. Human handoff: escalate only genuinely ambiguous new macro-world creation, low-confidence claims, or broad app refactors; do not escalate when the new-world boundary is clear from source evidence.\n8. Observability: append a run summary to loop-run-log.md.\n\nSource handling:\n- If it is a blog/article/docs page: extract concepts, claims, mechanisms, examples, contrasts, and practical learning takeaways.\n- If it is GitHub: inspect README, docs, examples, papers, and architecture hints before extraction.\n- If it is arXiv/paper/PDF: extract title, authors if available, abstract/core method/problem/contribution/limitations/related concepts.\n\nGraph update:\n- Merge with existing graph instead of duplicating.\n- Every node/edge must carry source_ids/provenance and confidence.\n- Preserve discovered_at/first_seen/last_seen timestamps.\n\nConcept world builder:\n- Sort concepts into existing macro umbrellas when sufficient: Agents, Transformer Architecture, Generative Models, Perception & World Models, LLM Systems & Serving, Retrieval-Augmented Generation.\n- Create a new macro concept world when existing umbrellas would hide the learning path. Use this promotion test: the cluster has (a) at least one coherent source-backed region now, preferably two; (b) a distinct mechanism pipeline or mental model; (c) concepts likely to recur in future sources; and (d) a useful learner-facing boundary. Update node world_hint values and add a routing_history.router_learning note so the router improves after each correction.\n- Each new/enhanced concept world should define multiple regions, critical concepts, prerequisite links, and side retention duels.\n- Use the existing Agents world as structural inspiration.\n- Keep user-facing branding as Edokai.\n\nSupabase live sync:\n- After local DKG/world-index JSON is updated and validated, do not expose secrets.\n- The wrapper process will run `npm run dkg:sync` after this agent exits, so make sure knowledge/edokai-dkg.json and knowledge/concept-world-index.json are valid before final response.\n\nVerification before final response:\n- JSON files parse.\n- No fake papers/links/citations.\n- No duplicate world/concept introduced unnecessarily.\n- loop-run-log.md was appended.\n\nReturn a concise Telegram-friendly summary: source read, graph changes, world changes, escalations/manual review."
LOG_PATH = Path('/Users/junaidahmed/Downloads/edokai/knowledge/manual-runs/20260629T030219Z-https-arxiv-org-pdf-2606-24937.log')
HERMES = '/Users/junaidahmed/.hermes/hermes-agent/venv/bin/hermes'


def load_env_file(path):
    try:
        text = Path(path).read_text(encoding='utf-8')
    except Exception:
        return
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, value = line.split('=', 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


load_env_file(Path.home() / '.hermes' / '.env')
load_env_file(EDOKAI_DIR / '.env')

CHAT_ID = os.environ.get('HERMES_PLUGIN_CHAT_ID') or os.environ.get('EDOKAI_TELEGRAM_CHAT_ID') or os.environ.get('TELEGRAM_CHAT_ID') or '7421808951'
THREAD_ID = os.environ.get('HERMES_PLUGIN_THREAD_ID') or os.environ.get('EDOKAI_TELEGRAM_THREAD_ID')


def log(line):
    with LOG_PATH.open('a', encoding='utf-8') as f:
        f.write(str(line).rstrip() + '\n')


def send_telegram(message):
    token = os.environ.get('TELEGRAM_BOT_TOKEN') or os.environ.get('HERMES_TELEGRAM_BOT_TOKEN')
    if not token or not CHAT_ID:
        log('Telegram completion notification skipped: missing TELEGRAM_BOT_TOKEN or Telegram chat id.')
        return False
    payload = {'chat_id': CHAT_ID, 'text': message, 'disable_web_page_preview': 'true'}
    if THREAD_ID:
        payload['message_thread_id'] = THREAD_ID
    data = urllib.parse.urlencode(payload).encode()
    try:
        with urllib.request.urlopen(f'https://api.telegram.org/bot{token}/sendMessage', data=data, timeout=30) as resp:
            log('Telegram completion notification sent: HTTP ' + str(resp.status))
        return True
    except Exception as exc:
        log('Telegram completion notification failed: ' + repr(exc))
        return False


def run(cmd, *, env):
    log('RUN: ' + ' '.join(cmd[:2]) + (' ...' if len(cmd) > 2 else ''))
    with LOG_PATH.open('a', encoding='utf-8') as out:
        return subprocess.run(cmd, cwd=str(EDOKAI_DIR), env=env, stdout=out, stderr=subprocess.STDOUT).returncode


env = os.environ.copy()
env.pop('_HERMES_GATEWAY', None)
env.pop('HERMES_GATEWAY_SESSION', None)
env['TERMINAL_CWD'] = str(EDOKAI_DIR)

agent_rc = run([
    HERMES,
    'chat',
    '--query',
    PROMPT,
    '--skills',
    'edokai-dkg-loop-engineering,research-intelligence-workflows,software-development-workflows',
    '--toolsets',
    'web,file,terminal,skills',
], env=env)

sync_rc = run(['npm', 'run', 'dkg:sync'], env=env)

if agent_rc == 0 and sync_rc == 0:
    status = '✅ Edokai ingest complete and synced to Supabase.'
elif agent_rc == 0 and sync_rc == 2:
    status = '⚠️ Edokai ingest complete locally, but Supabase sync is not configured. Add EDOKAI_SUPABASE_SERVICE_ROLE_KEY.'
elif agent_rc == 0:
    status = f'⚠️ Edokai ingest complete locally, but Supabase sync failed with exit {sync_rc}.'
else:
    status = f'❌ Edokai ingest failed with exit {agent_rc}. Supabase sync exit: {sync_rc}.'

send_telegram(status + '\n\nSource: ' + URL + '\nLog: ' + str(LOG_PATH))
raise SystemExit(0 if agent_rc == 0 and sync_rc == 0 else 1)
