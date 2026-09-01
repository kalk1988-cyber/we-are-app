// সাধারণ API হেল্পার ফাংশন

async function apiPost(url, body) {
  const token = localStorage.getItem('token');
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'কিছু একটা ভুল হয়েছে');
  return data;
}

async function apiPut(url, body) {
  const token = localStorage.getItem('token');
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'কিছু একটা ভুল হয়েছে');
  return data;
}

async function apiGet(url) {
  const token = localStorage.getItem('token');
  const res = await fetch(url, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'কিছু একটা ভুল হয়েছে');
  return data;
}

async function apiDelete(url) {
  const token = localStorage.getItem('token');
  const res = await fetch(url, {
    method: 'DELETE',
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'কিছু একটা ভুল হয়েছে');
  return data;
}

function requireLogin() {
  const token = localStorage.getItem('token');
  if (!token) {
    window.location.href = 'index.html';
  }
}

function requireAdmin() {
  const user = JSON.parse(localStorage.getItem('user') || 'null');
  if (!user || user.role !== 'admin') {
    window.location.href = 'profile.html';
  }
}

function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.location.href = 'index.html';
}
