/**
 * Project Leader B License Online Exam System - Application Logic
 * Supports 10 Fixed Non-Overlapping Exam Papers & Detailed Analytics
 */

(function () {
  'use strict';

  // Constants & Config
  const TOTAL_EXAM_TIME = 90 * 60; // 90 minutes in seconds
  const LICENSE_STORAGE_KEY = 'selected_license_type';
  const LICENSE_CONFIGS = {
    A: {
      name: '主要负责人A证（复审）',
      headerTitle: '主要负责人A证（复审）模拟考试',
      pageTitle: '主要负责人A证（复审）在线模拟考试系统',
      stateKey: 'a_license_exam_state',
      recordsKey: 'a_license_exam_records',
      getBank: () => window.QUESTION_BANK_A || []
    },
    B: {
      name: '项目负责人B证（复训）',
      headerTitle: '项目负责人B证（复训）模拟考试',
      pageTitle: '项目负责人B证（复训）在线模拟考试系统',
      stateKey: 'b_license_exam_state',
      recordsKey: 'b_license_exam_records',
      getBank: () => window.QUESTION_BANK || []
    },
    C: {
      name: '专职安全员C3证（复训）',
      headerTitle: '专职安全员C3证（复训）模拟考试',
      pageTitle: '专职安全员C3证（复训）在线模拟考试系统',
      stateKey: 'c_license_exam_state',
      recordsKey: 'c_license_exam_records',
      getBank: () => window.QUESTION_BANK_C || []
    }
  };

  function resolveInitialLicense() {
    try {
      const params = new URLSearchParams(window.location.search);
      const urlLic = (params.get('license') || '').toUpperCase();
      if (LICENSE_CONFIGS[urlLic]) {
        localStorage.setItem(LICENSE_STORAGE_KEY, urlLic);
        return urlLic;
      }
    } catch (e) {}
    try {
      const saved = (localStorage.getItem(LICENSE_STORAGE_KEY) || '').toUpperCase();
      if (LICENSE_CONFIGS[saved]) return saved;
    } catch (e) {}
    return 'B';
  }

  let currentLicense = resolveInitialLicense();

  function getLicenseConfig() {
    return LICENSE_CONFIGS[currentLicense] || LICENSE_CONFIGS.B;
  }
  function getExamStateKey() { return getLicenseConfig().stateKey; }
  function getExamRecordsKey() { return getLicenseConfig().recordsKey; }
  function getActiveBank() { return getLicenseConfig().getBank(); }
  function getMaxPapers() {
    const bank = getActiveBank();
    const sCount = Math.floor(bank.filter(q => q.category === 'single' || q.typeName === '单选题').length / 40);
    const mCount = Math.floor(bank.filter(q => q.category === 'multiple' || q.typeName === '多选题').length / 20);
    const tCount = Math.floor(bank.filter(q => q.category === 'tf' || q.typeName === '判断题').length / 40);
    return Math.max(1, Math.min(sCount, mCount, tCount));
  }

  // Application State
  let currentExam = {
    paperNumber: 1,
    questions: [], // 100 items: 40 single, 20 multiple, 40 tf
    userAnswers: {}, // { [index]: answerValue }
    marked: {}, // { [index]: true/false }
    startTime: null,
    timeRemaining: TOTAL_EXAM_TIME,
    isSubmitted: false,
    scoreResult: null
  };

  let currentIndex = 0;
  let timerInterval = null;
  let examWrongFilter = 'all';

  // DOM Elements
  const examView = document.getElementById('examView');
  const resultView = document.getElementById('resultView');
  const timerDisplay = document.getElementById('timerDisplay');
  const timerBox = document.getElementById('timerBox');
  const btnResetTimer = document.getElementById('btnResetTimer');
  const answeredBadge = document.getElementById('answeredBadge');
  const recordCountBadge = document.getElementById('recordCountBadge');
  const paperSelect = document.getElementById('paperSelect');
  const licenseSelect = document.getElementById('licenseSelect');
  const examHeaderTitle = document.getElementById('examHeaderTitle');
  const examHeaderSubtitle = document.getElementById('examHeaderSubtitle');

  // Question Card Elements
  const qNumTag = document.getElementById('qNumTag');
  const qTypeTag = document.getElementById('qTypeTag');
  const qScoreTag = document.getElementById('qScoreTag');
  const btnMarkCurrent = document.getElementById('btnMarkCurrent');
  const markBtnText = document.getElementById('markBtnText');
  const qTitle = document.getElementById('qTitle');
  const optionsContainer = document.getElementById('optionsContainer');
  const jumpText = document.getElementById('jumpText');
  const btnPrevQ = document.getElementById('btnPrevQ');
  const btnNextQ = document.getElementById('btnNextQ');

  // Modal / Sheet Elements
  const sheetModal = document.getElementById('sheetModal');
  const btnToggleSheet = document.getElementById('btnToggleSheet');
  const btnCloseSheet = document.getElementById('btnCloseSheet');
  const btnSubmitFromSheet = document.getElementById('btnSubmitFromSheet');
  const btnSubmitExam = document.getElementById('btnSubmitExam');

  const sheetGridSingle = document.getElementById('sheetGridSingle');
  const sheetGridMulti = document.getElementById('sheetGridMulti');
  const sheetGridTF = document.getElementById('sheetGridTF');

  // Result Elements
  const finalScoreVal = document.getElementById('finalScoreVal');
  const scoreCircle = document.getElementById('scoreCircle');
  const passStatusBanner = document.getElementById('passStatusBanner');
  const passStatusText = document.getElementById('passStatusText');
  const summaryText = document.getElementById('summaryText');
  const btnRestartExam = document.getElementById('btnRestartExam');
  const btnOpenHistoryView = document.getElementById('btnOpenHistoryView');
  const btnExamHistory = document.getElementById('btnExamHistory');

  // Analytics Elements
  const singleScoreVal = document.getElementById('singleScoreVal');
  const singleScoreRateVal = document.getElementById('singleScoreRateVal');
  const singleScoreFill = document.getElementById('singleScoreFill');
  const singleCorrectText = document.getElementById('singleCorrectText');

  const multiScoreVal = document.getElementById('multiScoreVal');
  const multiScoreRateVal = document.getElementById('multiScoreRateVal');
  const multiScoreFill = document.getElementById('multiScoreFill');
  const multiCorrectText = document.getElementById('multiCorrectText');
  const multiMissedText = document.getElementById('multiMissedText');
  const multiWrongText = document.getElementById('multiWrongText');

  const tfScoreVal = document.getElementById('tfScoreVal');
  const tfScoreRateVal = document.getElementById('tfScoreRateVal');
  const tfScoreFill = document.getElementById('tfScoreFill');
  const tfCorrectText = document.getElementById('tfCorrectText');

  // Exam Wrong Questions Elements
  const examWrongTotalCount = document.getElementById('examWrongTotalCount');
  const examWrongReviewList = document.getElementById('examWrongReviewList');
  const filterCountAll = document.getElementById('filterCountAll');
  const filterCountSingle = document.getElementById('filterCountSingle');
  const filterCountMultiple = document.getElementById('filterCountMultiple');
  const filterCountTF = document.getElementById('filterCountTF');
  const examFilterBtns = document.querySelectorAll('.exam-filter-btn');

  // Review List Elements
  const reviewList = document.getElementById('reviewList');
  const wrongCountVal = document.getElementById('wrongCountVal');

  // History Modal Elements
  const historyModal = document.getElementById('historyModal');
  const btnCloseHistory = document.getElementById('btnCloseHistory');
  const hTotalExams = document.getElementById('hTotalExams');
  const hPassExams = document.getElementById('hPassExams');
  const hAvgScore = document.getElementById('hAvgScore');
  const btnClearHistory = document.getElementById('btnClearHistory');
  const historyRecordsList = document.getElementById('historyRecordsList');

  // Exam Progress Sync Elements
  const btnExamSyncModal = document.getElementById('btnExamSyncModal');
  const examSyncModal = document.getElementById('examSyncModal');
  const btnCloseExamSync = document.getElementById('btnCloseExamSync');
  const examCloudSyncKeyInput = document.getElementById('examCloudSyncKeyInput');
  const btnExamCloudSyncNow = document.getElementById('btnExamCloudSyncNow');
  const examCloudSyncStatus = document.getElementById('examCloudSyncStatus');
  const btnExportExamCode = document.getElementById('btnExportExamCode');
  const btnImportExamCode = document.getElementById('btnImportExamCode');

  // Tab Buttons
  const tabBtns = document.querySelectorAll('.category-tabs .tab-btn');
  const filterBtns = document.querySelectorAll('.filter-btn');

  // Ensure Question Bank is 100% loaded before initializing
  function ensureBankReady(callback) {
    const activeBank = getActiveBank();
    if (Array.isArray(activeBank) && activeBank.length > 0) {
      callback();
      return;
    }

    let attempts = 0;
    const timer = setInterval(() => {
      attempts++;
      const bank = getActiveBank();
      if (Array.isArray(bank) && bank.length > 0) {
        clearInterval(timer);
        callback();
      } else if (attempts >= 50) {
        clearInterval(timer);
        alert('题库数据加载超时，请检查文件权限或刷新页面。');
      }
    }, 100);
  }

  // Safe localStorage Wrappers for Safari file:// protocol compatibility
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

  // Validate Exam Question Objects
  function isValidExamQuestions(questions) {
    if (!Array.isArray(questions) || questions.length !== 100) return false;
    return questions[0] && questions[0].prompt && questions[99] && questions[99].prompt;
  }

  // Initialize System on DOM Ready & Bank Ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => ensureBankReady(init));
  } else {
    ensureBankReady(init);
  }

  function checkUrlExamSyncParam() {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      let syncCode = urlParams.get('sync');
      if (!syncCode && window.location.hash && window.location.hash.includes('sync=')) {
        syncCode = window.location.hash.split('sync=')[1];
      }

      if (syncCode) {
        const decoded = decodeExamSyncState(syncCode);
        if (decoded) {
          const added = mergeExamSyncData(decoded);
          alert(`🎉 欢迎使用一键链接/二维码同步！\n已成功自动载入并合并您的模拟考试记录（新增 ${added} 套考卷）！`);
          try {
            const newUrl = window.location.protocol + '//' + window.location.host + window.location.pathname;
            window.history.replaceState({ path: newUrl }, '', newUrl);
          } catch (e) {}
          renderHistoryModal();
        }
      }
    } catch (e) {}
  }

  function renderLicenseUI() {
    const cfg = getLicenseConfig();
    const totalCount = getActiveBank().length;
    document.title = cfg.pageTitle;
    if (examHeaderTitle) examHeaderTitle.textContent = cfg.headerTitle;
    if (examHeaderSubtitle) examHeaderSubtitle.textContent = `全真模拟考场 · ${totalCount}题精选表格题库`;
    if (licenseSelect) licenseSelect.value = currentLicense;

    const practiceLink = document.querySelector('a[href^="顺序练习.html"]');
    if (practiceLink) {
      practiceLink.href = `顺序练习.html?license=${currentLicense}`;
    }

    if (paperSelect) {
      const maxPapers = getMaxPapers();
      paperSelect.innerHTML = '';
      for (let i = 1; i <= maxPapers; i++) {
        const opt = document.createElement('option');
        opt.value = String(i);
        opt.textContent = `模拟试卷 ${String(i).padStart(2, '0')}`;
        paperSelect.appendChild(opt);
      }
    }
  }

  function loadOrStartLicenseExam() {
    let loadedState = false;
    const savedState = safeGetItem(getExamStateKey());

    if (savedState) {
      try {
        const parsed = JSON.parse(savedState);
        if (parsed && isValidExamQuestions(parsed.questions) && !parsed.isSubmitted) {
          currentExam = parsed;
          if (paperSelect) paperSelect.value = currentExam.paperNumber || 1;
          loadedState = true;
        }
      } catch (e) {
        loadedState = false;
      }
    }

    if (!loadedState) {
      safeRemoveItem(getExamStateKey());
      startNewExam(1);
    } else {
      resultView.classList.remove('active');
      examView.classList.add('active');
      renderCurrentQuestion();
      updateAnsweredCount();
    }
    startTimer();
  }

  function switchLicense(newLic) {
    if (!LICENSE_CONFIGS[newLic]) return;
    currentLicense = newLic;
    safeSetItem(LICENSE_STORAGE_KEY, currentLicense);
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    renderLicenseUI();
    updateRecordCountBadge();
    loadOrStartLicenseExam();
  }

  function init() {
    renderLicenseUI();
    updateRecordCountBadge();
    setupEventListeners();
    checkUrlExamSyncParam();
    loadOrStartLicenseExam();
  }

  // Deterministic Seeded Shuffle Function (Fixed per paper)
  function seededShuffle(array, seed) {
    if (!Array.isArray(array)) return [];
    const arr = [...array];
    let s = seed || 12345;
    function rand() {
      s = (s ^ 0x6D2B79F5) + 0x6D2B79F5;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // Get fixed non-overlapping questions for paperNumber (1 to maxPapers) with deterministic fixed shuffling
  function getExamPaperQuestions(paperNum) {
    const rawBank = getActiveBank();

    const singles = rawBank.filter(q => q.category === 'single' || q.typeName === '单选题');
    const multiples = rawBank.filter(q => q.category === 'multiple' || q.typeName === '多选题');
    const tfs = rawBank.filter(q => q.category === 'tf' || q.typeName === '判断题');

    const maxPapers = getMaxPapers();
    const idx = Math.max(0, Math.min(maxPapers - 1, paperNum - 1));

    // Partition non-overlapping sets for this paper
    const paperSingles = singles.slice(idx * 40, (idx + 1) * 40);
    const paperMultiples = multiples.slice(idx * 20, (idx + 1) * 20);
    const paperTFs = tfs.slice(idx * 40, (idx + 1) * 40);

    // Fixed deterministic shuffle based on paper number seed so paper order is stable & persistent
    const shuffledSingles = seededShuffle(paperSingles, paperNum * 1000 + 1);
    const shuffledMultiples = seededShuffle(paperMultiples, paperNum * 1000 + 2);
    const shuffledTFs = seededShuffle(paperTFs, paperNum * 1000 + 3);

    return [
      ...shuffledSingles,
      ...shuffledMultiples,
      ...shuffledTFs
    ];
  }

  // Start New Exam for specified paper number
  function startNewExam(paperNum = 1) {
    const questions = getExamPaperQuestions(paperNum);

    currentExam = {
      paperNumber: paperNum,
      questions: questions,
      userAnswers: {},
      marked: {},
      startTime: Date.now(),
      timeRemaining: TOTAL_EXAM_TIME,
      isSubmitted: false,
      scoreResult: null
    };

    if (paperSelect) paperSelect.value = paperNum;
    currentIndex = 0;
    saveState();

    // Switch view back to exam
    resultView.classList.remove('active');
    examView.classList.add('active');

    renderCurrentQuestion();
    updateAnsweredCount();
  }

  function saveState() {
    safeSetItem(getExamStateKey(), JSON.stringify(currentExam));
  }

  // Timer Control Functions
  function startTimer() {
    if (timerInterval) clearInterval(timerInterval);

    timerInterval = setInterval(() => {
      if (currentExam.isSubmitted) {
        clearInterval(timerInterval);
        return;
      }

      currentExam.timeRemaining--;
      saveState();
      updateTimerDisplay();

      if (currentExam.timeRemaining <= 0) {
        clearInterval(timerInterval);
        alert('考试时间到！系统已为您自动提交试卷。');
        submitExam();
      }
    }, 1000);

    updateTimerDisplay();
  }

  function updateTimerDisplay() {
    const minutes = Math.floor(currentExam.timeRemaining / 60);
    const seconds = currentExam.timeRemaining % 60;

    const formattedTime = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    timerDisplay.textContent = formattedTime;

    if (currentExam.timeRemaining <= 600) {
      timerBox.classList.add('warning');
    } else {
      timerBox.classList.remove('warning');
    }
  }

  // Render Current Question
  function renderCurrentQuestion() {
    try {
      if (!currentExam.questions || currentExam.questions.length !== 100) {
        startNewExam(currentExam.paperNumber || 1);
        return;
      }

      if (currentIndex < 0) currentIndex = 0;
      if (currentIndex >= currentExam.questions.length) currentIndex = currentExam.questions.length - 1;

      const q = currentExam.questions[currentIndex];
      if (!q || !q.prompt) {
        startNewExam(currentExam.paperNumber || 1);
        return;
      }

      const userAns = currentExam.userAnswers[currentIndex];
      const isMarked = currentExam.marked[currentIndex];

      // Determine category and set active tab
      let sectionName = '一、单选题';
      let scoreText = '1.0 分';

      if (currentIndex >= 40 && currentIndex < 60) {
        sectionName = '二、多选题';
        scoreText = '2.0 分';
        updateTabActive('multiple');
      } else if (currentIndex >= 60) {
        sectionName = '三、判断题';
        scoreText = '0.5 分';
        updateTabActive('tf');
      } else {
        updateTabActive('single');
      }

      qNumTag.textContent = `第 ${currentIndex + 1} 题`;
      qTypeTag.textContent = q.typeName || (q.category === 'multiple' ? '多选题' : (q.category === 'tf' ? '判断题' : '单选题'));
      qScoreTag.textContent = scoreText;

      if (isMarked) {
        btnMarkCurrent.classList.add('active');
        markBtnText.textContent = '已标记';
      } else {
        btnMarkCurrent.classList.remove('active');
        markBtnText.textContent = '标记疑难';
      }

      qTitle.textContent = `${currentIndex + 1}. ${q.prompt}`;

      // Render Options
      optionsContainer.innerHTML = '';

      if (q.category === 'tf' || q.typeName === '判断题') {
        const opts = ['正确', '错误'];
        opts.forEach((optText, i) => {
          const key = i === 0 ? 'A' : 'B';
          const isSelected = userAns === key || (key === 'A' && userAns === '正确') || (key === 'B' && userAns === '错误');
          const optEl = document.createElement('div');
          optEl.className = 'option-item' + (isSelected ? ' selected' : '');
          optEl.innerHTML = `
            <div class="option-key">${key}</div>
            <div class="option-text">${optText}</div>
          `;
          optEl.addEventListener('click', () => selectAnswer(key));
          optionsContainer.appendChild(optEl);
        });
      } else {
        // Single or Multiple
        const labels = ['A', 'B', 'C', 'D', 'E'];
        const optsList = Array.isArray(q.options) ? q.options : [];
        optsList.forEach((optText, i) => {
          const key = labels[i] || String.fromCharCode(65 + i);
          const isSelected = (q.category === 'multiple' || q.typeName === '多选题')
            ? (Array.isArray(userAns) && userAns.includes(key))
            : (userAns === key);

          const optEl = document.createElement('div');
          optEl.className = 'option-item' + (isSelected ? ' selected' : '');
          optEl.innerHTML = `
            <div class="option-key">${key}</div>
            <div class="option-text">${optText}</div>
          `;

          optEl.addEventListener('click', () => {
            if (q.category === 'multiple' || q.typeName === '多选题') {
              let currentList = Array.isArray(userAns) ? [...userAns] : [];
              if (currentList.includes(key)) {
                currentList = currentList.filter(k => k !== key);
              } else {
                currentList.push(key);
                currentList.sort();
              }
              selectAnswer(currentList);
            } else {
              selectAnswer(key);
            }
          });

          optionsContainer.appendChild(optEl);
        });
      }

      // Update Footer Navigation
      jumpText.textContent = `${currentIndex + 1} / 100`;
      btnPrevQ.disabled = currentIndex === 0;
      btnNextQ.disabled = currentIndex === currentExam.questions.length - 1;
    } catch (err) {
      console.error('Error rendering current question, recovering...', err);
      localStorage.removeItem(getExamStateKey());
      startNewExam(1);
    }
  }

  function selectAnswer(ansValue) {
    if (currentExam.isSubmitted) return;

    currentExam.userAnswers[currentIndex] = ansValue;
    saveState();
    renderCurrentQuestion();
    updateAnsweredCount();
  }

  function updateAnsweredCount() {
    const answeredKeys = Object.keys(currentExam.userAnswers).filter(k => {
      const val = currentExam.userAnswers[k];
      if (Array.isArray(val)) return val.length > 0;
      return val !== undefined && val !== null && val !== '';
    });
    answeredBadge.textContent = `${answeredKeys.length}/100`;
  }

  function updateTabActive(category) {
    tabBtns.forEach(btn => {
      if (btn.dataset.cat === category) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  // Render Answer Sheet Grid
  function renderAnswerSheet() {
    sheetGridSingle.innerHTML = '';
    sheetGridMulti.innerHTML = '';
    sheetGridTF.innerHTML = '';

    currentExam.questions.forEach((q, idx) => {
      const btn = document.createElement('button');
      btn.className = 'sheet-btn';
      btn.textContent = idx + 1;

      if (idx === currentIndex) btn.classList.add('current');

      const userAns = currentExam.userAnswers[idx];
      const isAnswered = Array.isArray(userAns) ? userAns.length > 0 : (userAns !== undefined && userAns !== '');
      if (isAnswered) btn.classList.add('answered');
      if (currentExam.marked[idx]) btn.classList.add('marked');

      btn.addEventListener('click', () => {
        currentIndex = idx;
        renderCurrentQuestion();
        sheetModal.classList.remove('active');
      });

      if (idx < 40) {
        sheetGridSingle.appendChild(btn);
      } else if (idx < 60) {
        sheetGridMulti.appendChild(btn);
      } else {
        sheetGridTF.appendChild(btn);
      }
    });
  }

  // Scoring & Comprehensive Analytics Calculation
  function calculateScore() {
    let singleScore = 0;
    let singleCorrectCount = 0;

    let multiScore = 0;
    let multiCorrectCount = 0; // 全对
    let multiMissedCount = 0;  // 漏选
    let multiWrongCount = 0;   // 错选

    let tfScore = 0;
    let tfCorrectCount = 0;

    let wrongCount = 0;
    const reviewDetails = [];
    const examWrongQuestions = [];

    currentExam.questions.forEach((q, idx) => {
      const userAns = currentExam.userAnswers[idx];
      let itemScore = 0;
      let status = 'wrong'; // 'correct', 'partial', 'wrong'

      if (q.category === 'single' || q.typeName === '单选题') {
        if (userAns === q.answer) {
          itemScore = 1.0;
          status = 'correct';
          singleScore += 1.0;
          singleCorrectCount++;
        } else {
          wrongCount++;
          examWrongQuestions.push({ index: idx, question: q, userAns, status: 'wrong' });
        }
      } else if (q.category === 'tf' || q.typeName === '判断题') {
        const normalizedUserAns = userAns === '正确' ? 'A' : (userAns === '错误' ? 'B' : userAns);
        const normalizedCorrectAns = q.answer === '正确' ? 'A' : (q.answer === '错误' ? 'B' : q.answer);
        if (normalizedUserAns === normalizedCorrectAns) {
          itemScore = 0.5;
          status = 'correct';
          tfScore += 0.5;
          tfCorrectCount++;
        } else {
          wrongCount++;
          examWrongQuestions.push({ index: idx, question: q, userAns, status: 'wrong' });
        }
      } else if (q.category === 'multiple' || q.typeName === '多选题') {
        let correctArr = Array.isArray(q.answer) ? q.answer : (typeof q.answer === 'string' ? q.answer.split('') : []);
        let userArr = Array.isArray(userAns) ? userAns : (typeof userAns === 'string' ? userAns.split('') : []);

        const correctSet = new Set(correctArr);
        const userSet = new Set(userArr);

        let hasWrongOption = false;
        let correctCount = 0;

        userSet.forEach(opt => {
          if (correctSet.has(opt)) {
            correctCount++;
          } else {
            hasWrongOption = true;
          }
        });

        if (hasWrongOption || userSet.size === 0) {
          itemScore = 0.0;
          status = 'wrong';
          wrongCount++;
          multiWrongCount++;
          examWrongQuestions.push({ index: idx, question: q, userAns, status: 'wrong' });
        } else if (correctCount === correctSet.size && userSet.size === correctSet.size) {
          // All correct!
          itemScore = 2.0;
          status = 'correct';
          multiScore += itemScore;
          multiCorrectCount++;
        } else {
          // Partial correct (漏选)
          itemScore = Math.min(1.5, correctCount * 0.5);
          status = 'partial';
          multiScore += itemScore;
          multiMissedCount++;
          examWrongQuestions.push({ index: idx, question: q, userAns, status: 'partial' });
        }
      }

      reviewDetails.push({
        index: idx,
        question: q,
        userAnswer: userAns,
        correctAnswer: q.answer,
        score: itemScore,
        status: status
      });
    });

    const totalScoreNum = singleScore + multiScore + tfScore;
    const timeUsedSeconds = TOTAL_EXAM_TIME - currentExam.timeRemaining;

    return {
      totalScore: totalScoreNum.toFixed(1),
      singleScore: singleScore.toFixed(1),
      singleCorrectCount,
      singleCorrectRate: ((singleCorrectCount / 40) * 100).toFixed(1),
      singleScoreRate: ((singleScore / 40.0) * 100).toFixed(1),

      multiScore: multiScore.toFixed(1),
      multiCorrectCount,
      multiCorrectRate: ((multiCorrectCount / 20) * 100).toFixed(1),
      multiMissedCount,
      multiMissedRate: ((multiMissedCount / 20) * 100).toFixed(1),
      multiWrongCount,
      multiWrongRate: ((multiWrongCount / 20) * 100).toFixed(1),
      multiScoreRate: ((multiScore / 40.0) * 100).toFixed(1),

      tfScore: tfScore.toFixed(1),
      tfCorrectCount,
      tfCorrectRate: ((tfCorrectCount / 40) * 100).toFixed(1),
      tfScoreRate: ((tfScore / 20.0) * 100).toFixed(1),

      wrongCount,
      timeUsedSeconds,
      examWrongQuestions,
      details: reviewDetails
    };
  }

  // Submit Exam & Generate Record
  function submitExam() {
    currentExam.isSubmitted = true;
    const res = calculateScore();
    currentExam.scoreResult = res;
    saveState();

    // Generate Exam History Record (Only created upon explicit submission)
    saveExamHistoryRecord(res);

    // Render Result View
    renderResultView(res);
    examView.classList.remove('active');
    resultView.classList.add('active');
    sheetModal.classList.remove('active');
  }

  function saveExamHistoryRecord(res) {
    let records = [];
    const saved = safeGetItem(getExamRecordsKey());
    if (saved) {
      try {
        records = JSON.parse(saved) || [];
      } catch (e) { records = []; }
    }

    const record = {
      id: 'record_' + Date.now(),
      paperNumber: currentExam.paperNumber || 1,
      paperName: `模拟试卷 ${String(currentExam.paperNumber || 1).padStart(2, '0')}`,
      submitTime: new Date().toLocaleString('zh-CN'),
      timeUsedSeconds: res.timeUsedSeconds,
      totalScore: res.totalScore,
      isPass: parseFloat(res.totalScore) >= 60.0,
      res: res
    };

    records.unshift(record); // add to top
    safeSetItem(getExamRecordsKey(), JSON.stringify(records));
    updateRecordCountBadge();
  }

  function getExamRecords() {
    const saved = safeGetItem(getExamRecordsKey());
    if (!saved) return [];
    try {
      return JSON.parse(saved) || [];
    } catch (e) {
      return [];
    }
  }

  function updateRecordCountBadge() {
    const records = getExamRecords();
    if (recordCountBadge) recordCountBadge.textContent = records.length;
  }

  function renderResultView(res) {
    finalScoreVal.textContent = res.totalScore;

    const isPass = parseFloat(res.totalScore) >= 60.0;
    if (isPass) {
      scoreCircle.className = 'score-badge-circle';
      passStatusBanner.className = 'status-banner';
      passStatusBanner.innerHTML = '<i class="fa-solid fa-circle-check"></i> 考试合格';
    } else {
      scoreCircle.className = 'score-badge-circle fail';
      passStatusBanner.className = 'status-banner fail';
      passStatusBanner.innerHTML = '<i class="fa-solid fa-circle-xmark"></i> 考试未合格 (合格线 60分)';
    }

    const min = Math.floor(res.timeUsedSeconds / 60);
    const sec = res.timeUsedSeconds % 60;
    summaryText.textContent = `模拟试卷 ${String(currentExam.paperNumber || 1).padStart(2, '0')} 作答完成！用时 ${min}分${sec}秒，错题与漏选：${res.wrongCount} 题`;

    // Single Analytics
    if (singleScoreVal) singleScoreVal.textContent = `${res.singleScore} / 40.0 分`;
    if (singleScoreRateVal) singleScoreRateVal.textContent = `${res.singleScoreRate}%`;
    if (singleScoreFill) singleScoreFill.style.width = `${res.singleScoreRate}%`;
    if (singleCorrectText) singleCorrectText.textContent = `${res.singleCorrectCount} / 40 题`;

    // Multi Analytics (3-way split)
    if (multiScoreVal) multiScoreVal.textContent = `${res.multiScore} / 40.0 分`;
    if (multiScoreRateVal) multiScoreRateVal.textContent = `${res.multiScoreRate}%`;
    if (multiScoreFill) multiScoreFill.style.width = `${res.multiScoreRate}%`;
    if (multiCorrectText) multiCorrectText.textContent = `${res.multiCorrectCount} 题 (${res.multiCorrectRate}%)`;
    if (multiMissedText) multiMissedText.textContent = `${res.multiMissedCount} 题 (${res.multiMissedRate}%)`;
    if (multiWrongText) multiWrongText.textContent = `${res.multiWrongCount} 题 (${res.multiWrongRate}%)`;

    // TF Analytics
    if (tfScoreVal) tfScoreVal.textContent = `${res.tfScore} / 20.0 分`;
    if (tfScoreRateVal) tfScoreRateVal.textContent = `${res.tfScoreRate}%`;
    if (tfScoreFill) tfScoreFill.style.width = `${res.tfScoreRate}%`;
    if (tfCorrectText) tfCorrectText.textContent = `${res.tfCorrectCount} / 40 题`;

    // Exam Wrong Section
    if (wrongCountVal) wrongCountVal.textContent = res.wrongCount;
    if (examWrongTotalCount) examWrongTotalCount.textContent = res.wrongCount;

    examWrongFilter = 'all';
    renderExamWrongSection(res.examWrongQuestions);
    renderReviewList('all', res.details);
  }

  // Helper to render full options text list (A, B, C, D) with user selection & correct tags
  function renderReviewOptionsHtml(q, userAns) {
    let opts = [];
    if (q.category === 'tf' || q.typeName === '判断题') {
      opts = ['正确', '错误'];
    } else {
      opts = Array.isArray(q.options) ? q.options : [];
    }

    const labels = ['A', 'B', 'C', 'D', 'E'];
    const userAnsArr = Array.isArray(userAns) ? userAns : (userAns ? [userAns] : []);
    const correctAnsArr = Array.isArray(q.answer) ? q.answer : (q.answer ? [q.answer] : []);

    let html = '<div class="review-opts">';
    opts.forEach((optText, i) => {
      const key = labels[i] || String.fromCharCode(65 + i);

      // Check if user selected this key
      let isUserChosen = false;
      if (q.category === 'tf' || q.typeName === '判断题') {
        isUserChosen = (key === 'A' && userAns === '正确') || (key === 'B' && userAns === '错误') || (userAns === key);
      } else {
        isUserChosen = userAnsArr.includes(key);
      }

      // Check if this key is the correct answer
      let isCorrectKey = false;
      if (q.category === 'tf' || q.typeName === '判断题') {
        isCorrectKey = (key === 'A' && q.answer === '正确') || (key === 'B' && q.answer === '错误') || (q.answer === key);
      } else {
        isCorrectKey = correctAnsArr.includes(key);
      }

      let lineClass = 'review-opt-line';
      let tagHtml = '';

      if (isCorrectKey && isUserChosen) {
        lineClass += ' is-correct-user';
        tagHtml = '<span class="review-tag tag-correct-user"><i class="fa-solid fa-circle-check"></i> 您的选择 (正确)</span>';
      } else if (isCorrectKey) {
        lineClass += ' is-correct';
        tagHtml = '<span class="review-tag tag-correct"><i class="fa-solid fa-check"></i> 正确答案</span>';
      } else if (isUserChosen) {
        lineClass += ' is-user-wrong';
        tagHtml = '<span class="review-tag tag-user-wrong"><i class="fa-solid fa-circle-xmark"></i> 您的选择 (错误)</span>';
      }

      html += `
        <div class="${lineClass}">
          <span class="opt-label">${key}.</span>
          <span class="opt-content">${optText}</span>
          ${tagHtml}
        </div>
      `;
    });
    html += '</div>';
    return html;
  }

  function renderExamWrongSection(wrongQuestions) {
    if (!examWrongReviewList) return;
    examWrongReviewList.innerHTML = '';

    const singleWrongs = wrongQuestions.filter(item => item.question.category === 'single');
    const multiWrongs = wrongQuestions.filter(item => item.question.category === 'multiple');
    const tfWrongs = wrongQuestions.filter(item => item.question.category === 'tf');

    if (filterCountAll) filterCountAll.textContent = wrongQuestions.length;
    if (filterCountSingle) filterCountSingle.textContent = singleWrongs.length;
    if (filterCountMultiple) filterCountMultiple.textContent = multiWrongs.length;
    if (filterCountTF) filterCountTF.textContent = tfWrongs.length;

    const filtered = wrongQuestions.filter(item => {
      if (examWrongFilter === 'single' && item.question.category !== 'single') return false;
      if (examWrongFilter === 'multiple' && item.question.category !== 'multiple') return false;
      if (examWrongFilter === 'tf' && item.question.category !== 'tf') return false;
      return true;
    });

    if (filtered.length === 0) {
      examWrongReviewList.innerHTML = `
        <div style="text-align:center; padding: 30px; color: var(--text-muted);">
          <i class="fa-solid fa-circle-check" style="font-size: 2.5rem; color: var(--success); margin-bottom: 10px;"></i>
          <p style="font-weight: 600;">该分类下当前没有错题！</p>
        </div>
      `;
      return;
    }

    filtered.forEach(item => {
      const q = item.question;
      const card = document.createElement('div');
      card.className = `review-item ${item.status}`;

      const statusBadge = item.status === 'partial'
        ? '<span class="badge-result partial">漏选 (部分选对)</span>'
        : '<span class="badge-result wrong">回答错误</span>';

      let userAnsStr = Array.isArray(item.userAns) ? item.userAns.join(', ') : (item.userAns || '未作答');
      let correctAnsStr = Array.isArray(q.answer) ? q.answer.join(', ') : q.answer;

      if (q.category === 'tf') {
        userAnsStr = item.userAns === 'A' ? 'A (正确)' : (item.userAns === 'B' ? 'B (错误)' : item.userAns || '未作答');
        correctAnsStr = q.answer === 'A' ? 'A (正确)' : (q.answer === 'B' ? 'B (错误)' : q.answer);
      }

      const optionsHtml = renderReviewOptionsHtml(q, item.userAns);

      card.innerHTML = `
        <div class="review-item-header">
          <span style="font-weight: 700;">第 ${item.index + 1} 题 (${q.typeName})</span>
          ${statusBadge}
        </div>
        <div class="review-prompt">${q.prompt}</div>
        ${optionsHtml}
        <div class="review-ans-row">
          <div>您的选择：<strong style="color: #ef4444;">${userAnsStr}</strong></div>
          <div>正确答案：<strong style="color: #10b981;">${correctAnsStr}</strong></div>
        </div>
      `;

      examWrongReviewList.appendChild(card);
    });
  }

  function renderReviewList(filterType, details) {
    if (!reviewList) return;
    reviewList.innerHTML = '';

    details.forEach(item => {
      if (filterType === 'wrong' && item.status === 'correct') {
        return;
      }

      const card = document.createElement('div');
      card.className = `review-item ${item.status}`;

      const statusBadge = item.status === 'correct'
        ? '<span class="badge-result correct">正确 (+ ' + item.score + '分)</span>'
        : (item.status === 'partial'
          ? '<span class="badge-result partial">部分正确 (+ ' + item.score + '分)</span>'
          : '<span class="badge-result wrong">答错 (0分)</span>');

      let userAnsStr = Array.isArray(item.userAnswer) ? item.userAnswer.join(', ') : (item.userAnswer || '未作答');
      let correctAnsStr = Array.isArray(item.correctAnswer) ? item.correctAnswer.join(', ') : item.correctAnswer;

      if (item.question.category === 'tf') {
        userAnsStr = item.userAnswer === 'A' ? 'A (正确)' : (item.userAnswer === 'B' ? 'B (错误)' : item.userAnswer || '未作答');
        correctAnsStr = item.correctAnswer === 'A' ? 'A (正确)' : (item.correctAnswer === 'B' ? 'B (错误)' : item.correctAnswer);
      }

      const optionsHtml = renderReviewOptionsHtml(item.question, item.userAnswer);

      card.innerHTML = `
        <div class="review-item-header">
          <span style="font-weight: 700;">第 ${item.index + 1} 题 (${item.question.typeName})</span>
          ${statusBadge}
        </div>
        <div class="review-prompt">${item.question.prompt}</div>
        ${optionsHtml}
        <div class="review-ans-row">
          <div>您的选择：<strong style="color: ${item.status === 'correct' ? '#10b981' : '#ef4444'};">${userAnsStr}</strong></div>
          <div>正确答案：<strong style="color: #10b981;">${correctAnsStr}</strong></div>
        </div>
      `;

      reviewList.appendChild(card);
    });
  }

  // Render History Records Modal Content
  function renderHistoryModal() {
    const records = getExamRecords();
    hTotalExams.textContent = `${records.length} 套`;

    const passCount = records.filter(r => r.isPass).length;
    hPassExams.textContent = `${passCount} 套`;

    if (records.length > 0) {
      const avg = (records.reduce((sum, r) => sum + parseFloat(r.totalScore), 0) / records.length).toFixed(1);
      hAvgScore.textContent = `${avg} 分`;
    } else {
      hAvgScore.textContent = '0.0 分';
    }

    historyRecordsList.innerHTML = '';

    if (records.length === 0) {
      historyRecordsList.innerHTML = `
        <div style="text-align: center; padding: 40px; color: var(--text-muted);">
          <i class="fa-solid fa-clipboard" style="font-size: 3rem; margin-bottom: 12px; opacity: 0.5;"></i>
          <p style="font-weight: 600;">暂无提交的模拟考试记录</p>
          <p style="font-size: 0.85rem; margin-top: 4px;">完成试卷并点击【提交试卷】后，考试记录将自动生成并保存在此处。</p>
        </div>
      `;
      return;
    }

    records.forEach((rec, i) => {
      const item = document.createElement('div');
      item.className = 'history-record-item';

      const res = rec.res || {};
      const min = Math.floor((rec.timeUsedSeconds || 0) / 60);
      const sec = (rec.timeUsedSeconds || 0) % 60;
      const wrongCount = res.wrongCount !== undefined ? res.wrongCount : (res.examWrongQuestions ? res.examWrongQuestions.length : 0);

      item.innerHTML = `
        <div class="h-item-main">
          <div class="h-item-title">
            <i class="fa-solid fa-file-circle-check"></i> ${rec.paperName || '模拟试卷'}
            <span class="h-item-badge ${rec.isPass ? 'h-badge-pass' : 'h-badge-fail'}">
              ${rec.isPass ? '合格' : '未合格'}
            </span>
          </div>
          <div class="h-item-meta">
            <span><i class="fa-regular fa-clock"></i> 提交时间: ${rec.submitTime}</span>
            <span><i class="fa-solid fa-stopwatch"></i> 用时: ${min}分${sec}秒</span>
            <span>单选: ${res.singleScore || 0}分 | 多选: ${res.multiScore || 0}分 | 判断: ${res.tfScore || 0}分</span>
            <span style="color: var(--danger); font-weight: 700;"><i class="fa-solid fa-triangle-exclamation"></i> 错题+漏选: ${wrongCount} 题</span>
          </div>
        </div>

        <div class="h-item-right">
          <div class="h-item-score ${rec.isPass ? 'pass' : 'fail'}">${rec.totalScore}分</div>
          <div style="display: flex; flex-direction: column; gap: 6px;">
            <button class="btn btn-sm btn-primary btn-inspect-rec" data-rec-index="${i}">
              <i class="fa-solid fa-chart-pie"></i> 查看本卷分析
            </button>
            ${wrongCount > 0 ? `
              <button class="btn btn-sm btn-danger btn-practice-wrong-rec" data-rec-index="${i}">
                <i class="fa-solid fa-triangle-exclamation"></i> 练习本卷错题 (${wrongCount}题)
              </button>
            ` : ''}
          </div>
        </div>
      `;

      historyRecordsList.appendChild(item);
    });

    // Attach inspect & wrong question practice listeners
    const inspectBtns = historyRecordsList.querySelectorAll('.btn-inspect-rec');
    inspectBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.recIndex, 10);
        const targetRec = records[idx];
        if (targetRec && targetRec.res) {
          currentExam.paperNumber = targetRec.paperNumber || 1;
          currentExam.scoreResult = targetRec.res;
          renderResultView(targetRec.res);
          examView.classList.remove('active');
          resultView.classList.add('active');
          historyModal.classList.remove('active');
        }
      });
    });

    const practiceWrongBtns = historyRecordsList.querySelectorAll('.btn-practice-wrong-rec');
    practiceWrongBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.recIndex, 10);
        const targetRec = records[idx];
        if (targetRec && targetRec.res) {
          currentExam.paperNumber = targetRec.paperNumber || 1;
          currentExam.scoreResult = targetRec.res;
          renderResultView(targetRec.res);
          examView.classList.remove('active');
          resultView.classList.add('active');
          historyModal.classList.remove('active');
          
          const wrongSection = document.getElementById('examWrongSection');
          if (wrongSection) {
            wrongSection.scrollIntoView({ behavior: 'smooth' });
          }
        }
      });
    });
  }

  // Setup Event Listeners
  function setupEventListeners() {
    // License Selector Change
    if (licenseSelect) {
      licenseSelect.addEventListener('change', (e) => {
        switchLicense(e.target.value);
      });
    }

    // Paper Selector Change
    if (paperSelect) {
      paperSelect.addEventListener('change', (e) => {
        const selectedPaper = parseInt(e.target.value, 10);
        if (!currentExam.isSubmitted && Object.keys(currentExam.userAnswers).length > 0) {
          if (confirm(`确定要切换到【模拟试卷 ${selectedPaper.toString().padStart(2, '0')}】吗？当前试卷的作答进度将被放弃。`)) {
            startNewExam(selectedPaper);
          } else {
            paperSelect.value = currentExam.paperNumber || 1;
          }
        } else {
          startNewExam(selectedPaper);
        }
      });
    }

    // Navigation
    btnPrevQ.addEventListener('click', () => {
      if (currentIndex > 0) {
        currentIndex--;
        renderCurrentQuestion();
      }
    });

    btnNextQ.addEventListener('click', () => {
      if (currentIndex < currentExam.questions.length - 1) {
        currentIndex++;
        renderCurrentQuestion();
      }
    });

    // Mark Current Question
    btnMarkCurrent.addEventListener('click', () => {
      currentExam.marked[currentIndex] = !currentExam.marked[currentIndex];
      saveState();
      renderCurrentQuestion();
    });

    // Reset Exam Timer Button
    if (btnResetTimer) {
      btnResetTimer.addEventListener('click', () => {
        if (confirm('确定要刷新并重置考试时间为 90:00 吗？')) {
          currentExam.timeRemaining = TOTAL_EXAM_TIME;
          saveState();
          updateTimerDisplay();
          startTimer();
        }
      });
    }

    // Category Tabs
    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const cat = btn.dataset.cat;
        if (cat === 'single') currentIndex = 0;
        else if (cat === 'multiple') currentIndex = 40;
        else if (cat === 'tf') currentIndex = 60;
        renderCurrentQuestion();
      });
    });

    // Answer Sheet Modal
    btnToggleSheet.addEventListener('click', () => {
      renderAnswerSheet();
      sheetModal.classList.add('active');
    });

    btnCloseSheet.addEventListener('click', () => {
      sheetModal.classList.remove('active');
    });

    // History Records Modal
    if (btnExamHistory) {
      btnExamHistory.addEventListener('click', () => {
        renderHistoryModal();
        historyModal.classList.add('active');
      });
    }

    if (btnOpenHistoryView) {
      btnOpenHistoryView.addEventListener('click', () => {
        renderHistoryModal();
        historyModal.classList.add('active');
      });
    }

    if (btnCloseHistory) {
      btnCloseHistory.addEventListener('click', () => {
        historyModal.classList.remove('active');
      });
    }

    if (btnClearHistory) {
      btnClearHistory.addEventListener('click', () => {
        if (confirm('确定要清空所有历史考试记录与数据档案吗？此操作无法撤销。')) {
          localStorage.removeItem(getExamRecordsKey());
          renderHistoryModal();
          updateRecordCountBadge();
        }
      });
    }

    // Exam Wrong Questions Filter Buttons
    examFilterBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        examFilterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        examWrongFilter = btn.dataset.examFilter;
        if (currentExam.scoreResult) {
          renderExamWrongSection(currentExam.scoreResult.examWrongQuestions);
        }
      });
    });

    // Submit Buttons
    btnSubmitExam.addEventListener('click', () => {
      const unanswered = 100 - Object.keys(currentExam.userAnswers).length;
      let msg = '确定要提交试卷吗？交卷后将生成智能考试记录与数据分析。';
      if (unanswered > 0) {
        msg = `您还有 ${unanswered} 道题未回答，确定要现在提交试卷吗？`;
      }
      if (confirm(msg)) {
        submitExam();
      }
    });

    btnSubmitFromSheet.addEventListener('click', () => {
      if (confirm('确定提交试卷并进行智能计算评分与生成考试记录吗？')) {
        submitExam();
      }
    });

    // Restart Exam
    btnRestartExam.addEventListener('click', () => {
      const pNum = currentExam.paperNumber || 1;
      startNewExam(pNum);
      startTimer();
      renderCurrentQuestion();
      updateAnsweredCount();
    });

    // Filter Buttons in Full Review
    filterBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        filterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        if (currentExam.scoreResult) {
          renderReviewList(btn.dataset.filter, currentExam.scoreResult.details);
        }
      });
    });

    // Exam Sync Modal Listeners
    const btnShareExamSyncLink = document.getElementById('btnShareExamSyncLink');
    const btnShowExamQrCode = document.getElementById('btnShowExamQrCode');
    const examQrCodeContainer = document.getElementById('examQrCodeContainer');
    const examQrCodeImg = document.getElementById('examQrCodeImg');
    const importExamCodeInput = document.getElementById('importExamCodeInput');
    const btnConfirmExamImportPaste = document.getElementById('btnConfirmExamImportPaste');

    async function tryAutoFillExamImportInput() {
      if (!importExamCodeInput) return;
      if (navigator.clipboard && navigator.clipboard.readText) {
        try {
          const clipText = await navigator.clipboard.readText();
          const extracted = extractSyncCodeFromAnyInput(clipText);
          if (extracted && (extracted.startsWith('BEXAM') || extracted.includes('records'))) {
            importExamCodeInput.value = clipText;
          }
        } catch (e) {}
      }
    }

    if (btnShareExamSyncLink) {
      btnShareExamSyncLink.addEventListener('click', () => {
        const code = encodeExamSyncState();
        const baseUrl = window.location.protocol + '//' + window.location.host + window.location.pathname;
        const shareUrl = `${baseUrl}?sync=${encodeURIComponent(code)}`;

        const exportBox = document.getElementById('exportExamResultBox');
        const exportArea = document.getElementById('exportExamTextarea');
        const exportTitle = document.getElementById('exportExamResultTitle');

        if (exportArea && exportBox) {
          exportArea.value = shareUrl;
          exportBox.style.display = 'block';
        }

        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(shareUrl).then(() => {
            if (exportTitle) exportTitle.textContent = '✅ 考试一键同步超链接已复制到剪贴板！亦可点击下方框全选复制：';
            alert('✅ 考试一键同步超链接已复制！\n将链接发到微信/QQ，在另一台设备上点击链接即可一键自动同步考试记录！');
          }).catch(() => {
            if (exportTitle) exportTitle.textContent = '⚠️ 浏览器拦截了自动复制，请点击下方框【全选复制链接】：';
          });
        } else {
          if (exportTitle) exportTitle.textContent = '⚠️ 请点击下方文本框【全选复制】一键链接：';
        }
      });
    }

    if (btnShowExamQrCode) {
      btnShowExamQrCode.addEventListener('click', () => {
        const code = encodeExamSyncState();
        const baseUrl = window.location.protocol + '//' + window.location.host + window.location.pathname;
        const shareUrl = `${baseUrl}?sync=${encodeURIComponent(code)}`;
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(shareUrl)}`;

        if (examQrCodeImg && examQrCodeContainer) {
          examQrCodeImg.src = qrUrl;
          examQrCodeContainer.style.display = examQrCodeContainer.style.display === 'none' ? 'block' : 'none';
        }
      });
    }

    if (btnExamSyncModal) {
      btnExamSyncModal.addEventListener('click', () => {
        if (examSyncModal) examSyncModal.classList.add('active');
        tryAutoFillExamImportInput();
      });
    }

    if (btnCloseExamSync) {
      btnCloseExamSync.addEventListener('click', () => {
        if (examSyncModal) examSyncModal.classList.remove('active');
      });
    }

    if (importExamCodeInput) {
      importExamCodeInput.addEventListener('focus', tryAutoFillExamImportInput);
    }

    if (btnConfirmExamImportPaste) {
      btnConfirmExamImportPaste.addEventListener('click', () => {
        const raw = importExamCodeInput ? importExamCodeInput.value : '';
        const cleanCode = extractSyncCodeFromAnyInput(raw);
        if (!cleanCode) {
          alert('请先在输入框中粘贴您复制的考试暗号或一键链接！');
          return;
        }

        const decoded = decodeExamSyncState(cleanCode);
        if (!decoded) {
          alert('❌ 无法识别的暗号/链接格式！请确认粘贴了完整的考试暗号或链接。');
          return;
        }

        const addedCount = mergeExamSyncData(decoded);
        alert(`🎉 考试进度与历史数据导入成功！\n共同步 ${getExamRecords().length} 套考卷记录 (新增 ${addedCount} 套)！`);
        if (examSyncModal) examSyncModal.classList.remove('active');
        renderHistoryModal();
      });
    }

    if (btnExamCloudSyncNow) {
      btnExamCloudSyncNow.addEventListener('click', () => {
        const key = examCloudSyncKeyInput ? examCloudSyncKeyInput.value.trim() : '';
        if (!key) {
          alert('请输入您的专属考试暗号！');
          return;
        }
        autoCloudSyncExam(key);
      });
    }

    if (btnExportExamCode) {
      btnExportExamCode.addEventListener('click', () => {
        const code = encodeExamSyncState();
        const exportBox = document.getElementById('exportExamResultBox');
        const exportArea = document.getElementById('exportExamTextarea');
        const exportTitle = document.getElementById('exportExamResultTitle');

        if (exportArea && exportBox) {
          exportArea.value = code;
          exportBox.style.display = 'block';
        }

        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(code).then(() => {
            if (exportTitle) exportTitle.textContent = '✅ 考试暗号已自动复制到剪贴板！亦可点击下方框全选复制：';
            alert('✅ 考试暗号已复制到剪贴板！\n如自动复制失败，弹窗下方已为您提供全选复制框。');
          }).catch(() => {
            if (exportTitle) exportTitle.textContent = '⚠️ 浏览器拦截了自动复制，请点击下方框【全选复制】：';
          });
        } else {
          if (exportTitle) exportTitle.textContent = '⚠️ 请点击下方文本框【全选复制】您的考试暗号：';
        }
      });
    }
  }

  // ==================== MOCK EXAM MULTI-DEVICE SYNC ENGINE ====================
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

  function encodeExamSyncState() {
    const records = getExamRecords();
    const payload = {
      v: 2,
      records: records,
      active: currentExam && !currentExam.isSubmitted ? {
        paper: currentExam.paperNumber || 1,
        ans: currentExam.userAnswers || {},
        marked: currentExam.marked || {},
        time: currentExam.timeRemaining
      } : null
    };
    return 'BEXAM2_' + safeBase64Encode(JSON.stringify(payload));
  }

  function decodeExamSyncState(codeStr) {
    if (!codeStr) return null;
    let clean = codeStr.trim().replace(/\s+/g, '');

    // Strip prefix if any (e.g. BEXAM2_, BEXAM1_, BEXAM_)
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
    return parsed;
  }

  function mergeExamSyncData(incoming) {
    if (!incoming || typeof incoming !== 'object') return 0;

    let mergedCount = 0;
    if (incoming.records && Array.isArray(incoming.records)) {
      const existingRecords = getExamRecords();
      const existingMap = {};
      existingRecords.forEach(r => { if (r.id) existingMap[r.id] = true; });

      incoming.records.forEach(r => {
        if (r && r.id && !existingMap[r.id]) {
          existingRecords.push(r);
          existingMap[r.id] = true;
          mergedCount++;
        }
      });

      // Sort by submit time descending
      existingRecords.sort((a, b) => (b.id || '').localeCompare(a.id || ''));
      safeSetItem(getExamRecordsKey(), JSON.stringify(existingRecords));
      updateRecordCountBadge();
    }

    // Restore active exam if present and current is fresh
    if (incoming.active && incoming.active.paper) {
      if (!currentExam || currentExam.isSubmitted || Object.keys(currentExam.userAnswers || {}).length === 0) {
        startNewExam(incoming.active.paper);
        currentExam.userAnswers = incoming.active.ans || {};
        currentExam.marked = incoming.active.marked || {};
        currentExam.timeRemaining = incoming.active.time || TOTAL_EXAM_TIME;
        saveState();
        renderCurrentQuestion();
        updateAnsweredCount();
      }
    }

    return mergedCount;
  }

  const CLOUD_EXAM_ENDPOINTS = [
    { name: 'kvdb', get: (key) => `https://kvdb.io/B5mX7q8Y3pZ1/exam_${key}`, put: (key) => `https://kvdb.io/B5mX7q8Y3pZ1/exam_${key}` },
    { name: 'jsonblob', get: (key) => `https://jsonblob.com/api/jsonBlob/b_exam_${key}`, put: (key) => `https://jsonblob.com/api/jsonBlob/b_exam_${key}` }
  ];

  async function triggerExamCloudUpload(syncKey) {
    const cleanKey = encodeURIComponent(syncKey.trim());
    const payload = {
      records: getExamRecords(),
      active: currentExam && !currentExam.isSubmitted ? {
        paper: currentExam.paperNumber || 1,
        ans: currentExam.userAnswers || {},
        marked: currentExam.marked || {},
        time: currentExam.timeRemaining
      } : null,
      updatedAt: Date.now()
    };

    for (let provider of CLOUD_EXAM_ENDPOINTS) {
      try {
        const res = await fetch(provider.put(cleanKey), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (res.ok) return;
      } catch (e) {}
    }
  }

  async function autoCloudSyncExam(syncKey) {
    if (!syncKey) return;
    const cleanKey = encodeURIComponent(syncKey.trim());
    if (!examCloudSyncStatus) return;

    examCloudSyncStatus.textContent = '🔄 正在同步云端考试历史与记录...';
    examCloudSyncStatus.className = 'sync-status';

    for (let provider of CLOUD_EXAM_ENDPOINTS) {
      try {
        const res = await fetch(provider.get(cleanKey));
        if (res.ok) {
          const data = await res.json();
          if (data && data.records) {
            const added = mergeExamSyncData(data);
            examCloudSyncStatus.textContent = `✓ 已成功同步云端考试记录 (共 ${getExamRecords().length} 套考卷档案，本次新增 ${added} 套)`;
            examCloudSyncStatus.className = 'sync-status success';
            return;
          }
        }
      } catch (e) {}
    }

    try {
      await triggerExamCloudUpload(syncKey);
      examCloudSyncStatus.textContent = '✓ 已成功创建并绑定专属考试暗号！';
      examCloudSyncStatus.className = 'sync-status success';
    } catch (e) {
      examCloudSyncStatus.innerHTML = '💡 提示：网络连接超时。请优先使用下方<b>【方式二：复制/粘贴考试暗号】</b>秒级同步！';
      examCloudSyncStatus.className = 'sync-status error';
    }
  }

})();
