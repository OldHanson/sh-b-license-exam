/**
 * Project Leader B License - Sequential Practice System JavaScript Logic
 * Includes Multi-Device Progress Sync Engine (Multi-Cloud Failover, Code Export/Import & Reset Sync)
 */

(function () {
  'use strict';

  const STORAGE_KEY = 'b_license_practice_state';

  // Application State
  let practiceState = {
    answered: {}, // { [qId]: { userAns, isCorrect, timestamp } }
    currentCategory: 'single', // 'single', 'multiple', 'tf', 'wrong'
    categoryPositions: {
      single: 0,
      multiple: 0,
      tf: 0,
      wrong: 0
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

  function getEl(id) {
    return document.getElementById(id);
  }

  // Multi-choice temporary selected options & wrong review session state
  let tempMultiSelected = [];
  let wrongReviewAnswered = {};

  // Ensure Question Bank is 100% loaded before initializing
  function ensureBankReady(callback) {
    if (window.QUESTION_BANK && Array.isArray(window.QUESTION_BANK) && window.QUESTION_BANK.length > 0) {
      callback();
      return;
    }

    let attempts = 0;
    const timer = setInterval(() => {
      attempts++;
      if (window.QUESTION_BANK && Array.isArray(window.QUESTION_BANK) && window.QUESTION_BANK.length > 0) {
        clearInterval(timer);
        callback();
      } else if (attempts >= 50) {
        clearInterval(timer);
        alert('题库数据加载超时，请刷新页面。');
      }
    }, 100);
  }

  function safeInit() {
    try {
      init();
    } catch (e) {
      console.error('Initialization error:', e);
      loadBankData();
      switchCategory('single');
    }
  }

  // Initialize
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => ensureBankReady(safeInit));
  } else {
    ensureBankReady(safeInit);
  }

  function checkUrlSyncParam() {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      let syncCode = urlParams.get('sync');
      if (!syncCode && window.location.hash && window.location.hash.includes('sync=')) {
        syncCode = window.location.hash.split('sync=')[1];
      }

      if (syncCode) {
        const decoded = decodeProgressState(syncCode);
        if (decoded && mergeProgressData(decoded)) {
          alert('🎉 欢迎使用一键链接/二维码同步！\n已成功自动载入并更新您的全量刷题进度！');
          try {
            const newUrl = window.location.protocol + '//' + window.location.host + window.location.pathname;
            window.history.replaceState({ path: newUrl }, '', newUrl);
          } catch (e) {}
        }
      }
    } catch (e) {}
  }

  function init() {
    loadBankData();
    loadState();
    switchCategory(practiceState.currentCategory || 'single');
    updateAllProgressDisplays();
    setupEventListeners();
    checkUrlSyncParam();

    if (practiceState.cloudSyncKey) {
      const keyInput = getEl('cloudSyncKey');
      if (keyInput) keyInput.value = practiceState.cloudSyncKey;
      autoCloudSync();
    }
  }

  function loadBankData() {
    const rawBank = window.QUESTION_BANK || [];
    bankSingle = rawBank.filter(q => q.category === 'single');
    bankMultiple = rawBank.filter(q => q.category === 'multiple');
    bankTF = rawBank.filter(q => q.category === 'tf');
  }

  function safeGetItem(key) {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      console.warn('localStorage getItem blocked:', e);
      return null;
    }
  }

  function safeSetItem(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      console.warn('localStorage setItem blocked:', e);
    }
  }

  function safeRemoveItem(key) {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      console.warn('localStorage removeItem blocked:', e);
    }
  }

  function loadState() {
    const saved = safeGetItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') {
          practiceState = {
            answered: parsed.answered || {},
            currentCategory: parsed.currentCategory || 'single',
            wrongFilter: parsed.wrongFilter || 'all',
            categoryPositions: parsed.categoryPositions || { single: 0, multiple: 0, tf: 0, wrong: 0 },
            cloudSyncKey: parsed.cloudSyncKey || ''
          };
        }
      } catch (e) {
        console.error('Failed to parse practice state', e);
      }
    }
  }

  function saveState() {
    safeSetItem(STORAGE_KEY, JSON.stringify(practiceState));
  }

  function isQuestionInWrongSet(q, rec) {
    if (!rec) return false;
    if (typeof rec.inWrongSet === 'boolean') {
      return rec.inWrongSet;
    }
    // Fallback for legacy records
    if (q.category === 'multiple') {
      const status = getMultiChoiceResultStatus(q, rec);
      return status === 'missed' || status === 'wrong';
    } else {
      return !rec.isCorrect;
    }
  }

  function getQuestionWrongCount(q, rec) {
    if (!rec) return 0;
    if (typeof rec.wrongCount === 'number') {
      return rec.wrongCount;
    }
    return isQuestionInWrongSet(q, rec) ? 1 : 0;
  }

  function getWrongQuestionsList(filterOverride) {
    const rawBank = window.QUESTION_BANK || [];
    const filter = filterOverride || practiceState.wrongFilter || 'all';

    const wrongList = rawBank.filter(q => {
      const rec = practiceState.answered[q.id];
      if (!isQuestionInWrongSet(q, rec)) return false;
      if (filter === 'single' && q.category !== 'single') return false;
      if (filter === 'multiple' && q.category !== 'multiple') return false;
      if (filter === 'tf' && q.category !== 'tf') return false;
      return true;
    });

    // 错题集练习模式：按收录时间顺序（从最早到最近）排序
    wrongList.sort((a, b) => {
      const recA = practiceState.answered[a.id];
      const recB = practiceState.answered[b.id];
      const timeA = recA && recA.timestamp ? recA.timestamp : 0;
      const timeB = recB && recB.timestamp ? recB.timestamp : 0;
      return timeA - timeB;
    });

    return wrongList;
  }

  function switchCategory(category) {
    practiceState.currentCategory = category;
    const wrongFilterBar = getEl('wrongFilterBar');
    const catTag = getEl('catTag');
    const catTabs = document.querySelectorAll('.cat-tab-btn');

    if (category === 'single') {
      currentList = bankSingle;
      if (catTag) catTag.textContent = '单选题';
      if (wrongFilterBar) wrongFilterBar.style.display = 'none';
    } else if (category === 'multiple') {
      currentList = bankMultiple;
      if (catTag) catTag.textContent = '多选题';
      if (wrongFilterBar) wrongFilterBar.style.display = 'none';
    } else if (category === 'tf') {
      currentList = bankTF;
      if (catTag) catTag.textContent = '判断题';
      if (wrongFilterBar) wrongFilterBar.style.display = 'none';
    } else if (category === 'wrong') {
      wrongReviewAnswered = {}; // Clear previous session answers so questions present clean for new practice
      currentList = getWrongQuestionsList();
      if (catTag) catTag.textContent = '错题集练习';
      if (wrongFilterBar) wrongFilterBar.style.display = 'flex';

      const wrongFilterBtns = document.querySelectorAll('.wrong-filter-btn');
      const activeFilter = practiceState.wrongFilter || 'all';
      wrongFilterBtns.forEach(btn => {
        if (btn.dataset.wrongCat === activeFilter) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });
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
    const jumpSelect = getEl('jumpSelect');
    if (!jumpSelect) return;
    jumpSelect.innerHTML = '';

    if (!currentList || currentList.length === 0) {
      const opt = document.createElement('option');
      opt.value = 0;
      opt.textContent = '暂无错题记录';
      jumpSelect.appendChild(opt);
      jumpSelect.value = 0;
      return;
    }

    currentList.forEach((q, idx) => {
      const opt = document.createElement('option');
      opt.value = idx;
      
      const record = practiceState.answered[q.id];
      let statusSymbol = '';
      if (record) {
        if (q.category === 'multiple') {
          const status = getMultiChoiceResultStatus(q, record);
          if (status === 'correct') statusSymbol = ' ✓';
          else if (status === 'missed') statusSymbol = ' ➖';
          else statusSymbol = ' ✗';
        } else {
          statusSymbol = record.isCorrect ? ' ✓' : ' ✗';
        }
      }

      if (practiceState.currentCategory === 'wrong') {
        let typeStr = q.category === 'single' ? '单选' : (q.category === 'multiple' ? '多选' : '判断');
        if (q.category === 'multiple') {
          const status = getMultiChoiceResultStatus(q, record);
          if (status === 'missed') typeStr = '多选漏选';
          else typeStr = '多选错选';
        }
        const wCount = getQuestionWrongCount(q, record);
        opt.textContent = `第 ${idx + 1} 题 [${typeStr}] (全库${q.id}题·已错${wCount}次)${statusSymbol}`;
      } else {
        opt.textContent = `第 ${idx + 1} 题 (全库${q.id}题)${statusSymbol}`;
      }
      jumpSelect.appendChild(opt);
    });
    jumpSelect.value = currentIndex;
  }

  /**
   * Helper to evaluate a multiple-choice question answer state:
   * - 'correct': All correct options selected, no wrong options selected (所有选项都选对)
   * - 'missed': Non-empty subset of correct options selected, no wrong options selected (选对其中若干个选项)
   * - 'wrong': At least one wrong option selected (选到了错误的选项)
   */
  function getMultiChoiceResultStatus(q, record) {
    if (!record || !record.userAns) return null;

    const correctArr = Array.isArray(q.answer)
      ? q.answer
      : (typeof q.answer === 'string' ? q.answer.split('') : []);
    const userArr = Array.isArray(record.userAns)
      ? record.userAns
      : (typeof record.userAns === 'string' ? record.userAns.split('') : []);

    const correctSet = new Set(correctArr);
    const userSet = new Set(userArr);

    if (userSet.size === 0) return null;

    let hasWrongChoice = false;
    let correctChoiceCount = 0;

    for (let opt of userSet) {
      if (correctSet.has(opt)) {
        correctChoiceCount++;
      } else {
        hasWrongChoice = true;
      }
    }

    if (hasWrongChoice) {
      return 'wrong';
    } else if (correctChoiceCount === correctSet.size && userSet.size === correctSet.size) {
      return 'correct';
    } else if (correctChoiceCount > 0 && correctChoiceCount < correctSet.size) {
      return 'missed';
    }

    return 'wrong';
  }

  function renderCurrentQuestion() {
    const indexTag = getEl('indexTag');
    const globalIndexTag = getEl('globalIndexTag');
    const catTag = getEl('catTag');
    const wrongCountTag = getEl('wrongCountTag');
    const wrongModeTag = getEl('wrongModeTag');
    const pTitle = getEl('pTitle');
    const pOptionsContainer = getEl('pOptionsContainer');
    const feedbackBanner = getEl('feedbackBanner');
    const multiSubmitWrapper = getEl('multiSubmitWrapper');
    const btnPrevPEl = getEl('btnPrevP');
    const btnNextPEl = getEl('btnNextP');
    const jumpSelect = getEl('jumpSelect');
    const btnToggleWrong = getEl('btnToggleWrong');

    if (practiceState.currentCategory === 'wrong' && (!currentList || currentList.length === 0)) {
      if (indexTag) indexTag.textContent = '第 0 / 0 题';
      if (globalIndexTag) globalIndexTag.textContent = '全库 0 错题';
      if (catTag) catTag.textContent = '错题集练习';
      if (wrongCountTag) wrongCountTag.style.display = 'none';
      if (wrongModeTag) wrongModeTag.style.display = 'none';
      if (btnToggleWrong) btnToggleWrong.style.display = 'none';

      if (pTitle) {
        pTitle.innerHTML = `
          <div style="text-align: center; padding: 40px 20px;">
            <i class="fa-solid fa-circle-check" style="font-size: 3.5rem; color: var(--success); margin-bottom: 16px;"></i>
            <h3 style="font-size: 1.25rem; font-weight: 700; color: var(--text-main);">🎉 太棒了！您当前没有错题</h3>
            <p style="font-size: 0.9rem; color: var(--text-muted); margin-top: 8px;">包含单选、多选（含漏选题）与判断题在内的所有已练题目均回答正确！</p>
          </div>
        `;
      }
      if (pOptionsContainer) pOptionsContainer.innerHTML = '';
      if (feedbackBanner) feedbackBanner.style.display = 'none';
      if (multiSubmitWrapper) multiSubmitWrapper.style.display = 'none';
      if (btnPrevPEl) btnPrevPEl.disabled = true;
      if (btnNextPEl) btnNextPEl.disabled = true;
      updateAllProgressDisplays();
      return;
    }

    if (!currentList || currentList.length === 0) return;

    const q = currentList[currentIndex];
    practiceState.categoryPositions[practiceState.currentCategory] = currentIndex;
    saveState();

    if (indexTag) indexTag.textContent = `第 ${currentIndex + 1} / ${currentList.length} 题`;
    if (globalIndexTag) globalIndexTag.textContent = `全库第 ${q.id} 题`;

    if (practiceState.currentCategory === 'wrong') {
      const typeLabel = q.category === 'single' ? '错题·单选' : (q.category === 'multiple' ? '错题·多选' : '错题·判断');
      if (catTag) catTag.textContent = typeLabel;
    }

    if (jumpSelect) jumpSelect.value = currentIndex;

    if (pTitle) pTitle.textContent = `${currentIndex + 1}. ${q.prompt}`;
    if (pOptionsContainer) pOptionsContainer.innerHTML = '';
    if (feedbackBanner) feedbackBanner.style.display = 'none';
    if (multiSubmitWrapper) multiSubmitWrapper.style.display = 'none';

    const record = practiceState.answered[q.id];
    const isWrongCategory = practiceState.currentCategory === 'wrong';

    let recordForRender = record;
    if (isWrongCategory && !wrongReviewAnswered[q.id]) {
      recordForRender = null;
    }

    const isAnswered = !!recordForRender;

    // Update Wrong Count Tag & Wrong Mode Tag
    const wrongCount = getQuestionWrongCount(q, record);
    
    if (wrongCountTag) {
      if (wrongCount > 0) {
        wrongCountTag.style.display = 'inline-flex';
        wrongCountTag.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> 累计做错 ${wrongCount} 次`;
      } else {
        wrongCountTag.style.display = 'none';
      }
    }

    if (wrongModeTag) {
      if (practiceState.currentCategory === 'wrong') {
        wrongModeTag.style.display = 'inline-flex';
      } else {
        wrongModeTag.style.display = 'none';
      }
    }

    // Update Toggle Wrong Collection Button State
    const inWrongSet = isQuestionInWrongSet(q, record);
    if (btnToggleWrong) {
      btnToggleWrong.style.display = 'inline-flex';
      if (inWrongSet) {
        btnToggleWrong.className = 'btn-toggle-wrong in-wrong-set';
        btnToggleWrong.innerHTML = '<i class="fa-solid fa-bookmark"></i> 已在错题集 (点击移出)';
      } else {
        btnToggleWrong.className = 'btn-toggle-wrong';
        btnToggleWrong.innerHTML = '<i class="fa-regular fa-bookmark"></i> 移入错题集';
      }
    }

    if (q.category === 'tf') {
      renderTFOptions(q, recordForRender);
    } else if (q.category === 'single') {
      renderSingleOptions(q, recordForRender);
    } else if (q.category === 'multiple') {
      renderMultipleOptions(q, recordForRender);
    }

    if (isAnswered) {
      showFeedbackBanner(q, record);
    }

    if (btnPrevPEl) btnPrevPEl.disabled = currentIndex === 0;
    if (btnNextPEl) btnNextPEl.disabled = currentIndex === currentList.length - 1;

    updateAllProgressDisplays();
  }

  function renderTFOptions(q, record) {
    const opts = ['正确', '错误'];
    const keys = ['A', 'B'];
    const pOptionsContainer = getEl('pOptionsContainer');
    if (!pOptionsContainer) return;

    opts.forEach((optText, i) => {
      const key = keys[i];
      const normalizedUserAns = record ? (record.userAns === '正确' ? 'A' : (record.userAns === '错误' ? 'B' : record.userAns)) : null;
      const normalizedCorrectAns = q.answer === '正确' ? 'A' : (q.answer === '错误' ? 'B' : q.answer);

      const isUserChoice = record && normalizedUserAns === key;
      const isCorrectChoice = normalizedCorrectAns === key;

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

      optEl.addEventListener('click', () => submitAnswer(q, key));

      pOptionsContainer.appendChild(optEl);
    });
  }

  function renderSingleOptions(q, record) {
    const labels = ['A', 'B', 'C', 'D', 'E'];
    const pOptionsContainer = getEl('pOptionsContainer');
    if (!pOptionsContainer) return;

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

      optEl.addEventListener('click', () => submitAnswer(q, key));

      pOptionsContainer.appendChild(optEl);
    });
  }

  function renderMultipleOptions(q, record) {
    const labels = ['A', 'B', 'C', 'D', 'E'];
    const pOptionsContainer = getEl('pOptionsContainer');
    const multiSubmitWrapper = getEl('multiSubmitWrapper');
    if (!pOptionsContainer) return;

    if (!record && multiSubmitWrapper) {
      tempMultiSelected = [];
      multiSubmitWrapper.style.display = 'flex';
    } else if (multiSubmitWrapper) {
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

      pOptionsContainer.appendChild(optEl);
    });
  }

  function submitAnswer(q, userAns) {
    let isCorrect = false;
    let status = 'wrong';

    if (q.category === 'multiple' || q.typeName === '多选题') {
      const correctSet = new Set(Array.isArray(q.answer) ? q.answer : [q.answer]);
      const userSet = new Set(Array.isArray(userAns) ? userAns : []);
      
      let equals = correctSet.size === userSet.size;
      if (equals) {
        for (let item of correctSet) {
          if (!userSet.has(item)) { equals = false; break; }
        }
      }
      isCorrect = equals;

      const tempRec = { userAns, isCorrect };
      status = getMultiChoiceResultStatus(q, tempRec);
    } else if (q.category === 'tf' || q.typeName === '判断题') {
      const normalizedUserAns = userAns === '正确' ? 'A' : (userAns === '错误' ? 'B' : userAns);
      const normalizedCorrectAns = q.answer === '正确' ? 'A' : (q.answer === '错误' ? 'B' : q.answer);
      isCorrect = normalizedUserAns === normalizedCorrectAns;
      status = isCorrect ? 'correct' : 'wrong';
    } else {
      isCorrect = userAns === q.answer;
      status = isCorrect ? 'correct' : 'wrong';
    }

    const prevRec = practiceState.answered[q.id];
    const prevWrongCount = getQuestionWrongCount(q, prevRec);

    const isAttemptWrong = (status !== 'correct');
    const newWrongCount = isAttemptWrong ? prevWrongCount + 1 : prevWrongCount;
    const inWrongSet = isAttemptWrong;

    practiceState.answered[q.id] = {
      userAns: userAns,
      isCorrect: isCorrect,
      status: status,
      wrongCount: newWrongCount,
      inWrongSet: inWrongSet,
      timestamp: Date.now()
    };

    if (practiceState.currentCategory === 'wrong') {
      wrongReviewAnswered[q.id] = true;
    }

    saveState();
    populateJumpSelect();
    renderCurrentQuestion();

    if (practiceState.cloudSyncKey) {
      triggerCloudUpload();
    }
  }

  function showFeedbackBanner(q, record) {
    const feedbackBanner = getEl('feedbackBanner');
    const feedbackStatusRow = getEl('feedbackStatusRow');

    if (!record) {
      if (feedbackBanner) feedbackBanner.style.display = 'none';
      return;
    }

    if (feedbackBanner) feedbackBanner.style.display = 'block';

    let userAnsStr = Array.isArray(record.userAns) ? record.userAns.join(', ') : (record.userAns || '未作答');
    let correctAnsStr = Array.isArray(q.answer) ? q.answer.join(', ') : q.answer;

    if (q.category === 'tf' || q.typeName === '判断题') {
      userAnsStr = record.userAns === 'A' ? 'A (正确)' : (record.userAns === 'B' ? 'B (错误)' : (record.userAns || '未作答'));
      correctAnsStr = q.answer === 'A' ? 'A (正确)' : (q.answer === 'B' ? 'B (错误)' : q.answer);
    }

    const wrongCount = getQuestionWrongCount(q, record);

    if (feedbackStatusRow) {
      if (q.category === 'multiple') {
        const status = getMultiChoiceResultStatus(q, record);
        if (status === 'correct') {
          if (feedbackBanner) feedbackBanner.className = 'feedback-banner correct';
          if (wrongCount > 0) {
            feedbackStatusRow.innerHTML = '<i class="fa-solid fa-circle-check"></i> 恭喜您，回答正确！（已从错题集中自动移除 🎉）';
          } else {
            feedbackStatusRow.innerHTML = '<i class="fa-solid fa-circle-check"></i> 恭喜您，回答正确！（所有选项均选对）';
          }
        } else if (status === 'missed') {
          if (feedbackBanner) feedbackBanner.className = 'feedback-banner missed';
          feedbackStatusRow.innerHTML = `<i class="fa-solid fa-circle-minus"></i> 漏选（选对了部分选项，未选错项 · 累计错 ${wrongCount} 次，保留在错题集中）`;
        } else {
          if (feedbackBanner) feedbackBanner.className = 'feedback-banner wrong';
          feedbackStatusRow.innerHTML = `<i class="fa-solid fa-circle-xmark"></i> 回答错误（选到了错误的选项 · 累计错 ${wrongCount} 次，保留在错题集中）`;
        }
      } else {
        if (record.isCorrect) {
          if (feedbackBanner) feedbackBanner.className = 'feedback-banner correct';
          if (wrongCount > 0) {
            feedbackStatusRow.innerHTML = '<i class="fa-solid fa-circle-check"></i> 恭喜您，回答正确！（已从错题集中自动移除 🎉）';
          } else {
            feedbackStatusRow.innerHTML = '<i class="fa-solid fa-circle-check"></i> 恭喜您，回答正确！';
          }
        } else {
          if (feedbackBanner) feedbackBanner.className = 'feedback-banner wrong';
          feedbackStatusRow.innerHTML = `<i class="fa-solid fa-circle-xmark"></i> 回答错误（已累计错 ${wrongCount} 次，保留在错题集中）`;
        }
      }
    }

    const userAnsValEl = getEl('userAnsVal');
    const correctAnsValEl = getEl('correctAnsVal');
    if (userAnsValEl) userAnsValEl.textContent = userAnsStr;
    if (correctAnsValEl) correctAnsValEl.textContent = correctAnsStr;
  }

  function updateAllProgressDisplays() {
    const singleFillEl = getEl('singleFill');
    const singleMetaEl = getEl('singleMeta');
    const multiFillEl = getEl('multiFill');
    const multiMetaEl = getEl('multiMeta');
    const tfFillEl = getEl('tfFill');
    const tfMetaEl = getEl('tfMeta');
    const totalProgressTextEl = getEl('totalProgressText');
    const totalAccuracyTextEl = getEl('totalAccuracyText');

    // Single Choice Tab Stats
    const singleAnsCount = bankSingle.filter(q => practiceState.answered[q.id]).length;
    const singlePct = ((singleAnsCount / 400) * 100).toFixed(1);
    if (singleFillEl) singleFillEl.style.width = `${singlePct}%`;
    if (singleMetaEl) singleMetaEl.textContent = `已练 ${singleAnsCount} / 400 (${singlePct}%)`;

    let singleCorrectCount = 0;
    let singleWrongCount = 0;
    bankSingle.forEach(q => {
      const rec = practiceState.answered[q.id];
      if (rec) {
        if (rec.isCorrect) singleCorrectCount++;
        else singleWrongCount++;
      }
    });
    const singleCorrectPct = singleAnsCount > 0 ? ((singleCorrectCount / singleAnsCount) * 100).toFixed(1) : '0.0';
    const singleWrongPct = singleAnsCount > 0 ? ((singleWrongCount / singleAnsCount) * 100).toFixed(1) : '0.0';
    const singleCorrectEl = getEl('singleCorrectText');
    const singleWrongEl = getEl('singleWrongText');
    if (singleCorrectEl) singleCorrectEl.textContent = `${singleCorrectCount} (${singleCorrectPct}%)`;
    if (singleWrongEl) singleWrongEl.textContent = `${singleWrongCount} (${singleWrongPct}%)`;

    // Multiple Choice Tab Stats (正确, 漏选, 错误)
    const multiAnsCount = bankMultiple.filter(q => practiceState.answered[q.id]).length;
    const multiPct = ((multiAnsCount / 200) * 100).toFixed(1);
    if (multiFillEl) multiFillEl.style.width = `${multiPct}%`;
    if (multiMetaEl) multiMetaEl.textContent = `已练 ${multiAnsCount} / 200 (${multiPct}%)`;

    let multiCorrectCount = 0;
    let multiMissedCount = 0;
    let multiWrongCount = 0;

    bankMultiple.forEach(q => {
      const rec = practiceState.answered[q.id];
      if (rec) {
        const status = getMultiChoiceResultStatus(q, rec);
        if (status === 'correct') multiCorrectCount++;
        else if (status === 'missed') multiMissedCount++;
        else if (status === 'wrong') multiWrongCount++;
      }
    });

    const multiCorrectPct = multiAnsCount > 0 ? ((multiCorrectCount / multiAnsCount) * 100).toFixed(1) : '0.0';
    const multiMissedPct = multiAnsCount > 0 ? ((multiMissedCount / multiAnsCount) * 100).toFixed(1) : '0.0';
    const multiWrongPct = multiAnsCount > 0 ? ((multiWrongCount / multiAnsCount) * 100).toFixed(1) : '0.0';

    const multiCorrectEl = getEl('multiCorrectText');
    const multiMissedEl = getEl('multiMissedText');
    const multiWrongEl = getEl('multiWrongText');
    if (multiCorrectEl) multiCorrectEl.textContent = `${multiCorrectCount} (${multiCorrectPct}%)`;
    if (multiMissedEl) multiMissedEl.textContent = `${multiMissedCount} (${multiMissedPct}%)`;
    if (multiWrongEl) multiWrongEl.textContent = `${multiWrongCount} (${multiWrongPct}%)`;

    // TF Choice Tab Stats
    const tfAnsCount = bankTF.filter(q => practiceState.answered[q.id]).length;
    const tfPct = ((tfAnsCount / 400) * 100).toFixed(1);
    if (tfFillEl) tfFillEl.style.width = `${tfPct}%`;
    if (tfMetaEl) tfMetaEl.textContent = `已练 ${tfAnsCount} / 400 (${tfPct}%)`;

    let tfCorrectCount = 0;
    let tfWrongCount = 0;
    bankTF.forEach(q => {
      const rec = practiceState.answered[q.id];
      if (rec) {
        if (rec.isCorrect) tfCorrectCount++;
        else tfWrongCount++;
      }
    });
    const tfCorrectPct = tfAnsCount > 0 ? ((tfCorrectCount / tfAnsCount) * 100).toFixed(1) : '0.0';
    const tfWrongPct = tfAnsCount > 0 ? ((tfWrongCount / tfAnsCount) * 100).toFixed(1) : '0.0';
    const tfCorrectEl = getEl('tfCorrectText');
    const tfWrongEl = getEl('tfWrongText');
    if (tfCorrectEl) tfCorrectEl.textContent = `${tfCorrectCount} (${tfCorrectPct}%)`;
    if (tfWrongEl) tfWrongEl.textContent = `${tfWrongCount} (${tfWrongPct}%)`;

    // Wrong Questions Tab Stats (错题集) & Filter Badges
    const allWrongList = getWrongQuestionsList('all');
    const singleWrongList = getWrongQuestionsList('single');
    const multiWrongList = getWrongQuestionsList('multiple');
    const tfWrongList = getWrongQuestionsList('tf');

    const wrongCount = allWrongList.length;
    const totalAnsCount = Object.keys(practiceState.answered).length;
    const wrongPct = totalAnsCount > 0 ? ((wrongCount / totalAnsCount) * 100).toFixed(1) : '0.0';

    const wrongTotalCountEl = getEl('wrongTotalCount');
    const wrongMetaPctEl = getEl('wrongMetaPct');
    const wrongBadgeTextEl = getEl('wrongBadgeText');
    const wrongFillEl = getEl('wrongFill');

    if (wrongTotalCountEl) wrongTotalCountEl.textContent = wrongCount;
    if (wrongMetaPctEl) wrongMetaPctEl.textContent = `${wrongPct}%`;
    if (wrongBadgeTextEl) wrongBadgeTextEl.textContent = `${wrongCount} 题`;
    if (wrongFillEl) wrongFillEl.style.width = `${Math.min(wrongPct, 100)}%`;

    // Filter button count badges
    const wrongCountAllEl = getEl('wrongCountAll');
    const wrongCountSingleEl = getEl('wrongCountSingle');
    const wrongCountMultipleEl = getEl('wrongCountMultiple');
    const wrongCountTFEl = getEl('wrongCountTF');

    if (wrongCountAllEl) wrongCountAllEl.textContent = allWrongList.length;
    if (wrongCountSingleEl) wrongCountSingleEl.textContent = singleWrongList.length;
    if (wrongCountMultipleEl) wrongCountMultipleEl.textContent = multiWrongList.length;
    if (wrongCountTFEl) wrongCountTFEl.textContent = tfWrongList.length;

    // Overall Progress & Accuracy
    const totalPct = ((totalAnsCount / 1000) * 100).toFixed(1);
    if (totalProgressTextEl) totalProgressTextEl.textContent = `${totalAnsCount} / 1000 (${totalPct}%)`;

    let correctTotal = 0;
    Object.values(practiceState.answered).forEach(rec => {
      if (rec.isCorrect) correctTotal++;
    });

    const accuracyPct = totalAnsCount > 0 ? ((correctTotal / totalAnsCount) * 100).toFixed(1) : '0';
    if (totalAccuracyTextEl) totalAccuracyTextEl.textContent = `${accuracyPct}%`;
  }

  // ==================== MULTI-DEVICE SYNC ENGINE ====================

  // Safe Unicode Base64 Encoding & Decoding Helpers
  function safeBase64Encode(str) {
    try {
      return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (match, p1) => {
        return String.fromCharCode('0x' + p1);
      }));
    } catch (e) {
      return btoa(str);
    }
  }

  function safeBase64Decode(str) {
    try {
      return decodeURIComponent(Array.prototype.map.call(atob(str), (c) => {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));
    } catch (e) {
      try {
        return decodeURIComponent(atob(str));
      } catch (e2) {
        return atob(str);
      }
    }
  }

  function encodeProgressState() {
    const isResetState = Object.keys(practiceState.answered).length === 0;
    if (isResetState) {
      return 'BPRAC_RESET';
    }

    // Convert answered into super-compact format: { 1: "C", 401: "AB" }
    const compactAns = {};
    if (practiceState.answered) {
      Object.keys(practiceState.answered).forEach(qId => {
        const item = practiceState.answered[qId];
        if (item && item.ans !== undefined) {
          compactAns[qId] = Array.isArray(item.ans) ? item.ans.join('') : String(item.ans);
        }
      });
    }

    const payload = {
      v: 2,
      p: [
        practiceState.categoryPositions.single || 0,
        practiceState.categoryPositions.multiple || 0,
        practiceState.categoryPositions.tf || 0,
        practiceState.categoryPositions.wrong || 0
      ],
      a: compactAns
    };

    return 'BPRAC2_' + safeBase64Encode(JSON.stringify(payload));
  }

  function decodeProgressState(codeStr) {
    if (!codeStr) return null;
    let clean = codeStr.trim().replace(/\s+/g, '');

    if (clean === 'BPRAC_RESET') {
      return { isReset: true, answered: {}, positions: { single: 0, multiple: 0, tf: 0, wrong: 0 } };
    }

    // Strip prefix if any (e.g. BPRAC2_, BPRAC1_, BPRAC_)
    let payloadStr = clean;
    if (clean.includes('_')) {
      payloadStr = clean.substring(clean.indexOf('_') + 1);
    }

    let parsed = null;

    // Try 1: safeBase64Decode
    try {
      const raw = safeBase64Decode(payloadStr);
      parsed = JSON.parse(raw);
    } catch (e) {}

    // Try 2: decodeURIComponent(atob)
    if (!parsed) {
      try {
        const raw = decodeURIComponent(atob(payloadStr));
        parsed = JSON.parse(raw);
      } catch (e) {}
    }

    // Try 3: direct atob
    if (!parsed) {
      try {
        const raw = atob(payloadStr);
        parsed = JSON.parse(raw);
      } catch (e) {}
    }

    // Try 4: raw codeStr JSON
    if (!parsed) {
      try {
        parsed = JSON.parse(codeStr.trim());
      } catch (e) {}
    }

    if (!parsed || typeof parsed !== 'object') return null;

    // If parsed is in compact format v=2:
    if (parsed.v === 2 && parsed.a) {
      const rawBankMap = {};
      (window.QUESTION_BANK || []).forEach(q => { rawBankMap[q.id] = q; });

      const answeredObj = {};
      Object.keys(parsed.a).forEach(qId => {
        const val = parsed.a[qId];
        const q = rawBankMap[qId];
        let isRight = false;
        let ansVal = val;

        if (q) {
          if (q.category === 'multiple') {
            ansVal = typeof val === 'string' ? val.split('').sort() : val;
            const targetAnsStr = Array.isArray(q.answer) ? q.answer.join('') : String(q.answer);
            isRight = (Array.isArray(ansVal) ? ansVal.join('') : String(ansVal)) === targetAnsStr;
          } else {
            isRight = val === q.answer;
          }
        }

        answeredObj[qId] = {
          userAns: ansVal,
          ans: ansVal,
          isCorrect: isRight,
          isRight: isRight,
          timestamp: Date.now()
        };
      });

      return {
        answered: answeredObj,
        positions: {
          single: parsed.p ? parsed.p[0] : 0,
          multiple: parsed.p ? parsed.p[1] : 0,
          tf: parsed.p ? parsed.p[2] : 0,
          wrong: parsed.p ? parsed.p[3] : 0
        }
      };
    }

    // If parsed is in standard format (answered, positions):
    if (parsed.answered || parsed.positions) {
      return parsed;
    }

    return null;
  }

  function mergeProgressData(incoming) {
    if (!incoming || typeof incoming !== 'object') return false;

    // Check if incoming code is an explicit RESET command
    if (incoming.isReset && Object.keys(incoming.answered || {}).length === 0) {
      if (confirm('⚠️ 检测到导入的暗号为【清空/重置进度】指令！\n确定要将本设备的练习进度也同步清空重置吗？')) {
        practiceState.answered = {};
        practiceState.categoryPositions = { single: 0, multiple: 0, tf: 0, wrong: 0 };
        saveState();
        switchCategory('single');
        updateAllProgressDisplays();
        return true;
      }
      return false;
    }
    
    if (incoming.answered) {
      Object.keys(incoming.answered).forEach(qId => {
        const item = incoming.answered[qId];
        const userAnsVal = item.userAns !== undefined ? item.userAns : item.ans;
        const isCorrectVal = item.isCorrect !== undefined ? item.isCorrect : (item.isRight !== undefined ? item.isRight : false);

        practiceState.answered[qId] = {
          userAns: userAnsVal,
          ans: userAnsVal,
          isCorrect: isCorrectVal,
          isRight: isCorrectVal,
          timestamp: item.timestamp || Date.now()
        };
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
        // try next
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
    const catTabs = document.querySelectorAll('.cat-tab-btn');
    catTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        switchCategory(tab.dataset.cat);
      });
    });

    const wrongFilterBtns = document.querySelectorAll('.wrong-filter-btn');
    wrongFilterBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const filterCat = btn.dataset.wrongCat;
        practiceState.wrongFilter = filterCat;

        wrongFilterBtns.forEach(b => {
          if (b.dataset.wrongCat === filterCat) {
            b.classList.add('active');
          } else {
            b.classList.remove('active');
          }
        });

        if (practiceState.currentCategory === 'wrong') {
          currentList = getWrongQuestionsList();
          currentIndex = 0;
          populateJumpSelect();
          renderCurrentQuestion();
          saveState();
        }
      });
    });

    const btnToggleWrong = getEl('btnToggleWrong');
    if (btnToggleWrong) {
      btnToggleWrong.addEventListener('click', () => {
        if (!currentList || currentList.length === 0) return;
        const q = currentList[currentIndex];
        if (!q) return;

        let rec = practiceState.answered[q.id];
        const currentlyInWrong = isQuestionInWrongSet(q, rec);

        if (currentlyInWrong) {
          if (!rec) {
            rec = { userAns: null, isCorrect: true, inWrongSet: false, wrongCount: 0, timestamp: Date.now() };
            practiceState.answered[q.id] = rec;
          } else {
            rec.inWrongSet = false;
          }
          saveState();

          if (practiceState.currentCategory === 'wrong') {
            currentList = getWrongQuestionsList();
            if (currentIndex >= currentList.length) currentIndex = currentList.length - 1;
            if (currentIndex < 0) currentIndex = 0;
            populateJumpSelect();
            renderCurrentQuestion();
          } else {
            renderCurrentQuestion();
          }
          updateAllProgressDisplays();
        } else {
          if (!rec) {
            rec = { userAns: null, isCorrect: false, inWrongSet: true, wrongCount: 1, timestamp: Date.now() };
            practiceState.answered[q.id] = rec;
          } else {
            rec.inWrongSet = true;
            if (typeof rec.wrongCount !== 'number' || rec.wrongCount < 1) {
              rec.wrongCount = 1;
            }
            rec.timestamp = Date.now();
          }
          saveState();
          renderCurrentQuestion();
          updateAllProgressDisplays();
        }
      });
    }

    const jumpSelect = getEl('jumpSelect');
    if (jumpSelect) {
      jumpSelect.addEventListener('change', (e) => {
        currentIndex = parseInt(e.target.value, 10);
        renderCurrentQuestion();
      });
    }

    const btnPrevP = getEl('btnPrevP');
    if (btnPrevP) {
      btnPrevP.addEventListener('click', () => {
        if (currentIndex > 0) {
          currentIndex--;
          renderCurrentQuestion();
        }
      });
    }

    const btnNextP = getEl('btnNextP');
    if (btnNextP) {
      btnNextP.addEventListener('click', () => {
        if (currentIndex < currentList.length - 1) {
          currentIndex++;
          renderCurrentQuestion();
        }
      });
    }

    const btnReAnswer = getEl('btnReAnswer');
    if (btnReAnswer) {
      btnReAnswer.addEventListener('click', () => {
        const q = currentList[currentIndex];
        if (q) {
          delete practiceState.answered[q.id];
          delete wrongReviewAnswered[q.id];
          saveState();
          populateJumpSelect();
          renderCurrentQuestion();
        }
      });
    }

    const btnSubmitMulti = getEl('btnSubmitMulti');
    if (btnSubmitMulti) {
      btnSubmitMulti.addEventListener('click', () => {
        const q = currentList[currentIndex];
        if (!q) return;
        if (tempMultiSelected.length === 0) {
          alert('请至少选择一个选项后再提交！');
          return;
        }
        submitAnswer(q, tempMultiSelected);
      });
    }

    const btnResetProgress = getEl('btnResetProgress');
    if (btnResetProgress) {
      btnResetProgress.addEventListener('click', () => {
        if (confirm('确定要清空所有练习进度、错题集与作答记录吗？此操作无法撤销。')) {
          practiceState.answered = {};
          practiceState.categoryPositions = { single: 0, multiple: 0, tf: 0, wrong: 0 };
          saveState();
          switchCategory('single');
          updateAllProgressDisplays();
        }
      });
    }

    // Sync Modal Listeners
    const btnSyncModal = getEl('btnSyncModal');
    const btnCloseSync = getEl('btnCloseSync');
    const syncModal = getEl('syncModal');
    const btnShareSyncLink = getEl('btnShareSyncLink');
    const btnShowQrCode = getEl('btnShowQrCode');
    const qrCodeContainer = getEl('qrCodeContainer');
    const qrCodeImg = getEl('qrCodeImg');
    const importCodeInput = getEl('importCodeInput');
    const btnConfirmImportPaste = getEl('btnConfirmImportPaste');
    const btnCloudSyncNow = getEl('btnCloudSyncNow');
    const btnExportCode = getEl('btnExportCode');
    const cloudSyncKeyInput = getEl('cloudSyncKey');

    async function tryAutoFillImportInput() {
      if (!importCodeInput) return;
      if (navigator.clipboard && navigator.clipboard.readText) {
        try {
          const clipText = await navigator.clipboard.readText();
          const extracted = extractSyncCodeFromAnyInput(clipText);
          if (extracted && (extracted.startsWith('BPRAC') || extracted.includes('"v":2'))) {
            importCodeInput.value = clipText;
          }
        } catch (e) {}
      }
    }

    if (btnShareSyncLink) {
      btnShareSyncLink.addEventListener('click', () => {
        const code = encodeProgressState();
        const baseUrl = window.location.protocol + '//' + window.location.host + window.location.pathname;
        const shareUrl = `${baseUrl}?sync=${encodeURIComponent(code)}`;

        const exportBox = getEl('exportResultBox');
        const exportArea = getEl('exportTextarea');
        const exportTitle = getEl('exportResultTitle');

        if (exportArea && exportBox) {
          exportArea.value = shareUrl;
          exportBox.style.display = 'block';
        }

        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(shareUrl).then(() => {
            if (exportTitle) exportTitle.textContent = '✅ 一键同步超链接已复制到剪贴板！亦可点击下方框全选复制：';
            alert('✅ 一键同步超链接已复制！\n发到微信/QQ，在手机上点击链接即可一键自动同步进度（零复制零粘贴）！');
          }).catch(() => {
            if (exportTitle) exportTitle.textContent = '⚠️ 浏览器拦截了自动复制，请点击下方框【全选复制链接】：';
          });
        } else {
          if (exportTitle) exportTitle.textContent = '⚠️ 请点击下方文本框【全选复制】一键链接：';
        }
      });
    }

    if (btnShowQrCode) {
      btnShowQrCode.addEventListener('click', () => {
        const code = encodeProgressState();
        const baseUrl = window.location.protocol + '//' + window.location.host + window.location.pathname;
        const shareUrl = `${baseUrl}?sync=${encodeURIComponent(code)}`;
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(shareUrl)}`;

        if (qrCodeImg && qrCodeContainer) {
          qrCodeImg.src = qrUrl;
          qrCodeContainer.style.display = qrCodeContainer.style.display === 'none' ? 'block' : 'none';
        }
      });
    }

    if (btnSyncModal) {
      btnSyncModal.addEventListener('click', () => {
        if (syncModal) syncModal.classList.add('active');
        tryAutoFillImportInput();
      });
    }

    if (btnCloseSync) {
      btnCloseSync.addEventListener('click', () => {
        if (syncModal) syncModal.classList.remove('active');
      });
    }

    if (importCodeInput) {
      importCodeInput.addEventListener('focus', tryAutoFillImportInput);
    }

    if (btnConfirmImportPaste) {
      btnConfirmImportPaste.addEventListener('click', () => {
        const raw = importCodeInput ? importCodeInput.value : '';
        const cleanCode = extractSyncCodeFromAnyInput(raw);
        if (!cleanCode) {
          alert('请先在输入框中粘贴您复制的暗号口令或一键链接！');
          return;
        }

        const decoded = decodeProgressState(cleanCode);
        if (decoded && mergeProgressData(decoded)) {
          alert('🎉 成功导入进度！所有做答与错题记录已全量更新。');
          if (syncModal) syncModal.classList.remove('active');
        } else {
          alert('❌ 暗号/链接格式无效，请确认复制了完整的暗号或链接后再试！');
        }
      });
    }

    if (btnCloudSyncNow) {
      btnCloudSyncNow.addEventListener('click', () => {
        const key = cloudSyncKeyInput ? cloudSyncKeyInput.value.trim() : '';
        if (!key) {
          alert('请输入您的专属暗号！');
          return;
        }
        practiceState.cloudSyncKey = key;
        saveState();
        autoCloudSync();
      });
    }

    if (btnExportCode) {
      btnExportCode.addEventListener('click', () => {
        const code = encodeProgressState();
        const exportBox = getEl('exportResultBox');
        const exportArea = getEl('exportTextarea');
        const exportTitle = getEl('exportResultTitle');

        if (exportArea && exportBox) {
          exportArea.value = code;
          exportBox.style.display = 'block';
        }

        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(code).then(() => {
            if (exportTitle) exportTitle.textContent = '✅ 进度暗号已复制到剪贴板！亦可点击下方框全选复制：';
            alert('✅ 进度暗号已复制到剪贴板！\n如自动复制失败，弹窗下方已为您提供全选复制框。');
          }).catch(() => {
            if (exportTitle) exportTitle.textContent = '⚠️ 浏览器拦截了自动复制，请点击下方框【全选复制】：';
          });
        } else {
          if (exportTitle) exportTitle.textContent = '⚠️ 请点击下方文本框【全选复制】您的暗号：';
        }
      });
    }
  }

})();
