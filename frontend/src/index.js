import { ensureAuth } from './ui.js'; // для структуры, но здесь не нужен

const loginBtn   = document.getElementById('loginBtn');
const nameInput  = document.getElementById('displayName');
const errorEl    = document.getElementById('error');

loginBtn.addEventListener('click', async () => {
  const displayName = nameInput.value.trim();
  if (!displayName) {
    errorEl.textContent = 'Ник не может быть пустым';
    return;
  }
  try {
    const res  = await fetch('/api/auth', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ displayName })
    });
    const json = await res.json();
    if (!res.ok) {
      errorEl.textContent = json.error || 'Ошибка сервера';
      return;
    }
    localStorage.setItem('jwt', json.token);
    location.href = 'lobbies.html';
  } catch {
    errorEl.textContent = 'Сервер недоступен';
  }
});
