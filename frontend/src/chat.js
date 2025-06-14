// src/chat.js

export function initChat(socket, lobbyId, chatBox, chatInput, sendBtn) {
  const token = localStorage.getItem('jwt');

  // 0) Входим в комнату лобби, чтобы получать real-time новые сообщения
  if (socket.connected) {
    socket.emit('joinLobby', { lobbyId }, () => {});
  } else {
    socket.once('connect', () => {
      socket.emit('joinLobby', { lobbyId }, () => {});
    });
  }

  // 1) Загрузка истории через REST
  (async () => {
    try {
      const res = await fetch(`/api/lobby/${lobbyId}/chat`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const messages = await res.json();
      chatBox.innerHTML = '';
      messages.forEach(m => appendMsg(m));
    } catch (err) {
      console.error('Не удалось загрузить историю чата:', err);
      chatBox.innerHTML = 
        '<p class="chat-message other-message">Не удалось загрузить историю чата.</p>';
    }
  })();

  // 2) Подписка на новые сообщения
  socket.on('newMessage', m => appendMsg(m));

  // 3) Отправка нового сообщения
  function sendMessage() {
    const text = chatInput.value.trim();
    if (!text) return;
    socket.emit(
      'sendMessage',
      { lobbyId, text },
      res => { if (res.error) console.error(res.error); }
    );
    chatInput.value = '';
  }
  sendBtn.addEventListener('click', sendMessage);
  chatInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      sendMessage();
    }
  });

  // Вспомогательная функция отображения
  function appendMsg({ displayName, text }) {
    const p = document.createElement('p');
    p.classList.add('chat-message', 'other-message');
    p.innerHTML = `<strong>${displayName}:</strong> ${text}`;
    chatBox.append(p);
    chatBox.scrollTop = chatBox.scrollHeight;
  }
}
