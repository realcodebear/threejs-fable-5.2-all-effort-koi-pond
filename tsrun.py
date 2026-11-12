"""Pipe an agent's JSON event stream through this: saves every line with a timestamp, prints a short readable line, records the session id."""
import json, sys, time
base = sys.argv[1]
raw = open(base + ".jsonl", "a", buffering=1)
sid_file = base + ".sid"
for line in sys.stdin:
    line = line.rstrip("\n")
    if not line: continue
    t = time.time()
    raw.write(json.dumps({"t": round(t, 3), "e": line}) + "\n")
    try: d = json.loads(line)
    except Exception: print(time.strftime("%H:%M:%S"), line[:200], flush=True); continue
    sid = d.get("session_id") or d.get("thread_id")
    if sid and d.get("type") in ("system", "thread.started"):
        open(sid_file, "w").write(sid)
    ty = d.get("type", "")
    msg = ""
    if ty == "assistant":
        for c in d.get("message", {}).get("content", []):
            if c.get("type") == "text": msg += "SAY " + c["text"][:160].replace("\n", " ")
            elif c.get("type") == "tool_use": msg += f"TOOL {c.get('name')} " + json.dumps(c.get("input"))[:160]
    elif ty == "result": msg = f"RESULT {d.get('subtype')} cost={d.get('total_cost_usd')} turns={d.get('num_turns')}"
    elif ty.startswith("item."):
        it = d.get("item", {}); k = it.get("type", "")
        if k == "command_execution": msg = f"{ty} CMD {str(it.get('command'))[:160]}"
        elif k in ("agent_message", "reasoning"): msg = f"{k.upper()} " + str(it.get("text", ""))[:160].replace("\n", " ")
        else: msg = f"{ty} {k}"
    elif ty in ("turn.completed", "turn.failed", "error", "thread.started"): msg = line[:200]
    if msg: print(time.strftime("%H:%M:%S"), msg, flush=True)
