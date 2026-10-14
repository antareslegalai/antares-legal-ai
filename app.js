// ==========================================================================
// ANTARES LEGAL AI — PHASE 6B CLIENT APPLICATION ENGINE
// Teaching Case Discovery, Search, Filtering & Source Verification
// ==========================================================================

(function() {
  'use strict';

  // State Management
  let allCases = [];
  let filteredCases = [];
  let activeCase = null;

  // DOM Elements
  const searchInput = document.getElementById('searchInput');
  const btnClearSearch = document.getElementById('btnClearSearch');
  const btnSearch = document.getElementById('btnSearch');
  const quickTags = document.querySelectorAll('.tag-btn');

  const filterDomain = document.getElementById('filterDomain');
  const filterProvince = document.getElementById('filterProvince');
  const filterStage = document.getElementById('filterStage');
  const filterPublisher = document.getElementById('filterPublisher');
  const btnResetFilters = document.getElementById('btnResetFilters');
  const btnEmptyReset = document.getElementById('btnEmptyReset');

  const resultsGrid = document.getElementById('resultsGrid');
  const resultsCount = document.getElementById('resultsCount');
  const activeFilterChips = document.getElementById('activeFilterTags');
  const emptyState = document.getElementById('emptyState');
  const sortOrder = document.getElementById('sortOrder');

  // Modal Elements
  const caseDetailModal = document.getElementById('caseDetailModal');
  const btnModalClose = document.getElementById('btnModalClose');
  const btnModalCloseBottom = document.getElementById('btnModalCloseBottom');

  // Feedback Elements
  const feedbackModal = document.getElementById('feedbackModal');
  const btnFeedbackTrigger = document.getElementById('btnFeedbackTrigger');
  const btnFeedbackClose = document.getElementById('btnFeedbackClose');
  const btnCancelFeedback = document.getElementById('btnCancelFeedback');
  const btnSaveFeedback = document.getElementById('btnSaveFeedback');
  const feedbackCaseId = document.getElementById('feedbackCaseId');
  const feedbackCategory = document.getElementById('feedbackCategory');
  const feedbackNotes = document.getElementById('feedbackNotes');
  const feedbackCountEl = document.getElementById('feedbackCount');
  const btnFeedbackHistory = document.getElementById('btnFeedbackHistory');
  const historyDrawer = document.getElementById('historyDrawer');
  const btnDrawerClose = document.getElementById('btnDrawerClose');
  const feedbackList = document.getElementById('feedbackList');

  // Helper: Diacritics stripper for Vietnamese fuzzy matching
  function removeVietnameseDiacritics(str) {
    if (!str) return '';
    return str
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .toLowerCase();
  }

  // 1. DATA INITIALIZATION
  function initApp() {
    try {
      if (window.ANTARES_CASES && Array.isArray(window.ANTARES_CASES) && window.ANTARES_CASES.length > 0) {
        allCases = window.ANTARES_CASES;
        onDataLoaded();
      } else {
        // Fallback: Fetch JSON
        fetch('data/phase6b_cases.json')
          .then(res => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json();
          })
          .then(data => {
            if (!Array.isArray(data) || data.length === 0) {
              throw new Error('Tập dữ liệu vụ việc trống');
            }
            allCases = data;
            onDataLoaded();
          })
          .catch(err => {
            showInitError(err);
          });
      }
    } catch (err) {
      showInitError(err);
    }
  }

  function showInitError(err) {
    console.error('[Antares Error] Không thể tải dữ liệu vụ việc:', err);
    if (resultsCount) {
      resultsCount.textContent = 'Không thể tải dữ liệu. Vui lòng tải lại trang.';
      resultsCount.style.color = '#dc2626';
    }
    if (emptyState) {
      emptyState.style.display = 'block';
      emptyState.innerHTML = `
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="1.5">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <h3 style="color: #dc2626;">Không thể tải dữ liệu</h3>
        <p>Vui lòng tải lại trang hoặc kiểm tra kết nối máy chủ nội bộ.</p>
        <button onclick="window.location.reload()" class="btn-primary" style="margin-top: 1rem;">Tải lại trang</button>
      `;
    }
    if (resultsGrid) {
      resultsGrid.style.display = 'none';
    }
  }

  function onDataLoaded() {
    try {
      console.log(`[Antares] Loaded ${allCases.length} frozen master cases.`);
      populateFilterOptions();
      bindEvents();
      updateFeedbackCounter();
      handleUrlHash();
      applySearchAndFilter();
    } catch (err) {
      showInitError(err);
    }
  }

  // 2. POPULATE FILTER DROPDOWNS
  function populateFilterOptions() {
    const domains = new Set();
    const provinces = new Set();
    const stages = new Set();
    const publishers = new Set();

    allCases.forEach(c => {
      if (c.domain) domains.add(c.domain);
      if (c.province) provinces.add(c.province);
      if (c.broad_stage) stages.add(c.broad_stage);
      if (c.primary_publisher) publishers.add(c.primary_publisher);
    });

    fillSelect(filterDomain, Array.from(domains).sort());
    fillSelect(filterProvince, Array.from(provinces).sort((a, b) => a.localeCompare(b, 'vi')));
    fillSelect(filterStage, Array.from(stages).sort());
    fillSelect(filterPublisher, Array.from(publishers).sort());
  }

  function fillSelect(selectEl, values) {
    if (!selectEl) return;
    values.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v;
      opt.textContent = v;
      selectEl.appendChild(opt);
    });
  }

  // 3. SEARCH & FILTER ENGINE
  function applySearchAndFilter() {
    const rawQuery = (searchInput ? searchInput.value : '').trim();
    const queryLower = rawQuery.toLowerCase();
    const queryNoDiacritics = removeVietnameseDiacritics(rawQuery);
    const tokens = queryNoDiacritics.split(/\s+/).filter(Boolean);

    const selDomain = filterDomain ? filterDomain.value : '';
    const selProvince = filterProvince ? filterProvince.value : '';
    const selStage = filterStage ? filterStage.value : '';
    const selPublisher = filterPublisher ? filterPublisher.value : '';

    filteredCases = allCases.filter(c => {
      // 1. Text Search across structured & evidence fields
      if (rawQuery) {
        // Direct phrase match first (highest priority)
        if (c.search_raw.includes(queryLower) || c.search_no_diacritics.includes(queryNoDiacritics)) {
          // Match!
        } else if (tokens.length > 0) {
          // Token matching: each token must match as a complete word
          const matchesAllTokens = tokens.every(token => {
            const rx = new RegExp('\\b' + token + '\\b', 'i');
            return rx.test(c.search_no_diacritics) || rx.test(c.search_raw);
          });
          if (!matchesAllTokens) return false;
        } else {
          return false;
        }
      }

      // 2. Domain Filter
      if (selDomain && c.domain !== selDomain) return false;

      // 3. Province Filter
      if (selProvince && c.province !== selProvince) return false;

      // 4. Stage Filter
      if (selStage && c.broad_stage !== selStage) return false;

      // 5. Publisher Filter
      if (selPublisher && c.primary_publisher !== selPublisher) return false;

      return true;
    });

    // Sort Results
    sortFilteredCases();

    // Render
    renderResults();
    renderActiveFilterChips();
  }

  function sortFilteredCases() {
    const sortVal = sortOrder.value;
    filteredCases.sort((a, b) => {
      if (sortVal === 'newest') {
        const dtA = a.normalized_datetime || a.published_date || '';
        const dtB = b.normalized_datetime || b.published_date || '';
        const cmp = dtB.localeCompare(dtA);
        return cmp !== 0 ? cmp : b.case_id.localeCompare(a.case_id);
      } else if (sortVal === 'oldest') {
        const dtA = a.normalized_datetime || a.published_date || '';
        const dtB = b.normalized_datetime || b.published_date || '';
        const cmp = dtA.localeCompare(dtB);
        return cmp !== 0 ? cmp : a.case_id.localeCompare(b.case_id);
      } else if (sortVal === 'id_asc') {
        return a.case_id.localeCompare(b.case_id);
      }
      return 0;
    });
  }

  // 4. RENDER SEARCH RESULTS
  function renderResults() {
    resultsGrid.innerHTML = '';
    const total = allCases.length;
    const count = filteredCases.length;

    resultsCount.textContent = `Tìm thấy ${count} / ${total} vụ việc thực tiễn`;

    if (count === 0) {
      emptyState.style.display = 'block';
      resultsGrid.style.display = 'none';
      return;
    }

    emptyState.style.display = 'none';
    resultsGrid.style.display = 'flex';

    filteredCases.forEach(c => {
      const card = document.createElement('article');
      card.className = 'case-card';
      card.setAttribute('data-id', c.case_id);

      const statusText = c.procedural_status || c.procedural_stage || '';

      card.innerHTML = `
        <h3 class="card-title" title="Bấm để xem chi tiết vụ việc">${escapeHtml(c.title)}</h3>
        <p class="card-summary">${escapeHtml(c.summary_short || c.summary_detailed)}</p>

        <div class="card-meta-chips">
          <span class="meta-chip meta-chip-domain" title="Lĩnh vực pháp luật">
            ${escapeHtml(c.domain)}
          </span>
          <span class="meta-chip meta-chip-topic" title="Chủ đề pháp lý">
            ${escapeHtml(c.legal_topic)}
          </span>
          <span class="meta-chip" title="Địa bàn">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
              <circle cx="12" cy="10" r="3"/>
            </svg>
            ${escapeHtml(c.province)}
          </span>
          <span class="meta-chip" title="Thời gian vụ việc / đưa tin">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
            ${escapeHtml(c.incident_date || c.published_date || c.year)}
          </span>
        </div>

        <div class="card-footer">
          <div class="card-status-info" title="${escapeHtml(statusText)}">
            ${statusText ? `<strong>Tố tụng:</strong> ${escapeHtml(statusText)}` : ''}
          </div>
          <div class="card-btn-group">
            <button class="btn-card-detail" data-action="detail" data-id="${c.case_id}">Xem chi tiết</button>
            <a href="${escapeHtml(c.primary_url)}" target="_blank" rel="noopener noreferrer" class="btn-card-source" title="Mở bài báo gốc trong tab mới">
              Đọc nguồn
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                <polyline points="15 3 21 3 21 9"/>
                <line x1="10" y1="14" x2="21" y2="3"/>
              </svg>
            </a>
          </div>
        </div>
      `;

      // Click title or detail button to open modal
      card.querySelector('.card-title').addEventListener('click', () => openCaseDetail(c.case_id));
      card.querySelector('[data-action="detail"]').addEventListener('click', () => openCaseDetail(c.case_id));

      resultsGrid.appendChild(card);
    });
  }

  function renderActiveFilterChips() {
    activeFilterChips.innerHTML = '';

    const filters = [
      { key: 'domain', label: filterDomain.value, clear: () => filterDomain.value = '' },
      { key: 'province', label: filterProvince.value, clear: () => filterProvince.value = '' },
      { key: 'stage', label: filterStage.value, clear: () => filterStage.value = '' },
      { key: 'publisher', label: filterPublisher.value, clear: () => filterPublisher.value = '' }
    ];

    filters.forEach(f => {
      if (f.label) {
        const chip = document.createElement('span');
        chip.className = 'active-chip';
        chip.innerHTML = `${escapeHtml(f.label)} <button aria-label="Xóa bộ lọc">&times;</button>`;
        chip.querySelector('button').addEventListener('click', () => {
          f.clear();
          applySearchAndFilter();
        });
        activeFilterChips.appendChild(chip);
      }
    });
  }

  // 5. CASE DETAIL MODAL (SECTIONS A, B, C, D + ANOMALY + BOUNDARY NOTE)
  function openCaseDetail(caseId) {
    const c = allCases.find(item => item.case_id === caseId);
    if (!c) return;

    activeCase = c;
    window.location.hash = c.case_id;

    // Header Badges & Title
    document.getElementById('modalCaseId').textContent = c.case_id;
    document.getElementById('modalDomain').textContent = c.domain;
    document.getElementById('modalProvince').textContent = c.province;
    document.getElementById('modalCaseTitle').textContent = c.title;

    // Source Anomaly Warning Box
    const anomalyBox = document.getElementById('modalAnomalyAlert');
    if (c.source_anomaly_flag === 'SOURCE_TEXT_ANOMALY_AUTHORITY_NAME') {
      anomalyBox.style.display = 'flex';
      document.getElementById('modalAnomalyQuote').textContent = `“${c.verbatim_source_quote || c.evidence_quote}”`;
      document.getElementById('modalAnomalyNormalized').textContent = c.authority;
    } else {
      anomalyBox.style.display = 'none';
    }

    // SECTION A: TÓM TẮT VỤ VIỆC
    document.getElementById('modalSummaryShort').textContent = c.summary_short || 'Chưa có tóm tắt ngắn gọn.';
    document.getElementById('modalIncidentDate').textContent = c.incident_date || 'Không xác định cụ thể trong bài';
    document.getElementById('modalPublishedDate').textContent = c.published_date || c.normalized_datetime || '2026';
    
    // Detailed location with safe fallback
    const locParts = [c.province];
    if (c.commune) locParts.push(`Địa bàn cơ sở: ${c.commune}`);
    if (c.detailed_location && c.detailed_location !== c.province) {
      locParts.push(c.detailed_location);
    }
    document.getElementById('modalLocationDetail').textContent = locParts.join(' — ');
    document.getElementById('modalHistoricalLoc').textContent = c.historical_location || 'Giữ nguyên theo địa giới hiện hành';

    // SECTION B: DIỄN BIẾN / SỰ KIỆN CHÍNH
    document.getElementById('modalSummaryDetailed').textContent = c.summary_detailed || 'Xem chi tiết trong trích dẫn chứng cứ bài báo.';
    document.getElementById('modalInfraction').textContent = c.infraction_behavior || 'Hành vi được nêu trong kết luận ban đầu của cơ quan chức năng.';
    document.getElementById('modalConsequence').textContent = c.legal_consequence || 'Không ghi nhận thiệt hại đặc biệt.';

    // SECTION C: THÔNG TIN PHÁP LÝ ĐỂ TRA CỨU
    document.getElementById('modalLegalDomain').textContent = c.domain;
    document.getElementById('modalLegalTopic').textContent = c.legal_topic;
    document.getElementById('modalAuthority').textContent = c.authority || 'Cơ quan có thẩm quyền xử lý theo quy định pháp luật';
    document.getElementById('modalProceduralStatus').textContent = c.procedural_status || c.procedural_stage || 'Đang thụ lý, giải quyết';
    document.getElementById('modalActors').textContent = c.actors || 'Chưa công bố danh tính hoặc đang trong quá trình điều tra';
    document.getElementById('modalRelatedEntities').textContent = c.related_entities || 'Không có bên thứ ba liên quan trực tiếp';

    // SECTION D: NGUỒN & CHỨNG CỨ
    document.getElementById('modalPublisher').textContent = c.primary_publisher || 'Nguồn báo chí';
    document.getElementById('modalSourcePublished').textContent = c.published_date ? `Đăng tải: ${c.published_date}` : '';
    
    const readBtn = document.getElementById('btnReadOriginalArticle');
    readBtn.href = c.primary_url;

    const urlLink = document.getElementById('modalSourceUrl');
    urlLink.href = c.primary_url;
    urlLink.textContent = c.primary_url;

    document.getElementById('modalEvidenceQuote').textContent = c.evidence_quote || c.verbatim_source_quote || 'Trích dẫn nguyên văn đang được đối soát trong Evidence Vault.';
    document.getElementById('modalRawFilename').textContent = c.raw_filename || 'Đang cập nhật';
    document.getElementById('modalRawSha').textContent = c.raw_sha256 || 'Đang cập nhật';

    // Multi sources
    const multiWrap = document.getElementById('modalMultiSourcesWrap');
    const multiList = document.getElementById('modalMultiSourcesList');
    multiList.innerHTML = '';
    if (c.sources && c.sources.length > 1) {
      multiWrap.style.display = 'block';
      c.sources.forEach(src => {
        const li = document.createElement('li');
        li.className = 'multi-source-item';
        li.innerHTML = `<strong>${escapeHtml(src.publisher)}:</strong> <a href="${escapeHtml(src.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(src.article_title || src.url)}</a> (${escapeHtml(src.published_date)})`;
        multiList.appendChild(li);
      });
    } else {
      multiWrap.style.display = 'none';
    }

    // Show modal
    caseDetailModal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }

  function closeCaseDetail() {
    caseDetailModal.style.display = 'none';
    document.body.style.overflow = '';
    activeCase = null;
    history.replaceState(null, null, ' ');
  }

  // 6. FEEDBACK SYSTEM (MINIMAL USER FEEDBACK - SECTION 12)
  function openFeedbackModal() {
    if (!activeCase) return;
    feedbackCaseId.value = activeCase.case_id;
    feedbackNotes.value = '';
    feedbackModal.style.display = 'flex';
  }

  function closeFeedbackModal() {
    feedbackModal.style.display = 'none';
  }

  function saveFeedback() {
    const cid = feedbackCaseId.value;
    const cat = feedbackCategory.value;
    const notes = (feedbackNotes.value || '').trim();

    if (!notes) {
      alert('Vui lòng nhập nội dung ghi chú góp ý của giảng viên.');
      return;
    }

    const item = {
      case_id: cid,
      category: cat,
      notes: notes,
      timestamp: new Date().toISOString()
    };

    let stored = [];
    try {
      stored = JSON.parse(localStorage.getItem('antares_feedbacks') || '[]');
    } catch(e) {
      stored = [];
    }
    stored.push(item);
    localStorage.setItem('antares_feedbacks', JSON.stringify(stored));

    updateFeedbackCounter();
    closeFeedbackModal();
    alert(`Đã lưu ghi chú góp ý cho vụ việc ${cid} trên trình duyệt thành công!`);
  }

  function updateFeedbackCounter() {
    try {
      const stored = JSON.parse(localStorage.getItem('antares_feedbacks') || '[]');
      feedbackCountEl.textContent = stored.length;
    } catch(e) {
      feedbackCountEl.textContent = '0';
    }
  }

  function openHistoryDrawer() {
    let stored = [];
    try {
      stored = JSON.parse(localStorage.getItem('antares_feedbacks') || '[]');
    } catch(e) {
      stored = [];
    }

    feedbackList.innerHTML = '';
    if (stored.length === 0) {
      feedbackList.innerHTML = '<p style="color: #64748b; font-size: 0.875rem;">Chưa có ghi chú góp ý nào được lưu trên trình duyệt.</p>';
    } else {
      stored.reverse().forEach((item, idx) => {
        const el = document.createElement('div');
        el.className = 'feedback-item';
        el.innerHTML = `
          <div class="feedback-item-header">
            <span class="badge badge-case-id">${escapeHtml(item.case_id)}</span>
            <span class="feedback-item-time">${new Date(item.timestamp).toLocaleString('vi-VN')}</span>
          </div>
          <div style="font-size: 0.75rem; font-weight: 600; color: #2563eb;">${escapeHtml(item.category)}</div>
          <div class="feedback-item-text">${escapeHtml(item.notes)}</div>
        `;
        feedbackList.appendChild(el);
      });
    }

    historyDrawer.style.display = 'flex';
  }

  function closeHistoryDrawer() {
    historyDrawer.style.display = 'none';
  }

  // 7. EVENT BINDINGS
  function bindEvents() {
    // Search input
    let searchTimeout = null;
    searchInput.addEventListener('input', () => {
      btnClearSearch.style.display = searchInput.value ? 'flex' : 'none';
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(applySearchAndFilter, 150);
    });

    btnClearSearch.addEventListener('click', () => {
      searchInput.value = '';
      btnClearSearch.style.display = 'none';
      applySearchAndFilter();
      searchInput.focus();
    });

    btnSearch.addEventListener('click', applySearchAndFilter);
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        clearTimeout(searchTimeout);
        applySearchAndFilter();
      }
    });

    // Quick tag buttons
    quickTags.forEach(btn => {
      btn.addEventListener('click', () => {
        searchInput.value = btn.getAttribute('data-query');
        btnClearSearch.style.display = 'flex';
        applySearchAndFilter();
      });
    });

    // Filters & Sort
    filterDomain.addEventListener('change', applySearchAndFilter);
    filterProvince.addEventListener('change', applySearchAndFilter);
    filterStage.addEventListener('change', applySearchAndFilter);
    filterPublisher.addEventListener('change', applySearchAndFilter);
    sortOrder.addEventListener('change', () => {
      sortFilteredCases();
      renderResults();
    });

    // Reset buttons
    const resetAll = () => {
      searchInput.value = '';
      btnClearSearch.style.display = 'none';
      filterDomain.value = '';
      filterProvince.value = '';
      filterStage.value = '';
      filterPublisher.value = '';
      sortOrder.value = 'newest';
      applySearchAndFilter();
    };

    btnResetFilters.addEventListener('click', resetAll);
    btnEmptyReset.addEventListener('click', resetAll);

    // Modal close
    btnModalClose.addEventListener('click', closeCaseDetail);
    btnModalCloseBottom.addEventListener('click', closeCaseDetail);
    caseDetailModal.addEventListener('click', (e) => {
      if (e.target === caseDetailModal) closeCaseDetail();
    });

    // Feedback
    btnFeedbackTrigger.addEventListener('click', openFeedbackModal);
    btnFeedbackClose.addEventListener('click', closeFeedbackModal);
    btnCancelFeedback.addEventListener('click', closeFeedbackModal);
    btnSaveFeedback.addEventListener('click', saveFeedback);
    feedbackModal.addEventListener('click', (e) => {
      if (e.target === feedbackModal) closeFeedbackModal();
    });

    btnFeedbackHistory.addEventListener('click', openHistoryDrawer);
    btnDrawerClose.addEventListener('click', closeHistoryDrawer);
    historyDrawer.addEventListener('click', (e) => {
      if (e.target === historyDrawer) closeHistoryDrawer();
    });

    // Keyboard accessibility
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (feedbackModal.style.display === 'flex') {
          closeFeedbackModal();
        } else if (historyDrawer.style.display === 'flex') {
          closeHistoryDrawer();
        } else if (caseDetailModal.style.display === 'flex') {
          closeCaseDetail();
        }
      }
    });

    // Hash change
    window.addEventListener('hashchange', handleUrlHash);
  }

  function handleUrlHash() {
    const hash = window.location.hash.replace('#', '').trim();
    if (hash && hash.startsWith('PILOT_2026_')) {
      openCaseDetail(hash);
    }
  }

  function escapeHtml(text) {
    if (!text) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Start app on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }

})();
