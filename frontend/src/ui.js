// src/ui.js

/**
 * Если нет JWT в localStorage — редиректит на корневую страницу (login.html или index.html).
 */
export function ensureAuth() {
  const token = localStorage.getItem('jwt');
  if (!token) {
    window.location.href = '/';
    throw new Error('No JWT');
  }
}

/**
 * Удаляет JWT из localStorage и редиректит на вход.
 */
export function logout() {
  localStorage.removeItem('jwt');
  window.location.href = '/';
}
