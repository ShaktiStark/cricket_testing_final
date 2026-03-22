// ═══════════════════════════════════════════════════
// AUTH — login / logout
// ═══════════════════════════════════════════════════
import { state }      from './state.js';
import { ADMIN_PASS } from './config.js';
import { goPage }     from './navigation.js';

export function playerLogin() {
  state.user = 'user';
  goPage('user-home');
}

export function showAdminForm() {
  document.getElementById('login-choose').style.display = 'none';
  document.getElementById('login-form').style.display   = 'block';
  document.getElementById('login-pass').value            = '';
  document.getElementById('login-err').style.display     = 'none';
  setTimeout(() => document.getElementById('login-pass').focus(), 50);
}

export function backToChoose() {
  document.getElementById('login-choose').style.display = 'flex';
  document.getElementById('login-form').style.display   = 'none';
  document.getElementById('login-pass').value            = '';
}

export function doAdminLogin() {
  const errEl = document.getElementById('login-err');
  const pass  = document.getElementById('login-pass').value;
  if (pass !== ADMIN_PASS) {
    errEl.textContent    = 'Wrong password';
    errEl.style.display  = 'block';
    return;
  }
  state.user = 'admin';
  goPage('admin-home');
}

export function logout() {
  state.user = null;
  goPage('login');
}
