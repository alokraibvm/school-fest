const GAS_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbxhdRXcjFF4s2ZhIlTMwaZ47PV_KNuA3jokw5HrZx5X93PGYMzuWiwNQqRJkXIzLUu2/exec';

let html5QrCode = null;
let currentCode = '';
let adminData = null;
let activeTab = 'registrations';
let sortState = { column: '', direction: 'asc' };
let currentTableRows = [];
let selectedRecord = null;

window.addEventListener('load', () => {
  if (document.getElementById('reader')) initScannerPage();
  if (document.getElementById('tableBody')) initAdminPage();
});

function initScannerPage() {
  const startBtn = document.getElementById('startBtn');
  const stopBtn = document.getElementById('stopBtn');
  const manualForm = document.getElementById('manualForm');
  const markBtn = document.getElementById('markBtn');
  const qrFile = document.getElementById('qrFile');

  startBtn.addEventListener('click', startCamera);
  stopBtn.addEventListener('click', stopCamera);
  qrFile.addEventListener('change', scanUploadedQr);
  manualForm.addEventListener('submit', event => {
    event.preventDefault();
    const code = document.getElementById('manualCode').value.trim();
    if (code) checkCode(code);
  });
  markBtn.addEventListener('click', () => {
    if (currentCode) markEntry(currentCode);
  });

  if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    setStatus(
      'Camera access unavailable',
      'error',
      'Open this page over HTTPS in a browser that supports camera access. Local files and insecure pages cannot use the camera.'
    );
    startBtn.disabled = true;
  }

  const initialToken = new URLSearchParams(location.search).get('token') || '';
  if (initialToken) {
    document.getElementById('manualCode').value = initialToken;
    checkCode(initialToken);
  }
}

function startCamera() {
  if (!window.Html5Qrcode) {
    setStatus('Camera library is still loading. Try again in a moment.', 'warn');
    return;
  }

  html5QrCode = html5QrCode || new Html5Qrcode('reader');
  document.getElementById('startBtn').disabled = true;
  document.getElementById('stopBtn').disabled = false;

  const startWithCamera = cameraId => {
    const cameraConfig = cameraId ? cameraId : { facingMode: 'environment' };
    return html5QrCode.start(
      cameraConfig,
      { fps: 10, qrbox: qrboxSize },
      decodedText => {
        stopCamera();
        const code = extractCode(decodedText);
        document.getElementById('manualCode').value = code;
        checkCode(code);
      },
      () => {}
    );
  };

  const tryStartCamera = () => {
    if (Html5Qrcode && Html5Qrcode.getCameras) {
      Html5Qrcode.getCameras()
        .then(cameras => {
          const cameraId = cameras && cameras.length ? cameras[0].id : null;
          return startWithCamera(cameraId);
        })
        .catch(() => startWithCamera(null))
        .catch(error => {
          document.getElementById('startBtn').disabled = false;
          document.getElementById('stopBtn').disabled = true;
          setStatus('Camera could not start', 'error', error.message || String(error));
        });
    } else {
      startWithCamera(null).catch(error => {
        document.getElementById('startBtn').disabled = false;
        document.getElementById('stopBtn').disabled = true;
        setStatus('Camera could not start', 'error', error.message || String(error));
      });
    }
  };

  tryStartCamera();
}

function stopCamera() {
  document.getElementById('startBtn').disabled = false;
  document.getElementById('stopBtn').disabled = true;
  if (html5QrCode && html5QrCode.isScanning) {
    return html5QrCode.stop();
  }
  return Promise.resolve();
}

function qrboxSize(viewfinderWidth, viewfinderHeight) {
  const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
  const size = Math.floor(minEdge * 0.78);
  return { width: size, height: size };
}

function extractCode(decodedText) {
  try {
    const url = new URL(decodedText);
    return url.searchParams.get('token') || decodedText;
  } catch (error) {
    return decodedText;
  }
}

function scanUploadedQr(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  if (!window.Html5Qrcode) {
    setStatus('QR reader is still loading. Try again in a moment.', 'warn');
    return;
  }

  setLoading('Reading QR photo...');
  html5QrCode = html5QrCode || new Html5Qrcode('reader');
  html5QrCode.scanFile(file, true)
    .then(decodedText => {
      const code = extractCode(decodedText);
      document.getElementById('manualCode').value = code;
      checkCode(code);
    })
    .catch(() => {
      setStatus('Could not read QR photo', 'error', 'Try a clearer close-up photo or enter the Pass ID manually.');
    })
    .finally(() => {
      event.target.value = '';
    });
}

function checkCode(code) {
  currentCode = code;
  setLoading('Checking pass...');
  apiCall('verify', { code })
    .then(renderVerification)
    .catch(error => setStatus('Verification failed', 'error', error.message || String(error)));
}

function markEntry(code) {
  document.getElementById('markBtn').disabled = true;
  setLoading('Marking entry...');
  apiCall('mark', { code })
    .then(renderVerification)
    .catch(error => setStatus('Entry failed', 'error', error.message || String(error)));
}

function renderVerification(result) {
  const record = result.record;
  const markBtn = document.getElementById('markBtn');
  if (!record) {
    markBtn.disabled = true;
    document.getElementById('details').classList.add('hidden');
    setStatus(result.message || 'Pass not found.', 'error');
    return;
  }

  renderDetails(record);
  if (result.status === 'ready') {
    setStatus('Valid pass', 'ready', result.message);
    markBtn.disabled = false;
  } else if (result.status === 'entered') {
    setStatus('Entry marked', 'ready', result.message);
    markBtn.disabled = true;
  } else if (result.status === 'already_entered' || result.status === 'duplicate_scan') {
    setStatus('Already entered', 'warn', result.message);
    markBtn.disabled = true;
  } else {
    setStatus('Cannot verify entry', 'error', result.message);
    markBtn.disabled = true;
  }
}

function renderDetails(record) {
  const details = document.getElementById('details');
  details.classList.remove('hidden');
  details.innerHTML = `
    <dl>
      <dt>Pass ID</dt><dd>${escapeHtml(record.passId)}</dd>
      <dt>Parent</dt><dd>${escapeHtml(record.parentName)}</dd>
      <dt>Student</dt><dd>${escapeHtml(record.studentName)}</dd>
      <dt>Class</dt><dd>${escapeHtml(record.className)}</dd>
      <dt>Relation</dt><dd>${escapeHtml(record.relation)}</dd>
      <dt>Status</dt><dd>${escapeHtml(record.entryStatus || 'Not Entered')}</dd>
    </dl>
  `;
}

function setLoading(message) {
  setStatus(message, 'idle');
}

function setStatus(title, type, message) {
  const statusCard = document.getElementById('statusCard');
  statusCard.className = `status-card ${type || 'idle'}`;
  statusCard.innerHTML = `
    <p class="eyebrow">Status</p>
    <h2>${escapeHtml(title)}</h2>
    <p>${escapeHtml(message || '')}</p>
  `;
}

function initAdminPage() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      activeTab = tab.dataset.tab;
      document.querySelectorAll('.tab').forEach(item => item.classList.remove('active'));
      tab.classList.add('active');
      sortState = { column: '', direction: 'asc' };
      renderAdminTable();
    });
  });
  document.querySelectorAll('.metric[data-tab]').forEach(card => {
    card.addEventListener('click', () => {
      activeTab = card.dataset.tab;
      document.querySelectorAll('.tab').forEach(item => item.classList.remove('active'));
      const tab = document.querySelector(`.tab[data-tab="${activeTab}"]`);
      if (tab) tab.classList.add('active');
      sortState = { column: '', direction: 'asc' };
      renderAdminTable();
    });
  });
  document.getElementById('searchInput').addEventListener('input', () => {
    sortState.column = '';
    renderAdminTable();
  });
  document.getElementById('refreshBtn').addEventListener('click', refreshDashboard);
  document.getElementById('exportBtn').addEventListener('click', exportCurrentTable);
  document.getElementById('tableHead').addEventListener('click', event => {
    const headerCell = event.target.closest('th.sortable');
    if (!headerCell) return;
    toggleSort(headerCell.dataset.column);
  });
  document.getElementById('tableBody').addEventListener('click', event => {
    const row = event.target.closest('tr');
    if (!row || row.dataset.index === undefined) return;
    selectRecord(currentTableRows[Number(row.dataset.index)]);
  });
  refreshDashboard();
  setInterval(refreshDashboard, 30000);
}

function refreshDashboard() {
  apiCall('dashboard')
    .then(data => {
      adminData = data;
      renderCounts(data.counts);
      renderAdminTable();
    })
    .catch(error => {
      document.getElementById('tableBody').innerHTML = `<tr><td>${escapeHtml(error.message || String(error))}</td></tr>`;
    });
}

function renderCounts(counts) {
  document.getElementById('registrationsCount').textContent = counts.registrations;
  document.getElementById('entriesCount').textContent = counts.entries;
  document.getElementById('pendingCount').textContent = counts.pending;
  document.getElementById('duplicateScansCount').textContent = counts.duplicateScans;
}

function renderAdminTable() {
  if (!adminData) return;
  const rows = adminData[activeTab] || [];
  const query = document.getElementById('searchInput').value.trim().toLowerCase();
  const filtered = rows.filter(row => JSON.stringify(row).toLowerCase().includes(query));
  const columns = activeTab === 'duplicateScans'
    ? ['Scan Time', 'Pass ID', 'Parent Name', 'Email', 'Student Name', 'Previous Entry Time', 'Scanned By', 'Reason']
    : activeTab === 'attendance'
      ? ['Entry Time', 'Pass ID', 'Parent Name', 'Email', 'Phone', 'Student Name', 'Class', 'Relation', 'Scanned By']
      : ['passId', 'parentName', 'studentName', 'className', 'relation', 'email', 'phone', 'entryStatus', 'entryTime'];

  currentTableRows = sortTableRows(filtered);

  document.getElementById('tableHead').innerHTML = `
    <tr>${columns.map(column => `
      <th class="sortable" data-column="${column}">
        ${labelFor(column)}${sortState.column === column ? ` <span class="sort-arrow">${sortState.direction === 'asc' ? '▲' : '▼'}</span>` : ''}
      </th>
    `).join('')}</tr>`;

  document.getElementById('tableBody').innerHTML = currentTableRows.length
    ? currentTableRows.map((row, index) => `<tr data-index="${index}" class="clickable-row">${columns.map(column => renderCell(row, column)).join('')}</tr>`).join('')
    : `<tr><td colspan="${columns.length}">No records found.</td></tr>`;

  if (!selectedRecord || !currentTableRows.includes(selectedRecord)) {
    selectRecord(currentTableRows[0] || null);
  }
}

function sortTableRows(rows) {
  if (!sortState.column) return rows.slice();
  return rows.slice().sort((a, b) => {
    const aValue = normalizeSortValue(a[sortState.column]);
    const bValue = normalizeSortValue(b[sortState.column]);
    if (aValue < bValue) return sortState.direction === 'asc' ? -1 : 1;
    if (aValue > bValue) return sortState.direction === 'asc' ? 1 : -1;
    return 0;
  });
}

function normalizeSortValue(value) {
  return String(value || '').trim().toLowerCase();
}

function toggleSort(column) {
  if (sortState.column === column) {
    sortState.direction = sortState.direction === 'asc' ? 'desc' : 'asc';
  } else {
    sortState.column = column;
    sortState.direction = 'asc';
  }
  renderAdminTable();
}

function selectRecord(record) {
  selectedRecord = record;
  const details = document.getElementById('recordDetails');
  if (!record) {
    details.classList.add('hidden');
    details.innerHTML = '';
    return;
  }

  details.classList.remove('hidden');
  details.innerHTML = `
    <div class="details-card">
      <p class="eyebrow">Selected record</p>
      ${Object.entries(record).map(([key, value]) => `
        <div class="detail-line">
          <strong>${labelFor(key)}</strong>
          <span>${escapeHtml(value)}</span>
        </div>
      `).join('')}
    </div>
  `;
}

function exportCurrentTable() {
  if (!currentTableRows.length) return;
  const columns = activeTab === 'duplicateScans'
    ? ['Scan Time', 'Pass ID', 'Parent Name', 'Email', 'Student Name', 'Previous Entry Time', 'Scanned By', 'Reason']
    : activeTab === 'attendance'
      ? ['Entry Time', 'Pass ID', 'Parent Name', 'Email', 'Phone', 'Student Name', 'Class', 'Relation', 'Scanned By']
      : ['passId', 'parentName', 'studentName', 'className', 'relation', 'whatsappNumber', 'email', 'phone', 'entryStatus', 'entryTime'];

  const csvRows = [
    columns.join(','),
    ...currentTableRows.map(row => columns.map(column => quoteCsv(row[column] || '')).join(','))
  ];

  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${activeTab || 'table'}-export.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function quoteCsv(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function renderCell(row, column) {
  const value = row[column] || '';
  if (column === 'entryStatus') {
    const className = value === 'Entered' ? 'entered' : 'pending';
    return `<td><span class="pill ${className}">${escapeHtml(value || 'Not Entered')}</span></td>`;
  }
  return `<td>${escapeHtml(value)}</td>`;
}

function labelFor(value) {
  return value
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, char => char.toUpperCase());
}

function apiCall(action, params = {}) {
  return new Promise((resolve, reject) => {
    const callbackName = `jsonp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement('script');
    const searchParams = new URLSearchParams(Object.assign({}, params, {
      action,
      callback: callbackName
    }));

    window[callbackName] = data => {
      cleanup();
      resolve(data);
    };

    script.onerror = () => {
      cleanup();
      reject(new Error('Could not reach Apps Script backend.'));
    };

    script.src = `${GAS_WEB_APP_URL}?${searchParams.toString()}`;
    document.body.appendChild(script);

    function cleanup() {
      delete window[callbackName];
      script.remove();
    }
  });
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
