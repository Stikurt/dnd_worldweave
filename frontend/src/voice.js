// src/voice.js
import { io } from 'socket.io-client';

/**
 * Инициализация голосового чата
 * @param {HTMLButtonElement} voiceBtn — кнопка 🎤
 * @param {import("socket.io-client").Socket} socket — уже созданный socket.io клиент
 * @param {string|number} lobbyId — ID лобби
 */
export function initVoice(voiceBtn, socket, lobbyId) {
  let localStream = null;
  const peers = {};
  const userSockets = {};

  // при любом сигнале ICE/SDP
  socket.on('signal', async ({ from, signal }) => {
    let pc = peers[from];
    if (!pc) {
      pc = createPeerConnection(from);
      peers[from] = pc;
    }
    if (signal.description) {
      await pc.setRemoteDescription(signal.description);
      if (signal.description.type === 'offer') {
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('signal', { to: from, signal: { description: pc.localDescription } });
      }
    }
    if (signal.candidate) {
      await pc.addIceCandidate(signal.candidate);
    }
  });

  // когда кто-то заходит в комнату
  socket.on('peer-join', async (newUserId) => {
    if (!localStream) return;
    const pc = createPeerConnection(newUserId);
    peers[newUserId] = pc;
    localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit('signal', { to: newUserId, signal: { description: pc.localDescription } });
  });

  // кнопка 🎤
  voiceBtn.addEventListener('click', async () => {
    if (!localStream) {
      try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (e) {
        return alert('Нужен доступ к микрофону');
      }
      socket.emit('peer-join', { lobbyId: Number(lobbyId) });
      voiceBtn.classList.add('is-danger');
      voiceBtn.textContent = '🔴 Голос: вкл';
    } else {
      Object.values(peers).forEach(pc => pc.close());
      localStream.getTracks().forEach(t => t.stop());
      voiceBtn.classList.remove('is-danger');
      voiceBtn.textContent = '🎤 Голос';
      localStream = null;
    }
  });

  function createPeerConnection(peerId) {
    const pc = new RTCPeerConnection();
    pc.onicecandidate = ({ candidate }) => candidate &&
      socket.emit('signal', { to: peerId, signal: { candidate } });
    pc.ontrack = evt => {
      let audio = document.getElementById(`audio-${peerId}`);
      if (!audio) {
        audio = document.createElement('audio');
        audio.id = `audio-${peerId}`;
        audio.autoplay = true;
        document.body.appendChild(audio);
      }
      audio.srcObject = evt.streams[0];
    };
    return pc;
  }
}
