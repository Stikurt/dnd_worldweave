// frontend/src/game.js

import { ensureAuth }       from './ui.js';
import { io }               from 'socket.io-client';
import { initCanvas }       from './game/canvas.js';
import { initTokenManager } from './game/tokenManager.js';
import { initUIControls }   from './game/uiControls.js';
import { initChat }         from './chat.js';    // НЕ ТРОГАЕМ
import { initVoice }        from './voice.js';
import { initDice }         from './dice.js';

document.addEventListener('DOMContentLoaded', () => {
  // 1) Авторизация + Socket.IO
  ensureAuth();
  const token   = localStorage.getItem('jwt');
  const socket  = io({ auth: { token }, path: '/socket.io' });
  const params  = new URLSearchParams(window.location.search);
  const lobbyId = Number(params.get('lobbyId'));
  if (!Number.isInteger(lobbyId)) {
    console.error('Неверный lobbyId');
    return;
  }

  // 1.1) Заходим в комнату
  socket.once('connect', () => {
    socket.emit('joinLobby', { lobbyId }, res => {
      if (res?.error) console.error('joinLobby:', res.error);
    });
  });

  // 2) Canvas
  const canvasEl = document.getElementById('gameBoard');
  if (!canvasEl) {
    console.error('Не найден <canvas id="gameBoard">');
    return;
  }
  const canvasAPI = initCanvas(canvasEl);
  canvasAPI.onTokenMove(tok => {
    socket.emit('moveToken', { lobbyId, id: tok.id, x: tok.x, y: tok.y }, () => {});
  });

  // 3) Token Manager + UI Controls
  const tokenManager = initTokenManager({
    gallery:        document.getElementById('tokenGallery'),
    categorySelect: document.getElementById('tokenCategory'),
    sizeSelect:     document.getElementById('tokenSize'),
    socket,
    lobbyId,
    canvasAPI
  });
  initUIControls({
    deleteTokenBtn:     document.getElementById('deleteToken'),
    clearBoardBtn:      document.getElementById('clearBoard'),
    tokenSizeSelect:    document.getElementById('tokenSize'),
    tokenCategorySelect:document.getElementById('tokenCategory'),
    tokenGallery:       document.getElementById('tokenGallery'),
    tokenManager,
    canvas:             canvasEl,
    canvasAPI,
    socket,
    lobbyId
  });

  socket.emit('getGameState', { lobbyId }, state => {
    if (state && !state.error) {
      state.placedTokens.forEach(p => {
        canvasAPI.addTokenWorld(p.x, p.y, p.color || '#000', p.radius || 20, p.resourceId, p.id);
      });
    } else if (state?.error) {
      console.error('getGameState', state.error);
    }
  });

  // 4) ВАЖНО: оборачиваем socket только для chat.js
  const chatBox   = document.getElementById('chatBox');
  const chatInput = document.getElementById('chatInput');
  const sendBtn   = document.getElementById('sendBtn');

  const chatSocket = {
    // всё, что слушаем — прокидываем
    on:  (evt, cb)   => socket.on(evt, cb),
    once:(evt, cb)   => socket.once(evt, cb),
    // emit — перехватываем только getChatHistory
    emit: (evt, data, ack) => {
      if (evt === 'getChatHistory') {
        // вместо несуществующего WS-эвента — HTTP-fetch
        fetch(`/api/lobby/${lobbyId}/chat`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
        .then(res => res.ok ? res.json() : Promise.reject(res.statusText))
        .then(msgs => ack({ messages: msgs, error: null }))
        .catch(err => {
          console.error('fetch history failed:', err);
          ack({ messages: [], error: err.toString() });
        });
      } else {
        // всё остальное — штатно
        socket.emit(evt, data, ack);
      }
    }
  };

  // 5) Инициализируем чат — chat.js не трогаем
  initChat(
    chatSocket,
    lobbyId,
    chatBox,
    chatInput,
    sendBtn
  );

  // 6) Кубики
  initDice(
    socket,
    lobbyId,
    document.getElementById('diceType'),
    document.getElementById('diceCount'),
    document.getElementById('rollDice')
  );

  // 7) Голосовой чат
  initVoice(
    document.getElementById('voiceBtn'),
    socket,
    lobbyId
  );

  socket.on('tokenPlaced', (tok) => {
    canvasAPI.addTokenWorld(tok.x, tok.y, tok.color || '#000', tok.radius || 20, tok.resourceId, tok.id);
  });
  socket.on('tokenMoved', (tok) => {
    canvasAPI.updateTokenPosition(tok.id, tok.x, tok.y);
  });
  socket.on('tokenRemoved', ({ id }) => {
    canvasAPI.removeToken(id);
  });

  // 8) Старт игры
  socket.on('gameStarted', ({ lobbyId: id }) => {
    if (id === lobbyId) {
      console.log('Game started!');
      // тут можно переключить интерфейс в режим самой игры
    }
  });
});
