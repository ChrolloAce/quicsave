const API_URL = 'https://api-production-cad4.up.railway.app';

let data = { folders: [] };
let navStack = [{ type: 'root' }];
let searchQuery = '';
let activeTab = 'responses';
let prayerState = { appId: null, reviews: [], loaded: false, currentIdx: null };

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function currentView() {
  return navStack[navStack.length - 1];
}

// ---- API helpers ----
async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(API_URL + path, opts);
  return res.json();
}

async function loadData() {
  try {
    const remote = await api('GET', '/data');
    if (remote && remote.folders) return remote;
  } catch (e) {
    console.warn('API unreachable:', e);
  }
  return { folders: [] };
}

function saveLocal() {}

async function createFolder(id, name, parentId) {
  await api('POST', '/folders', { id, name, parent_id: parentId || null });
}

async function updateFolder(id, name) {
  await api('PUT', '/folders/' + id, { name });
}

async function removeFolder(id) {
  await api('DELETE', '/folders/' + id);
}

async function createResponse(id, folderId, title, content) {
  await api('POST', '/responses', { id, folder_id: folderId, title, content });
}

async function updateResponse(id, title, content, folderId) {
  const body = { title, content };
  if (folderId !== undefined) body.folder_id = folderId;
  await api('PUT', '/responses/' + id, body);
}

async function removeResponse(id) {
  await api('DELETE', '/responses/' + id);
}

// ---- UI helpers ----
function esc(str) {
  const d = document.createElement('div');
  d.textContent = str == null ? '' : str;
  return d.innerHTML;
}

// ---- Tabs ----
function bindTabs() {
  document.querySelectorAll('.tab').forEach(t => {
    t.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      activeTab = t.dataset.tab;
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      document.getElementById('panel-' + activeTab).classList.add('active');
      document.getElementById('addBtn').style.display = activeTab === 'responses' ? 'inline-flex' : 'none';
      if (activeTab === 'prayerlock') loadPrayerLock();
    });
  });
}

// ---- Breadcrumb ----
function renderBreadcrumb() {
  const bc = document.getElementById('breadcrumb');
  const backBtn = document.getElementById('backBtn');
  backBtn.style.display = navStack.length > 1 ? 'flex' : 'none';

  let html = '';
  navStack.forEach((item, i) => {
    const isLast = i === navStack.length - 1;
    let name = 'Home';
    if (item.type === 'folder') {
      const f = data.folders.find(f => f.id === item.id);
      name = f ? f.name : '?';
    } else if (item.type === 'subfolder') {
      const f = data.folders.find(f => f.id === item.folderId);
      const sf = f?.subfolders?.find(s => s.id === item.subId);
      name = sf ? sf.name : '?';
    }
    if (i > 0) html += '<span class="breadcrumb-sep">&#9656;</span>';
    html += `<span class="breadcrumb-item ${isLast ? 'active' : ''}" data-nav="${i}">${esc(name)}</span>`;
  });
  bc.innerHTML = html;

  bc.querySelectorAll('.breadcrumb-item:not(.active)').forEach(el => {
    el.addEventListener('click', () => {
      navStack = navStack.slice(0, parseInt(el.dataset.nav) + 1);
      render();
    });
  });
}

// ---- Render ----
function render() {
  renderBreadcrumb();
  const view = currentView();
  const content = document.getElementById('content');
  const q = searchQuery.toLowerCase();

  if (view.type === 'root') {
    let html = '';
    data.folders.forEach(folder => {
      const total = (folder.responses?.length || 0) +
        (folder.subfolders?.reduce((a, sf) => a + (sf.responses?.length || 0), 0) || 0);
      if (q && !folder.name.toLowerCase().includes(q) && !hasMatch(folder, q)) return;
      html += folderCardHTML(folder.id, null, folder.name, total, folder.subfolders?.length || 0);
    });

    if (q) {
      data.folders.forEach(folder => {
        folder.responses?.forEach(r => {
          if (matchR(r, q)) html += responseCardHTML(r, folder.name);
        });
        folder.subfolders?.forEach(sf => {
          sf.responses?.forEach(r => {
            if (matchR(r, q)) html += responseCardHTML(r, folder.name + ' / ' + sf.name);
          });
        });
      });
    }

    content.innerHTML = html || '<div class="empty-state"><p>No folders yet. Click "+ New" to create one.</p></div>';
    bindClicks();
  } else if (view.type === 'folder') {
    const folder = data.folders.find(f => f.id === view.id);
    if (!folder) return;
    let html = '';

    folder.subfolders?.forEach(sf => {
      if (q && !sf.name.toLowerCase().includes(q) && !sf.responses?.some(r => matchR(r, q))) return;
      html += folderCardHTML(folder.id, sf.id, sf.name, sf.responses?.length || 0, 0);
    });

    folder.responses?.forEach(r => {
      if (q && !matchR(r, q)) return;
      html += responseCardHTML(r);
    });

    content.innerHTML = html || '<div class="empty-state"><p>Empty folder. Click "+ New" to add.</p></div>';
    bindClicks();
  } else if (view.type === 'subfolder') {
    const folder = data.folders.find(f => f.id === view.folderId);
    const sf = folder?.subfolders?.find(s => s.id === view.subId);
    if (!sf) return;
    let html = '';

    sf.responses?.forEach(r => {
      if (q && !matchR(r, q)) return;
      html += responseCardHTML(r);
    });

    content.innerHTML = html || '<div class="empty-state"><p>Empty subfolder. Click "+ New" to add.</p></div>';
    bindClicks();
  }
}

function matchR(r, q) {
  return r.title.toLowerCase().includes(q) || r.content.toLowerCase().includes(q);
}

function hasMatch(folder, q) {
  if (folder.responses?.some(r => matchR(r, q))) return true;
  return folder.subfolders?.some(sf => sf.responses?.some(r => matchR(r, q)));
}

function folderCardHTML(folderId, subId, name, count, subCount) {
  const dataAttr = subId
    ? `data-folder-id="${folderId}" data-subfolder-id="${subId}"`
    : `data-folder-id="${folderId}"`;
  const countText = subCount ? `${count} responses · ${subCount} subfolders` : `${count} responses`;

  return `
    <div class="card-item folder" ${dataAttr}>
      <div class="item-icon">&#128193;</div>
      <div class="item-info">
        <div class="item-name">${esc(name)}</div>
        <div class="item-meta">${countText}</div>
      </div>
      <div class="item-actions">
        <button class="mini-btn edit-item" title="Edit">&#9998;</button>
        <button class="mini-btn delete delete-item" title="Delete">&times;</button>
      </div>
    </div>
  `;
}

function responseCardHTML(r, contextLabel) {
  return `
    <div class="card-item response" data-response-id="${r.id}">
      <div class="item-icon response">&#10149;</div>
      <div class="item-info">
        <div class="item-name">${esc(r.title)}</div>
        <div class="item-preview">${contextLabel ? '<b>' + esc(contextLabel) + ':</b> ' : ''}${esc(r.content)}</div>
      </div>
      <div class="item-actions">
        <button class="mini-btn edit-response" title="Edit">&#9998;</button>
        <button class="mini-btn delete delete-response" title="Delete">&times;</button>
      </div>
      <span class="copy-badge">Copied</span>
    </div>
  `;
}

function bindClicks() {
  document.querySelectorAll('.card-item.folder').forEach(el => {
    el.addEventListener('click', e => {
      if (e.target.closest('.item-actions')) return;
      const fid = el.dataset.folderId;
      const sid = el.dataset.subfolderId;
      if (sid) navStack.push({ type: 'subfolder', folderId: fid, subId: sid });
      else navStack.push({ type: 'folder', id: fid });
      render();
    });

    el.querySelector('.edit-item')?.addEventListener('click', e => {
      e.stopPropagation();
      const sid = el.dataset.subfolderId;
      if (sid) {
        const folder = data.folders.find(f => f.id === el.dataset.folderId);
        const sf = folder?.subfolders?.find(s => s.id === sid);
        if (sf) editFolderModal(sf);
      } else {
        const folder = data.folders.find(f => f.id === el.dataset.folderId);
        if (folder) editFolderModal(folder);
      }
    });

    el.querySelector('.delete-item')?.addEventListener('click', async e => {
      e.stopPropagation();
      if (!confirm('Delete this folder and all its contents?')) return;
      const sid = el.dataset.subfolderId;
      if (sid) {
        const folder = data.folders.find(f => f.id === el.dataset.folderId);
        if (folder) {
          folder.subfolders = folder.subfolders.filter(s => s.id !== sid);
          removeFolder(sid);
        }
      } else {
        const fid = el.dataset.folderId;
        data.folders = data.folders.filter(f => f.id !== fid);
        removeFolder(fid);
      }
      render();
    });
  });

  document.querySelectorAll('.card-item.response').forEach(el => {
    el.addEventListener('click', e => {
      if (e.target.closest('.item-actions')) return;
      const r = findResponse(el.dataset.responseId);
      if (r) {
        navigator.clipboard.writeText(r.content);
        el.classList.add('copied');
        setTimeout(() => el.classList.remove('copied'), 1200);
      }
    });

    el.querySelector('.edit-response')?.addEventListener('click', e => {
      e.stopPropagation();
      const r = findResponse(el.dataset.responseId);
      if (r) editResponseModal(r);
    });

    el.querySelector('.delete-response')?.addEventListener('click', e => {
      e.stopPropagation();
      const rid = el.dataset.responseId;
      deleteResponseLocal(rid);
      removeResponse(rid);
      render();
    });
  });
}

function findResponse(id) {
  for (const f of data.folders) {
    const r = f.responses?.find(r => r.id === id);
    if (r) return r;
    for (const sf of (f.subfolders || [])) {
      const r = sf.responses?.find(r => r.id === id);
      if (r) return r;
    }
  }
  return null;
}

function findResponseLocation(id) {
  for (const f of data.folders) {
    if (f.responses?.some(r => r.id === id)) return { folderId: f.id, subId: null, dbFolderId: f.id };
    for (const sf of (f.subfolders || [])) {
      if (sf.responses?.some(r => r.id === id)) return { folderId: f.id, subId: sf.id, dbFolderId: sf.id };
    }
  }
  return null;
}

function deleteResponseLocal(id) {
  for (const f of data.folders) {
    const idx = f.responses?.findIndex(r => r.id === id);
    if (idx >= 0) { f.responses.splice(idx, 1); return; }
    for (const sf of (f.subfolders || [])) {
      const idx2 = sf.responses?.findIndex(r => r.id === id);
      if (idx2 >= 0) { sf.responses.splice(idx2, 1); return; }
    }
  }
}

function popResponseLocal(id) {
  for (const f of data.folders) {
    const idx = f.responses?.findIndex(r => r.id === id);
    if (idx >= 0) return f.responses.splice(idx, 1)[0];
    for (const sf of (f.subfolders || [])) {
      const idx2 = sf.responses?.findIndex(r => r.id === id);
      if (idx2 >= 0) return sf.responses.splice(idx2, 1)[0];
    }
  }
  return null;
}

function pushResponseTo(response, folderId, subId) {
  const folder = data.folders.find(f => f.id === folderId);
  if (!folder) return null;
  if (subId) {
    const sf = folder.subfolders?.find(s => s.id === subId);
    if (!sf) return null;
    if (!sf.responses) sf.responses = [];
    sf.responses.push(response);
    return sf.id;
  } else {
    if (!folder.responses) folder.responses = [];
    folder.responses.push(response);
    return folder.id;
  }
}

// ---- Modals ----
function showModal(title, bodyHtml, onSave) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = bodyHtml;
  document.getElementById('modalOverlay').classList.add('active');
  document.getElementById('modalSave').onclick = () => {
    if (onSave() !== false) closeModal();
  };
  setTimeout(() => {
    const inp = document.querySelector('.modal input, .modal textarea');
    if (inp) inp.focus();
  }, 50);
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('active');
}

function buildLocationOptions(selFolderId, selSubId) {
  let opts = '';
  data.folders.forEach(f => {
    const sel = (f.id === selFolderId && !selSubId) ? 'selected' : '';
    opts += `<option value="${f.id}::" ${sel}>${esc(f.name)}</option>`;
    (f.subfolders || []).forEach(sf => {
      const sel2 = (f.id === selFolderId && sf.id === selSubId) ? 'selected' : '';
      opts += `<option value="${f.id}::${sf.id}" ${sel2}>   ↳ ${esc(f.name)} / ${esc(sf.name)}</option>`;
    });
  });
  return opts;
}

function editFolderModal(folder) {
  showModal('Edit Folder', `
    <label>Name</label>
    <input type="text" id="inputName" value="${esc(folder.name)}">
  `, () => {
    const newName = document.getElementById('inputName').value.trim();
    if (!newName) return false;
    folder.name = newName;
    updateFolder(folder.id, newName);
    render();
  });
}

function editResponseModal(response) {
  const loc = findResponseLocation(response.id);
  const opts = buildLocationOptions(loc?.folderId, loc?.subId);
  showModal('Edit Response', `
    <label>Title</label>
    <input type="text" id="inputTitle" value="${esc(response.title)}">
    <label>Content</label>
    <textarea id="inputContent">${esc(response.content)}</textarea>
    <label>Location (move to)</label>
    <select id="inputLocation">${opts}</select>
  `, () => {
    const newTitle = document.getElementById('inputTitle').value.trim();
    const newContent = document.getElementById('inputContent').value.trim();
    if (!newTitle || !newContent) return false;
    const locVal = document.getElementById('inputLocation').value;
    const [newFolderId, newSubIdRaw] = locVal.split('::');
    const newSubId = newSubIdRaw || null;

    response.title = newTitle;
    response.content = newContent;

    const moved = !loc || loc.folderId !== newFolderId || (loc.subId || null) !== newSubId;
    if (moved) {
      const popped = popResponseLocal(response.id);
      if (popped) {
        const newDbFolderId = pushResponseTo(popped, newFolderId, newSubId);
        updateResponse(response.id, newTitle, newContent, newDbFolderId);
      }
    } else {
      updateResponse(response.id, newTitle, newContent);
    }
    render();
  });
}

// ---- Prayer Lock ----
const PRAYER_LOCK_SEARCH = 'prayerlock';

async function loadPrayerLock() {
  const el = document.getElementById('prayerContent');
  if (prayerState.loaded && prayerState.reviews.length > 0) {
    renderPrayerLock();
    return;
  }
  el.innerHTML = '<div class="review-loading">Loading Prayer Lock reviews...</div>';
  try {
    if (!prayerState.appId) {
      const searchRes = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(PRAYER_LOCK_SEARCH)}&entity=software&limit=5`);
      const searchJson = await searchRes.json();
      const app = (searchJson.results || []).find(r => /prayer\s*lock/i.test(r.trackName));
      if (!app) throw new Error('Prayer Lock app not found in App Store');
      prayerState.appId = app.trackId;
    }

    const reviews = [];
    for (let page = 1; page <= 10; page++) {
      try {
        const res = await fetch(`https://itunes.apple.com/us/rss/customerreviews/page=${page}/id=${prayerState.appId}/sortBy=mostHelpful/json`);
        const json = await res.json();
        const entries = json?.feed?.entry || [];
        const reviewEntries = Array.isArray(entries) ? entries.filter(e => e['im:rating']) : [];
        if (reviewEntries.length === 0) break;
        reviewEntries.forEach(e => {
          reviews.push({
            rating: parseInt(e['im:rating'].label),
            title: e.title?.label || '',
            content: e.content?.label || '',
            author: e.author?.name?.label || 'Anonymous',
            date: e.updated?.label || '',
          });
        });
      } catch (err) { break; }
    }

    prayerState.reviews = reviews
      .filter(r => r.rating === 5)
      .sort((a, b) => b.content.length - a.content.length);
    prayerState.loaded = true;

    if (!prayerState.reviews.length) {
      el.innerHTML = '<div class="review-loading">No 5-star reviews found yet.</div>';
      return;
    }
    renderPrayerLock();
  } catch (err) {
    el.innerHTML = `<div class="review-loading">Failed to load reviews.<br><br>${esc(err.message)}<br><br><button class="review-btn" id="retryReviews">Retry</button></div>`;
    document.getElementById('retryReviews')?.addEventListener('click', () => {
      prayerState.loaded = false;
      loadPrayerLock();
    });
  }
}

function getDailyReviewIndex() {
  const reviews = prayerState.reviews;
  if (!reviews.length) return 0;
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((now - start) / (1000 * 60 * 60 * 24));
  const poolSize = Math.min(20, reviews.length);
  return dayOfYear % poolSize;
}

function renderPrayerLock(customIdx) {
  const el = document.getElementById('prayerContent');
  const reviews = prayerState.reviews;
  if (!reviews.length) return;
  const pool = Math.min(20, reviews.length);
  const idx = customIdx ?? (prayerState.currentIdx ?? getDailyReviewIndex());
  prayerState.currentIdx = idx;
  const r = reviews[idx];
  const stars = '★'.repeat(r.rating) + '☆'.repeat(5 - r.rating);
  const dateStr = r.date
    ? new Date(r.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '';

  el.innerHTML = `
    <div class="review-stat">
      <span>Review of the Day</span>
      <span>${idx + 1} / ${pool}</span>
    </div>
    <div class="review-card">
      <div class="review-header">
        <span class="review-stars">${stars}</span>
        <span class="review-date">${esc(dateStr)}</span>
      </div>
      <div class="review-title">${esc(r.title)}</div>
      <div class="review-content">${esc(r.content)}</div>
      <div class="review-author">— ${esc(r.author)}</div>
      <div class="review-actions">
        <button class="review-btn" id="prevReview">← Prev</button>
        <button class="review-btn primary" id="copyReview">Copy</button>
        <button class="review-btn" id="nextReview">Next →</button>
      </div>
    </div>
    <div class="review-stat">
      <span>${r.content.length} chars · ${r.content.trim().split(/\s+/).length} words</span>
      <span>${reviews.length} total 5★</span>
    </div>
  `;

  document.getElementById('prevReview').addEventListener('click', () => {
    renderPrayerLock((idx - 1 + pool) % pool);
  });
  document.getElementById('nextReview').addEventListener('click', () => {
    renderPrayerLock((idx + 1) % pool);
  });
  document.getElementById('copyReview').addEventListener('click', (e) => {
    const text = `"${r.title}"\n\n${r.content}\n\n— ${r.author} (${r.rating}★)`;
    navigator.clipboard.writeText(text);
    e.target.textContent = 'Copied!';
    setTimeout(() => e.target.textContent = 'Copy', 1200);
  });
}

// ---- Add button ----
document.getElementById('addBtn').addEventListener('click', () => {
  const view = currentView();
  if (view.type === 'root') {
    showModal('New Folder', `
      <label>Folder Name</label>
      <input type="text" id="inputName" placeholder="e.g. My Company">
    `, () => {
      const name = document.getElementById('inputName').value.trim();
      if (!name) return false;
      const id = generateId();
      data.folders.push({ id, name, subfolders: [], responses: [] });
      createFolder(id, name, null);
      render();
    });
  } else if (view.type === 'folder') {
    showModal('Add New', `
      <div style="display:flex;gap:8px;margin-bottom:12px;">
        <button class="btn btn-primary" id="pickSubfolder" style="flex:1">Subfolder</button>
        <button class="btn btn-primary" id="pickResponse" style="flex:1">Response</button>
      </div>
      <div id="addFields"></div>
    `, () => {
      const fields = document.getElementById('addFields');
      if (!fields.dataset.type) return false;
      const folder = data.folders.find(f => f.id === view.id);
      if (!folder) return false;

      if (fields.dataset.type === 'subfolder') {
        const name = document.getElementById('inputName')?.value.trim();
        if (!name) return false;
        const id = generateId();
        if (!folder.subfolders) folder.subfolders = [];
        folder.subfolders.push({ id, name, responses: [] });
        createFolder(id, name, folder.id);
      } else if (fields.dataset.type === 'response') {
        const title = document.getElementById('inputTitle')?.value.trim();
        const content = document.getElementById('inputContent')?.value.trim();
        if (!title || !content) return false;
        const id = generateId();
        if (!folder.responses) folder.responses = [];
        folder.responses.push({ id, title, content });
        createResponse(id, folder.id, title, content);
      }
      render();
    });

    setTimeout(() => {
      document.getElementById('pickSubfolder')?.addEventListener('click', () => {
        const f = document.getElementById('addFields');
        f.dataset.type = 'subfolder';
        f.innerHTML = `<label>Subfolder Name</label><input type="text" id="inputName" placeholder="e.g. Sales">`;
        f.querySelector('input').focus();
      });
      document.getElementById('pickResponse')?.addEventListener('click', () => {
        const f = document.getElementById('addFields');
        f.dataset.type = 'response';
        f.innerHTML = `<label>Title</label><input type="text" id="inputTitle" placeholder="e.g. Welcome message"><label>Content</label><textarea id="inputContent" placeholder="Type your quick response..."></textarea>`;
        f.querySelector('input').focus();
      });
    }, 50);
  } else if (view.type === 'subfolder') {
    showModal('New Response', `
      <label>Title</label>
      <input type="text" id="inputTitle" placeholder="e.g. Welcome message">
      <label>Content</label>
      <textarea id="inputContent" placeholder="Type your quick response..."></textarea>
    `, () => {
      const title = document.getElementById('inputTitle').value.trim();
      const content = document.getElementById('inputContent').value.trim();
      if (!title || !content) return false;
      const folder = data.folders.find(f => f.id === view.folderId);
      const sf = folder?.subfolders?.find(s => s.id === view.subId);
      if (sf) {
        const id = generateId();
        if (!sf.responses) sf.responses = [];
        sf.responses.push({ id, title, content });
        createResponse(id, sf.id, title, content);
        render();
      }
    });
  }
});

// ---- Back button ----
document.getElementById('backBtn').addEventListener('click', () => {
  if (navStack.length > 1) { navStack.pop(); render(); }
});

// ---- Search ----
document.getElementById('searchInput').addEventListener('input', e => {
  searchQuery = e.target.value;
  if (searchQuery && currentView().type !== 'root') navStack = [{ type: 'root' }];
  render();
});

// ---- Escape ----
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (document.getElementById('modalOverlay').classList.contains('active')) closeModal();
    else if (navStack.length > 1 && activeTab === 'responses') { navStack.pop(); render(); }
  }
});

// ---- Modal cancel ----
document.getElementById('modalCancel').addEventListener('click', closeModal);
document.getElementById('modalOverlay').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeModal();
});

// ---- Init ----
bindTabs();
loadData().then(d => { data = d; render(); });
