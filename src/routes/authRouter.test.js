const request = require('supertest');
const app = require('../service');

const testUser = { name: 'pizza diner', email: 'reg@test.com', password: 'a' };
let testUserAuthToken;

beforeAll(async () => {
  testUser.email = Math.random().toString(36).substring(2, 12) + '@test.com';
  const registerRes = await request(app).post('/api/auth').send(testUser);
  testUserAuthToken = registerRes.body.token;
  expectValidJwt(testUserAuthToken);
});

test('login', async () => {
  const loginRes = await request(app).put('/api/auth').send(testUser);
  expect(loginRes.status).toBe(200);
  expectValidJwt(loginRes.body.token);

  const expectedUser = { ...testUser, roles: [{ role: 'diner' }] };
  delete expectedUser.password;
  expect(loginRes.body.user).toMatchObject(expectedUser);
});

function expectValidJwt(potentialJwt) {
  expect(potentialJwt).toMatch(/^[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*$/);
}

function randomName() {
  return Math.random().toString(36).substring(2, 12);
}
test('bad register', async () => {
  const badUser = { name: randomName(), email: 'bad@user.com'};
  const registerBad = await request(app).post('/api/auth').send(badUser);
  expect(registerBad.status).not.toBe(200);
  expect(registerBad.status).toBe(400);
  expect(registerBad.body.message).toBe('name, email, and password are required');
});

test('get menu', async () => {
  const login = await request(app).put('/api/auth').send(testUser);
  expect(login.status).toBe(200);
  expectValidJwt(login.body.token);
  const goodUser = { ...testUser, roles: [{ role: 'diner' }] };
  delete goodUser.password;
  expect(login.body.user).toMatchObject(goodUser);
  const menu = await request(app).get('/api/order/menu/');
  expect(menu.status).toBe(200);
  expect(menu.body).toBeInstanceOf(Array);
});

test('login bad', async () => {
  const badUser = { name: randomName(), email: 'test@user.com', password: 'test' };
  const unauthorizedUser = await request(app).put('/api/auth').send(badUser);
  expect(unauthorizedUser.status).not.toBe(200);
});

test('logout', async () => {
    const logoutGood = await request(app).delete('/api/auth/').set('Authorization', `Bearer ${testUserAuthToken}`);
    expect(logoutGood.status).toBe(200);
    expect(logoutGood.body.message).toBe('logout successful');
});