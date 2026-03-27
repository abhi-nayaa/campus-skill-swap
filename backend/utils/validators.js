// Strict industry-standard regex definitions
const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
// Min 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 special character
const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
// Exact 10 digits
const phoneRegex = /^\d{10}$/;

const validateEmail = (email) => emailRegex.test(email);
const validatePassword = (password) => passwordRegex.test(password);
const validatePhone = (phone) => phoneRegex.test(phone);

const validateName = (name) => name && name.trim().length >= 2 && name.trim().length <= 50;
const validateCampus = (campus) => campus && campus.trim().length >= 3 && campus.trim().length <= 100;
const validateDepartment = (dept) => !dept || (dept.trim().length >= 2 && dept.trim().length <= 100);
const validateYear = (year) => !year || (year.trim().length >= 1 && year.trim().length <= 20);
const validateBio = (bio) => !bio || bio.trim().length <= 500;

const validateSkillName = (name) => name && name.trim().length >= 2 && name.trim().length <= 50;
const validateSkillLevel = (level) => ['Beginner', 'Intermediate', 'Advanced'].includes(level);
const validateRating = (rating) => Number.isInteger(rating) && rating >= 1 && rating <= 5;

const validateFutureDate = (dateString) => {
    const date = new Date(dateString);
    return date > new Date();
};

module.exports = {
    validateEmail,
    validatePassword,
    validatePhone,
    validateName,
    validateCampus,
    validateDepartment,
    validateYear,
    validateBio,
    validateSkillName,
    validateSkillLevel,
    validateRating,
    validateFutureDate
};
