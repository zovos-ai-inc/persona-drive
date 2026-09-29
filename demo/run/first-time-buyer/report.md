# persona-drive — Maya Chen (Office manager choosing a helpdesk tool for a nine-person company) on sample-app

- target: http://localhost:3000
- started: 2026-09-28T17:05:23.801Z, duration 0.3 min
- Jev: 31 calls, 103418 input tokens, $0.0043 ($0.0009 per goal)
- note: steps 15 per goal; seed 1; browser local headless

## Summary

| FAIL | LIKELY | REVIEW | OK |
| ---: | ---: | ---: | ---: |
| 1 | 0 | 1 | 3 |

## Goals

| goal | band | ended | steps | final goalMet or parts met | cost | video |
| --- | --- | --- | ---: | ---: | ---: | --- |
| pricing | OK | done | 2 | 0.96 | $0.0003 | [video](pricing/video.webm) |
| session-length | REVIEW | done | 5 | 0.97 | $0.0008 | [video](session-length/video.webm) |
| soc2 | FAIL | stuck | 15 | 0.03 | $0.0021 | [video](soc2/video.webm) |
| data-picture | OK | done | 3 | 2/2 parts | $0.0004 | [video](data-picture/video.webm) |
| contact | OK | done | 6 | 0.74 | $0.0008 | [video](contact/video.webm) |

### pricing — OK

- goal: Find out what the Team plan costs per agent per month and whether it includes single sign-on.
- start: `/`; ended: done after 2 steps, 2 s
- Jev: 2 calls, 7760 input tokens, $0.0003
- files: [video](pricing/video.webm) · [steps](pricing/steps.jsonl)

| step | route | what the persona did | what happened | P(next) | goalMet or parts |
| ---: | --- | --- | --- | ---: | ---: |
| 1 | `/` | link "Pricing" | went to /pricing.html | 1.00 | 0.02 |
| 2 | `/pricing.html` | done | chose done | 0.95 | 0.96 |

### session-length — REVIEW

- goal: Find out how long an agent stays signed in before having to sign in again.
- start: `/`; ended: done after 5 steps, 3 s
- Jev: 5 calls, 19754 input tokens, $0.0008
- REVIEW: layoutBug 0.93 at step 2 (/app.html)
- files: [video](session-length/video.webm) · [steps](session-length/steps.jsonl)

| step | route | what the persona did | what happened | P(next) | goalMet or parts |
| ---: | --- | --- | --- | ---: | ---: |
| 1 | `/` | link "Sign in" | went to /app.html | 0.40 | 0.02 |
| 2 | `/app.html` | searchbox "Search" = persona-drive-muli0g2h baselin… | the screen changed | 0.22 | 0.02 |
| 3 | `/app.html` | link "Docs" | went to /docs.html | 0.41 | 0.02 |
| 4 | `/docs.html` | link "Single sign-on and sessions" | went to /docs-sso.html | 1.00 | 0.03 |
| 5 | `/docs-sso.html` | done | chose done | 1.00 | 0.97 |

### soc2 — FAIL

- goal: Find out whether the vendor has a SOC 2 report and how to get it.
- start: `/`; ended: stuck after 15 steps, 9 s
- Jev: 15 calls, 48930 input tokens, $0.0021
- FAIL: stuck: Jev chose stuck twice in a row
- LIKELY: goalMet 0.03 at the end
- files: [video](soc2/video.webm) · [trace](soc2/trace.zip) · [steps](soc2/steps.jsonl)

| step | route | what the persona did | what happened | P(next) | goalMet or parts |
| ---: | --- | --- | --- | ---: | ---: |
| 1 | `/` | link "Security" | went to /security.html | 1.00 | 0.02 |
| 2 | `/security.html` | link "Contact" | went to /contact.html | 0.70 | 0.32 |
| 3 | `/contact.html` | textbox "Message" = persona-drive-muli0g2h baselin… | the screen changed | 0.39 | 0.03 |
| 4 | `/contact.html` | textbox "Message" = persona-drive-muli0g2h baselin… | no visible change | 0.25 | 0.03 |
| 5 | `/contact.html` | link "Security" | went to /security.html | 0.28 | 0.03 |
| 6 | `/security.html` | link "Contact" | went to /contact.html | 0.64 | 0.35 |
| 7 | `/contact.html` | link "Security" | went to /security.html | 0.61 | 0.03 |
| 8 | `/security.html` | link "Contact" | went to /contact.html | 0.71 | 0.39 |
| 9 | `/contact.html` | link "Security" | went to /security.html | 0.67 | 0.03 |
| 10 | `/security.html` | link "Contact" | went to /contact.html | 0.64 | 0.35 |
| 11 | `/contact.html` | textbox "Message" = persona-drive-muli0g2h baselin… | the screen changed | 0.15 | 0.03 |
| 12 | `/contact.html` | textbox "Message" = persona-drive-muli0g2h baselin… | no visible change | 0.25 | 0.04 |
| 13 | `/contact.html` | textbox "Message" = persona-drive-muli0g2h baselin… | no visible change | 0.11 | 0.03 |
| 14 | `/contact.html` | stuck | chose stuck | 0.13 | 0.04 |
| 15 | `/contact.html` | stuck | chose stuck | 0.17 | 0.03 |

### data-picture — OK

- goal: Understand where customer data goes: which region it is stored in, and which third parties process it.
- start: `/`; ended: done after 3 steps, 2 s
- Jev: 3 calls, 8635 input tokens, $0.0004
- part 1: met at step 2: The region or regions customer data is stored in.
- part 2: met at step 3: The list of third parties that process customer data.
- files: [video](data-picture/video.webm) · [steps](data-picture/steps.jsonl)

| step | route | what the persona did | what happened | P(next) | goalMet or parts |
| ---: | --- | --- | --- | ---: | ---: |
| 1 | `/` | link "Security" | went to /security.html | 0.83 | p1 0.03 p2 0.03 |
| 2 | `/security.html` | link "subprocessors list" | went to /subprocessors.html | 1.00 | p1 0.93 p2 0.08 |
| 3 | `/subprocessors.html` | done | chose done | 0.00 | p2 0.82 |

### contact — OK

- goal: Send a message asking for a demo next week. (writes)
- start: `/contact.html`; ended: done after 6 steps, 2 s
- Jev: 6 calls, 18339 input tokens, $0.0008
- files: [video](contact/video.webm) · [steps](contact/steps.jsonl)

| step | route | what the persona did | what happened | P(next) | goalMet or parts |
| ---: | --- | --- | --- | ---: | ---: |
| 1 | `/contact.html` | select combobox "Topic" = Request a demo | the screen changed | 0.84 | 0.03 |
| 2 | `/contact.html` | textbox "Your name" = persona-drive-muli0g2h baselin… | the screen changed | 0.66 | 0.04 |
| 3 | `/contact.html` | textbox "Work email" = <email> | the screen changed | 0.70 | 0.04 |
| 4 | `/contact.html` | textbox "Message" = persona-drive-muli0g2h baselin… | the screen changed | 0.91 | 0.05 |
| 5 | `/contact.html` | button "Send message" | saved: POST /api/contact 201 | 0.50 | 0.06 |
| 6 | `/contact.html` | done | chose done | 0.94 | 0.74 |
