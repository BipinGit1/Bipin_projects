const loginPanel = document.querySelector('#login-panel');
const dashboardPanel = document.querySelector('#dashboard-panel');
const loadingMessage = document.querySelector('#loading-message');
const currency = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });

function setMessage(target, message, isError = false) {
  target.textContent = message;
  target.classList.toggle('is-error', isError);
}

async function request(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'same-origin',
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers
    }
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'The request could not be completed.');
  return result;
}

function addCell(row, text, className) {
  const cell = document.createElement('td');
  if (className) cell.className = className;
  cell.textContent = text;
  row.append(cell);
  return cell;
}

function formatDate(value) {
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(new Date(value));
}

function renderLeads(leads) {
  const body = document.querySelector('#leads-body');
  const empty = document.querySelector('#leads-empty');
  body.replaceChildren();
  empty.hidden = leads.length > 0;

  for (const lead of leads) {
    const row = document.createElement('tr');
    addCell(row, formatDate(lead.createdAt));
    const contact = document.createElement('td');
    const name = document.createElement('strong');
    name.textContent = lead.name;
    const email = document.createElement('a');
    email.href = `mailto:${lead.email}`;
    email.textContent = lead.email;
    const details = document.createElement('div');
    details.className = 'muted';
    details.textContent = lead.phone || 'No phone provided';
    contact.append(name, document.createElement('br'), email, document.createElement('br'), details);
    row.append(contact);
    addCell(row, `${lead.projectType} · ${lead.budget}`);
    const message = addCell(row, lead.message, 'lead-message');
    message.title = lead.message;
    const statusCell = document.createElement('td');
    const select = document.createElement('select');
    select.className = 'status-select';
    select.setAttribute('aria-label', `Update status for ${lead.name}`);
    for (const [value, label] of [['new', 'New'], ['contacted', 'Contacted'], ['closed', 'Closed']]) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      option.selected = value === lead.status;
      select.append(option);
    }
    select.addEventListener('change', async () => {
      select.disabled = true;
      try {
        await request(`/api/admin/leads/${encodeURIComponent(lead.id)}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: select.value })
        });
        await loadDashboard();
      } catch (error) {
        setMessage(document.querySelector('#dashboard-message'), error.message, true);
        select.value = lead.status;
      } finally {
        select.disabled = false;
      }
    });
    statusCell.append(select);
    row.append(statusCell);
    body.append(row);
  }
}

function renderRevenue(entries) {
  const body = document.querySelector('#revenue-body');
  const empty = document.querySelector('#revenue-empty');
  body.replaceChildren();
  empty.hidden = entries.length > 0;
  for (const entry of entries) {
    const row = document.createElement('tr');
    addCell(row, formatDate(entry.paidAt));
    addCell(row, entry.title);
    addCell(row, currency.format(Number(entry.amount)));
    body.append(row);
  }
}

function renderTrend(trend) {
  const chart = document.querySelector('#revenue-chart');
  chart.replaceChildren();
  const maximum = Math.max(0, ...trend.map((item) => Number(item.total)));

  for (const item of trend) {
    const column = document.createElement('div');
    column.className = 'chart-column';
    const area = document.createElement('div');
    area.className = 'chart-bar-area';
    const bar = document.createElement('div');
    bar.className = 'chart-bar';
    bar.style.height = `${maximum ? Math.max(4, Number(item.total) / maximum * 100) : 4}%`;
    bar.title = `${item.month}: ${currency.format(Number(item.total))}`;
    const value = document.createElement('span');
    value.className = 'chart-value';
    value.textContent = currency.format(Number(item.total));
    area.append(bar);
    column.append(value, area);
    const label = document.createElement('span');
    label.className = 'chart-label';
    label.textContent = item.month;
    column.append(label);
    chart.append(column);
  }
}

async function loadDashboard() {
  const message = document.querySelector('#dashboard-message');
  try {
    const data = await request('/api/admin/summary');
    document.querySelector('#revenue-total').textContent = currency.format(Number(data.revenue.total));
    document.querySelector('#revenue-month').textContent = currency.format(Number(data.revenue.thisMonth));
    document.querySelector('#lead-total').textContent = data.leads.total;
    document.querySelector('#lead-new').textContent = data.leads.new;
    document.querySelector('#lead-count-label').textContent = `Latest ${data.leads.recent.length} of ${data.leads.total}`;
    document.querySelector('#revenue-count-label').textContent = `Latest ${data.revenue.recent.length}`;
    renderTrend(data.revenue.trend);
    renderLeads(data.leads.recent);
    renderRevenue(data.revenue.recent);
    setMessage(message, '');
  } catch (error) {
    setMessage(message, error.message, true);
    if (error.message.includes('sign in')) showLogin();
  }
}

function showLogin(message = '') {
  dashboardPanel.hidden = true;
  loginPanel.hidden = false;
  loadingMessage.hidden = true;
  if (message) setMessage(document.querySelector('#login-message'), message, true);
}

async function initialize() {
  try {
    const session = await request('/api/admin/session');
    document.querySelector('#account-email').textContent = session.email;
    dashboardPanel.hidden = false;
    loginPanel.hidden = true;
    loadingMessage.hidden = true;
    document.querySelector('#revenue-form [name="paidAt"]').value = new Date().toISOString().slice(0, 10);
    await loadDashboard();
  } catch {
    showLogin();
  }
}

document.querySelector('#login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  const status = document.querySelector('#login-message');
  button.disabled = true;
  setMessage(status, '');
  try {
    const result = await request('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify(Object.fromEntries(new FormData(form)))
    });
    document.querySelector('#account-email').textContent = result.email;
    document.querySelector('#revenue-form [name="paidAt"]').value = new Date().toISOString().slice(0, 10);
    loginPanel.hidden = true;
    dashboardPanel.hidden = false;
    form.reset();
    await loadDashboard();
  } catch (error) {
    setMessage(status, error.message, true);
  } finally {
    button.disabled = false;
  }
});

document.querySelector('#revenue-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  const message = document.querySelector('#dashboard-message');
  button.disabled = true;
  try {
    const data = Object.fromEntries(new FormData(form));
    await request('/api/admin/revenue', { method: 'POST', body: JSON.stringify(data) });
    form.reset();
    form.elements.paidAt.value = new Date().toISOString().slice(0, 10);
    setMessage(message, 'Payment saved.');
    await loadDashboard();
  } catch (error) {
    setMessage(message, error.message, true);
  } finally {
    button.disabled = false;
  }
});

document.querySelector('#refresh-button').addEventListener('click', loadDashboard);
document.querySelector('#logout-button').addEventListener('click', async () => {
  try {
    await request('/api/admin/logout', { method: 'POST', body: '{}' });
  } finally {
    showLogin();
  }
});

initialize();
