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

  // Multi-choice temporary selected options & wrong review session state
  let tempMultiSelected = [];
  let wrongReviewAnswered = {};

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

  function getWrongQuestionsList() {
    const rawBank = window.QUESTION_BANK || [];
    const wrongList = rawBank.filter(q => {
      const rec = practiceState.answered[q.id];
      return isQuestionInWrongSet(q, rec);
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
    
    if (category === 'single') {
      currentList = bankSingle;
      catTag.textContent = '单选题';
    } else if (category === 'multiple') {
      currentList = bankMultiple;
      catTag.textContent = '多选题';
    } else if (category === 'tf') {
      currentList = bankTF;
      catTag.textContent = '判断题';
    } else if (category === 'wrong') {
      wrongReviewAnswered = {}; // Clear previous session answers so questions present clean for new practice
      currentList = getWrongQuestionsList();
      catTag.textContent = '错题集练习';
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
    if (practiceState.currentCategory === 'wrong' && (!currentList || currentList.length === 0)) {
      indexTag.textContent = '第 0 / 0 题';
      globalIndexTag.textContent = '全库 0 错题';
      catTag.textContent = '错题集练习';
      const wrongCountTag = document.getElementById('wrongCountTag');
      if (wrongCountTag) wrongCountTag.style.display = 'none';
      const wrongModeTag = document.getElementById('wrongModeTag');
      if (wrongModeTag) wrongModeTag.style.display = 'none';

      pTitle.innerHTML = `
        <div style="text-align: center; padding: 40px 20px;">
          <i class="fa-solid fa-circle-check" style="font-size: 3.5rem; color: var(--success); margin-bottom: 16px;"></i>
          <h3 style="font-size: 1.25rem; font-weight: 700; color: var(--text-main);">🎉 太棒了！您当前没有错题</h3>
          <p style="font-size: 0.9rem; color: var(--text-muted); margin-top: 8px;">包含单选、多选（含漏选题）与判断题在内的所有已练题目均回答正确！</p>
        </div>
      `;
      pOptionsContainer.innerHTML = '';
      feedbackBanner.style.display = 'none';
      multiSubmitWrapper.style.display = 'none';
      btnPrevP.disabled = true;
      btnNextP.disabled = true;
      updateAllProgressDisplays();
      return;
    }

    if (!currentList || currentList.length === 0) return;

    const q = currentList[currentIndex];
    practiceState.categoryPositions[practiceState.currentCategory] = currentIndex;
    saveState();

    indexTag.textContent = `第 ${currentIndex + 1} / ${currentList.length} 题`;
    globalIndexTag.textContent = `全库第 ${q.id} 题`;

    if (practiceState.currentCategory === 'wrong') {
      const typeLabel = q.category === 'single' ? '错题·单选' : (q.category === 'multiple' ? '错题·多选' : '错题·判断');
      catTag.textContent = typeLabel;
    }

    jumpSelect.value = currentIndex;

    pTitle.textContent = `${currentIndex + 1}. ${q.prompt}`;
    pOptionsContainer.innerHTML = '';
    feedbackBanner.style.display = 'none';
    multiSubmitWrapper.style.display = 'none';

    const record = practiceState.answered[q.id];
    const isWrongCategory = practiceState.currentCategory === 'wrong';

    // In wrong category review mode, present options clean (unanswered) until user submits an answer in this review session
    let recordForRender = record;
    if (isWrongCategory && !wrongReviewAnswered[q.id]) {
      recordForRender = null;
    }

    const isAnswered = !!recordForRender;

    // Update Wrong Count Tag & Wrong Mode Tag
    const wrongCountTag = document.getElementById('wrongCountTag');
    const wrongModeTag = document.getElementById('wrongModeTag');
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
    let status = 'wrong';

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

      const tempRec = { userAns, isCorrect };
      status = getMultiChoiceResultStatus(q, tempRec);
    } else {
      isCorrect = userAns === q.answer;
      status = isCorrect ? 'correct' : 'wrong';
    }

    const prevRec = practiceState.answered[q.id];
    const prevWrongCount = getQuestionWrongCount(q, prevRec);

    const isAttemptWrong = (status !== 'correct');
    const newWrongCount = isAttemptWrong ? prevWrongCount + 1 : prevWrongCount;
    // If user gets it 100% correct, inWrongSet becomes false (automatically removed from wrong set!)
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
    feedbackBanner.style.display = 'block';

    const userAnsStr = Array.isArray(record.userAns) ? record.userAns.join(', ') : (record.userAns || '未作答');
    const correctAnsStr = Array.isArray(q.answer) ? q.answer.join(', ') : q.answer;
    const wrongCount = getQuestionWrongCount(q, record);

    if (q.category === 'multiple') {
      const status = getMultiChoiceResultStatus(q, record);
      if (status === 'correct') {
        feedbackBanner.className = 'feedback-banner correct';
        if (wrongCount > 0) {
          feedbackStatusRow.innerHTML = '<i class="fa-solid fa-circle-check"></i> 恭喜您，回答正确！（已从错题集中自动移除 🎉）';
        } else {
          feedbackStatusRow.innerHTML = '<i class="fa-solid fa-circle-check"></i> 恭喜您，回答正确！（所有选项均选对）';
        }
      } else if (status === 'missed') {
        feedbackBanner.className = 'feedback-banner missed';
        feedbackStatusRow.innerHTML = `<i class="fa-solid fa-circle-minus"></i> 漏选（选对了部分选项，未选错项 · 累计错 ${wrongCount} 次，保留在错题集中）`;
      } else {
        feedbackBanner.className = 'feedback-banner wrong';
        feedbackStatusRow.innerHTML = `<i class="fa-solid fa-circle-xmark"></i> 回答错误（选到了错误的选项 · 累计错 ${wrongCount} 次，保留在错题集中）`;
      }
    } else {
      if (record.isCorrect) {
        feedbackBanner.className = 'feedback-banner correct';
        if (wrongCount > 0) {
          feedbackStatusRow.innerHTML = '<i class="fa-solid fa-circle-check"></i> 恭喜您，回答正确！（已从错题集中自动移除 🎉）';
        } else {
          feedbackStatusRow.innerHTML = '<i class="fa-solid fa-circle-check"></i> 恭喜您，回答正确！';
        }
      } else {
        feedbackBanner.className = 'feedback-banner wrong';
        feedbackStatusRow.innerHTML = `<i class="fa-solid fa-circle-xmark"></i> 回答错误（已累计错 ${wrongCount} 次，保留在错题集中）`;
      }
    }

    userAnsVal.textContent = userAnsStr;
    correctAnsVal.textContent = correctAnsStr;
  }

  function updateAllProgressDisplays() {
    // Single Choice Tab Stats
    const singleAnsCount = bankSingle.filter(q => practiceState.answered[q.id]).length;
    const singlePct = ((singleAnsCount / 400) * 100).toFixed(1);
    singleFill.style.width = `${singlePct}%`;
    singleMeta.textContent = `已练 ${singleAnsCount} / 400 (${singlePct}%)`;

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
    const singleCorrectEl = document.getElementById('singleCorrectText');
    const singleWrongEl = document.getElementById('singleWrongText');
    if (singleCorrectEl) singleCorrectEl.textContent = `${singleCorrectCount} (${singleCorrectPct}%)`;
    if (singleWrongEl) singleWrongEl.textContent = `${singleWrongCount} (${singleWrongPct}%)`;

    // Multiple Choice Tab Stats (正确, 漏选, 错误)
    const multiAnsCount = bankMultiple.filter(q => practiceState.answered[q.id]).length;
    const multiPct = ((multiAnsCount / 200) * 100).toFixed(1);
    multiFill.style.width = `${multiPct}%`;
    multiMeta.textContent = `已练 ${multiAnsCount} / 200 (${multiPct}%)`;

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

    const multiCorrectEl = document.getElementById('multiCorrectText');
    const multiMissedEl = document.getElementById('multiMissedText');
    const multiWrongEl = document.getElementById('multiWrongText');
    if (multiCorrectEl) multiCorrectEl.textContent = `${multiCorrectCount} (${multiCorrectPct}%)`;
    if (multiMissedEl) multiMissedEl.textContent = `${multiMissedCount} (${multiMissedPct}%)`;
    if (multiWrongEl) multiWrongEl.textContent = `${multiWrongCount} (${multiWrongPct}%)`;

    // TF Choice Tab Stats
    const tfAnsCount = bankTF.filter(q => practiceState.answered[q.id]).length;
    const tfPct = ((tfAnsCount / 400) * 100).toFixed(1);
    tfFill.style.width = `${tfPct}%`;
    tfMeta.textContent = `已练 ${tfAnsCount} / 400 (${tfPct}%)`;

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
    const tfCorrectEl = document.getElementById('tfCorrectText');
    const tfWrongEl = document.getElementById('tfWrongText');
    if (tfCorrectEl) tfCorrectEl.textContent = `${tfCorrectCount} (${tfCorrectPct}%)`;
    if (tfWrongEl) tfWrongEl.textContent = `${tfWrongCount} (${tfWrongPct}%)`;

    // Wrong Questions Tab Stats (错题集)
    const wrongList = getWrongQuestionsList();
    const wrongCount = wrongList.length;
    const totalAnsCount = Object.keys(practiceState.answered).length;
    const wrongPct = totalAnsCount > 0 ? ((wrongCount / totalAnsCount) * 100).toFixed(1) : '0.0';

    const wrongTotalCountEl = document.getElementById('wrongTotalCount');
    const wrongMetaPctEl = document.getElementById('wrongMetaPct');
    const wrongBadgeTextEl = document.getElementById('wrongBadgeText');
    const wrongFillEl = document.getElementById('wrongFill');

    if (wrongTotalCountEl) wrongTotalCountEl.textContent = wrongCount;
    if (wrongMetaPctEl) wrongMetaPctEl.textContent = `${wrongPct}%`;
    if (wrongBadgeTextEl) wrongBadgeTextEl.textContent = `${wrongCount} 题`;
    if (wrongFillEl) wrongFillEl.style.width = `${Math.min(wrongPct, 100)}%`;

    // Overall Progress & Accuracy
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
    const isResetState = Object.keys(practiceState.answered).length === 0;
    const data = {
      answered: practiceState.answered,
      positions: practiceState.categoryPositions,
      isReset: isResetState
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
      delete wrongReviewAnswered[q.id];
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
      if (confirm('确定要清空所有练习进度、错题集与作答记录吗？此操作无法撤销。')) {
        practiceState.answered = {};
        practiceState.categoryPositions = { single: 0, multiple: 0, tf: 0, wrong: 0 };
        saveState();
        switchCategory('single');
        updateAllProgressDisplays();

        // Prompt to export reset code to reset other devices too
        if (confirm('已清空本设备进度！是否复制【重置暗号】到剪贴板，以便去其他设备同步清空？')) {
          const resetCode = encodeProgressState();
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(resetCode);
            alert('✅ 重置暗号已复制！去其他设备点击【粘贴暗号导入进度】即可同步清空该设备。');
          }
        }
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

    btnImportCode.addEventListener('click', () => {
      const inputCode = prompt('请粘贴您在其他设备上复制的进度暗号：');
      if (inputCode) {
        const decoded = decodeProgressState(inputCode);
        if (decoded && mergeProgressData(decoded)) {
          alert('🎉 成功同步进度！');
          syncModal.classList.remove('active');
        } else if (!decoded) {
          alert('❌ 暗号格式无效，请重新复制后再试！');
        }
      }
    });
  }

})();
