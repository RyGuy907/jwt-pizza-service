const request = require('supertest');
const app = require('../service');
const testUtils = require('./testUtils');

const seedUser = { name: 'pizza diner', email: 'pizza@test.com', password: 'test' };
let authTokenUnderTest;

const makeEmail = () => `${Math.random().toString(36).substring(2, 12)}@test.com`;
const bearer = (tkn) => ({ Authorization: `Bearer ${tkn}` });

beforeAll(async () => {
  seedUser.email = makeEmail();
  const regResp = await request(app).post('/api/auth').send(seedUser);
  authTokenUnderTest = regResp.body.token;
  testUtils.expectValidJwt(authTokenUnderTest);
});

test('getUser', async () => {
  const meResp = await request(app).get('/api/user/me').set(bearer(authTokenUnderTest));
  expect(meResp.status).toBe(200);

  const expectedProfile = { ...seedUser, roles: [{ role: 'diner' }] };
  delete expectedProfile.password;
  expect(meResp.body).toMatchObject(expectedProfile);
});

test('updateUser', async () => {
  const meResp = await request(app).get('/api/user/me').set(bearer(authTokenUnderTest));
  const subjectUserId = meResp.body.id;

  const updatedName = 'new name';
  const updatedEmail = makeEmail();
  const updatedPassword = 'new password';

  const updateResp = await request(app)
    .put(`/api/user/${subjectUserId}`)
    .send({ name: updatedName, email: updatedEmail, password: updatedPassword })
    .set(bearer(authTokenUnderTest));

  expect(updateResp.status).toBe(200);
  expect(updateResp.body.user).toMatchObject({
    id: subjectUserId,
    name: updatedName,
    email: updatedEmail,
    roles: [{ role: 'diner' }],
  });
  testUtils.expectValidJwt(updateResp.body.token);

  await request(app).delete('/api/auth').set(bearer(authTokenUnderTest));
  authTokenUnderTest = updateResp.body.token;
});

test('list users bad', async () => {
  const listResp = await request(app).get('/api/user');
  expect(listResp.status).toBe(401);
});

test('list users 2', async () => {
  for (let i = 0; i < 15; i++) {
    const tempUser = { name: 'list user', email: makeEmail(), password: 'a' };
    const tempReg = await request(app).post('/api/auth').send(tempUser);
    await request(app).delete('/api/auth').set(bearer(tempReg.body.token));
  }

  const adminAccount = await testUtils.createAdminUser();
  const adminJwt = await testUtils.loginUser(app, adminAccount);

  const listResp = await request(app).get('/api/user').set(bearer(adminJwt));
  expect(listResp.status).toBe(200);
  expect(listResp.body).toMatchObject({
    users: expect.arrayContaining([
      {
        id: expect.any(Number),
        name: expect.any(String),
        email: expect.any(String),
        roles: expect.any(Array),
      },
    ]),
    more: true,
  });

  await request(app).delete('/api/auth').set(bearer(adminJwt));
});

test('delete user bad', async () => {
  const delResp = await request(app).delete('/api/user/400').send();
  expect(delResp.status).toBe(401);
});

test('delete user', async () => {
  const doomedUser = { name: 'delete user', email: makeEmail(), password: 'a' };

  const regResp = await request(app).post('/api/auth').send(doomedUser);
  const meResp = await request(app).get('/api/user/me').set(bearer(regResp.body.token));
  const doomedId = meResp.body.id;

  const adminAccount = await testUtils.createAdminUser();
  const adminJwt = await testUtils.loginUser(app, adminAccount);

  const delResp = await request(app).delete(`/api/user/${doomedId}`).set(bearer(adminJwt));
  expect(delResp.status).toBe(200);
  expect(delResp.body.message).toBe('user deleted');

  const postList = await request(app).get('/api/user').set(bearer(adminJwt));
  expect(postList.body.users).not.toEqual(
    expect.arrayContaining([expect.objectContaining({ email: doomedUser.email })])
  );

  await request(app).delete('/api/auth').set(bearer(adminJwt));
  await request(app).delete('/api/auth').set(bearer(regResp.body.token));
});

afterAll(async () => {
  const logoutResp = await request(app).delete('/api/auth').set(bearer(authTokenUnderTest));
  expect(logoutResp.status).toBe(200);
  expect(logoutResp.body.message).toBe('logout successful');
});
