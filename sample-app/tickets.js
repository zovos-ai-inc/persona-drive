// The ticket list lives in the browser tab: a page reload starts over.
const SEED = [
  ['TCK-1039', 'Cannot reset password from the mobile app', 'Open', 'Tomorrow'],
  ['TCK-1040', 'Invoice for March shows the wrong VAT number', 'Waiting', 'In 3 days'],
  ['TCK-1041', 'Export to CSV includes closed tickets even when the filter says open only', 'Overdue', '2 days ago'],
  ['TCK-1042', 'SSO login loops back to the sign-in page for one user', 'Open', 'Today'],
  ['TCK-1043', 'Knowledge base article shows the draft, not the published version', 'Open', 'In 5 days'],
  ['TCK-1044', 'Reply from customer created a second ticket instead of threading', 'Overdue', 'Yesterday'],
  ['TCK-1045', 'Request: dark mode', 'Waiting', 'No date'],
  ['TCK-1046', 'SLA timer keeps running over the weekend', 'Closed', 'Done'],
  ['TCK-1047', 'Attachment over 10 MB fails silently', 'Open', 'In 2 days'],
  ['TCK-1048', 'CSAT survey sent twice', 'Closed', 'Done'],
]
const tickets = JSON.parse(sessionStorage.getItem('tickets') ?? 'null') ?? SEED.map((t) => ({ id: t[0], title: t[1], status: t[2], due: t[3] }))
const save = () => sessionStorage.setItem('tickets', JSON.stringify(tickets))

const rows = document.getElementById('rows')
if (rows) {
  const q = document.getElementById('q')
  const status = document.getElementById('status')
  const render = () => {
    const needle = q.value.trim().toLowerCase()
    rows.innerHTML = tickets
      .filter((t) => !status.value || t.status === status.value)
      .filter((t) => !needle || t.id.toLowerCase().includes(needle) || t.title.toLowerCase().includes(needle))
      .map(
        (t) =>
          `<tr><td>${t.id}</td><td class="title">${t.title}</td><td>${t.status}</td><td class="faint">${t.due}</td><td><a href="/ticket.html?id=${t.id}" aria-label="Open ${t.id}">Open</a></td></tr>`,
      )
      .join('')
  }
  q.addEventListener('input', render)
  status.addEventListener('change', render)
  render()
  const dlg = document.getElementById('dlg')
  document.getElementById('new').addEventListener('click', () => dlg.showModal())
  document.getElementById('cancel').addEventListener('click', () => dlg.close())
  document.getElementById('form').addEventListener('submit', async (e) => {
    const title = document.getElementById('title').value.trim()
    if (!title) return
    const id = `TCK-${1039 + tickets.length}`
    await fetch('/api/tickets', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, title }) })
    tickets.unshift({ id, title, status: 'Open', due: 'In 7 days' })
    save()
    render()
    const created = document.getElementById('created')
    created.textContent = `Created ${id}.`
    created.hidden = false
    e.target.reset()
  })
}

const detail = document.getElementById('detail')
if (detail) {
  const id = new URLSearchParams(location.search).get('id')
  const t = tickets.find((x) => x.id === id)
  const h = document.getElementById('h')
  if (!t) {
    h.textContent = 'Ticket not found'
  } else {
    h.textContent = `${t.id}: ${t.title}`
    detail.innerHTML = `<dt>Status</dt><dd>${t.status}</dd><dt>Due</dt><dd>${t.due}</dd><dt>Requester</dt><dd>customer@example.com</dd><dt>Assigned to</dt><dd>Unassigned</dd>`
    const msg = document.getElementById('msg')
    document.getElementById('close').addEventListener('click', async () => {
      await fetch(`/api/tickets/${t.id}`, { method: 'PATCH', body: '{"status":"Closed"}' })
      t.status = 'Closed'
      save()
      detail.querySelector('dd').textContent = 'Closed'
      msg.textContent = `${t.id} marked resolved.`
      msg.hidden = false
    })
    document.getElementById('delete').addEventListener('click', async () => {
      if (!confirm(`Delete ${t.id}? This cannot be undone.`)) return
      await fetch(`/api/tickets/${t.id}`, { method: 'DELETE' })
      tickets.splice(tickets.indexOf(t), 1)
      save()
      location.href = '/app.html'
    })
  }
}
