const API_URL = 'https://api-production-cad4.up.railway.app';

let data = { folders: [] };
let navStack = [{ type: 'root' }];
let searchQuery = '';
let activeTab = 'responses';

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
    // Edit button — capture phase so it fires before card click
    el.querySelector('.edit-response')?.addEventListener('click', e => {
      e.stopPropagation();
      e.stopImmediatePropagation();
      e.preventDefault();
      el._actionClicked = true;
      const r = findResponse(el.dataset.responseId);
      if (r) editResponseModal(r);
    }, true);

    // Delete button — capture phase
    el.querySelector('.delete-response')?.addEventListener('click', e => {
      e.stopPropagation();
      e.stopImmediatePropagation();
      e.preventDefault();
      el._actionClicked = true;
      const rid = el.dataset.responseId;
      deleteResponseLocal(rid);
      removeResponse(rid);
      render();
    }, true);

    // Card click = copy (only if no action button was clicked)
    el.addEventListener('click', e => {
      if (el._actionClicked) { el._actionClicked = false; return; }
      if (e.target.closest('.item-actions') || e.target.closest('.mini-btn')) return;
      const r = findResponse(el.dataset.responseId);
      if (r) {
        navigator.clipboard.writeText(r.content);
        el.classList.add('copied');
        setTimeout(() => el.classList.remove('copied'), 1200);
      }
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
const BIBLE_API_URL = 'https://bible-api.com/?random=verse';

const VERSE_CATEGORIES = {
  random: { label: 'Random', refs: null }, // uses random endpoint
  motivational: { label: 'Motivational', refs: [
    'Philippians 4:13','Joshua 1:9','Isaiah 41:10','Jeremiah 29:11','Romans 8:28',
    'Psalm 46:1','Proverbs 3:5-6','2 Timothy 1:7','Isaiah 40:31','Deuteronomy 31:6',
    'Psalm 27:1','Romans 8:31','1 Corinthians 16:13','Ephesians 6:10','Philippians 4:6-7',
    'Psalm 118:6','Hebrews 13:6','Isaiah 43:2','Psalm 31:24','Nehemiah 8:10',
    'Colossians 3:23','Galatians 6:9','2 Corinthians 12:9-10','Romans 15:13','Psalm 37:4',
    'Matthew 19:26','Psalm 138:8','Isaiah 54:17','1 John 5:4','Psalm 121:1-2',
  ]},
  comfort: { label: 'Comfort & Peace', refs: [
    'Psalm 23:1-4','Matthew 11:28-30','John 14:27','Psalm 34:18','2 Corinthians 1:3-4',
    'Isaiah 41:13','Psalm 147:3','Romans 8:38-39','Psalm 55:22','1 Peter 5:7',
    'Psalm 46:10','Isaiah 66:13','Matthew 5:4','Revelation 21:4','Psalm 30:5',
    'Psalm 91:1-2','Nahum 1:7','Psalm 62:1-2','John 16:33','Lamentations 3:22-23',
    'Psalm 34:4','2 Thessalonians 3:16','Isaiah 26:3','Psalm 4:8','Romans 15:13',
  ]},
  faith: { label: 'Faith & Trust', refs: [
    'Hebrews 11:1','Hebrews 11:6','Romans 10:17','Mark 11:24','James 1:6',
    'Matthew 17:20','2 Corinthians 5:7','Proverbs 3:5-6','Psalm 37:5','Isaiah 40:31',
    'Jeremiah 17:7','Romans 8:24-25','Psalm 56:3-4','1 Peter 1:8-9','Habakkuk 2:4',
    'Galatians 2:20','Ephesians 2:8-9','Mark 9:23','John 20:29','Psalm 9:10',
    'Psalm 62:8','Proverbs 29:25','Isaiah 12:2','Psalm 28:7','Psalm 112:7',
  ]},
  love: { label: 'Love', refs: [
    '1 Corinthians 13:4-7','1 John 4:7-8','John 3:16','Romans 5:8','1 John 4:19',
    'Ephesians 3:17-19','1 Peter 4:8','Colossians 3:14','Romans 13:10','John 15:12-13',
    '1 John 3:18','Song of Solomon 8:6-7','Mark 12:30-31','Galatians 5:22-23','Psalm 136:1',
    'Zephaniah 3:17','Psalm 86:15','Romans 8:35-37','1 John 4:16','Deuteronomy 7:9',
    'Jeremiah 31:3','John 13:34-35','Proverbs 10:12','1 Corinthians 16:14','Psalm 103:8',
  ]},
  wisdom: { label: 'Wisdom', refs: [
    'James 1:5','Proverbs 2:6','Proverbs 4:7','Colossians 3:16','Psalm 111:10',
    'Proverbs 9:10','Proverbs 16:16','Ecclesiastes 7:12','Proverbs 19:20','Proverbs 1:7',
    'James 3:17','Proverbs 3:13-14','Job 28:28','Proverbs 11:2','Proverbs 15:33',
    'Proverbs 24:14','1 Corinthians 1:25','Proverbs 13:20','Proverbs 18:15','Psalm 90:12',
  ]},
  praise: { label: 'Praise & Gratitude', refs: [
    'Psalm 100:1-2','Psalm 150:6','Psalm 95:1-2','1 Thessalonians 5:18','Psalm 34:1',
    'Psalm 107:1','Colossians 3:17','Hebrews 13:15','Psalm 9:1-2','Psalm 103:1-2',
    'Ephesians 5:19-20','Psalm 145:3','Psalm 63:3-4','Psalm 105:1-2','Philippians 4:4',
    'Psalm 96:1-3','Psalm 33:1-3','Psalm 66:1-2','1 Chronicles 16:34','Psalm 92:1-2',
  ]},
  hope: { label: 'Hope', refs: [
    'Romans 15:13','Jeremiah 29:11','Psalm 39:7','Hebrews 6:19','Romans 5:3-5',
    'Lamentations 3:24-25','Psalm 42:11','1 Peter 1:3','Isaiah 40:31','Psalm 130:5',
    'Romans 8:24-25','Titus 3:7','Psalm 71:5','Hebrews 11:1','Micah 7:7',
    'Psalm 33:18','Colossians 1:27','Psalm 62:5','Zechariah 9:12','Job 11:18',
  ]},
};

let selectedCategory = 'random';
const PRAYER_LOGO = 'assets/prayerlock-logo.jpg';
const BACKGROUNDS = [
  'assets/backgrounds/bg-10.jpg',
  'assets/backgrounds/bg-13.jpg',
  'assets/backgrounds/bg-15.jpg',
  'assets/backgrounds/bg-27.jpg',
  'assets/backgrounds/bg-29.jpg',
  'assets/backgrounds/bg-1015.jpg',
  'assets/backgrounds/bg-1018.jpg',
  'assets/backgrounds/bg-1019.jpg',
  'assets/backgrounds/bg-1022.jpg',
  'assets/backgrounds/bg-1036.jpg',
  'assets/backgrounds/bg-1037.jpg',
  'assets/backgrounds/bg-1039.jpg',
  'assets/backgrounds/bg-1043.jpg',
];

// Caption variations for DMs to Christian creators
const VERSE_CAPTIONS = [
  "Good morning! Dropping in with a little encouragement — a verse to carry with you today. 🙏",
  "Hey friend, hope your morning is blessed. Here's a word from scripture I thought you'd love:",
  "Morning! Sending this your way today — felt like the right one to share with you.",
  "Good morning! A quick reminder that God's working behind the scenes. Here's a verse for today:",
  "Hope your day is off to a beautiful start. Here's today's verse — take it with you.",
  "Morning! This one hit different today — wanted to pass it along to you.",
  "Good morning! Praying for you today. Here's a word to anchor your morning:",
  "Hey, hope you're doing well. Here's a verse to start the day off right:",
  "Good morning friend! Starting the day in the Word — sharing this one with you.",
  "Morning! A little light for your day. Let this one sit with you for a minute:",
  "Hope you're being lifted up today. Here's a verse that's been on my heart:",
  "Good morning! Thought of you this morning while reading this — had to share it:",
  "Hey! Here's your daily dose of encouragement from scripture:",
  "Morning friend. A verse to remind you whose you are today:",
  "Good morning! May this word meet you right where you are today:",
  "Hey — wanted to kick your day off with a little truth from the Word:",
  "Morning! Hope this verse lands on your heart the way it landed on mine:",
  "Good morning! Another day, another reason to trust Him. Here's today's:",
  "Hey, sending you a verse to carry with you today. God's got you.",
  "Morning! Here's a word to lean on today — praying it blesses you.",
];

const REVIEW_CAPTIONS = [
  "Hey! Another 5-star review just came in for Prayer Lock. 🙌 Thank you for everything you do to help people draw closer to God — you're a huge part of why these keep rolling in.",
  "Look at this — another 5★ review for Prayer Lock. Wanted to share it with you because you're literally the reason stories like this are happening. 🙏",
  "Yo, check this out. Another 5-star review for Prayer Lock. Thank you for being part of this mission — you're changing lives one post at a time.",
  "Hey friend! Another beautiful 5-star review came in today. Every review like this is a reminder of the real impact — thank you for what you do.",
  "Good morning! Sharing another 5-star review for Prayer Lock with you. People are finding real peace through the app and it wouldn't be possible without creators like you.",
  "Another day, another 5★ review. 🙌 Wanted you to see it because your work is part of this story. Thank you for closing the distance between people and God.",
  "Hey! This one gave us chills — another 5-star review for Prayer Lock. Your voice is reaching hearts. Thank you for everything.",
  "Check this out — another glowing 5★ review for Prayer Lock. We see you out there pouring into this mission. Thank you.",
  "Morning! Just got another 5-star review and had to share. You're a huge reason these keep happening. Keep going — the fruit is real.",
  "Hey, another 5★ review for Prayer Lock came in. Sharing it so you can see the impact firsthand. Thank you for doing what you do.",
  "Another 5-star review for Prayer Lock. 🙏 You're part of the reason people are finding faith through the app — thank you for all of it.",
  "Yo! Look at this review — 5 stars for Prayer Lock. You're the reason Jesus is reaching more people through this app. Grateful for you.",
  "Another review like this hit the App Store today. 5★ for Prayer Lock — sending it your way because you made this happen.",
  "Good morning! Another 5-star review for Prayer Lock. Wanted to celebrate it with you — you're moving the needle in a big way.",
  "Hey — another 5-star review just came in and I had to share. Thank you for helping people find God every single day. 🙏",
];

function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

let prayerView = 'home'; // 'home' | 'reviews' | 'verses'
let reviewsCache = { reviews: [], loaded: false };

// ---- Storage helpers (chrome.storage.local with localStorage fallback) ----
function storageGet(keys) {
  return new Promise(resolve => {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.get(keys, resolve);
    } else {
      const out = {};
      (Array.isArray(keys) ? keys : [keys]).forEach(k => {
        try { out[k] = JSON.parse(localStorage.getItem(k) || 'null'); } catch { out[k] = null; }
      });
      resolve(out);
    }
  });
}

function storageSet(obj) {
  return new Promise(resolve => {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.set(obj, resolve);
    } else {
      Object.entries(obj).forEach(([k, v]) => localStorage.setItem(k, JSON.stringify(v)));
      resolve();
    }
  });
}

async function getUsedSet(key) {
  const r = await storageGet([key]);
  return new Set(r[key] || []);
}

async function markUsed(key, id) {
  const used = await getUsedSet(key);
  used.add(id);
  await storageSet({ [key]: Array.from(used) });
}

// Used verses store full objects: [{reference, text, translation, bgImage, usedAt}]
async function getUsedVerseList() {
  const r = await storageGet(['usedVerses']);
  const list = r.usedVerses || [];
  return list.map(v => typeof v === 'string' ? { reference: v, text: '' } : v);
}

async function getUsedVerseRefs() {
  const list = await getUsedVerseList();
  return new Set(list.map(v => v.reference));
}

async function markVerseUsed(verse) {
  const list = await getUsedVerseList();
  if (!list.some(v => v.reference === verse.reference)) {
    list.push({
      reference: verse.reference,
      text: verse.text,
      translation: verse.translation || '',
      bgImage: verse.bgImage || '',
      usedAt: new Date().toISOString(),
    });
  }
  await storageSet({ usedVerses: list });
}

async function removeUsedVerse(reference) {
  const list = await getUsedVerseList();
  const filtered = list.filter(v => v.reference !== reference);
  await storageSet({ usedVerses: filtered });
}

// ---- Main dispatcher ----
async function loadPrayerLock() {
  if (prayerView === 'home') return renderPrayerHome();
  if (prayerView === 'reviews') return renderReviewsPanel();
  if (prayerView === 'verses') return renderVersesPanel();
}

function renderPrayerHome() {
  const el = document.getElementById('prayerContent');
  el.innerHTML = `
    <div class="card-item folder" id="navVerses">
      <div class="item-icon">&#128218;</div>
      <div class="item-info">
        <div class="item-name">Bible Verses</div>
        <div class="item-meta">Daily scripture cards</div>
      </div>
    </div>
    <div class="card-item folder" id="navReviews">
      <div class="item-icon">&#11088;</div>
      <div class="item-info">
        <div class="item-name">Reviews</div>
        <div class="item-meta">5★ Prayer Lock reviews</div>
      </div>
    </div>
    <div style="margin-top:14px;">
      <button class="btn" id="resetUsedBtn" style="width:100%">Reset Used Items</button>
    </div>
  `;
  document.getElementById('navVerses').addEventListener('click', () => { prayerView = 'verses'; loadPrayerLock(); });
  document.getElementById('navReviews').addEventListener('click', () => { prayerView = 'reviews'; loadPrayerLock(); });
  document.getElementById('resetUsedBtn').addEventListener('click', async () => {
    if (!confirm('Reset used reviews AND verses?')) return;
    await storageSet({ usedReviews: [], usedVerses: [], currentReview: null, currentVerse: null });
    alert('Reset complete.');
  });
}

// ---- Reviews panel ----
async function renderReviewsPanel() {
  const el = document.getElementById('prayerContent');
  el.innerHTML = `
    <div class="prayer-toolbar">
      <button class="btn" id="prayerBack">← Back</button>
      <button class="btn btn-primary" id="reviewGenerate" style="flex:1">Generate</button>
    </div>
    <div id="reviewCardWrap"></div>
    <div id="reviewStats"></div>
  `;
  document.getElementById('prayerBack').onclick = () => { prayerView = 'home'; loadPrayerLock(); };
  document.getElementById('reviewGenerate').onclick = generateReview;

  if (!reviewsCache.loaded) {
    document.getElementById('reviewCardWrap').innerHTML = '<div class="review-loading">Loading Prayer Lock reviews from iTunes...</div>';
    try {
      reviewsCache.reviews = await fetchPrayerLockReviews();
      reviewsCache.loaded = true;
    } catch (err) {
      document.getElementById('reviewCardWrap').innerHTML =
        `<div class="review-loading">Failed: ${esc(err.message)}<br><br>If you just updated the extension, reload it at chrome://extensions/ first.</div>`;
      return;
    }
  }

  if (!reviewsCache.reviews.length) {
    document.getElementById('reviewCardWrap').innerHTML = '<div class="review-loading">No 5★ reviews found.</div>';
    return;
  }

  const stored = await storageGet(['currentReview']);
  if (stored.currentReview) {
    renderReviewCard(stored.currentReview);
  } else {
    generateReview();
  }
}

async function fetchPrayerLockReviews() {
  const searchRes = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent('prayer lock')}&entity=software&limit=15`);
  const searchJson = await searchRes.json();
  const app = (searchJson.results || []).find(r => /prayer\s*lock/i.test(r.trackName || ''));
  if (!app) throw new Error('Prayer Lock not found in App Store');

  const reviews = [];
  for (let page = 1; page <= 10; page++) {
    try {
      const res = await fetch(`https://itunes.apple.com/us/rss/customerreviews/page=${page}/id=${app.trackId}/sortBy=mostHelpful/json`);
      const json = await res.json();
      const entries = json?.feed?.entry || [];
      const reviewEntries = Array.isArray(entries) ? entries.filter(e => e['im:rating']) : [];
      if (!reviewEntries.length) break;
      reviewEntries.forEach(e => {
        const id = e.id?.label || `${e.author?.name?.label}-${e.title?.label}`;
        reviews.push({
          id,
          rating: parseInt(e['im:rating'].label),
          title: e.title?.label || '',
          content: e.content?.label || '',
          author: e.author?.name?.label || 'Anonymous',
          date: e.updated?.label || '',
        });
      });
    } catch (err) { break; }
  }
  return reviews
    .filter(r => r.rating === 5)
    .sort((a, b) => b.content.length - a.content.length);
}

async function generateReview() {
  const used = await getUsedSet('usedReviews');
  let pool = reviewsCache.reviews.filter(r => !used.has(r.id));
  if (!pool.length) {
    if (confirm('All reviews used. Reset and start over?')) {
      await storageSet({ usedReviews: [] });
      pool = reviewsCache.reviews;
    } else return;
  }
  // Weight toward top-20 most verbose (pool already sorted)
  const topN = Math.min(20, pool.length);
  const pick = pool[Math.floor(Math.random() * topN)];
  await storageSet({ currentReview: pick });
  renderReviewCard(pick);
}

async function renderReviewCard(r) {
  const wrap = document.getElementById('reviewCardWrap');
  const stats = document.getElementById('reviewStats');
  if (!wrap) return;
  const stars = '★'.repeat(r.rating);
  const initial = (r.author || '?').trim()[0]?.toUpperCase() || '?';
  const dateStr = r.date
    ? new Date(r.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '';
  wrap.innerHTML = `
    <div class="app-card review-app-card">
      <div class="app-card-header">
        <img src="${PRAYER_LOGO}" class="app-logo" alt="Prayer Lock">
        <div class="app-header-text">
          <div class="app-name">Prayer Lock</div>
          <div class="app-tagline">App Store Review</div>
        </div>
      </div>
      <div class="review-stars-big">${stars}</div>
      <div class="review-title-big">${esc(r.title)}</div>
      <div class="review-content-big">${esc(r.content)}</div>
      <div class="review-author-row">
        <div class="author-avatar">${esc(initial)}</div>
        <div>
          <div class="author-name">${esc(r.author)}</div>
          <div class="author-sub">${esc(dateStr)}</div>
        </div>
      </div>
      <div class="action-row">
        <button class="action-pill primary" id="reviewCopyText">Copy Text</button>
        <button class="action-pill primary" id="reviewCopyImg">Copy Image</button>
        <button class="action-pill" id="reviewDownload">Download</button>
      </div>
    </div>
  `;

  const used = await getUsedSet('usedReviews');
  if (stats) {
    stats.innerHTML = `
      <div class="prayer-stat">
        <span>${r.content.length} chars · ${r.content.trim().split(/\s+/).length} words</span>
        <span>${used.size} / ${reviewsCache.reviews.length} used</span>
      </div>
    `;
  }

  const onReviewUse = async () => {
    await markUsed('usedReviews', r.id);
    await storageSet({ currentReview: null });
    generateReview();
  };

  document.getElementById('reviewCopyText').onclick = async () => {
    const caption = pickRandom(REVIEW_CAPTIONS);
    const text = `${caption}\n\n"${r.title}"\n\n${r.content}\n\n— ${r.author} (${r.rating}★)`;
    try { await navigator.clipboard.writeText(text); } catch {}
    flashBtn('reviewCopyText', 'Copied!');
    onReviewUse();
  };

  document.getElementById('reviewCopyImg').onclick = async () => {
    const btn = document.getElementById('reviewCopyImg');
    btn.textContent = 'Rendering...';
    try {
      const blob = await renderReviewBlob(r);
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      btn.textContent = 'Copied!';
      setTimeout(() => onReviewUse(), 400);
    } catch (err) {
      btn.textContent = 'Failed';
      console.error(err);
      setTimeout(() => btn.textContent = 'Copy Image', 1500);
    }
  };

  document.getElementById('reviewDownload').onclick = async () => {
    const btn = document.getElementById('reviewDownload');
    btn.textContent = 'Rendering...';
    try {
      const blob = await renderReviewBlob(r);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `review-${(r.title || 'prayerlock').replace(/[^\w]/g, '-').substring(0, 40)}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      btn.textContent = 'Downloaded!';
      setTimeout(() => onReviewUse(), 400);
    } catch (err) {
      btn.textContent = 'Failed';
      console.error(err);
      setTimeout(() => btn.textContent = 'Download', 1500);
    }
  };
}

// ---- Verses panel ----
async function renderVersesPanel() {
  const el = document.getElementById('prayerContent');
  const catOptions = Object.entries(VERSE_CATEGORIES)
    .map(([key, cat]) => `<option value="${key}"${key === selectedCategory ? ' selected' : ''}>${esc(cat.label)}</option>`)
    .join('');
  el.innerHTML = `
    <div class="prayer-toolbar">
      <button class="btn" id="prayerBack">←</button>
      <select id="verseCategorySelect" class="category-select">${catOptions}</select>
      <button class="btn btn-primary" id="verseGenerate">Generate</button>
    </div>
    <div id="verseCardWrap"></div>
    <div id="verseStats"></div>
  `;
  document.getElementById('prayerBack').onclick = () => { prayerView = 'home'; loadPrayerLock(); };
  document.getElementById('verseGenerate').onclick = generateVerse;
  document.getElementById('verseCategorySelect').onchange = (e) => {
    selectedCategory = e.target.value;
  };

  const stored = await storageGet(['currentVerse']);
  if (stored.currentVerse) {
    renderVerseCard(stored.currentVerse);
  } else {
    generateVerse();
  }
}

async function generateVerse() {
  const wrap = document.getElementById('verseCardWrap');
  if (wrap) wrap.innerHTML = '<div class="review-loading">Loading verse...</div>';
  const usedRefs = await getUsedVerseRefs();
  const cat = VERSE_CATEGORIES[selectedCategory] || VERSE_CATEGORIES.random;

  let verse = null;

  if (cat.refs) {
    // Category mode — pick a random unused reference from the curated list
    const available = cat.refs.filter(ref => !usedRefs.has(ref));
    if (!available.length) {
      if (wrap) wrap.innerHTML = `<div class="review-loading">All ${esc(cat.label)} verses used!<br><br>Reset used verses or pick another category.</div>`;
      return;
    }
    const ref = available[Math.floor(Math.random() * available.length)];
    try {
      const res = await fetch(`https://bible-api.com/${encodeURIComponent(ref)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      verse = {
        reference: json.reference || ref,
        text: (json.text || '').trim(),
        translation: json.translation_name || '',
        category: selectedCategory,
      };
    } catch (err) {
      if (wrap) wrap.innerHTML = `<div class="review-loading">Failed to fetch verse: ${esc(err.message)}</div>`;
      return;
    }
  } else {
    // Random mode — use the random endpoint
    for (let attempt = 0; attempt < 12; attempt++) {
      try {
        const res = await fetch(BIBLE_API_URL);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const reference = json.reference || '';
        const text = (json.text || '').trim();
        if (!text || !reference) continue;
        if (usedRefs.has(reference)) continue;
        verse = { reference, text, translation: json.translation_name || '', category: 'random' };
        break;
      } catch (err) {
        if (wrap) wrap.innerHTML = `<div class="review-loading">Failed to fetch verse: ${esc(err.message)}</div>`;
        return;
      }
    }

    if (!verse) {
      try {
        const res = await fetch(BIBLE_API_URL);
        const json = await res.json();
        verse = {
          reference: json.reference || '',
          text: (json.text || '').trim(),
          translation: json.translation_name || '',
          category: 'random',
        };
      } catch (err) {
        if (wrap) wrap.innerHTML = `<div class="review-loading">Failed: ${esc(err.message)}</div>`;
        return;
      }
    }
  }

  verse.bgImage = BACKGROUNDS[Math.floor(Math.random() * BACKGROUNDS.length)];
  await storageSet({ currentVerse: verse });
  renderVerseCard(verse);
}

async function renderVerseCard(v) {
  const wrap = document.getElementById('verseCardWrap');
  const stats = document.getElementById('verseStats');
  if (!wrap) return;
  wrap.innerHTML = `
    <div class="app-card verse-app-card" id="verseCardEl" style="background-image: url('${v.bgImage}');">
      <div class="verse-top">
        <img src="${PRAYER_LOGO}" class="app-logo" alt="Prayer Lock">
        <div class="verse-top-name">Prayer Lock</div>
      </div>
      <div class="verse-overlay">
        <div class="verse-text">"${esc(v.text)}"</div>
        <div class="verse-reference">— ${esc(v.reference)}${v.translation ? ' · ' + esc(v.translation) : ''}</div>
      </div>
    </div>
    <div class="action-row">
      <button class="action-pill primary" id="verseCopyText">Copy Text</button>
      <button class="action-pill primary" id="verseCopyImg">Copy Image</button>
      <button class="action-pill" id="verseDownload">Download</button>
    </div>
  `;

  const usedList = await getUsedVerseList();
  if (stats) {
    stats.innerHTML = `
      <div class="prayer-stat" style="margin-top:10px;">
        <span>${v.text.trim().split(/\s+/).length} words</span>
        <span>${usedList.length} verses used</span>
      </div>
      <div class="used-dropdown">
        <button class="btn" id="toggleUsedVerses" style="width:100%;display:flex;justify-content:space-between;align-items:center;">
          <span>Used Verses (${usedList.length})</span>
          <span id="usedVersesArrow">▼</span>
        </button>
        <div id="usedVersesList" class="used-list" style="display:none;"></div>
      </div>
    `;

    const listEl = document.getElementById('usedVersesList');
    const arrowEl = document.getElementById('usedVersesArrow');
    let expanded = false;
    document.getElementById('toggleUsedVerses').onclick = () => {
      expanded = !expanded;
      listEl.style.display = expanded ? 'block' : 'none';
      arrowEl.textContent = expanded ? '▲' : '▼';
      if (expanded) renderUsedVersesList();
    };
  }

  const onUse = async () => {
    await markVerseUsed(v);
    await storageSet({ currentVerse: null });
    generateVerse();
  };

  document.getElementById('verseCopyText').onclick = async () => {
    const caption = pickRandom(VERSE_CAPTIONS);
    const text = `${caption}\n\n"${v.text}"\n— ${v.reference}`;
    try { await navigator.clipboard.writeText(text); } catch {}
    flashBtn('verseCopyText', 'Copied!');
    onUse();
  };

  document.getElementById('verseCopyImg').onclick = async () => {
    const btn = document.getElementById('verseCopyImg');
    btn.textContent = 'Rendering...';
    try {
      const blob = await renderVerseBlob(v);
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      btn.textContent = 'Copied!';
      setTimeout(() => onUse(), 400);
    } catch (err) {
      btn.textContent = 'Failed';
      console.error(err);
      setTimeout(() => btn.textContent = 'Copy Image', 1500);
    }
  };

  document.getElementById('verseDownload').onclick = async () => {
    const btn = document.getElementById('verseDownload');
    btn.textContent = 'Rendering...';
    try {
      const blob = await renderVerseBlob(v);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `verse-${v.reference.replace(/[^\w]/g, '-')}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      btn.textContent = 'Downloaded!';
      setTimeout(() => onUse(), 400);
    } catch (err) {
      btn.textContent = 'Failed';
      console.error(err);
      setTimeout(() => btn.textContent = 'Download', 1500);
    }
  };
}

function flashBtn(id, msg) {
  const btn = document.getElementById(id);
  if (!btn) return;
  const prev = btn.textContent;
  btn.textContent = msg;
  setTimeout(() => btn.textContent = prev, 1000);
}

async function renderUsedVersesList() {
  const listEl = document.getElementById('usedVersesList');
  if (!listEl) return;
  const list = await getUsedVerseList();
  if (!list.length) {
    listEl.innerHTML = '<div class="used-empty">No verses used yet.</div>';
    return;
  }
  // Most recent first
  const sorted = [...list].reverse();
  listEl.innerHTML = sorted.map(v => `
    <div class="used-item">
      <div class="used-item-info">
        <div class="used-item-ref">${esc(v.reference)}</div>
        <div class="used-item-text">${esc(v.text)}</div>
      </div>
      <button class="mini-btn used-remove" data-ref="${esc(v.reference)}" title="Remove from used">&times;</button>
    </div>
  `).join('');

  listEl.querySelectorAll('.used-remove').forEach(btn => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      await removeUsedVerse(btn.dataset.ref);
      renderUsedVersesList();
      // Also refresh the stats counter
      const stats = document.getElementById('verseStats');
      if (stats) {
        const current = (await storageGet(['currentVerse'])).currentVerse;
        if (current) renderVerseCard(current);
      }
    };
  });
}

// ---- Canvas image export ----
function loadImg(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function wrapText(ctx, text, maxWidth) {
  const paragraphs = text.split('\n');
  const lines = [];
  paragraphs.forEach(para => {
    const words = para.split(' ');
    let current = '';
    for (const word of words) {
      const test = current ? current + ' ' + word : word;
      if (ctx.measureText(test).width > maxWidth && current) {
        lines.push(current);
        current = word;
      } else {
        current = test;
      }
    }
    if (current) lines.push(current);
  });
  return lines;
}

async function renderReviewBlob(r) {
  const S = 1080;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d');

  // Cream page background
  ctx.fillStyle = '#F4F1EA';
  ctx.fillRect(0, 0, S, S);

  // Card geometry
  const margin = 50;
  const shadowOffset = 22;
  const cardX = margin;
  const cardY = margin;
  const cardW = S - 2 * margin - shadowOffset;
  const cardH = cardW;
  const radius = 40;

  // 1) Offset shadow
  roundedRectPath(ctx, cardX + shadowOffset, cardY + shadowOffset, cardW, cardH, radius);
  ctx.fillStyle = '#0A0A0A';
  ctx.fill();

  // 2) White card background
  ctx.save();
  roundedRectPath(ctx, cardX, cardY, cardW, cardH, radius);
  ctx.clip();
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(cardX, cardY, cardW, cardH);

  // 3) Orange accent strip at top
  const accentH = 8;
  ctx.fillStyle = '#F26522';
  ctx.fillRect(cardX, cardY, cardW, accentH);

  // 4) Logo + app name header
  const logoSize = 100;
  const lx = cardX + 56;
  const ly = cardY + 46;
  const logoRadius = 24;
  try {
    const logo = await loadImg(PRAYER_LOGO);
    ctx.save();
    roundedRectPath(ctx, lx, ly, logoSize, logoSize, logoRadius);
    ctx.clip();
    ctx.drawImage(logo, lx, ly, logoSize, logoSize);
    ctx.restore();
    // Black border on logo
    ctx.strokeStyle = '#0A0A0A';
    ctx.lineWidth = 4;
    roundedRectPath(ctx, lx, ly, logoSize, logoSize, logoRadius);
    ctx.stroke();
  } catch {}

  ctx.fillStyle = '#0A0A0A';
  ctx.textBaseline = 'alphabetic';
  ctx.font = '800 30px "Helvetica Neue", -apple-system, sans-serif';
  ctx.fillText('PRAYER LOCK', lx + logoSize + 24, ly + 44);

  ctx.font = '600 17px "Helvetica Neue", -apple-system, sans-serif';
  ctx.fillStyle = '#6B6B6B';
  ctx.fillText('5-STAR APP STORE REVIEW', lx + logoSize + 24, ly + 74);

  // Divider line under header
  const divY = ly + logoSize + 30;
  ctx.strokeStyle = '#0A0A0A';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cardX + 56, divY);
  ctx.lineTo(cardX + cardW - 56, divY);
  ctx.stroke();

  // 5) Stars
  const starsY = divY + 48;
  ctx.font = '400 38px sans-serif';
  ctx.fillStyle = '#F59E0B';
  ctx.fillText('★ ★ ★ ★ ★', cardX + 56, starsY);

  // 6) Review title
  ctx.font = '800 36px "Helvetica Neue", -apple-system, sans-serif';
  ctx.fillStyle = '#0A0A0A';
  const titleY = starsY + 48;
  const maxW = cardW - 112;
  const titleLines = wrapText(ctx, r.title || '', maxW);
  let curY = titleY;
  titleLines.forEach(line => {
    ctx.fillText(line, cardX + 56, curY);
    curY += 44;
  });

  // 7) Review content
  curY += 10;
  ctx.font = '400 28px "Playfair Display", "Didot", "Georgia", serif';
  ctx.fillStyle = '#333333';
  const contentLines = wrapText(ctx, r.content || '', maxW);
  // Limit to fit card
  const maxContentLines = Math.floor((cardY + cardH - curY - 140) / 38);
  const shownLines = contentLines.slice(0, maxContentLines);
  const truncated = contentLines.length > maxContentLines;
  shownLines.forEach(line => {
    ctx.fillText(line, cardX + 56, curY);
    curY += 38;
  });
  if (truncated) {
    ctx.fillText('...', cardX + 56, curY);
    curY += 38;
  }

  // 8) Author row at bottom
  const authorY = cardY + cardH - 80;

  // Divider above author
  ctx.strokeStyle = '#0A0A0A';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cardX + 56, authorY - 20);
  ctx.lineTo(cardX + cardW - 56, authorY - 20);
  ctx.stroke();

  // Author avatar circle
  const avatarSize = 48;
  const initial = (r.author || '?').trim()[0]?.toUpperCase() || '?';
  const avX = cardX + 56 + avatarSize / 2;
  const avY = authorY + avatarSize / 2 - 6;
  ctx.beginPath();
  ctx.arc(avX, avY, avatarSize / 2, 0, Math.PI * 2);
  ctx.fillStyle = '#FFE8D9';
  ctx.fill();
  ctx.strokeStyle = '#0A0A0A';
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.fillStyle = '#0A0A0A';
  ctx.font = '800 22px "Helvetica Neue", sans-serif';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillText(initial, avX, avY);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  // Author name
  ctx.font = '700 24px "Helvetica Neue", -apple-system, sans-serif';
  ctx.fillStyle = '#0A0A0A';
  ctx.fillText(r.author || 'Anonymous', cardX + 56 + avatarSize + 16, authorY + 14);

  // Date
  if (r.date) {
    const dateStr = new Date(r.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    ctx.font = '600 16px "Helvetica Neue", sans-serif';
    ctx.fillStyle = '#6B6B6B';
    ctx.fillText(dateStr.toUpperCase(), cardX + 56 + avatarSize + 16, authorY + 42);
  }

  ctx.restore();

  // 9) Black card border
  ctx.strokeStyle = '#0A0A0A';
  ctx.lineWidth = 8;
  roundedRectPath(ctx, cardX, cardY, cardW, cardH, radius);
  ctx.stroke();

  return await new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('toBlob returned null')), 'image/png');
  });
}

function roundedRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

async function renderVerseBlob(v) {
  const S = 1080; // square canvas
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d');

  // Cream page background
  ctx.fillStyle = '#F4F1EA';
  ctx.fillRect(0, 0, S, S);

  // Card geometry — neo-brutalism offset shadow
  const margin = 50;
  const shadowOffset = 22;
  const cardX = margin;
  const cardY = margin;
  const cardW = S - 2 * margin - shadowOffset;
  const cardH = cardW; // keep square
  const radius = 40;

  // 1) Offset black shadow
  roundedRectPath(ctx, cardX + shadowOffset, cardY + shadowOffset, cardW, cardH, radius);
  ctx.fillStyle = '#0A0A0A';
  ctx.fill();

  // 2) Card clip, draw image cover-fit inside
  ctx.save();
  roundedRectPath(ctx, cardX, cardY, cardW, cardH, radius);
  ctx.clip();

  try {
    const bg = await loadImg(v.bgImage);
    const imgW = bg.naturalWidth || bg.width;
    const imgH = bg.naturalHeight || bg.height;
    const cardAR = cardW / cardH;
    const imgAR = imgW / imgH;
    let sx = 0, sy = 0, sw = imgW, sh = imgH;
    if (imgAR > cardAR) {
      sw = imgH * cardAR;
      sx = (imgW - sw) / 2;
    } else {
      sh = imgW / cardAR;
      sy = (imgH - sh) / 2;
    }
    ctx.drawImage(bg, sx, sy, sw, sh, cardX, cardY, cardW, cardH);
  } catch {
    ctx.fillStyle = '#2E3192';
    ctx.fillRect(cardX, cardY, cardW, cardH);
  }

  // 3) Dark gradient overlay for text readability
  const grad = ctx.createLinearGradient(cardX, cardY, cardX, cardY + cardH);
  grad.addColorStop(0, 'rgba(10,10,10,0.20)');
  grad.addColorStop(0.35, 'rgba(10,10,10,0.30)');
  grad.addColorStop(0.65, 'rgba(10,10,10,0.70)');
  grad.addColorStop(1, 'rgba(10,10,10,0.95)');
  ctx.fillStyle = grad;
  ctx.fillRect(cardX, cardY, cardW, cardH);

  // 4) Logo + app name top-left
  const logoSize = 108;
  const lx = cardX + 44;
  const ly = cardY + 44;
  const logoRadius = 26;
  try {
    const logo = await loadImg(PRAYER_LOGO);
    ctx.save();
    roundedRectPath(ctx, lx, ly, logoSize, logoSize, logoRadius);
    ctx.clip();
    ctx.drawImage(logo, lx, ly, logoSize, logoSize);
    ctx.restore();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    roundedRectPath(ctx, lx, ly, logoSize, logoSize, logoRadius);
    ctx.stroke();
  } catch {}

  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'alphabetic';
  ctx.shadowColor = 'rgba(0,0,0,0.7)';
  ctx.shadowBlur = 12;
  ctx.font = '800 32px "Helvetica Neue", -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText('PRAYER LOCK', lx + logoSize + 22, ly + 48);

  ctx.font = '600 18px "Helvetica Neue", -apple-system, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.fillText('VERSE OF THE DAY', lx + logoSize + 22, ly + 80);
  ctx.shadowBlur = 0;

  // 5) Verse text — elegant serif italic, wrapped
  ctx.fillStyle = '#ffffff';
  ctx.font = 'italic 600 44px "Playfair Display", "Didot", "Georgia", "Times New Roman", serif';
  const maxTextWidth = cardW - 120;
  const quoted = `"${v.text}"`;
  const lines = wrapText(ctx, quoted, maxTextWidth);
  const lineHeight = 58;
  const bottomPad = 70;
  const refBlock = 70;
  const totalH = lines.length * lineHeight + refBlock;
  let y = cardY + cardH - bottomPad - totalH + lineHeight;

  ctx.shadowColor = 'rgba(0,0,0,0.85)';
  ctx.shadowBlur = 16;
  ctx.textAlign = 'left';
  lines.forEach(line => {
    ctx.fillText(line, cardX + 60, y);
    y += lineHeight;
  });

  // 6) Reference
  y += 18;
  ctx.font = '800 26px "Helvetica Neue", -apple-system, sans-serif';
  const refText = `— ${v.reference}${v.translation ? ' · ' + v.translation : ''}`;
  ctx.fillText(refText.toUpperCase(), cardX + 60, y);
  ctx.shadowBlur = 0;

  ctx.restore();

  // 7) Black card border last (above clipped content)
  ctx.strokeStyle = '#0A0A0A';
  ctx.lineWidth = 8;
  roundedRectPath(ctx, cardX, cardY, cardW, cardH, radius);
  ctx.stroke();

  return await new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('toBlob returned null')), 'image/png');
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
