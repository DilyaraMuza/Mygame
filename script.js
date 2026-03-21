import { loadFromFirebase, saveToFirebase } from './firebase-config.js';

// ========== СОСТОЯНИЕ ==========
let state = {
    designerTheory: 0,
    designerPractice: 0,
    english: 0,
    style: 0,
    coins: 0,
    streak: 0,
    lastLogin: new Date().toDateString(),
    bonusClaimedToday: false,
    quests: []  
};

// ========== РАНГИ ==========
const globalRanks = [
    'Новичок', 'Ученик', 'Джуниор', 'Мидл', 'Сеньор',
    'Мастер', 'Грандмастер', 'Легенда', 'Мифический', 'Божественный'
];
const englishRanks = [
    'Исследователь', 'Говорун', 'Коммуникатор', 'Свободный',
    'Мастер слова', 'Поэт', 'Оратор', 'Дипломат', 'Литератор', 'Хранитель языка'
];
const styleRanks = [
    'Наблюдатель', 'Стилист', 'Творец', 'Авторский стиль',
    'Икона стиля', 'Легенда', 'Искусство', 'Маэстро', 'Гений', 'Бессмертный стиль'
];

// ========== XP ПОРОГИ ==========
const thresholds = [0, 100, 250, 450, 700, 1000, 1350, 1750, 2200, 2700, 3300];

// ========== ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ==========
let audioCtx = null;
let currentFilter = 'all';
let editingQuestId = null;

// ========== ЗВУК ==========
function playCoinSound() {
    try {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
        
        const now = audioCtx.currentTime;
        const osc1 = audioCtx.createOscillator();
        const osc2 = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        
        osc1.type = 'sine';
        osc2.type = 'sine';
        
        osc1.frequency.setValueAtTime(800, now);
        osc1.frequency.exponentialRampToValueAtTime(1200, now + 0.1);
        osc2.frequency.setValueAtTime(1200, now + 0.05);
        osc2.frequency.exponentialRampToValueAtTime(600, now + 0.15);
        
        gainNode.gain.setValueAtTime(0.1, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
        
        osc1.connect(gainNode);
        osc2.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        
        osc1.start(now);
        osc2.start(now + 0.05);
        osc1.stop(now + 0.2);
        osc2.stop(now + 0.2);
    } catch (e) {
        console.log('Audio error:', e);
    }
}

// ========== УВЕДОМЛЕНИЯ ==========
function showXpToast(xp) {
    const toast = document.getElementById('xpToast');
    toast.textContent = `+${xp} XP`;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 800);
}

function showLevelToast(skillName, level, rank) {
    const toast = document.getElementById('levelToast');
    toast.textContent = `${skillName} · уровень ${level} · ${rank}`;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2000);
}

// ========== ФУНКЦИИ УРОВНЕЙ ==========
function getLevel(xp) {
    for (let i = thresholds.length - 1; i >= 0; i--) {
        if (xp >= thresholds[i]) return i + 1;
    }
    return 1;
}

function getProgress(xp) {
    let lvl = getLevel(xp);
    if (lvl >= thresholds.length) return 100;
    let current = thresholds[lvl - 1];
    let next = thresholds[lvl];
    return Math.min(100, Math.floor(((xp - current) / (next - current)) * 100));
}

function getGlobalLevel() {
    let l1 = getLevel(state.designerTheory);
    let l2 = getLevel(state.designerPractice);
    let l3 = getLevel(state.english);
    let l4 = getLevel(state.style);
    let desLvl = Math.min(l1, l2);
    let sum = desLvl + l3 + l4;
    let global = Math.floor(Math.sqrt(sum) * 1.5);
    return Math.min(10, Math.max(1, global));
}

// ========== ФУНКЦИИ ДАТ ==========
function formatDate(dateStr) {
    if (!dateStr) return '';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const date = new Date(dateStr);
    date.setHours(0, 0, 0, 0);
    
    const diffTime = date - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'сегодня';
    if (diffDays === 1) return 'до завтра';
    if (diffDays < 0) return `просрочено на ${-diffDays} ${getDayWord(-diffDays)}`;
    return `до ${dateStr.split('-').reverse().join('.')}`;
}

function getDayWord(days) {
    if (days % 10 === 1 && days % 100 !== 11) return 'день';
    if (days % 10 >= 2 && days % 10 <= 4 && (days % 100 < 10 || days % 100 >= 20)) return 'дня';
    return 'дней';
}

function isOverdue(dateStr) {
    if (!dateStr) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const date = new Date(dateStr);
    date.setHours(0, 0, 0, 0);
    return date < today;
}

function isToday(dateStr) {
    if (!dateStr) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const date = new Date(dateStr);
    date.setHours(0, 0, 0, 0);
    return date.getTime() === today.getTime();
}

function isUrgent(dateStr) {
    if (!dateStr) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const date = new Date(dateStr);
    date.setHours(0, 0, 0, 0);
    const diffDays = Math.ceil((date - today) / (1000 * 60 * 60 * 24));
    return diffDays >= 0 && diffDays <= 1;
}

// ========== ЛОКАЛЬНОЕ СОХРАНЕНИЕ ==========
function saveState() {
    localStorage.setItem('stazhor_state', JSON.stringify(state));
}

function loadState() {
    let saved = localStorage.getItem('stazhor_state');
    if (saved) {
        try {
            let loaded = JSON.parse(saved);
            state = { ...state, ...loaded };
        } catch (e) {}
    }
}

// ========== БОНУС ==========
function updateBonusUI() {
    document.getElementById('streakDays').innerText = state.streak || 0;
    document.getElementById('coinBalance').innerText = state.coins || 0;
}

function checkDailyBonus() {
    let today = new Date().toDateString();
    if (state.lastLogin !== today) {
        let yesterday = new Date(Date.now() - 86400000).toDateString();
        if (state.lastLogin === yesterday) {
            state.streak++;
        } else {
            state.streak = 1;
        }
        state.lastLogin = today;
        state.bonusClaimedToday = false;
        saveState();
    }
    updateBonusUI();
}

async function claimBonus() {
    let today = new Date().toDateString();
    if (state.lastLogin === today && !state.bonusClaimedToday) {
        state.coins += 10 + state.streak * 2;
        state.designerTheory += 10;
        state.designerPractice += 10;
        state.english += 10;
        state.style += 10;
        state.bonusClaimedToday = true;
        
        saveState();
        await saveToFirebase(state);
        renderHome();
        renderStats();
        playCoinSound();
        showXpToast(40);
    }
    updateBonusUI();
}

// ========== СБРОС ==========
async function resetProgress() {
    if (confirm('Сбросить весь прогресс? Это нельзя отменить.')) {
        state = {
            designerTheory: 0,
            designerPractice: 0,
            english: 0,
            style: 0,
            coins: 0,
            streak: 0,
            lastLogin: new Date().toDateString(),
            bonusClaimedToday: false,
            quests: []
        };
        saveState();
        await saveToFirebase(state);
        renderHome();
        renderQuests();
        renderStats();
    }
}

// ========== КВЕСТЫ ==========
async function completeQuest(questId) {
    let quest = state.quests.find(x => x.id === questId);
    if (!quest || quest.done) return;
    
    quest.done = true;
    
    let oldDes = Math.min(getLevel(state.designerTheory), getLevel(state.designerPractice));
    let oldEn = getLevel(state.english);
    let oldSt = getLevel(state.style);
    let oldGlobal = getGlobalLevel();
    
    switch (quest.type) {
        case 'designerTheory':
            state.designerTheory += quest.xp;
            break;
        case 'designerPractice':
            state.designerPractice += quest.xp;
            break;
        case 'english':
            state.english += quest.xp;
            break;
        case 'style':
            state.style += quest.xp;
            break;
    }
    
    state.coins += Math.floor(quest.xp / 10);
    
    let newDes = Math.min(getLevel(state.designerTheory), getLevel(state.designerPractice));
    let newEn = getLevel(state.english);
    let newSt = getLevel(state.style);
    let newGlobal = getGlobalLevel();
    
    if (newDes > oldDes) showLevelToast('Дизайнер', newDes, globalRanks[newDes - 1]);
    if (newEn > oldEn) showLevelToast('Английский', newEn, englishRanks[newEn - 1]);
    if (newSt > oldSt) showLevelToast('Персональный стиль', newSt, styleRanks[newSt - 1]);
    if (newGlobal > oldGlobal) showLevelToast('Общий уровень', newGlobal, globalRanks[newGlobal - 1]);
    
    saveState();
    await saveToFirebase(state);
    playCoinSound();
    showXpToast(quest.xp);
    renderHome();
    renderStats();
}

function openEditModal(questId) {
    let quest = state.quests.find(x => x.id === questId);
    if (!quest) return;
    
    editingQuestId = questId;
    document.getElementById('editName').value = quest.name;
    document.getElementById('editType').value = quest.type;
    document.getElementById('editDifficulty').value = quest.xp.toString();
    document.getElementById('editDate').value = quest.date || '';
    
    document.getElementById('editModal').classList.add('active');
}

async function saveEdit() {
    if (!editingQuestId) return;
    
    let quest = state.quests.find(x => x.id === editingQuestId);
    if (!quest) return;
    
    quest.name = document.getElementById('editName').value;
    quest.type = document.getElementById('editType').value;
    quest.xp = parseInt(document.getElementById('editDifficulty').value);
    quest.date = document.getElementById('editDate').value;
    
    saveState();
    await saveToFirebase(state);
    renderQuests();
    document.getElementById('editModal').classList.remove('active');
    editingQuestId = null;
}

// ========== ОТРИСОВКА ==========
function renderHome() {
    let dt = state.designerTheory, dp = state.designerPractice;
    let en = state.english, st = state.style;
    let desLvl = Math.min(getLevel(dt), getLevel(dp));
    let enLvl = getLevel(en);
    let stLvl = getLevel(st);
    let global = getGlobalLevel();
    
    function getXpToNextLevel(xp) {
        let lvl = getLevel(xp);
        if (lvl >= thresholds.length) return 0;
        return thresholds[lvl] - xp;
    }
    
    let html = `
        <div class="skill-card">
            <div class="skill-header">
                <span>ДИЗАЙНЕР</span>
                <span class="skill-level-badge">ур.${desLvl} · ${globalRanks[desLvl - 1]}</span>
            </div>
            <div class="progress-bg"><div class="progress-fill" style="width:${Math.min(getProgress(dt), getProgress(dp))}%"></div></div>
            <div class="skill-stats">
                <span>до след. уровня: ${getXpToNextLevel(Math.min(dt, dp))} XP</span>
            </div>
        </div>
        <div class="skill-card">
            <div class="skill-header">
                <span>АНГЛИЙСКИЙ</span>
                <span class="skill-level-badge">ур.${enLvl} · ${englishRanks[enLvl - 1]}</span>
            </div>
            <div class="progress-bg"><div class="progress-fill" style="width:${getProgress(en)}%"></div></div>
            <div class="skill-stats">
                <span>до след. уровня: ${getXpToNextLevel(en)} XP</span>
            </div>
        </div>
        <div class="skill-card">
            <div class="skill-header">
                <span>ПЕРСОНАЛЬНЫЙ СТИЛЬ</span>
                <span class="skill-level-badge">ур.${stLvl} · ${styleRanks[stLvl - 1]}</span>
            </div>
            <div class="progress-bg"><div class="progress-fill" style="width:${getProgress(st)}%"></div></div>
            <div class="skill-stats">
                <span>до след. уровня: ${getXpToNextLevel(st)} XP</span>
            </div>
        </div>
    `;
    document.getElementById('skillsContainer').innerHTML = html;
    
    document.getElementById('globalLevel').innerText = global;
    document.getElementById('globalTitle').innerText = globalRanks[global - 1];
    let globalXp = dt + dp + en + st;
    document.getElementById('globalProgress').style.width = Math.min(100, (globalXp % 200) / 2) + '%';
    
    updateBonusUI();
}

function renderQuests() {
    let active = state.quests.filter(q => !q.done);
    
    if (currentFilter === 'urgent') {
        active = active.filter(q => isUrgent(q.date));
    } else if (currentFilter === 'overdue') {
        active = active.filter(q => isOverdue(q.date));
    }
    
    const tasks = active.filter(q => q.xp === 20);
    const missions = active.filter(q => q.xp === 50);
    const operations = active.filter(q => q.xp === 100);
    const epic = active.filter(q => q.xp === 200);
    
    let html = '';
    
    if (tasks.length > 0) {
        html += '<div class="quest-section"><div class="section-title">ЗАДАЧА ★</div>';
        tasks.forEach(q => {
            let overdueClass = isOverdue(q.date) ? 'overdue' : (isToday(q.date) ? 'today' : '');
            html += `
                <div class="quest-item ${overdueClass}" data-id="${q.id}">
                    <div class="quest-check" data-id="${q.id}"></div>
                    <div class="quest-content">
                        <div class="quest-title">${q.name}</div>
                        <div class="quest-meta">+${q.xp} XP</div>
                        ${q.date ? `<div class="quest-date">${formatDate(q.date)}</div>` : ''}
                    </div>
                    <div class="delete-btn" data-id="${q.id}">✕</div>
                </div>
            `;
        });
        html += '</div>';
    }
    
    if (missions.length > 0) {
        html += '<div class="quest-section"><div class="section-title">МИССИЯ ★★</div>';
        missions.forEach(q => {
            let overdueClass = isOverdue(q.date) ? 'overdue' : (isToday(q.date) ? 'today' : '');
            html += `
                <div class="quest-item ${overdueClass}" data-id="${q.id}">
                    <div class="quest-check" data-id="${q.id}"></div>
                    <div class="quest-content">
                        <div class="quest-title">${q.name}</div>
                        <div class="quest-meta">+${q.xp} XP</div>
                        ${q.date ? `<div class="quest-date">${formatDate(q.date)}</div>` : ''}
                    </div>
                    <div class="delete-btn" data-id="${q.id}">✕</div>
                </div>
            `;
        });
        html += '</div>';
    }
    
    if (operations.length > 0) {
        html += '<div class="quest-section"><div class="section-title">ОПЕРАЦИЯ ★★★</div>';
        operations.forEach(q => {
            let overdueClass = isOverdue(q.date) ? 'overdue' : (isToday(q.date) ? 'today' : '');
            html += `
                <div class="quest-item ${overdueClass}" data-id="${q.id}">
                    <div class="quest-check" data-id="${q.id}"></div>
                    <div class="quest-content">
                        <div class="quest-title">${q.name}</div>
                        <div class="quest-meta">+${q.xp} XP</div>
                        ${q.date ? `<div class="quest-date">${formatDate(q.date)}</div>` : ''}
                    </div>
                    <div class="delete-btn" data-id="${q.id}">✕</div>
                </div>
            `;
        });
        html += '</div>';
    }
    
    if (epic.length > 0) {
        html += '<div class="quest-section"><div class="section-title">ЭПИЧЕСКАЯ МИССИЯ ★★★★</div>';
        epic.forEach(q => {
            let overdueClass = isOverdue(q.date) ? 'overdue' : (isToday(q.date) ? 'today' : '');
            html += `
                <div class="quest-item ${overdueClass}" data-id="${q.id}">
                    <div class="quest-check" data-id="${q.id}"></div>
                    <div class="quest-content">
                        <div class="quest-title">${q.name}</div>
                        <div class="quest-meta">+${q.xp} XP</div>
                        ${q.date ? `<div class="quest-date">${formatDate(q.date)}</div>` : ''}
                    </div>
                    <div class="delete-btn" data-id="${q.id}">✕</div>
                </div>
            `;
        });
        html += '</div>';
    }
    
    if (html === '') {
        html = '<p style="text-align:center;">нет активных квестов</p>';
    }
    
    document.getElementById('questsContainer').innerHTML = html;
    
    document.querySelectorAll('.quest-check').forEach(el => {
        el.addEventListener('click', function(e) {
            e.stopPropagation();
            let id = parseInt(this.dataset.id);
            completeQuest(id);
            
            let parent = this.closest('.quest-item');
            if (parent) {
                parent.classList.add('fade-out');
                setTimeout(() => renderQuests(), 300);
            } else {
                renderQuests();
            }
        });
    });
    
    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            let id = parseInt(this.dataset.id);
            if (confirm('Удалить квест?')) {
                state.quests = state.quests.filter(q => q.id !== id);
                saveState();
                saveToFirebase(state);
                renderQuests();
                renderStats();
            }
        });
    });
    
    document.querySelectorAll('.quest-item').forEach(el => {
        el.addEventListener('click', function(e) {
            if (e.target.classList.contains('quest-check')) return;
            if (e.target.classList.contains('delete-btn')) return;
            let id = parseInt(this.dataset.id);
            openEditModal(id);
        });
    });
}

function renderStats() {
    let total = state.designerTheory + state.designerPractice + state.english + state.style;
    document.getElementById('totalXP').innerText = total;
    document.getElementById('doneCount').innerText = state.quests.filter(q => q.done).length;
    document.getElementById('statsCoins').innerText = state.coins;
    document.getElementById('statsStreak').innerText = state.streak;
}

// ========== АВАТАРКА ==========
const fileInput = document.getElementById('fileInput');
const avatarLarge = document.getElementById('avatarLarge');
const avatarImg = document.getElementById('avatarImg');
const avatarPlaceholder = document.getElementById('avatarPlaceholder');

avatarLarge.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(ev) {
            avatarImg.src = ev.target.result;
            avatarImg.style.display = 'block';
            avatarPlaceholder.style.display = 'none';
            localStorage.setItem('stazhor_avatar', ev.target.result);
        };
        reader.readAsDataURL(file);
    }
});

const savedAvatar = localStorage.getItem('stazhor_avatar');
if (savedAvatar) {
    avatarImg.src = savedAvatar;
    avatarImg.style.display = 'block';
    avatarPlaceholder.style.display = 'none';
}

// ========== ВКЛАДКИ ==========
document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', function(e) {
        e.preventDefault();
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        this.classList.add('active');
        document.getElementById(this.dataset.page).classList.add('active');
    });
});

// ========== ФИЛЬТРЫ ==========
document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', function() {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        currentFilter = this.dataset.filter;
        renderQuests();
    });
});

// ========== ДОБАВЛЕНИЕ КВЕСТА ==========
document.getElementById('addQuestBtn').addEventListener('click', function(e) {
    e.preventDefault();
    let name = document.getElementById('questName').value.trim();
    if (!name) return alert('введи название');
    let type = document.getElementById('questType').value;
    let xp = parseInt(document.getElementById('questDifficulty').value);
    let date = document.getElementById('questDate').value;
    let newId = state.quests.length ? Math.max(...state.quests.map(q => q.id)) + 1 : 1;
    state.quests.push({ id: newId, name, type, xp, difficulty: xp.toString(), date, done: false });
    saveState();
    document.getElementById('questName').value = '';
    document.getElementById('questDate').value = '';
    renderQuests();
    document.querySelector('[data-page="pageQuests"]').click();
});

// ========== БОНУС ==========
document.getElementById('dailyBonusBtn').addEventListener('click', function(e) {
    e.preventDefault();
    claimBonus();
});

// ========== СБРОС ==========
document.getElementById('resetProgressBtn').addEventListener('click', function(e) {
    e.preventDefault();
    resetProgress();
});

// ========== РЕДАКТИРОВАНИЕ ==========
document.getElementById('saveEditBtn').addEventListener('click', function() {
    saveEdit();
});

document.getElementById('editModal').addEventListener('click', function(e) {
    if (e.target === this) {
        saveEdit();
    }
});

// ========== ЗАПУСК ==========
async function init() {
    await loadFromFirebase(state);
    checkDailyBonus();
    renderHome();
    renderQuests();
    renderStats();
}

init();