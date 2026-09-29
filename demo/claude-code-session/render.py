#!/usr/bin/env python3
"""Render a `claude --print --output-format stream-json --verbose` transcript as markdown:
every tool call with a trimmed input, every tool result trimmed, and the assistant's text.
Run: python3 demo/claude-code-session/render.py transcript.jsonl > session.md"""
import json
import sys

MAX = 1200


def trim(text: str, n: int = MAX) -> str:
    text = text.strip()
    return text if len(text) <= n else text[:n] + f"\n… ({len(text) - n} more characters)"


def main(path: str) -> None:
    out = ["# Claude Code session transcript", ""]
    for line in open(path, encoding="utf8"):
        line = line.strip()
        if not line:
            continue
        ev = json.loads(line)
        t = ev.get("type")
        if t == "assistant":
            for block in ev["message"].get("content", []):
                if block.get("type") == "text" and block["text"].strip():
                    out += ["**Claude:** " + trim(block["text"], 2000), ""]
                elif block.get("type") == "tool_use":
                    name = block["name"]
                    inp = block.get("input", {})
                    if name == "Bash":
                        body = inp.get("command", "")
                    elif name == "Write":
                        body = f"{inp.get('file_path', '')} ({len(inp.get('content', ''))} characters)"
                    else:
                        body = json.dumps(inp)
                    out += [f"`{name}`", "", "```", trim(body, 600), "```", ""]
        elif t == "user":
            for block in ev["message"].get("content", []):
                if block.get("type") == "tool_result":
                    content = block.get("content")
                    if isinstance(content, list):
                        text = "\n".join(c.get("text", "") for c in content if c.get("type") == "text")
                    else:
                        text = str(content or "")
                    if text.strip():
                        out += ["<details><summary>result</summary>", "", "```", trim(text), "```", "", "</details>", ""]
        elif t == "result":
            out += [
                "---",
                "",
                f"- turns: {ev.get('num_turns')}",
                f"- cost: ${ev.get('total_cost_usd', 0):.2f}",
                f"- duration: {ev.get('duration_ms', 0) / 1000:.0f} s",
                "",
            ]
    print("\n".join(out))


if __name__ == "__main__":
    main(sys.argv[1])
