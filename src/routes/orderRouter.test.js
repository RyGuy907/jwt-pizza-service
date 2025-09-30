const request = require('supertest');
const app = require('../service');
const { Role, DB } = require('../database/database.js');

let testAdminAuthToken;
let testFranchiseId;
let testStoreId;

beforeAll(async () => {
  const admin = await createAdminUser();
  const adminLogin = await request(app).put('/api/auth').send(admin);
  expect(adminLogin.status).toBe(200);
  testAdminAuthToken = adminLogin.body.token;
  expectValidJwt(testAdminAuthToken);

  const testFranchise = { name: randomName(), admins: [{ email: admin.email }] };
  const createFranchise = await request(app).post('/api/franchise').set('Authorization', `Bearer ${testAdminAuthToken}`).send(testFranchise);
  expect(createFranchise.status).toBe(200);
  testFranchiseId = createFranchise.body.id;

  const testStore = { franchiseId: testFranchiseId, name: randomName() };
  const createStore = await request(app).post(`/api/franchise/${testFranchiseId}/store`).set('Authorization', `Bearer ${testAdminAuthToken}`).send(testStore);
  expect(createStore.status).toBe(200);
  testStoreId = createStore.body.id;
});

function expectValidJwt(potentialJwt) {
  expect(potentialJwt).toMatch(/^[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*$/);
}

async function createAdminUser() {
  const user = { password: 'toomanysecrets', roles: [{ role: Role.Admin }] };
  user.name = randomName();
  user.email = `${user.name}@admin.com`;

  await DB.addUser(user);
  user.password = 'toomanysecrets';
  return user;
}

function randomName() {
  return Math.random().toString(36).substring(2, 12);
}