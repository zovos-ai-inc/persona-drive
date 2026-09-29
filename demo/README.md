# Demo

Two recordings against the bundled sample site (`sample-app/`, a fictional helpdesk
product with flaws left in on purpose). Nobody scripted a path: Jev chose every step
from the persona, the goal and the text of the screen. Anyone can reproduce both with
`docker compose` and a TypeSafe key; see the README.

## 1. `persona-drive run`: Jev decides, Playwright drives

![Maya Chen and Tomasz Nowak on the sample site](run/persona-drive-demo.gif)

`run/` holds the two run directories as written, minus traces and most screenshots:
`report.md` with a step table per goal, `results.jsonl`, and per goal `video.webm`,
`steps.jsonl` and the first screenshot.

**Maya Chen**, office manager choosing a helpdesk tool ([`run/first-time-buyer/report.md`](run/first-time-buyer/report.md)):

| goal | what happened | steps | band |
| --- | --- | ---: | --- |
| pricing | Nav → Pricing, done | 2 | OK |
| session-length | Sign in → the app → Docs → "Single sign-on and sessions", done | 5 | REVIEW |
| soc2 | Footer → Security ("report available under NDA") → Contact, and back, four times; gave up | 15 | FAIL |
| data-picture | Security → subprocessors list; both parts met | 3 | OK |
| contact (writes) | Chose "Request a demo", filled name, email and message, sent | 6 | OK |

**Tomasz Nowak**, support agent on his second day ([`run/support-agent/report.md`](run/support-agent/report.md)):

| goal | what happened | steps | band |
| --- | --- | ---: | --- |
| find-ticket | "Open TCK-1042", done | 2 | REVIEW |
| overdue | Status filter → Overdue, done | 2 | REVIEW |
| export (writes) | Reports → Export CSV three times: 500 each time, a page error, then stuck | 9 | FAIL |
| new-ticket (writes) | Submitted the empty form, filled the requester, typed the title from the goal, created TCK-1049 | 13 | REVIEW |
| resolve (writes) | Open TCK-1039 → Mark resolved, saved | 3 | REVIEW |

Both runs together: 60 Jev calls, under a cent, 40 seconds of browser time.

What to read in those tables:

- **The persona finds things the way a person does.** SOC 2 is on the security page,
  which is linked only from the footer, and the persona went straight there. The page
  says the report is "available under NDA" and nothing more, so the persona went to
  Contact to ask, could not (the goal was read-only), went back, tried again, and
  gave up. The dead end was not planned into the sample site; the tool found it.
- **REVIEW means look, not fail.** Every step on the ticket list carries
  `layoutBug` around 0.9: the layout facts list four ticket titles clipped with an
  ellipsis and nine "Due" cells at 1.8:1 contrast, both deliberate flaws of the
  sample. They stay REVIEW until someone calibrates the threshold on this app.
- **Failures are deterministic where they can be.** The CSV export banded FAIL on a
  5xx and a page error, not on Jev's opinion. Jev's `confusing` and `layoutBug`
  answers raise REVIEW, with the probability printed, for a person to look at.
- **The guards hold.** The persona filled the contact form only on the goal that
  allowed writes, never touched "Delete ticket", and never left the site.

## 2. Claude Code as the hands, Jev as the person

[`claude-code-session/`](claude-code-session/) is one non-interactive Claude Code
session (`claude --print`, see [`run.sh`](claude-code-session/run.sh)) that follows
the repo skill [`persona-session`](../.claude/skills/persona-session/SKILL.md): it
drives the site through a headless Playwright MCP server, and on every screen calls
`persona-drive ask` for the persona's next move. Jev's answer is the instruction Claude
carries out; Claude adds what Jev cannot see, a screenshot wherever Jev flags
confusion.

- [`session.md`](claude-code-session/session.md): the transcript rendered from
  `transcript.jsonl` (every browser tool call, every `ask` answer).
- [`session/`](claude-code-session/session/): the `ask` session directory: `steps.jsonl`,
  the state Jev judged at each step, its answers in `jev-calls.jsonl`, the screenshots
  Claude took, and `report.md`.

In the recorded session Claude took the persona from the home page to the sign-in
page, to the docs index, to "Single sign-on and sessions", where Jev judged the goal
met (0.97) in 4 steps: 17 Claude turns, 45 seconds, $0.32 of Claude and $0.0005 of Jev.
The persona's path was Jev's, every time; Claude only clicked what it was told.
