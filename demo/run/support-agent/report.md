# persona-drive — Tomasz Nowak (Support agent on his second day) on sample-app

- target: http://localhost:3000
- started: 2026-09-28T17:05:43.518Z, duration 0.3 min
- Jev: 29 calls, 105107 input tokens, $0.0044 ($0.0009 per goal)
- note: steps 15 per goal; seed 1; browser local headless

## Summary

| FAIL | LIKELY | REVIEW | OK |
| ---: | ---: | ---: | ---: |
| 1 | 0 | 4 | 0 |

## Goals

| goal | band | ended | steps | final goalMet or parts met | cost | video |
| --- | --- | --- | ---: | ---: | ---: | --- |
| find-ticket | REVIEW | done | 2 | 0.97 | $0.0005 | [video](find-ticket/video.webm) |
| overdue | REVIEW | done | 2 | 0.90 | $0.0003 | [video](overdue/video.webm) |
| export | FAIL | stuck | 9 | 0.02 | $0.0011 | [video](export/video.webm) |
| new-ticket | REVIEW | done | 13 | 0.56 | $0.0020 | [video](new-ticket/video.webm) |
| resolve | REVIEW | done | 3 | 0.79 | $0.0004 | [video](resolve/video.webm) |

### find-ticket — REVIEW

- goal: Open ticket TCK-1042 and see its status and who it is assigned to.
- start: `/app.html`; ended: done after 2 steps, 2 s
- Jev: 2 calls, 12878 input tokens, $0.0005
- REVIEW: layoutBug 0.89 at step 1 (/app.html)
- files: [video](find-ticket/video.webm) · [steps](find-ticket/steps.jsonl)

| step | route | what the persona did | what happened | P(next) | goalMet or parts |
| ---: | --- | --- | --- | ---: | ---: |
| 1 | `/app.html` | link "Open TCK-1042" | went to /ticket.html?id=TCK-1042 | 0.94 | 0.05 |
| 2 | `/ticket.html?id=TCK-1042` | done | chose done | 1.00 | 0.97 |

### overdue — REVIEW

- goal: See only the tickets that are overdue.
- start: `/app.html`; ended: done after 2 steps, 1 s
- Jev: 2 calls, 8258 input tokens, $0.0003
- REVIEW: confusing 0.52 at step 1 (/app.html)
- REVIEW: layoutBug 0.91 at step 1 (/app.html)
- REVIEW: confusing 0.43 at step 2 (/app.html)
- REVIEW: layoutBug 0.90 at step 2 (/app.html)
- files: [video](overdue/video.webm) · [steps](overdue/steps.jsonl)

| step | route | what the persona did | what happened | P(next) | goalMet or parts |
| ---: | --- | --- | --- | ---: | ---: |
| 1 | `/app.html` | select combobox "Status" = Overdue | the screen changed | 0.99 | 0.05 |
| 2 | `/app.html` | done | chose done | 0.93 | 0.90 |

### export — FAIL

- goal: Export the reports as a CSV file. (writes)
- start: `/app.html`; ended: stuck after 9 steps, 9 s
- Jev: 9 calls, 27042 input tokens, $0.0011
- REVIEW: confusing 0.49 at step 1 (/app.html)
- REVIEW: layoutBug 0.91 at step 1 (/app.html)
- FAIL: 1 page error(s) at step 2
- FAIL: API 500 POST http://localhost:3000/api/export at step 2
- FAIL: 1 page error(s) at step 3
- FAIL: API 500 POST http://localhost:3000/api/export at step 3
- LIKELY: userVisibleError 0.96 at step 3 (/reports.html)
- FAIL: 1 page error(s) at step 4
- FAIL: API 500 POST http://localhost:3000/api/export at step 4
- LIKELY: userVisibleError 0.98 at step 4 (/reports.html)
- LIKELY: userVisibleError 0.98 at step 5 (/reports.html)
- LIKELY: userVisibleError 0.98 at step 6 (/reports.html)
- LIKELY: userVisibleError 0.98 at step 7 (/reports.html)
- LIKELY: userVisibleError 0.98 at step 8 (/reports.html)
- LIKELY: userVisibleError 0.98 at step 9 (/reports.html)
- FAIL: stuck: Jev chose stuck twice in a row
- LIKELY: goalMet 0.02 at the end
- files: [video](export/video.webm) · [trace](export/trace.zip) · [steps](export/steps.jsonl)

| step | route | what the persona did | what happened | P(next) | goalMet or parts |
| ---: | --- | --- | --- | ---: | ---: |
| 1 | `/app.html` | link "Reports" | went to /reports.html | 0.98 | 0.03 |
| 2 | `/reports.html` | button "Export CSV" | refused: POST /api/export 500; alert: The export could not be started. Try again later. | 1.00 | 0.08 |
| 3 | `/reports.html` | button "Export CSV" | refused: POST /api/export 500 | 0.94 | 0.03 |
| 4 | `/reports.html` | button "Export CSV" | refused: POST /api/export 500 | 0.83 | 0.02 |
| 5 | `/reports.html` | wait | waited | 0.12 | 0.02 |
| 6 | `/reports.html` | wait | waited | 0.14 | 0.02 |
| 7 | `/reports.html` | wait | waited | 0.18 | 0.02 |
| 8 | `/reports.html` | stuck | chose stuck | 0.05 | 0.02 |
| 9 | `/reports.html` | stuck | chose stuck | 0.20 | 0.02 |

### new-ticket — REVIEW

- goal: Create a ticket titled "Printer on floor 2 offline" and see it in the list. (writes)
- start: `/app.html`; ended: done after 13 steps, 4 s
- Jev: 13 calls, 46569 input tokens, $0.0020
- REVIEW: layoutBug 0.89 at step 1 (/app.html)
- REVIEW: layoutBug 0.87 at step 2 (/app.html)
- REVIEW: layoutBug 0.87 at step 3 (/app.html)
- REVIEW: layoutBug 0.88 at step 4 (/app.html)
- REVIEW: layoutBug 0.88 at step 5 (/app.html)
- REVIEW: layoutBug 0.90 at step 6 (/app.html)
- REVIEW: layoutBug 0.88 at step 7 (/app.html)
- REVIEW: layoutBug 0.87 at step 8 (/app.html)
- REVIEW: layoutBug 0.87 at step 9 (/app.html)
- REVIEW: layoutBug 0.88 at step 10 (/app.html)
- REVIEW: layoutBug 0.89 at step 11 (/app.html)
- REVIEW: layoutBug 0.88 at step 12 (/app.html)
- REVIEW: confusing 0.43 at step 13 (/app.html)
- REVIEW: layoutBug 0.89 at step 13 (/app.html)
- REVIEW: goalMet 0.56 at the end (uncertain)
- files: [video](new-ticket/video.webm) · [steps](new-ticket/steps.jsonl)

| step | route | what the persona did | what happened | P(next) | goalMet or parts |
| ---: | --- | --- | --- | ---: | ---: |
| 1 | `/app.html` | button "New ticket" | opened dialog "New ticket" | 0.97 | 0.05 |
| 2 | `/app.html` | button "Create ticket" | no visible change | 0.54 | 0.04 |
| 3 | `/app.html` | textbox "Requester email" = <email> | the screen changed | 0.67 | 0.03 |
| 4 | `/app.html` | textbox "Requester email" = <email> | no visible change | 0.42 | 0.05 |
| 5 | `/app.html` | textbox "Requester email" = <email> | no visible change | 0.50 | 0.04 |
| 6 | `/app.html` | textbox "Requester email" = <email> | no visible change | 0.48 | 0.04 |
| 7 | `/app.html` | button "Create ticket" | no visible change | 0.18 | 0.03 |
| 8 | `/app.html` | type textbox "Title" = Printer on floor 2 offline | the screen changed | 0.22 | 0.03 |
| 9 | `/app.html` | textbox "Requester email" = <email> | no visible change | 0.62 | 0.04 |
| 10 | `/app.html` | textbox "Requester email" = <email> | no visible change | 0.63 | 0.04 |
| 11 | `/app.html` | textbox "Requester email" = <email> | no visible change | 0.70 | 0.05 |
| 12 | `/app.html` | button "Create ticket" | closed dialog "New ticket"; saved: POST /api/tickets 201; alert: Created TCK-1049. | 0.22 | 0.04 |
| 13 | `/app.html` | done | chose done | 0.44 | 0.56 |

### resolve — REVIEW

- goal: Open ticket TCK-1039 and mark it resolved. (writes)
- start: `/app.html`; ended: done after 3 steps, 2 s
- Jev: 3 calls, 10360 input tokens, $0.0004
- REVIEW: layoutBug 0.89 at step 1 (/app.html)
- files: [video](resolve/video.webm) · [steps](resolve/steps.jsonl)

| step | route | what the persona did | what happened | P(next) | goalMet or parts |
| ---: | --- | --- | --- | ---: | ---: |
| 1 | `/app.html` | link "Open TCK-1039" | went to /ticket.html?id=TCK-1039 | 0.91 | 0.04 |
| 2 | `/ticket.html?id=TCK-1039` | button "Mark resolved" | saved: PATCH /api/tickets/TCK-1039 201 | 1.00 | 0.09 |
| 3 | `/ticket.html?id=TCK-1039` | done | chose done | 1.00 | 0.79 |
