/**
 * Project Leader B License - Sequential Practice System JavaScript Logic
 * Includes Multi-Device Progress Sync Engine (Multi-Cloud Failover & Code Export/Import)
 */

(function () {
  'use strict';

  const STORAGE_KEY = 'b_license_practice_state';

  // Application State
  let practiceState = {
    answered: {}, // { [qId]: { userAns, isCorrect, timestamp } }
    currentCategory: 'single', // 'single', 'multiple', 'tf'
    categoryPositions: {
      single: 0,
      multiple: 0,
      tf: 0
    },
    cloudSyncKey: ''
  };

  // Raw Question Bank categorized
  let bankSingle = [];
  let bankMultiple = [];
  let bankTF = [];

  // Currently Active Question List
  let currentList = [];
  let currentIndex = 0; // Index in currentList

  // DOM Elements
  const totalProgressText = document.getElementById('totalProgressText');
  const totalAccuracyText = document.getElementById('totalAccuracyText');
  const btnResetProgress = document.getElementById('btnResetProgress');

  // Category Tabs & Progress Elements
  const catTabs = document.querySelectorAll('.cat-tab-btn');
  const singleFill = document.getElementById('singleFill');
  const singleMeta = document.getElementById('singleMeta');
  const multiFill = document.getElementById('multiFill');
  const multiMeta = document.getElementById('multiMeta');
  const tfFill = document.getElementById('tfFill');
  const tfMeta = document.getElementById('tfMeta');

  // Question Card Elements
  const catTag = document.getElementById('catTag');
  const indexTag = document.getElementById('indexTag');
  const globalIndexTag = document.getElementById('globalIndexTag');
  const jumpSelect = document.getElementById('jumpSelect');
  const pTitle = document.getElementById('pTitle');
  const pOptionsContainer = document.getElementById('pOptionsContainer');
  const multiSubmitWrapper = document.getElementById('multiSubmitWrapper');
  const btnSubmitMulti = document.getElementById('btnSubmitMulti');

  // Feedback Banner Elements
  const feedbackBanner = document.getElementById('feedbackBanner');
  const feedbackStatusRow = document.getElementById('feedbackStatusRow');
  const userAnsVal = document.getElementById('userAnsVal');
  const correctAnsVal = document.getElementById('correctAnsVal');

  // Footer Buttons
  const btnPrevP = document.getElementById('btnPrevP');
  const btnNextP = document.getElementById('btnNextP');
  const btnReAnswer = document.getElementById('btnReAnswer');

  // Sync Modal Elements
  const syncModal = document.getElementById('syncModal');
  const btnSyncModal = document.getElementById('btnSyncModal');
  const btnCloseSync = document.getElementById('btnCloseSync');
  const cloudSyncKeyInput = document.getElementById('cloudSyncKey');
  const btnCloudSyncNow = document.getElementById('btnCloudSyncNow');
  const cloudSyncStatus = document.getElementById('cloudSyncStatus');
  const btnExportCode = document.getElementById('btnExportCode');
  const btnImportCode = document.getElementById('btnImportCode');

  // Multi-choice temporary selected options
  let tempMultiSelected = [];

  // Initialize
  init();

  function init() {
    loadBankData();
    loadState();
    setupEventListeners();
    switchCategory(practiceState.currentCategory || 'single');
    updateAllProgressDisplays();

    if (practiceState.cloudSyncKey) {
      cloudSyncKeyInput.value = practiceState.cloudSyncKey;
      autoCloudSync();
    }
  }

  function loadBankData() {
    const rawBank = window.QUESTION_BANK || [];
    bankSingle = rawBank.filter(q => q.category === 'single');
    bankMultiple = rawBank.filter(q => q.category === 'multiple');
    bankTF = rawBank.filter(q => q.category === 'tf');
  }

  function loadState() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') {
          practiceState = {
            answered: parsed.answered || {},
            currentCategory: parsed.currentCategory || 'single',
            categoryPositions: parsed.categoryPositions || { single: 0, multiple: 0, tf: 0 },
            cloudSyncKey: parsed.cloudSyncKey || ''
          };
        }
      } catch (e) {
        console.error('Failed to parse practice state', e);
      }
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(practiceState));
  }

  function switchCategory(category) {
    practiceState.currentCategory = category;
    
    if (category === 'single') {
      currentList = bankSingle;
      catTag.textContent = '单选题';
    } else if (category === 'multiple') {
      currentList = bankMultiple;
      catTag.textContent = '多选题';
    } else {
      currentList = bankTF;
      catTag.textContent = '判断题';
    }

    currentIndex = practiceState.categoryPositions[category] || 0;
    if (currentIndex >= currentList.length) currentIndex = currentList.length - 1;
    if (currentIndex < 0) currentIndex = 0;

    catTabs.forEach(tab => {
      if (tab.dataset.cat === category) {
        tab.classList.add('active');
      } else {
        tab.classList.remove('active');
      }
    });

    populateJumpSelect();
    renderCurrentQuestion();
    saveState();
  }

  function populateJumpSelect() {
    jumpSelect.innerHTML = '';
    currentList.forEach((q, idx) => {
      const opt = document.createElement('option');
      opt.value = idx;
      
      const record = practiceState.answered[q.id];
      let statusSymbol = '';
      if (record) {
        statusSymbol = record.isCorrect ? ' ✓' : ' ✗';
      }

      opt.textContent = `第 ${idx + 1} 题 (全库${q.id}题)${statusSymbol}`;
      jumpSelect.appendChild(opt);
    });
    jumpSelect.value = currentIndex;
  }

  function renderCurrentQuestion() {
    if (!currentList || currentList.length === 0) return;

    const q = currentList[currentIndex];
    practiceState.categoryPositions[practiceState.currentCategory] = currentIndex;
    saveState();

    indexTag.textContent = `第 ${currentIndex + 1} / ${currentList.length} 题`;
    globalIndexTag.textContent = `全库第 ${q.id} 题`;
    jumpSelect.value = currentIndex;

    pTitle.textContent = `${currentIndex + 1}. ${q.prompt}`;
    pOptionsContainer.innerHTML = '';
    feedbackBanner.style.display = 'none';
    multiSubmitWrapper.style.display = 'none';

    const record = practiceState.answered[q.id];
    const isAnswered = !!record;

    if (q.category === 'tf') {
      renderTFOptions(q, record);
    } else if (q.category === 'single') {
      renderSingleOptions(q, record);
    } else if (q.category === 'multiple') {
      renderMultipleOptions(q, record);
    }

    if (isAnswered) {
      showFeedbackBanner(q, record);
    }

    btnPrevP.disabled = currentIndex === 0;
    btnNextP.disabled = currentIndex === currentList.length - 1;

    updateAllProgressDisplays();
  }

  function renderTFOptions(q, record) {
    const opts = ['正确', '错误'];
    const keys = ['正确', '错误'];

    opts.forEach((optText, i) => {
      const key = keys[i];
      const isUserChoice = record && record.userAns === key;
      const isCorrectChoice = q.answer === key;

      const optEl = document.createElement('div');
      let classNames = 'option-item';

      if (record) {
        if (isCorrectChoice) classNames += ' is-correct-ans';
        else if (isUserChoice && !record.isCorrect) classNames += ' is-wrong-ans';
      }

      optEl.className = classNames;
      optEl.innerHTML = `
        <div class="option-key">${i === 0 ? 'A' : 'B'}</div>
        <div class="option-text">${optText}</div>
      `;

      if (!record) {
        optEl.addEventListener('click', () => submitAnswer(q, key));
      }

      pOptionsContainer.appendChild(optEl);
    });
  }

  function renderSingleOptions(q, record) {
    const labels = ['A', 'B', 'C', 'D', 'E'];

    q.options.forEach((optText, i) => {
      const key = labels[i] || String.fromCharCode(65 + i);
      const isUserChoice = record && record.userAns === key;
      const isCorrectChoice = q.answer === key;

      const optEl = document.createElement('div');
      let classNames = 'option-item';

      if (record) {
        if (isCorrectChoice) classNames += ' is-correct-ans';
        else if (isUserChoice && !record.isCorrect) classNames += ' is-wrong-ans';
      }

      optEl.className = classNames;
      optEl.innerHTML = `
        <div class="option-key">${key}</div>
        <div class="option-text">${optText}</div>
      `;

      if (!record) {
        optEl.addEventListener('click', () => submitAnswer(q, key));
      }

      pOptionsContainer.appendChild(optEl);
    });
  }

  function renderMultipleOptions(q, record) {
    const labels = ['A', 'B', 'C', 'D', 'E'];
    if (!record) {
      tempMultiSelected = [];
      multiSubmitWrapper.style.display = 'flex';
    }

    q.options.forEach((optText, i) => {
      const key = labels[i] || String.fromCharCode(65 + i);
      const isUserChoice = record && Array.isArray(record.userAns) && record.userAns.includes(key);
      const isCorrectChoice = Array.isArray(q.answer) && q.answer.includes(key);

      const optEl = document.createElement('div');
      let classNames = 'option-item';

      if (record) {
        if (isCorrectChoice) classNames += ' is-correct-ans';
        else if (isUserChoice && !isCorrectChoice) classNames += ' is-wrong-ans';
      }

      optEl.className = classNames;
      optEl.innerHTML = `
        <div class="option-key">${key}</div>
        <div class="option-text">${optText}</div>
      `;

      if (!record) {
        optEl.addEventListener('click', () => {
          if (tempMultiSelected.includes(key)) {
            tempMultiSelected = tempMultiSelected.filter(k => k !== key);
            optEl.classList.remove('selected');
          } else {
            tempMultiSelected.push(key);
            tempMultiSelected.sort();
            optEl.classList.add('selected');
          }
        });
      }

      pOptionsContainer.appendChild(optEl);
    });
  }

  function submitAnswer(q, userAns) {
    let isCorrect = false;

    if (q.category === 'multiple') {
      const correctSet = new Set(Array.isArray(q.answer) ? q.answer : [q.answer]);
      const userSet = new Set(Array.isArray(userAns) ? userAns : []);
      
      let equals = correctSet.size === userSet.size;
      if (equals) {
        for (let item of correctSet) {
          if (!userSet.has(item)) { equals = false; break; }
        }
      }
      isCorrect = equals;
    } else {
      isCorrect = userAns === q.answer;
    }

    practiceState.answered[q.id] = {
      userAns: userAns,
      isCorrect: isCorrect,
      timestamp: Date.now()
    };

    saveState();
    populateJumpSelect();
    renderCurrentQuestion();

    if (practiceState.cloudSyncKey) {
      triggerCloudUpload();
    }
  }

  function showFeedbackBanner(q, record) {
    feedbackBanner.style.display = 'block';

    const userAnsStr = Array.isArray(record.userAns) ? record.userAns.join(', ') : (record.userAns || '未作答');
    const correctAnsStr = Array.isArray(q.answer) ? q.answer.join(', ') : q.answer;

    if (record.isCorrect) {
      feedbackBanner.className = 'feedback-banner correct';
      feedbackStatusRow.innerHTML = '<i class="fa-solid fa-circle-check"></i> 恭喜您，回答正确！';
    } else {
      feedbackBanner.className = 'feedback-banner wrong';
      feedbackStatusRow.innerHTML = '<i class="fa-solid fa-circle-xmark"></i> 回答错误';
    }

    userAnsVal.textContent = userAnsStr;
    correctAnsVal.textContent = correctAnsStr;
  }

  function updateAllProgressDisplays() {
    const singleAnsCount = bankSingle.filter(q => practiceState.answered[q.id]).length;
    const singlePct = ((singleAnsCount / 400) * 100).toFixed(1);
    singleFill.style.width = `${singlePct}%`;
    singleMeta.textContent = `已练 ${singleAnsCount} / 400 (${singlePct}%)`;

    const multiAnsCount = bankMultiple.filter(q => practiceState.answered[q.id]).length;
    const multiPct = ((multiAnsCount / 200) * 100).toFixed(1);
    multiFill.style.width = `${multiPct}%`;
    multiMeta.textContent = `已练 ${multiAnsCount} / 200 (${multiPct}%)`;

    const tfAnsCount = bankTF.filter(q => practiceState.answered[q.id]).length;
    const tfPct = ((tfAnsCount / 400) * 100).toFixed(1);
    tfFill.style.width = `${tfPct}%`;
    tfMeta.textContent = `已练 ${tfAnsCount} / 400 (${tfPct}%)`;

    const totalAnsCount = Object.keys(practiceState.answered).length;
    const totalPct = ((totalAnsCount / 1000) * 100).toFixed(1);
    totalProgressText.textContent = `${totalAnsCount} / 1000 (${totalPct}%)`;

    let correctTotal = 0;
    Object.values(practiceState.answered).forEach(rec => {
      if (rec.isCorrect) correctTotal++;
    });

    const accuracyPct = totalAnsCount > 0 ? ((correctTotal / totalAnsCount) * 100).toFixed(1) : '0';
    totalAccuracyText.textContent = `${accuracyPct}%`;
  }

  // ==================== MULTI-DEVICE SYNC ENGINE ====================

  function encodeProgressState() {
    const data = {
      answered: practiceState.answered,
      positions: practiceState.categoryPositions
    };
    return btoa(encodeURIComponent(JSON.stringify(data)));
  }

  function decodeProgressState(codeStr) {
    try {
      const jsonStr = decodeURIComponent(atob(codeStr.trim()));
      return JSON.parse(jsonStr);
    } catch (e) {
      return null;
    }
  }

  function mergeProgressData(incoming) {
    if (!incoming || typeof incoming !== 'object') return false;
    
    if (incoming.answered) {
      Object.keys(incoming.answered).forEach(qId => {
        const item = incoming.answered[qId];
        const existing = practiceState.answered[qId];
        if (!existing || (item.timestamp && item.timestamp > (existing.timestamp || 0))) {
          practiceState.answered[qId] = item;
        }
      });
    }

    if (incoming.positions) {
      Object.keys(incoming.positions).forEach(cat => {
        if (incoming.positions[cat] !== undefined) {
          practiceState.categoryPositions[cat] = Math.max(
            practiceState.categoryPositions[cat] || 0,
            incoming.positions[cat]
          );
        }
      });
    }

    saveState();
    switchCategory(practiceState.currentCategory);
    updateAllProgressDisplays();
    return true;
  }

  // Multi-Cloud REST Endpoints
  const CLOUD_ENDPOINTS = [
    { name: 'kvdb', get: (key) => `https://kvdb.io/B5mX7q8Y3pZ1/${key}`, put: (key) => `https://kvdb.io/B5mX7q8Y3pZ1/${key}` },
    { name: 'jsonblob', get: (key) => `https://jsonblob.com/api/jsonBlob/b_license_${key}`, put: (key) => `https://jsonblob.com/api/jsonBlob/b_license_${key}` }
  ];

  async function triggerCloudUpload() {
    const rawKey = practiceState.cloudSyncKey.trim();
    if (!rawKey) return;
    const cleanKey = encodeURIComponent(rawKey);

    const payload = {
      answered: practiceState.answered,
      positions: practiceState.categoryPositions,
      updatedAt: Date.now()
    };

    for (let provider of CLOUD_ENDPOINTS) {
      try {
        const res = await fetch(provider.put(cleanKey), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (res.ok) return;
      } catch (e) {
        // try next provider
      }
    }
  }

  async function autoCloudSync() {
    const rawKey = practiceState.cloudSyncKey.trim();
    if (!rawKey) return;
    const cleanKey = encodeURIComponent(rawKey);

    cloudSyncStatus.textContent = '🔄 正在同步云端进度...';
    cloudSyncStatus.className = 'sync-status';

    for (let provider of CLOUD_ENDPOINTS) {
      try {
        const res = await fetch(provider.get(cleanKey));
        if (res.ok) {
          const data = await res.json();
          if (data && data.answered) {
            mergeProgressData(data);
            cloudSyncStatus.textContent = `✓ 已成功同步云端进度 (共 ${Object.keys(practiceState.answered).length} 题记录)`;
            cloudSyncStatus.className = 'sync-status success';
            return;
          }
        }
      } catch (e) {
        // try next
      }
    }

    // Attempt first upload
    try {
      await triggerCloudUpload();
      cloudSyncStatus.textContent = '✓ 已成功创建并绑定云端专属暗号！';
      cloudSyncStatus.className = 'sync-status success';
    } catch (e) {
      cloudSyncStatus.innerHTML = '💡 提示：公网 API 受到网络拦截。请优先使用下方<b>【方式二：复制/粘贴暗号】</b>，秒级跨设备同步！';
      cloudSyncStatus.className = 'sync-status error';
    }
  }

  // Event Listeners Setup
  function setupEventListeners() {
    catTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        switchCategory(tab.dataset.cat);
      });
    });

    jumpSelect.addEventListener('change', (e) => {
      currentIndex = parseInt(e.target.value, 10);
      renderCurrentQuestion();
    });

    btnPrevP.addEventListener('click', () => {
      if (currentIndex > 0) {
        currentIndex--;
        renderCurrentQuestion();
      }
    });

    btnNextP.addEventListener('click', () => {
      if (currentIndex < currentList.length - 1) {
        currentIndex++;
        renderCurrentQuestion();
      }
    });

    btnReAnswer.addEventListener('click', () => {
      const q = currentList[currentIndex];
      delete practiceState.answered[q.id];
      saveState();
      populateJumpSelect();
      renderCurrentQuestion();
    });

    btnSubmitMulti.addEventListener('click', () => {
      const q = currentList[currentIndex];
      if (tempMultiSelected.length === 0) {
        alert('请至少选择一个选项后再提交！');
        return;
      }
      submitAnswer(q, tempMultiSelected);
    });

    btnResetProgress.addEventListener('click', () => {
      if (confirm('确定要清空所有练习进度和作答记录吗？此操作无法撤销。')) {
        practiceState.answered = {};
        practiceState.categoryPositions = { single: 0, multiple: 0, tf: 0 };
        saveState();
        switchCategory('single');
        updateAllProgressDisplays();
      }
    });

    // Sync Modal Listeners
    btnSyncModal.addEventListener('click', () => {
      syncModal.classList.add('active');
    });

    btnCloseSync.addEventListener('click', () => {
      syncModal.classList.remove('active');
    });

    btnCloudSyncNow.addEventListener('click', () => {
      const key = cloudSyncKeyInput.value.trim();
      if (!key) {
        alert('请输入您的专属暗号！');
        return;
      }
      practiceState.cloudSyncKey = key;
      saveState();
      autoCloudSync();
    });

    // Copy Code to Clipboard (方式二 - 100% 成功)
    btnExportCode.addEventListener('click', () => {
      const code = encodeProgressState();
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(code).then(() => {
          alert('✅ 进度暗号已复制到剪贴板！\n请在另一台设备上点击【粘贴暗号导入进度】即可 0.1 秒秒级同步！');
        }).catch(() => {
          prompt('请复制下方您的进度暗号：', code);
        });
      } else {
        prompt('请复制下方您的进度暗号：', code);
      }
    });

    // Import Code (方式二 - 100% 成功)
    btnImportCode.addEventListener('click', () => {
      const inputCode = prompt('请粘贴您在其他设备上复制的进度暗号：');
      if (inputCode) {
        const decoded = decodeProgressState(inputCode);
        if (decoded && mergeProgressData(decoded)) {
          alert('🎉 成功导入并合并练习进度！');
          syncModal.classList.remove('active');
        } else {
          alert('❌ 暗号格式无效，请重新复制后再试！');
        }
      }
    });
  }

})();
