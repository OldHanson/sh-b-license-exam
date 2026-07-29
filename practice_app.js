/**
 * Project Leader B License - Sequential Practice System JavaScript Logic
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
    }
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
            categoryPositions: parsed.categoryPositions || { single: 0, multiple: 0, tf: 0 }
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

    // Set position to saved index for this category
    currentIndex = practiceState.categoryPositions[category] || 0;
    if (currentIndex >= currentList.length) currentIndex = currentList.length - 1;
    if (currentIndex < 0) currentIndex = 0;

    // Update Tab UI active state
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

    // Navigation buttons
    btnPrevP.disabled = currentIndex === 0;
    btnNextP.disabled = currentIndex === currentList.length - 1;

    updateAllProgressDisplays();
  }

  // Render True/False Options
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

  // Render Single Choice Options
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

  // Render Multiple Choice Options
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

  // Submit Answer Logic
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

  // Update All Progress Displays
  function updateAllProgressDisplays() {
    // Single category progress
    const singleAnsCount = bankSingle.filter(q => practiceState.answered[q.id]).length;
    const singlePct = ((singleAnsCount / 400) * 100).toFixed(1);
    singleFill.style.width = `${singlePct}%`;
    singleMeta.textContent = `已练 ${singleAnsCount} / 400 (${singlePct}%)`;

    // Multiple category progress
    const multiAnsCount = bankMultiple.filter(q => practiceState.answered[q.id]).length;
    const multiPct = ((multiAnsCount / 200) * 100).toFixed(1);
    multiFill.style.width = `${multiPct}%`;
    multiMeta.textContent = `已练 ${multiAnsCount} / 200 (${multiPct}%)`;

    // TF category progress
    const tfAnsCount = bankTF.filter(q => practiceState.answered[q.id]).length;
    const tfPct = ((tfAnsCount / 400) * 100).toFixed(1);
    tfFill.style.width = `${tfPct}%`;
    tfMeta.textContent = `已练 ${tfAnsCount} / 400 (${tfPct}%)`;

    // Total Overall Progress
    const totalAnsCount = Object.keys(practiceState.answered).length;
    const totalPct = ((totalAnsCount / 1000) * 100).toFixed(1);
    totalProgressText.textContent = `${totalAnsCount} / 1000 (${totalPct}%)`;

    // Calculate overall accuracy rate
    let correctTotal = 0;
    Object.values(practiceState.answered).forEach(rec => {
      if (rec.isCorrect) correctTotal++;
    });

    const accuracyPct = totalAnsCount > 0 ? ((correctTotal / totalAnsCount) * 100).toFixed(1) : '0';
    totalAccuracyText.textContent = `${accuracyPct}%`;
  }

  // Event Listeners Setup
  function setupEventListeners() {
    // Category Tabs click
    catTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        switchCategory(tab.dataset.cat);
      });
    });

    // Dropdown Jump
    jumpSelect.addEventListener('change', (e) => {
      currentIndex = parseInt(e.target.value, 10);
      renderCurrentQuestion();
    });

    // Previous & Next Question Buttons
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

    // Re-answer current question
    btnReAnswer.addEventListener('click', () => {
      const q = currentList[currentIndex];
      delete practiceState.answered[q.id];
      saveState();
      populateJumpSelect();
      renderCurrentQuestion();
    });

    // Multiple choice submit button
    btnSubmitMulti.addEventListener('click', () => {
      const q = currentList[currentIndex];
      if (tempMultiSelected.length === 0) {
        alert('请至少选择一个选项后再提交！');
        return;
      }
      submitAnswer(q, tempMultiSelected);
    });

    // Reset Progress Button
    btnResetProgress.addEventListener('click', () => {
      if (confirm('确定要清空所有练习进度和作答记录吗？此操作无法撤销。')) {
        practiceState = {
          answered: {},
          currentCategory: 'single',
          categoryPositions: { single: 0, multiple: 0, tf: 0 }
        };
        saveState();
        switchCategory('single');
        updateAllProgressDisplays();
      }
    });
  }

})();
