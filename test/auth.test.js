const test = require('node:test');
const assert = require('node:assert');
const { hashPassword, verifyPassword, validateCredentials, SessionStore, parseCookies } = require('../src/auth');

test('비밀번호는 해시로 저장되고 맞는 비밀번호만 통과', () => {
  const stored = hashPassword('secret123');
  assert.ok(!JSON.stringify(stored).includes('secret123'));
  assert.strictEqual(verifyPassword('secret123', stored), true);
  assert.strictEqual(verifyPassword('wrong', stored), false);
});

test('같은 비밀번호도 매번 다른 해시', () => {
  assert.notStrictEqual(hashPassword('secret123').hash, hashPassword('secret123').hash);
});

test('아이디/비밀번호 규칙', () => {
  assert.deepStrictEqual(validateCredentials('minjun_1', 'password1'), []);
  assert.ok(validateCredentials('ab', 'password1').length > 0);
  assert.ok(validateCredentials('Minjun', 'password1').length > 0);
  assert.ok(validateCredentials('minjun', 'short').length > 0);
});

test('로그인 세션 생성/조회/삭제', () => {
  const store = new SessionStore();
  const token = store.create('user-1');
  assert.strictEqual(store.get(token), 'user-1');
  assert.strictEqual(store.get('fake-token'), null);
  store.delete(token);
  assert.strictEqual(store.get(token), null);
});

test('쿠키 파싱', () => {
  assert.deepStrictEqual(parseCookies('sid=abc; theme=dark'), { sid: 'abc', theme: 'dark' });
  assert.deepStrictEqual(parseCookies(undefined), {});
});
