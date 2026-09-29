# Personas

A persona file is one person and the goals they bring to the site. Jev reads `name`,
`role` and `cares` on every step, so write `cares` the way you would brief a new
colleague about a customer: what they know, what they are short of, what they will
not put up with.

```yaml
name: Maya Chen
role: Office manager choosing a helpdesk tool for a nine-person company
cares: >-
  Answers support email herself between other jobs …
goals:
  - id: pricing # lower-case words joined by -
    text: Find out what the Team plan costs per agent per month.
    start: / # the route the goal starts on (default /)
  - id: contact
    text: Send a message asking for a demo next week.
    start: /contact.html
    writes: true # changes data: skipped unless --allow-writes
  - id: data-picture
    text: Understand where customer data goes.
    parts: # 2 to 4 parts, each judged on the screen that shows it
      - The region customer data is stored in.
      - The list of third parties that process customer data.
```

Goal text is what Jev judges `goalMet` against, so name what the persona must be
looking at when they are done. Record ids (`INV-0042`) and quoted phrases in the text
become things the persona will type into a search box.
