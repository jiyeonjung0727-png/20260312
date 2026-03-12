'use strict';

let allInventory = [];
let editingCode  = null;   // 현재 인라인 편집 중인 코드 (null = 없음, 'NEW' = 새 행)

// ── 페이지 전환 ────────────────────────────────────────────────────
function goPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  document.getElementById('page-' + name).classList.add('active');
  document.querySelector(`[data-page="${name}"]`).classList.add('active');
  if (name === 'dashboard') loadDashboard();
  if (name === 'inventory') { fetchInventory().then(renderInventoryTable); }
  if (name === 'order')     renderOrderTable();
}

document.querySelectorAll('.nav-link').forEach(link => {
  link.addEventListener('click', e => { e.preventDefault(); goPage(link.dataset.page); });
});

// ── 데이터 로드 ────────────────────────────────────────────────────
async function fetchInventory() {
  const res = await fetch('/api/inventory');
  allInventory = await res.json();
  return allInventory;
}
async function fetchSummary() {
  const res = await fetch('/api/summary');
  return res.json();
}
async function refreshAll() {
  await fetchInventory();
  loadDashboard();
}

// ── 대시보드 ────────────────────────────────────────────────────────
async function loadDashboard() {
  const [summary] = await Promise.all([fetchSummary(), fetchInventory()]);

  document.getElementById('kpiGrid').innerHTML = `
    <div class="kpi">
      <div class="kpi-label">전체 품목</div>
      <div class="kpi-val">${summary.totalItems}</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">발주 필요</div>
      <div class="kpi-val danger">${summary.lowCount}</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">정상</div>
      <div class="kpi-val success">${summary.normalCount}</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">총 발주권장 수량</div>
      <div class="kpi-val">${summary.totalOrderQty}</div>
    </div>`;

  const low   = allInventory.filter(i => i.status === '발주 필요');
  const tbody = document.querySelector('#lowTable tbody');
  tbody.innerHTML = '';
  if (low.length === 0) {
    document.getElementById('lowEmpty').style.display = 'block';
    document.getElementById('lowTable').style.display = 'none';
  } else {
    document.getElementById('lowEmpty').style.display = 'none';
    document.getElementById('lowTable').style.display = '';
    low.forEach(it => {
      tbody.insertAdjacentHTML('beforeend', `
        <tr>
          <td>${it.code}</td>
          <td><strong>${it.name}</strong></td>
          <td style="color:var(--muted)">${it.spec}</td>
          <td>${it.supplierName}</td>
          <td class="num danger">${it.currentStock}${it.unit}</td>
          <td class="num">${it.safetyStock}${it.unit}</td>
          <td class="num danger">${it.shortage}${it.unit}</td>
          <td class="num accent">${it.orderQty}${it.unit}</td>
        </tr>`);
    });
  }

  const suppDiv = document.getElementById('supplierSummary');
  suppDiv.innerHTML = '';
  if (Object.keys(summary.bySupplier).length === 0) {
    suppDiv.innerHTML = '<p style="color:var(--muted)">발주 필요 거래처 없음</p>';
  } else {
    for (const [name, stat] of Object.entries(summary.bySupplier)) {
      suppDiv.insertAdjacentHTML('beforeend', `
        <div class="supplier-card">
          <h3>${name}</h3>
          <div class="supplier-stat">발주 품목: <span>${stat.count}건</span></div>
          <div class="supplier-stat">총 발주량: <span>${stat.totalOrderQty}</span></div>
        </div>`);
    }
  }
}

// ── 재고 입력 테이블 ────────────────────────────────────────────────
function renderInventoryTable() {
  const keyword = (document.getElementById('searchInput')?.value || '').toLowerCase();
  const statusF = document.getElementById('statusFilter')?.value || '';
  const filtered = allInventory.filter(it => {
    const matchKw = !keyword || it.name.toLowerCase().includes(keyword) || (it.supplierName || '').toLowerCase().includes(keyword);
    const matchSt = !statusF || it.status === statusF;
    return matchKw && matchSt;
  });

  const tbody   = document.getElementById('invTbody');
  const emptyEl = document.getElementById('invEmpty');
  tbody.innerHTML = '';
  editingCode = null;

  if (filtered.length === 0) {
    emptyEl.style.display = 'block';
  } else {
    emptyEl.style.display = 'none';
    filtered.forEach(it => tbody.appendChild(buildViewRow(it)));
  }
}

/** 읽기 전용 행 */
function buildViewRow(it) {
  const tr  = document.createElement('tr');
  tr.dataset.code = it.code;
  const badgeCls  = it.status === '발주 필요' ? 'badge-danger' : 'badge-success';
  const curCls    = it.status === '발주 필요' ? 'danger' : '';
  tr.innerHTML = `
    <td class="td-code">${it.code}</td>
    <td class="td-name"><strong>${esc(it.name)}</strong></td>
    <td class="td-muted">${esc(it.spec)}</td>
    <td>${esc(it.unit)}</td>
    <td class="num ${curCls}">${it.currentStock}</td>
    <td class="num">${it.safetyStock}</td>
    <td class="num">${it.moq}</td>
    <td class="num accent">${it.orderQty}</td>
    <td>${esc(it.supplierName)}</td>
    <td><span class="badge ${badgeCls}">${it.status}</span></td>
    <td class="td-actions">
      <button class="btn btn-ghost btn-sm" onclick="startEdit('${it.code}')">수정</button>
      <button class="btn btn-icon btn-sm" title="삭제" onclick="deleteRow('${it.code}')">🗑</button>
    </td>`;
  return tr;
}

/** 인라인 편집 행 */
function buildEditRow(it, isNew) {
  const tr = document.createElement('tr');
  tr.dataset.code    = it.code;
  tr.classList.add('editing-row');
  tr.innerHTML = `
    <td class="td-code" style="color:var(--muted);font-size:11px;">${isNew ? '자동' : it.code}</td>
    <td><input class="cell-input" id="ei_name"  type="text"   value="${esc(it.name)}"         placeholder="재료명 *"></td>
    <td><input class="cell-input" id="ei_spec"  type="text"   value="${esc(it.spec)}"         placeholder="규격"></td>
    <td><input class="cell-input" id="ei_unit"  type="text"   value="${esc(it.unit)}"         placeholder="단위" style="width:52px;"></td>
    <td><input class="cell-input num" id="ei_cur"  type="number" value="${it.currentStock}" min="0" style="width:72px;"></td>
    <td><input class="cell-input num" id="ei_safe" type="number" value="${it.safetyStock}"  min="0" style="width:72px;"></td>
    <td><input class="cell-input num" id="ei_moq"  type="number" value="${it.moq}"          min="0" style="width:60px;"></td>
    <td class="num td-muted" id="ei_orderQty">—</td>
    <td><input class="cell-input" id="ei_sup"   type="text"   value="${esc(it.supplierName)}" placeholder="거래처명"></td>
    <td></td>
    <td class="td-actions">
      <button class="btn btn-primary btn-sm" onclick="saveInlineRow('${it.code}', ${isNew})">저장</button>
      <button class="btn btn-ghost btn-sm"   onclick="cancelEdit('${it.code}', ${isNew})">취소</button>
    </td>`;
  // 현재재고/안전재고 바뀔 때 발주권장 수량 미리보기
  const updatePreview = () => {
    const cur  = Number(tr.querySelector('#ei_cur').value)  || 0;
    const safe = Number(tr.querySelector('#ei_safe').value) || 0;
    const moq  = Number(tr.querySelector('#ei_moq').value)  || 0;
    const shortage = Math.max(0, safe - cur);
    const oq = shortage > 0 ? Math.max(moq, shortage) : 0;
    tr.querySelector('#ei_orderQty').textContent = oq > 0 ? oq : '—';
    tr.querySelector('#ei_orderQty').style.color = oq > 0 ? 'var(--danger)' : 'var(--muted)';
  };
  tr.querySelector('#ei_cur').addEventListener('input',  updatePreview);
  tr.querySelector('#ei_safe').addEventListener('input', updatePreview);
  tr.querySelector('#ei_moq').addEventListener('input',  updatePreview);
  updatePreview();
  return tr;
}

/** 수정 시작 */
function startEdit(code) {
  if (editingCode !== null) cancelEdit(editingCode, editingCode === 'NEW');
  const it = allInventory.find(i => i.code === code);
  if (!it) return;
  const tr = document.querySelector(`#invTbody tr[data-code="${code}"]`);
  if (!tr) return;
  editingCode = code;
  tr.replaceWith(buildEditRow(it, false));
  document.querySelector(`#invTbody tr[data-code="${code}"] #ei_name`).focus();
}

/** 새 행 추가 */
function addNewRow() {
  if (editingCode !== null) cancelEdit(editingCode, editingCode === 'NEW');
  editingCode = 'NEW';
  const emptyEl = document.getElementById('invEmpty');
  emptyEl.style.display = 'none';
  const blankItem = { code: 'NEW', name: '', spec: '', unit: '개', currentStock: 0, safetyStock: 0, moq: 0, supplierName: '', supplierEmail: '', leadDays: 0 };
  const newTr = buildEditRow(blankItem, true);
  document.getElementById('invTbody').prepend(newTr);
  newTr.querySelector('#ei_name').focus();
}

/** 저장 */
async function saveInlineRow(code, isNew) {
  const tr   = document.querySelector(`#invTbody tr[data-code="${code}"]`);
  if (!tr) return;
  const name = tr.querySelector('#ei_name').value.trim();
  if (!name) { flashError(tr, '재료명을 입력해 주세요.'); return; }

  const body = {
    name,
    spec:          tr.querySelector('#ei_spec').value.trim(),
    unit:          tr.querySelector('#ei_unit').value.trim() || '개',
    currentStock:  Number(tr.querySelector('#ei_cur').value)  || 0,
    safetyStock:   Number(tr.querySelector('#ei_safe').value) || 0,
    moq:           Number(tr.querySelector('#ei_moq').value)  || 0,
    supplierName:  tr.querySelector('#ei_sup').value.trim(),
  };

  const url    = isNew ? '/api/inventory'           : `/api/inventory/${code}`;
  const method = isNew ? 'POST'                     : 'PUT';
  try {
    const res  = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '저장 실패');
    editingCode = null;
    showSaveMsg('success', `✅ "${data.name}" 저장 완료`);
    await fetchInventory();
    renderInventoryTable();
  } catch (e) {
    flashError(tr, e.message);
  }
}

/** 취소 */
function cancelEdit(code, isNew) {
  editingCode = null;
  if (isNew) {
    const tr = document.querySelector(`#invTbody tr[data-code="NEW"]`);
    if (tr) tr.remove();
    if (allInventory.length === 0) document.getElementById('invEmpty').style.display = 'block';
    return;
  }
  const it = allInventory.find(i => i.code === code);
  if (!it) return;
  const tr = document.querySelector(`#invTbody tr[data-code="${code}"]`);
  if (tr) tr.replaceWith(buildViewRow(it));
}

/** 삭제 */
async function deleteRow(code) {
  const it = allInventory.find(i => i.code === code);
  if (!confirm(`"${it?.name || code}" 품목을 삭제할까요?`)) return;
  const res = await fetch(`/api/inventory/${code}`, { method: 'DELETE' });
  const data = await res.json();
  if (!res.ok) { alert(data.error || '삭제 실패'); return; }
  showSaveMsg('success', `"${it?.name || code}" 삭제 완료`);
  await fetchInventory();
  renderInventoryTable();
}

function flashError(tr, msg) {
  tr.style.outline = '2px solid var(--danger)';
  setTimeout(() => { tr.style.outline = ''; }, 1500);
  showSaveMsg('error', msg);
}
function showSaveMsg(type, msg) {
  const el = document.getElementById('invSaveMsg');
  el.style.display = 'block';
  el.className = `alert alert-${type}`;
  el.textContent = msg;
  clearTimeout(el._timer);
  el._timer = setTimeout(() => { el.style.display = 'none'; }, 3000);
}

// ── 발주 테이블 ────────────────────────────────────────────────────
function renderOrderTable() {
  fetchInventory().then(() => {
    const low = allInventory.filter(i => i.status === '발주 필요');
    const tbody = document.getElementById('orderTbody');
    tbody.innerHTML = '';
    if (low.length === 0) {
      document.getElementById('orderEmpty').style.display = 'block';
      document.getElementById('orderTable').style.display = 'none';
    } else {
      document.getElementById('orderEmpty').style.display = 'none';
      document.getElementById('orderTable').style.display = '';
      low.forEach(it => {
        tbody.insertAdjacentHTML('beforeend', `
          <tr>
            <td><input type="checkbox" class="order-chk" value="${it.code}" checked></td>
            <td><strong>${esc(it.name)}</strong></td>
            <td style="color:var(--muted)">${esc(it.spec)}</td>
            <td class="num danger">${it.currentStock}${it.unit}</td>
            <td class="num">${it.safetyStock}${it.unit}</td>
            <td class="num accent">${it.orderQty}${it.unit}</td>
            <td>${esc(it.supplierName)}</td>
          </tr>`);
      });
    }
    document.getElementById('orderResultBox').style.display = 'none';
  });
}

function selectAllOrder(checked) {
  document.querySelectorAll('.order-chk').forEach(c => c.checked = checked);
  document.getElementById('chkAll').checked = checked;
}

async function sendOrder() {
  const emailUser = document.getElementById('emailUser').value.trim();
  const emailPass = document.getElementById('emailPass').value.trim();
  const checked   = [...document.querySelectorAll('.order-chk:checked')].map(c => c.value);
  const box       = document.getElementById('orderResultBox');
  const btn       = document.getElementById('sendOrderBtn');
  const btnIcon   = document.getElementById('sendBtnIcon');
  const btnText   = document.getElementById('sendBtnText');

  if (!emailUser || !emailPass) { showAlert(box, 'error', 'Gmail 계정과 앱 비밀번호를 입력해 주세요.'); return; }
  if (checked.length === 0)     { showAlert(box, 'error', '발주할 품목을 하나 이상 선택해 주세요.'); return; }

  // 버튼 로딩 상태
  btn.disabled    = true;
  btnIcon.textContent = '';
  btnIcon.className   = 'spinner';
  btnText.textContent = '이메일 발송 중...';
  showAlert(box, 'info', '📤 이메일 발송 중입니다. 잠시 기다려 주세요...');

  try {
    const res  = await fetch('/api/send-order', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ emailUser, emailPass, selectedCodes: checked }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '발송 실패');

    // 성공 알림
    const rows   = data.results.map(r => `${r.supplier} (${r.itemCount}건): ${r.status}`).join('\n');
    const detail = data.results.map(r => `• ${r.supplier} ${r.itemCount}건 — ${r.status}`).join('<br>');
    showAlert(box, 'success', `✅ 발주서가 ${data.sentTo}로 발송되었습니다!\n\n${rows}`);
    showToast('success',
      `📧 발주서 발송 완료!`,
      `${checked.length}개 품목 → <strong>${data.sentTo}</strong><br>${detail}`
    );
  } catch (e) {
    showAlert(box, 'error', `❌ 발송 실패: ${e.message}`);
    showToast('error', '발송 실패', e.message);
  } finally {
    // 버튼 복원
    btn.disabled        = false;
    btnIcon.className   = '';
    btnIcon.textContent = '📧';
    btnText.textContent = '발주서 이메일 발송 (수신: jiyeon.jung0727@gmail.com)';
  }
}

// ── 공통 헬퍼 ─────────────────────────────────────────────────────
function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function showAlert(el, type, msg) {
  el.style.display    = 'block';
  el.className        = `alert alert-${type}`;
  el.style.whiteSpace = 'pre-wrap';
  el.textContent      = msg;
}

// ── 토스트 알림 ───────────────────────────────────────────────────
let toastTimer = null;
function showToast(type, title, bodyHtml, durationMs = 6000) {
  const toast = document.getElementById('toast');
  const icon  = document.getElementById('toastIcon');
  const ttl   = document.getElementById('toastTitle');
  const bdy   = document.getElementById('toastBody');

  toast.className = `toast toast-${type} toast-show`;
  icon.textContent = type === 'success' ? '✅' : '❌';
  ttl.textContent  = title;
  bdy.innerHTML    = bodyHtml;
  toast.style.display = 'flex';

  // 애니메이션 트리거
  requestAnimationFrame(() => toast.classList.add('toast-visible'));

  clearTimeout(toastTimer);
  toastTimer = setTimeout(closeToast, durationMs);
}
function closeToast() {
  const toast = document.getElementById('toast');
  toast.classList.remove('toast-visible');
  setTimeout(() => { toast.style.display = 'none'; }, 400);
}

// ── 로그아웃 ──────────────────────────────────────────────────────
async function logout() {
  await fetch('/api/logout', { method: 'POST' });
  window.location.href = '/login';
}

// ── 401 인터셉터 ──────────────────────────────────────────────────
const _origFetch = window.fetch.bind(window);
window.fetch = async (...args) => {
  const res = await _origFetch(...args);
  if (res.status === 401) { window.location.href = '/login'; }
  return res;
};

// ── 초기화 ────────────────────────────────────────────────────────
fetchInventory().then(loadDashboard);
