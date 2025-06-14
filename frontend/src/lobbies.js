// src/lobbies.js
import { ensureAuth, logout } from './ui.js';
import { io } from 'socket.io-client';
import { initChat } from './chat.js';

ensureAuth(); // если токена нет — редиректит на /

const token = localStorage.getItem('jwt');
const headers = { 'Authorization': `Bearer ${token}` };

// Настраиваем WebSocket
const socket = io({
  auth: { token }
});

// HTML-элементы
const lobbyListEl     = document.getElementById('lobbyList');
const newLobbyNameEl  = document.getElementById('newLobbyName');
const createLobbyBtn  = document.getElementById('createLobbyBtn');
const logoutBtn       = document.getElementById('logoutBtn');

// Выход из аккаунта
logoutBtn.addEventListener('click', logout);

// Создание нового лобби
createLobbyBtn.addEventListener('click', async () => {
  const name = newLobbyNameEl.value.trim();
  if (!name) return alert('Введите название лобби');
  const res = await fetch('/api/lobby', {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  });
  if (res.status === 401) return logout();
  const json = await res.json();
  if (!res.ok) return alert(json.error);
  newLobbyNameEl.value = '';
  await loadLobbies();
});

// Загрузка списка лобби
async function loadLobbies() {
  const res = await fetch('/api/lobby', { headers });
  if (res.status === 401) return logout();
  const list = await res.json();
  lobbyListEl.innerHTML = '';
  list.forEach(l => {
    const btn = document.createElement('button');
    btn.className = 'button is-fullwidth mb-2';
    btn.textContent = `#${l.id} — ${l.name}`;
    btn.addEventListener('click', () => {
      // переходим в лобби — передаем lobbyId
      window.location.href = `lobby.html?lobbyId=${l.id}`;
    });
    lobbyListEl.appendChild(btn);
  });
}

// По возвращении в список лобби (или сразу после загрузки) — грузим его
loadLobbies();

// Если вы хотите сразу инициализировать чат на этой странице,
// то нужно понимать, что на странице списка лобби чата обычно нет.
// Но если всё-таки есть блок чата, то вот пример:
const chatBox   = document.getElementById('chat');
const chatInput = document.getElementById('chatInput');
const sendBtn   = document.getElementById('sendBtn');
if (chatBox && chatInput && sendBtn) {
  // Передайте в initChat нужные параметры — пример:
  //   socket      — ваш объект Socket.IO
  //   getLobbyId  — функция, возвращающая текущий lobbyId
  //   elements    — контейнеры чата
  initChat({
    socket,
    getLobbyId: () => new URLSearchParams(location.search).get('lobbyId'),
    chatBox,
    chatInput,
    sendBtn
  });
}
