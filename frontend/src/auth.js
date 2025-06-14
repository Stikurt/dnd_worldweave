// src/auth.js
const btn = document.getElementById('loginBtn');
btn.addEventListener('click', async () => {
  const name = document.getElementById('displayName').value.trim();
  if (!name) return alert('Ник не может быть пустым');
  try {
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ displayName: name })
    });
    const { token, error } = await res.json();
    if (error) return alert(error);
    localStorage.setItem('jwt', token);
    location.href = 'lobbies.html';
  } catch (e) {
    console.error(e);
    alert('Ошибка при логине');
  }
});
