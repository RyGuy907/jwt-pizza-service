const request = require("supertest");
const { DB, Role } = require("../database/database.js");

const JWT_REGEX = /^[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*$/;

function randomName(len = 10) {
  return Math.random().toString(36).substring(2, 2 + len);
}

async function createAdminUser() {
  const name = randomName();
  const user = {
    name,
    email: `${name}@test.com`,
    password: "toomanysecrets",
    roles: [{ role: Role.Admin }],
  };

  await DB.addUser(user);
  user.password = "toomanysecrets";
  return user;
}

async function loginUser(app, testUser) {
  const res = await request(app).put("/api/auth").send(testUser);
  expect(res.status).toBe(200);
  expectValidJwt(res.body.token);
  return res.body.token;
}

const orderReq = {
  franchiseId: 1,
  storeId: 1,
  items: [{ menuId: 1, description: "Pep", price: 0.50 }],
};


async function createTestFranchise(app) {
  const adminUser = await createAdminUser();
  const adminToken = await loginUser(app, adminUser);

  const testFranchiseName = `${randomName()}Test_franchise`;
  const res = await request(app)
    .post("/api/franchise")
    .send({ name: testFranchiseName, admins: [{ email: adminUser.email }] })
    .set("Authorization", `Bearer ${adminToken}`);

  expect(res.status).toBe(200);
  expect(res.body.name).toBe(testFranchiseName);
  return [res.body.id, adminToken];
}

function expectValidJwt(potentialJwt) {
  expect(potentialJwt).toMatch(JWT_REGEX);
}

module.exports = {
  loginUser,
  expectValidJwt,
  createAdminUser,
  createTestFranchise,
  orderReq,
};
