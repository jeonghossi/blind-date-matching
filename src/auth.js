// 계정: 비밀번호 해시 + 로그인 세션
const crypto = require('crypto');

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7일

// 비밀번호는 그대로 저장하지 않고 salt + scrypt 해시로 저장
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

function verifyPassword(password, { salt, hash }) {
  const actual = crypto.scryptSync(String(password), salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function validateCredentials(username, password) {
  const errors = [];
  if (!/^[a-z0-9_]{4,20}$/.test(username || '')) errors.push('아이디는 영문 소문자·숫자·_ 4~20자');
  if (typeof password !== 'string' || password.length < 8) errors.push('비밀번호는 8자 이상');
  return errors;
}

// 로그인 토큰 → userId
class SessionStore {
  constructor() {
    this.sessions = new Map();
  }

  create(userId) {
    const token = crypto.randomBytes(32).toString('hex');
    this.sessions.set(token, { userId, expires: Date.now() + SESSION_TTL_MS });
    return token;
  }

  get(token) {
    const s = token && this.sessions.get(token);
    if (!s) return null;
    if (s.expires < Date.now()) {
      this.sessions.delete(token);
      return null;
    }
    return s.userId;
  }

  delete(token) {
    this.sessions.delete(token);
  }

  clear() {
    this.sessions.clear();
  }
}

function parseCookies(header = '') {
  return Object.fromEntries(
    header.split(';').map((c) => c.trim().split('=')).filter(([k, v]) => k && v).map(([k, v]) => [k, decodeURIComponent(v)]),
  );
}

module.exports = { SESSION_TTL_MS, hashPassword, verifyPassword, validateCredentials, SessionStore, parseCookies };
