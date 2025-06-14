import { io } from 'socket.io-client';
import { initVoice } from './voice.js';

// --- АУТЕНТИФИКАЦИЯ И ВАЛИДАЦИЯ ПАРАМЕТРОВ ---
const token = localStorage.getItem('jwt');
if (!token) {
  location.href = '/';
}

// Хелпер для получения DOM-элемента или выброса ошибки, если он не найден
function getEl(id) {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Элемент с id="${id}" не найден`);
  return el;
}

// Извлечение и проверка lobbyId из параметров URL
const urlParams = new URLSearchParams(location.search);
const lobbyIdParam = urlParams.get('lobbyId');
if (!lobbyIdParam) {
  alert('Лобби не указано');
  location.href = '/lobbies.html';
}
const lobbyId = Number(lobbyIdParam);
if (!Number.isInteger(lobbyId)) {
  alert('Неверный ID лобби');
  location.href = '/lobbies.html';
}

// --- ССЫЛКИ НА ЭЛЕМЕНТЫ ---
const playersList = getEl('playersList');
const chatBox     = getEl('chat');
const chatInput   = getEl('chatInput');
const sendBtn     = getEl('sendBtn');
const leaveBtn    = getEl('leaveBtn');
const startBtn    = getEl('startBtn');
const voiceBtn    = getEl('voiceBtn');
const lobbyNameEl = getEl('lobbyName');
const errorBox    = getEl('error');

lobbyNameEl.textContent = `#${lobbyId}`;
let errorTimer = null;

// --- УТИЛИТЫ ---
function escapeHtml(text) {
  return text.replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function parseJwt(token) {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64).split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch {
    return {};
  }
}

const currentUser = parseJwt(token);
const headers = { 'Authorization': `Bearer ${token}` };

// --- SOCKET.IO ---
const socket = io('/', {
  path: '/socket.io',
  auth: { token }
});

socket.once('connect', () => {
  console.log('Socket connected');
  socket.emit('joinLobby', { lobbyId }, res => {
    if (res.error) return showError(res.error);
    console.log('Joined lobby', lobbyId);
  });
  loadPlayers();
  loadChatHistory();
});

socket.on('lobbyPlayers', players => {
  console.log('lobbyPlayers event', players);
  renderPlayers(players);
});

socket.on('newMessage', msg => {
  console.log('newMessage event', msg);
  appendMessage(msg);
});

socket.on('gameStarted', () => {
  console.log('gameStarted event');
  location.href = `/game.html?lobbyId=${lobbyId}`;
});

socket.on('disconnect', reason => {
  console.log('Socket disconnected:', reason);
  showError('Соединение потеряно: ' + reason);
});

initVoice(voiceBtn, socket, lobbyId);

// --- ЗАГРУЗЧИКИ ---
async function loadPlayers() {
  try {
    const res = await fetch(`/api/lobby/${lobbyId}/players`, { headers });
    if (res.status === 401) { location.href = '/'; return; }
    if (!res.ok) { console.error(`Ошибка загрузки игроков: ${res.status}`); return; }
    const list = await res.json();
    renderPlayers(list);
  } catch (e) {
    console.error('Ошибка при запросе списка игроков:', e);
    showError('Не удалось загрузить список игроков');
  }
}

async function loadChatHistory() {
  try {
    const res = await fetch(`/api/lobby/${lobbyId}/chat`, { headers });
    if (!res.ok) throw new Error(res.statusText);
    const msgs = await res.json();
    chatBox.innerHTML = '';
    msgs.forEach(m => appendMessage(m));
  } catch (e) {
    console.error('Ошибка при загрузке истории чата:', e);
    showError('Не удалось загрузить историю чата');
  }
}

// --- ОТОБРАЖЕНИЕ ---
function renderPlayers(players) {
  playersList.innerHTML = '';
  const uniquePlayers = players.filter((p, idx, arr) =>
    arr.findIndex(x => x.userId === p.userId) === idx
  );
  let isMaster = false;
  uniquePlayers.forEach(p => {
    const li = document.createElement('li');
    li.textContent = `${p.displayName}${p.isMaster ? ' (Мастер)' : ''}`;
    if (p.isMaster && (p.userId === currentUser.userId || p.userId === currentUser.sub)) isMaster = true;
    if (p.isMaster) li.classList.add('has-text-weight-bold');
    playersList.append(li);
  });
  startBtn.disabled = !isMaster;
}

function appendMessage({ displayName, text }) {
  const p = document.createElement('p');
  p.innerHTML = `<strong>${escapeHtml(displayName)}:</strong> ${escapeHtml(text)}`;
  chatBox.append(p);
  chatBox.scrollTop = chatBox.scrollHeight;
}

// --- ОТПРАВКА ---
function sendMessage() {
  const text = chatInput.value.trim();
  if (!text) return;
  console.log('sendMessage()', text);
  socket.emit('sendMessage', { lobbyId, text }, res => { if (res.error) showError(res.error); });
  chatInput.value = '';
  chatInput.focus();
}

sendBtn.addEventListener('click', sendMessage);
chatInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); sendMessage(); }});
leaveBtn.addEventListener('click', () => socket.emit('leaveLobby', { lobbyId }, () => location.href = '/lobbies.html'));

// --- ОБРАТНЫЙ ОТСЧЁТ И СТАРТ ---
startBtn.addEventListener('click', () => {
  console.log('Master clicked start');
  for (let i = 5; i >= 1; i--) {
    setTimeout(() => {
      console.log(`Countdown: ${i}`);
      socket.emit('sendMessage', { lobbyId, text: `Игра начнётся через ${i} сек...` }, () => {});
    }, (6 - i) * 1000);
  }
  setTimeout(() => {
    console.log('Emitting startGame');
    socket.emit('startGame', { lobbyId }, res => { if (res.error) showError(res.error); });
  }, 6000);
});

// --- ОШИБКИ ---
function showError(msg) {
  if (errorTimer) clearTimeout(errorTimer);
  console.log('showError()', msg);
  errorBox.textContent = msg;
  errorBox.classList.remove('is-hidden');
  errorTimer = setTimeout(() => errorBox.classList.add('is-hidden'), 3000);
}
