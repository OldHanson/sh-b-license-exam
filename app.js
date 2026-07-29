/**
 * Project Leader B License Online Exam System - Application Logic
 */

(function () {
  'use strict';

  // Constants & Config
  const TOTAL_EXAM_TIME = 90 * 60; // 90 minutes in seconds
  const STORAGE_KEY = 'b_license_exam_state';

  // Application State
  let currentExam = {
    questions: [], // 100 items: 40 single, 20 multiple, 40 tf
    userAnswers: {}, // { [index]: answerValue }  Single/TF: "A", Multiple: ["A", "C"]
    marked: {}, // { [index]: true/false }
    startTime: null,
    timeRemaining: TOTAL_EXAM_TIME,
    isSubmitted: false,
    scoreResult: null
  };

  let currentIndex = 0;
  let timerInterval = null;

  // DOM Elements
  const examView = document.getElementById('examView');
  const resultView = document.getElementById('resultView');
  const timerDisplay = document.getElementById('timerDisplay');
  const timerBox = document.getElementById('timerBox');
  const answeredBadge = document.getElementById('answeredBadge');
  
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
  const btnRefreshExam = document.getElementById('btnRefreshExam');

  const sheetGridSingle = document.getElementById('sheetGridSingle');
  const sheetGridMulti = document.getElementById('sheetGridMulti');
  const sheetGridTF = document.getElementById('sheetGridTF');

  // Result Elements
  const finalScoreVal = document.getElementById('finalScoreVal');
  const scoreCircle = document.getElementById('scoreCircle');
  const passStatusBanner = document.getElementById('passStatusBanner');
  const passStatusText = document.getElementById('passStatusText');
  const summaryText = document.getElementById('summaryText');
  const singleScoreVal = document.getElementById('singleScoreVal');
  const multiScoreVal = document.getElementById('multiScoreVal');
  const tfScoreVal = document.getElementById('tfScoreVal');
  const btnRestartExam = document.getElementById('btnRestartExam');
  const reviewList = document.getElementById('reviewList');
  const wrongCountVal = document.getElementById('wrongCountVal');

  // Tab Buttons
  const tabBtns = document.querySelectorAll('.category-tabs .tab-btn');
  const filterBtns = document.querySelectorAll('.filter-btn');

  // Initialize System
  init();

  function init() {
    // Try to load state from localStorage or start new exam
    const savedState = localStorage.getItem(STORAGE_KEY);
    if (savedState) {
      try {
        const parsed = JSON.parse(savedState);
        if (parsed && parsed.questions && parsed.questions.length === 100 && !parsed.isSubmitted) {
          currentExam = parsed;
        } else {
          startNewExam();
        }
      } catch (e) {
        startNewExam();
      }
    } else {
      startNewExam();
    }

    setupEventListeners();
    startTimer();
    renderCurrentQuestion();
    updateAnsweredCount();
  }

  // Shuffle Array Helper
  function shuffle(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // Start New Exam (Randomly Sample 40 Single, 20 Multiple, 40 TF)
  function startNewExam() {
    const rawBank = window.QUESTION_BANK || [];
    
    const singles = rawBank.filter(q => q.category === 'single');
    const multiples = rawBank.filter(q => q.category === 'multiple');
    const tfs = rawBank.filter(q => q.category === 'tf');

    const sampledSingles = shuffle(singles).slice(0, 40);
    const sampledMultiples = shuffle(multiples).slice(0, 20);
    const sampledTFs = shuffle(tfs).slice(0, 40);

    // Combine in standard exam section order: Single (0..39), Multi (40..59), TF (60..99)
    const questions = [
      ...sampledSingles,
      ...sampledMultiples,
      ...sampledTFs
    ];

    currentExam = {
      questions: questions,
      userAnswers: {},
      marked: {},
      startTime: Date.now(),
      timeRemaining: TOTAL_EXAM_TIME,
      isSubmitted: false,
      scoreResult: null
    };

    currentIndex = 0;
    saveState();

    // Switch view back to exam
    resultView.classList.remove('active');
    examView.classList.add('active');
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(currentExam));
  }

  // Timer Management
  function startTimer() {
    if (timerInterval) clearInterval(timerInterval);

    timerInterval = setInterval(() => {
      if (currentExam.isSubmitted) {
        clearInterval(timerInterval);
        return;
      }

      currentExam.timeRemaining--;

      if (currentExam.timeRemaining <= 0) {
        currentExam.timeRemaining = 0;
        clearInterval(timerInterval);
        alert('⏰ 考试时间到！系统已为您自动提交试卷。');
        submitExam();
        return;
      }

      updateTimerDisplay();
      // Save state every 10 seconds
      if (currentExam.timeRemaining % 10 === 0) {
        saveState();
      }
    }, 1000);

    updateTimerDisplay();
  }

  function updateTimerDisplay() {
    const m = Math.floor(currentExam.timeRemaining / 60);
    const s = currentExam.timeRemaining % 60;
    const str = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    timerDisplay.textContent = str;

    if (currentExam.timeRemaining <= 300) { // 5 minutes remaining
      timerBox.classList.add('warning');
    } else {
      timerBox.classList.remove('warning');
    }
  }

  // Render Current Question
  function renderCurrentQuestion() {
    if (!currentExam.questions || currentExam.questions.length === 0) return;

    const q = currentExam.questions[currentIndex];
    
    // Update Header Tags
    qNumTag.textContent = `第 ${currentIndex + 1} 题`;
    
    if (q.category === 'single') {
      qTypeTag.textContent = '单选题';
      qScoreTag.textContent = '1.0 分';
      updateTabActive('single');
    } else if (q.category === 'multiple') {
      qTypeTag.textContent = '多选题';
      qScoreTag.textContent = '少选各0.5分';
      updateTabActive('multiple');
    } else {
      qTypeTag.textContent = '判断题';
      qScoreTag.textContent = '0.5 分';
      updateTabActive('tf');
    }

    // Update Mark Button
    const isMarked = currentExam.marked[currentIndex];
    if (isMarked) {
      btnMarkCurrent.classList.add('marked');
      markBtnText.textContent = '已标记';
    } else {
      btnMarkCurrent.classList.remove('marked');
      markBtnText.textContent = '标记疑难';
    }

    // Update Title
    qTitle.textContent = `${currentIndex + 1}. ${q.prompt}`;

    // Render Options
    optionsContainer.innerHTML = '';
    const userAns = currentExam.userAnswers[currentIndex];

    if (q.category === 'tf') {
      const opts = ['正确', '错误'];
      opts.forEach((optText, i) => {
        const key = i === 0 ? '正确' : '错误';
        const optEl = document.createElement('div');
        optEl.className = 'option-item' + (userAns === key ? ' selected' : '');
        optEl.innerHTML = `
          <div class="option-key">${i === 0 ? 'A' : 'B'}</div>
          <div class="option-text">${optText}</div>
        `;
        optEl.addEventListener('click', () => selectAnswer(key));
        optionsContainer.appendChild(optEl);
      });
    } else {
      // Single or Multiple
      const labels = ['A', 'B', 'C', 'D', 'E'];
      q.options.forEach((optText, i) => {
        const key = labels[i] || String.fromCharCode(65 + i);
        const isSelected = q.category === 'multiple' 
          ? (Array.isArray(userAns) && userAns.includes(key))
          : (userAns === key);

        const optEl = document.createElement('div');
        optEl.className = 'option-item' + (isSelected ? ' selected' : '');
        optEl.innerHTML = `
          <div class="option-key">${key}</div>
          <div class="option-text">${optText}</div>
        `;

        optEl.addEventListener('click', () => {
          if (q.category === 'multiple') {
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

  // Scoring Logic Implementation
  function calculateScore() {
    let singleScore = 0;
    let multiScore = 0;
    let tfScore = 0;
    let wrongCount = 0;

    const reviewDetails = [];

    currentExam.questions.forEach((q, idx) => {
      const userAns = currentExam.userAnswers[idx];
      let itemScore = 0;
      let status = 'wrong'; // 'correct', 'partial', 'wrong'

      if (q.category === 'single') {
        if (userAns === q.answer) {
          itemScore = 1.0;
          status = 'correct';
          singleScore += 1.0;
        } else {
          wrongCount++;
        }
      } else if (q.category === 'tf') {
        if (userAns === q.answer) {
          itemScore = 0.5;
          status = 'correct';
          tfScore += 0.5;
        } else {
          wrongCount++;
        }
      } else if (q.category === 'multiple') {
        // Multiple Choice Rule:
        // Extra/wrong option -> 0 pts
        // Partial correct (subset of correct options, 0 wrong option) -> 0.5 pt EACH correct option selected!
        const correctSet = new Set(Array.isArray(q.answer) ? q.answer : [q.answer]);
        const userSet = new Set(Array.isArray(userAns) ? userAns : []);

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
        } else if (correctCount === correctSet.size) {
          // All correct!
          itemScore = correctSet.size * 0.5; // Or full score
          status = 'correct';
          multiScore += itemScore;
        } else {
          // Partial correct
          itemScore = correctCount * 0.5;
          status = 'partial';
          multiScore += itemScore;
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

    const totalScore = singleScore + multiScore + tfScore;
    const timeUsedSeconds = TOTAL_EXAM_TIME - currentExam.timeRemaining;

    return {
      totalScore: totalScore.toFixed(1),
      singleScore: singleScore.toFixed(1),
      multiScore: multiScore.toFixed(1),
      tfScore: tfScore.toFixed(1),
      wrongCount: wrongCount,
      timeUsedSeconds: timeUsedSeconds,
      details: reviewDetails
    };
  }

  // Submit Exam Function
  function submitExam() {
    currentExam.isSubmitted = true;
    const res = calculateScore();
    currentExam.scoreResult = res;
    saveState();

    // Render Result View
    renderResultView(res);
    examView.classList.remove('active');
    resultView.classList.add('active');
    sheetModal.classList.remove('active');
  }

  function renderResultView(res) {
    finalScoreVal.textContent = res.totalScore;
    
    // Pass status threshold (standard 60.0)
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
    summaryText.textContent = `考试作答完成！用时 ${min}分${sec}秒，错题：${res.wrongCount} 题`;

    singleScoreVal.textContent = `${res.singleScore} / 40.0`;
    multiScoreVal.textContent = `${res.multiScore} 分`;
    tfScoreVal.textContent = `${res.tfScore} / 20.0`;
    wrongCountVal.textContent = res.wrongCount;

    renderReviewList('all', res.details);
  }

  function renderReviewList(filterType, details) {
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

      const userAnsStr = Array.isArray(item.userAnswer) ? item.userAnswer.join(', ') : (item.userAnswer || '未作答');
      const correctAnsStr = Array.isArray(item.correctAnswer) ? item.correctAnswer.join(', ') : item.correctAnswer;

      card.innerHTML = `
        <div class="review-item-header">
          <span style="font-weight: 700;">第 ${item.index + 1} 题 (${item.question.typeName})</span>
          ${statusBadge}
        </div>
        <div class="review-prompt">${item.question.prompt}</div>
        <div class="review-ans-row">
          <div>您的选择：<strong style="color: ${item.status === 'correct' ? '#10b981' : '#ef4444'};">${userAnsStr}</strong></div>
          <div>正确答案：<strong style="color: #10b981;">${correctAnsStr}</strong></div>
        </div>
      `;

      reviewList.appendChild(card);
    });
  }

  // Setup Event Listeners
  function setupEventListeners() {
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

    // Submit Buttons
    btnSubmitExam.addEventListener('click', () => {
      const unanswered = 100 - Object.keys(currentExam.userAnswers).length;
      let msg = '确定要提交试卷吗？';
      if (unanswered > 0) {
        msg = `您还有 ${unanswered} 道题未回答，确定要现在提交试卷吗？`;
      }
      if (confirm(msg)) {
        submitExam();
      }
    });

    btnSubmitFromSheet.addEventListener('click', () => {
      if (confirm('确定提交试卷并进行实时智能计算评分吗？')) {
        submitExam();
      }
    });

    // Refresh / Restart Exam
    btnRefreshExam.addEventListener('click', () => {
      if (confirm('确定要重新抽取试卷吗？当前已作答的进度将被重置。')) {
        startNewExam();
        startTimer();
        renderCurrentQuestion();
        updateAnsweredCount();
      }
    });

    btnRestartExam.addEventListener('click', () => {
      startNewExam();
      startTimer();
      renderCurrentQuestion();
      updateAnsweredCount();
    });

    // Filter Buttons in Review
    filterBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        filterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        if (currentExam.scoreResult) {
          renderReviewList(btn.dataset.filter, currentExam.scoreResult.details);
        }
      });
    });
  }

})();
