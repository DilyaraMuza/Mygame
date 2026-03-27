import { loadFromFirebase, saveToFirebase } from './firebase-config.js';

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

const globalRanks = ['Новичок', 'Ученик', 'Джуниор', 'Мидл', 'Сеньор', 'Мастер', 'Грандмастер', 'Легенда', 'Мифический', 'Божественный'];
const englishRanks = ['Исследователь', 'Говорун', 'Коммуникатор', 'Свободный', 'Мастер слова', 'Поэт', 'Оратор', 'Дипломат', 'Литератор', 'Хранитель языка'];
const styleRanks = ['Наблюдатель', 'Стилист', 'Творец', 'Авторский стиль', 'Икона стиля', 'Легенда', 'Искусство', 'Маэстро', 'Гений', 'Бессмертный стиль'];
const thresholds = [0, 100, 250, 450, 700, 1000, 1350, 1750, 2200, 2700, 3300];

let audioCtx = null;
let currentFilter = 'all';
let editingQuestId = null;

function playCoinSound() {
    try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const now = audioCtx.currentTime;
        const osc1 = audioCtx.createOscillator();
        const osc2 = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc1.type = 'sine';
        osc2.type = 'sine';
        osc1.frequency.setValueAtTime(800, now);
        osc1.frequency.exponentialRampToValueAtTime(1200, now + 0.1);
        osc2.frequency.setValueAtTime(1200, now + 0.05);
        osc2.frequency.exponentialRampToValueAtTime(600, now + 0.15);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(audioCtx.destination);
        osc1.start(now);
        osc2.start(now + 0.05);
        osc1.stop(now + 0.2);
        osc2.stop(now + 0.2);
    } catch (e) {}
}

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

function getLevel(xp) {
    for (let i = thresholds.length - 1; i >= 0; i--) if (xp >= thresholds[i]) return i + 1;
    return 1;
}

function getProgress(xp) {
    let lvl = getLevel(xp);
    if (lvl >= thresholds.length) return 100;
    let cur = thresholds[lvl - 1];
    let next = thresholds[lvl];
    return Math.min(100, Math.floor(((xp - cur) / (next - cur)) * 100));
}

function getGlobalLevel() {
    let l1 = getLevel(state.designerTheory);
    let l2 = getLevel(state.designerPractice);
    let l3 = getLevel(state.english);
    let l4 = getLevel(state.style);
    let desLvl = Math.min(l1, l2);
    let sum = desLvl + l3 + l4;
    return Math.min(10, Math.max(1, Math.floor(Math.sqrt(sum) * 1.5)));
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const today = new Date();
    today.setHours(0,0,0,0);
    const date = new Date(dateStr);
    date.setHours(0,0,0,0);
    const diff = Math.ceil((date - today) / (1000 * 60 * 60 * 24));
    if (diff === 0) return 'сегодня';
    if (diff === 1) return 'до завтра';
    if (diff < 0) return `просрочено на ${-diff} дн.`;
    return `до ${dateStr.split('-').reverse().join('.')}`;
}

function isOverdue(dateStr) {
    if (!dateStr) return false;
    return new Date(dateStr) < new Date().setHours(0,0,0,0);
}

function isToday(dateStr) {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    const t = new Date();
    return d.setHours(0,0,0,0) === t.setHours(0,0,0,0);
}

function isUrgent(dateStr) {
    if (!dateStr) return false;
    const diff = Math.ceil((new Date(dateStr) - new Date().setHours(0,0,0,0)) / (1000*60*60*24));
    return diff >= 0 && diff <= 1;
}

function saveState() {
    localStorage.setItem('stazhor_state', JSON.stringify(state));
}

function updateBonusUI() {
    document.getElementById('streakDays').innerText = state.streak || 0;
    document.getElementById('coinBalance').innerText = state.coins || 0;
}

function checkDailyBonus() {
    let today = new Date().toDateString();
    if (state.lastLogin !== today) {
        let yesterday = new Date(Date.now() - 86400000).toDateString();
        state.streak = state.lastLogin === yesterday ? state.streak + 1 : 1;
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

async function resetProgress() {
    if (confirm('Сбросить весь прогресс?')) {
        state = {
            designerTheory: 0, designerPractice: 0, english: 0, style: 0,
            coins: 0, streak: 0,
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

async function completeQuest(questId) {
    let quest = state.quests.find(x => x.id === questId);
    if (!quest || quest.done) return;
    
    let oldDes = Math.min(getLevel(state.designerTheory), getLevel(state.designerPractice));
    let oldEn = getLevel(state.english);
    let oldSt = getLevel(state.style);
    let oldGlobal = getGlobalLevel();
    
    switch (quest.type) {
        case 'designerTheory': state.designerTheory += quest.xp; break;
        case 'designerPractice': state.designerPractice += quest.xp; break;
        case 'english': state.english += quest.xp; break;
        case 'style': state.style += quest.xp; break;
    }
    state.coins += Math.floor(quest.xp / 10);
    
    let newDes = Math.min(getLevel(state.designerTheory), getLevel(state.designerPractice));
    let newEn = getLevel(state.english);
    let newSt = getLevel(state.style);
    let newGlobal = getGlobalLevel();
    
    if (newDes > oldDes) showLevelToast('Дизайнер', newDes, globalRanks[newDes-1]);
    if (newEn > oldEn) showLevelToast('Английский', newEn, englishRanks[newEn-1]);
    if (newSt > oldSt) showLevelToast('Персональный стиль', newSt, styleRanks[newSt-1]);
    if (newGlobal > oldGlobal) showLevelToast('Общий уровень', newGlobal, globalRanks[newGlobal-1]);
    
    // Просто помечаем квест как выполненный
    quest.done = true;
    
    saveState();
    await saveToFirebase(state);
    playCoinSound();
    showXpToast(quest.xp);
    renderHome();
    renderStats();
    renderQuests();
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

function renderHome() {
    let dt = state.designerTheory, dp = state.designerPractice, en = state.english, st = state.style;
    let desLvl = Math.min(getLevel(dt), getLevel(dp));
    let enLvl = getLevel(en);
    let stLvl = getLevel(st);
    let global = getGlobalLevel();
    let getXpToNext = (xp) => {
        let lvl = getLevel(xp);
        return lvl >= thresholds.length ? 0 : thresholds[lvl] - xp;
    };
    let html = `
        <div class="skill-card"><div class="skill-header"><span>ДИЗАЙНЕР</span><span class="skill-level-badge">ур.${desLvl} · ${globalRanks[desLvl-1]}</span></div><div class="progress-bg"><div class="progress-fill" style="width:${Math.min(getProgress(dt), getProgress(dp))}%"></div></div><div class="skill-stats"><span>до след. уровня: ${getXpToNext(Math.min(dt, dp))} XP</span></div></div>
        <div class="skill-card"><div class="skill-header"><span>АНГЛИЙСКИЙ</span><span class="skill-level-badge">ур.${enLvl} · ${englishRanks[enLvl-1]}</span></div><div class="progress-bg"><div class="progress-fill" style="width:${getProgress(en)}%"></div></div><div class="skill-stats"><span>до след. уровня: ${getXpToNext(en)} XP</span></div></div>
        <div class="skill-card"><div class="skill-header"><span>ПЕРСОНАЛЬНЫЙ СТИЛЬ</span><span class="skill-level-badge">ур.${stLvl} · ${styleRanks[stLvl-1]}</span></div><div class="progress-bg"><div class="progress-fill" style="width:${getProgress(st)}%"></div></div><div class="skill-stats"><span>до след. уровня: ${getXpToNext(st)} XP</span></div></div>
    `;
    document.getElementById('skillsContainer').innerHTML = html;
    document.getElementById('globalLevel').innerText = global;
    document.getElementById('globalTitle').innerText = globalRanks[global-1];
    let globalXp = dt + dp + en + st;
    document.getElementById('globalProgress').style.width = Math.min(100, (globalXp % 200) / 2) + '%';
    updateBonusUI();
}

function renderQuests() {
    // Показываем только НЕвыполненные квесты
    let active = state.quests.filter(q => !q.done);
    
    if (currentFilter === 'urgent') active = active.filter(q => isUrgent(q.date));
    if (currentFilter === 'overdue') active = active.filter(q => isOverdue(q.date));
    
    let groups = { 20: [], 50: [], 100: [], 200: [] };
    active.forEach(q => groups[q.xp].push(q));
    let titles = { 20: 'ЗАДАЧА ★', 50: 'МИССИЯ ★★', 100: 'ОПЕРАЦИЯ ★★★', 200: 'ЭПИЧЕСКАЯ МИССИЯ ★★★★' };
    let html = '';
    for (let xp in titles) {
        if (groups[xp].length) {
            html += `<div class="quest-section"><div class="section-title">${titles[xp]}</div>`;
            groups[xp].forEach(q => {
                let cls = isOverdue(q.date) ? 'overdue' : (isToday(q.date) ? 'today' : '');
                html += `<div class="quest-item ${cls}" data-id="${q.id}"><div class="quest-check" data-id="${q.id}"></div><div class="quest-content"><div class="quest-title">${q.name}</div><div class="quest-meta">+${q.xp} XP</div>${q.date ? `<div class="quest-date">${formatDate(q.date)}</div>` : ''}</div><div class="delete-btn" data-id="${q.id}">✕</div></div>`;
            });
            html += '</div>';
        }
    }
    if (!html) html = '<p style="text-align:center;">нет активных квестов</p>';
    document.getElementById('questsContainer').innerHTML = html;
    
    document.querySelectorAll('.quest-check').forEach(el => {
        el.addEventListener('click', e => {
            e.stopPropagation();
            let id = parseInt(el.dataset.id);
            completeQuest(id);
            let parent = el.closest('.quest-item');
            if (parent) parent.classList.add('fade-out');
            setTimeout(() => renderQuests(), 300);
        });
    });
    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', e => {
            e.stopPropagation();
            let id = parseInt(btn.dataset.id);
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
        el.addEventListener('click', e => {
            if (e.target.classList.contains('quest-check')) return;
            if (e.target.classList.contains('delete-btn')) return;
            openEditModal(parseInt(el.dataset.id));
        });
    });
}

function renderStats() {
    let total = state.designerTheory + state.designerPractice + state.english + state.style;
    document.getElementById('totalXP').innerText = total;
    // Считаем выполненные квесты (где done === true)
    document.getElementById('doneCount').innerText = state.quests.filter(q => q.done).length;
    document.getElementById('statsCoins').innerText = state.coins;
    document.getElementById('statsStreak').innerText = state.streak;
}

const fileInput = document.getElementById('fileInput');
const avatarLarge = document.getElementById('avatarLarge');
const avatarImg = document.getElementById('avatarImg');
const avatarPlaceholder = document.getElementById('avatarPlaceholder');
avatarLarge.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', e => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = ev => {
            avatarImg.src = ev.target.result;
            avatarImg.style.display = 'block';
            avatarPlaceholder.style.display = 'none';
            localStorage.setItem('stazhor_avatar', ev.target.result);
        };
        reader.readAsDataURL(file);
    }
});
const saved = localStorage.getItem('stazhor_avatar');
if (saved) {
    avatarImg.src = saved;
    avatarImg.style.display = 'block';
    avatarPlaceholder.style.display = 'none';
}

document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', e => {
        e.preventDefault();
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(tab.dataset.page).classList.add('active');
    });
});

document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentFilter = btn.dataset.filter;
        renderQuests();
    });
});

document.getElementById('addQuestBtn').addEventListener('click', async e => {
    e.preventDefault();
    let name = document.getElementById('questName').value.trim();
    if (!name) return alert('введи название');
    let type = document.getElementById('questType').value;
    let xp = parseInt(document.getElementById('questDifficulty').value);
    let date = document.getElementById('questDate').value;
    let newId = state.quests.length ? Math.max(...state.quests.map(q => q.id)) + 1 : 1;
    state.quests.push({ id: newId, name, type, xp, difficulty: xp.toString(), date, done: false });
    saveState();
    await saveToFirebase(state);
    document.getElementById('questName').value = '';
    document.getElementById('questDate').value = '';
    renderQuests();
    document.querySelector('[data-page="pageQuests"]').click();
});

document.getElementById('dailyBonusBtn').addEventListener('click', e => { e.preventDefault(); claimBonus(); });
document.getElementById('resetProgressBtn').addEventListener('click', e => { e.preventDefault(); resetProgress(); });
document.getElementById('saveEditBtn').addEventListener('click', () => saveEdit());
document.getElementById('editModal').addEventListener('click', e => { if (e.target === this) saveEdit(); });

async function init() {
    await loadFromFirebase(state);
    checkDailyBonus();
    renderHome();
    renderQuests();
    renderStats();
}
init();