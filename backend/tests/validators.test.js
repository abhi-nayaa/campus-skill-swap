const assert = require("node:assert/strict");

const {
  validateEmail,
  validatePassword,
  validatePhone,
  validateSkillLevel,
  validateRating
} = require("../utils/validators");

assert.equal(validateEmail("student@example.edu"), true);

assert.equal(validatePassword("Campus@123"), true);
assert.equal(validatePassword("weakpass"), false);

assert.equal(validatePhone("9876543210"), true);
assert.equal(validatePhone("98765"), false);

assert.equal(validateSkillLevel("Intermediate"), true);
assert.equal(validateSkillLevel("Expert"), false);

assert.equal(validateRating(5), true);
assert.equal(validateRating(0), false);

console.log("Backend validator tests passed.");
