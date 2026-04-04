import sys, json
logs = json.load(sys.stdin)
for entry in logs:
    ts = entry.get('timestamp', '?')
    tp = entry.get('textPayload', '')
    if tp:
        print(f'{ts}  {tp[:200]}')
