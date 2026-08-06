const API_BASE = window.location.origin;
let currentEmailId = null;

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('api-base').value = API_BASE;

  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  document.getElementById('search-input').addEventListener('input', (e) => {
    loadEmails(e.target.value);
  });

  loadEmails();
  loadAliases();
  loadForwards();
});

function switchTab(tabName) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelector(`.tab[data-tab="${tabName}"]`).classList.add('active');
  document.getElementById(tabName).classList.add('active');
}

function showToast(msg) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// ========== 邮件 ==========
async function loadEmails(search = '') {
  const list = document.getElementById('emails-list');
  list.innerHTML = '<div class="loading">加载中...</div>';

  try {
    const url = search
      ? `${API_BASE}/api/emails?search=${encodeURIComponent(search)}`
      : `${API_BASE}/api/emails`;
    const res = await fetch(url);
    const data = await res.json();

    if (!data.success || !data.data.length) {
      list.innerHTML = '<div class="loading">暂无邮件</div>';
      return;
    }

    list.innerHTML = data.data.map(e => `
      <div class="email-item" onclick="showEmail(${e.id})">
        <div class="from">${escapeHtml(e.from_addr)}</div>
        <div class="subject">${escapeHtml(e.subject)}</div>
        <div class="preview">${escapeHtml((e.text_body || '').substring(0, 100))}</div>
        <div class="meta">
          → ${escapeHtml(e.to_addr)} · ${formatTime(e.received_at)}
        </div>
      </div>
    `).join('');
  } catch (err) {
    list.innerHTML = `<div class="loading">加载失败: ${err.message}</div>`;
  }
}

async function showEmail(id) {
  currentEmailId = id;
  const list = document.getElementById('emails-list');
  const detail = document.getElementById('email-detail');
  const content = document.getElementById('detail-content');

  list.classList.add('hidden');
  detail.classList.remove('hidden');
  content.innerHTML = '<div class="loading">加载中...</div>';

  try {
    const res = await fetch(`${API_BASE}/api/emails/${id}`);
    const data = await res.json();
    const e = data.data;

    content.innerHTML = `
      <div class="meta">
        <div><strong>发件人:</strong> ${escapeHtml(e.from_addr)}</div>
        <div><strong>收件人:</strong> ${escapeHtml(e.to_addr)}</div>
        <div><strong>主题:</strong> ${escapeHtml(e.subject)}</div>
        <div><strong>收到时间:</strong> ${formatTime(e.received_at)}</div>
        <div><strong>Message-ID:</strong> ${escapeHtml(e.message_id)}</div>
      </div>
      ${e.html_body ? `<h3>HTML 内容</h3><iframe sandbox srcdoc="${escapeAttr(e.html_body)}"></iframe>` : ''}
      ${e.text_body ? `<h3>纯文本</h3><pre>${escapeHtml(e.text_body)}</pre>` : ''}
    `;
  } catch (err) {
    content.innerHTML = `<div class="loading">加载失败: ${err.message}</div>`;
  }
}

function closeDetail() {
  document.getElementById('emails-list').classList.remove('hidden');
  document.getElementById('email-detail').classList.add('hidden');
  currentEmailId = null;
}

async function deleteCurrentEmail() {
  if (!currentEmailId) return;
  if (!confirm('确定删除这封邮件？')) return;

  await fetch(`${API_BASE}/api/emails/${currentEmailId}`, { method: 'DELETE' });
  showToast('已删除');
  closeDetail();
  loadEmails();
}

async function clearAllEmails() {
  if (!confirm('确定清空所有邮件？此操作不可恢复。')) return;

  const res = await fetch(`${API_BASE}/api/emails`);
  const data = await res.json();
  if (data.data) {
    await Promise.all(data.data.map(e =>
      fetch(`${API_BASE}/api/emails/${e.id}`, { method: 'DELETE' })
    ));
  }
  showToast('已清空');
  loadEmails();
}

// ========== 别名 ==========
async function loadAliases() {
  const list = document.getElementById('aliases-list');
  list.innerHTML = '<div class="loading">加载中...</div>';

  try {
    const res = await fetch(`${API_BASE}/api/aliases`);
    const data = await res.json();

    if (!data.success || !data.data.length) {
      list.innerHTML = '<div class="loading">暂无别名，添加一个开始使用</div>';
      return;
    }

    list.innerHTML = data.data.map(a => `
      <div class="item-card">
        <div class="info">
          <span class="label">@${escapeHtml(a.alias)}</span>
          <span class="sub">→ ${escapeHtml(a.target_email)}</span>
        </div>
        <button class="danger" onclick="deleteAlias(${a.id})">删除</button>
      </div>
    `).join('');
  } catch (err) {
    list.innerHTML = `<div class="loading">加载失败</div>`;
  }
}

async function addAlias() {
  const alias = document.getElementById('alias-domain').value.trim();
  const target = document.getElementById('alias-target').value.trim();

  if (!alias || !target) {
    alert('请填写完整信息');
    return;
  }

  await fetch(`${API_BASE}/api/aliases`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ alias, target_email: target })
  });

  document.getElementById('alias-domain').value = '';
  document.getElementById('alias-target').value = '';
  showToast('别名已添加');
  loadAliases();
}

async function deleteAlias(id) {
  if (!confirm('确定删除此别名？')) return;
  await fetch(`${API_BASE}/api/aliases/${id}`, { method: 'DELETE' });
  showToast('已删除');
  loadAliases();
}

// ========== 转发规则 ==========
async function loadForwards() {
  const list = document.getElementById('forwards-list');
  list.innerHTML = '<div class="loading">加载中...</div>';

  try {
    const res = await fetch(`${API_BASE}/api/forwards`);
    const data = await res.json();

    if (!data.success || !data.data.length) {
      list.innerHTML = '<div class="loading">暂无转发规则</div>';
      return;
    }

    list.innerHTML = data.data.map(f => `
      <div class="item-card">
        <div class="info">
          <span class="label">模式: ${escapeHtml(f.pattern)}</span>
          <span class="sub">→ ${escapeHtml(f.target_url)}</span>
        </div>
        <button class="danger" onclick="deleteForward(${f.id})">删除</button>
      </div>
    `).join('');
  } catch (err) {
    list.innerHTML = `<div class="loading">加载失败</div>`;
  }
}

async function addForward() {
  const pattern = document.getElementById('forward-pattern').value.trim();
  const url = document.getElementById('forward-url').value.trim();

  if (!pattern || !url) {
    alert('请填写完整信息');
    return;
  }

  await fetch(`${API_BASE}/api/forwards`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pattern, target_url: url })
  });

  document.getElementById('forward-pattern').value = '';
  document.getElementById('forward-url').value = '';
  showToast('转发规则已添加');
  loadForwards();
}

async function deleteForward(id) {
  if (!confirm('确定删除此转发规则？')) return;
  await fetch(`${API_BASE}/api/forwards/${id}`, { method: 'DELETE' });
  showToast('已删除');
  loadForwards();
}

// ========== 设置 ==========
async function saveSettings() {
  const days = document.getElementById('retention-days').value;
  localStorage.setItem('retention_days', days);
  showToast('设置已保存');
}

// ========== 工具函数 ==========
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function escapeAttr(text) {
  if (!text) return '';
  return text.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function formatTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}
