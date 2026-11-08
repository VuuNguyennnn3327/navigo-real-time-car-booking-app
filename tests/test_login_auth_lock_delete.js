/**
 * TEST: Login Authentication Guard for Locked & Deleted Accounts
 */
const assert = require('assert');

// Simulate login handler logic from login.html
function simulateLogin({ email, password, offlineUsers = [], defaultAccounts = [] }) {
    const normInput = (email || '').toLowerCase().trim();
    const cleanDigits = normInput.replace(/\D/g, '');

    // 0. Check deleted
    const deletedIds = JSON.parse(localStorage.getItem('goride_deleted_user_ids') || '[]');
    const deletedAccounts = JSON.parse(localStorage.getItem('goride_deleted_accounts') || '[]');
    const isDeleted = deletedIds.some(id => String(id).toLowerCase() === normInput || (cleanDigits && String(id).replace(/\D/g, '') === cleanDigits)) ||
                      deletedAccounts.some(a => {
                          if (!a) return false;
                          if (typeof a === 'string') return a.toLowerCase() === normInput || (cleanDigits && a.replace(/\D/g, '') === cleanDigits);
                          return (a.id && a.id.toLowerCase() === normInput) ||
                                 (a.email && a.email.toLowerCase() === normInput) ||
                                 (cleanDigits && a.phone && a.phone.replace(/\D/g, '') === cleanDigits);
                      });
    if (isDeleted) {
        throw new Error('Tài khoản hoặc mật khẩu không chính xác.');
    }

    // 0. Check explicitly locked
    const lockedIds = JSON.parse(localStorage.getItem('goride_locked_user_ids') || '[]');
    const isExplicitlyLocked = lockedIds.some(id => String(id).toLowerCase() === normInput || (cleanDigits && String(id).replace(/\D/g, '') === cleanDigits));
    if (isExplicitlyLocked) {
        throw new Error('Tài khoản này đã bị khóa do vi phạm.');
    }

    // 1. Offline user match
    const matchedUser = offlineUsers.find(u => 
        (u.email && u.email.toLowerCase() === normInput) || 
        (u.name && u.name.toLowerCase() === normInput) ||
        (u.phone && u.phone === normInput)
    );

    if (matchedUser) {
        if (isDeleted || (matchedUser.id && deletedIds.includes(matchedUser.id))) {
            throw new Error('Tài khoản hoặc mật khẩu không chính xác.');
        }
        if (matchedUser.status === 'locked' || (matchedUser.id && lockedIds.includes(matchedUser.id))) {
            throw new Error('Tài khoản này đã bị khóa do vi phạm.');
        }
        if (matchedUser.password && matchedUser.password !== password) {
            throw new Error('Mật khẩu không chính xác. Vui lòng kiểm tra lại.');
        }
        return { user: matchedUser, token: 'token_' + Date.now() };
    }

    // 2. Demo accounts match
    const matchedDemo = defaultAccounts.find(d => 
        d.identifiers.some(id => id.toLowerCase() === normInput)
    );

    if (matchedDemo) {
        if (isDeleted || (matchedDemo.id && deletedIds.includes(matchedDemo.id))) {
            throw new Error('Tài khoản hoặc mật khẩu không chính xác.');
        }
        if (isExplicitlyLocked || (matchedDemo.id && lockedIds.includes(matchedDemo.id))) {
            throw new Error('Tài khoản này đã bị khóa do vi phạm.');
        }
        const isPassValid = matchedDemo.passwords.includes(password);
        if (!isPassValid) {
            throw new Error('Tài khoản hoặc mật khẩu không chính xác.');
        }
        return { user: matchedDemo, token: 'demo_token_' + Date.now() };
    }

    throw new Error('Tài khoản hoặc mật khẩu không chính xác.');
}

// Storage setup
const storage = new Map();
global.localStorage = {
    getItem: (k) => storage.get(k) || null,
    setItem: (k, v) => storage.set(k, String(v)),
    clear: () => storage.clear()
};

const defaultAccounts = [
    { identifiers: ['customer@demo.com', 'usr_c101'], passwords: ['123456'], role: 'customer', id: 'usr_c101' },
    { identifiers: ['driver@demo.com', 'drv_d202'], passwords: ['123456'], role: 'driver', id: 'drv_d202' }
];

const offlineUsers = [
    { id: 'usr_reg_01', email: 'registered@test.vn', phone: '0909090909', password: 'secretpassword', status: 'active' },
    { id: 'usr_reg_locked', email: 'locked@test.vn', phone: '0908887777', password: 'secretpassword', status: 'locked' }
];

console.log('--- Testing Login Logic for Locked & Deleted Accounts ---');

// Case 1: Normal active login succeeds
const activeRes = simulateLogin({ email: 'registered@test.vn', password: 'secretpassword', offlineUsers, defaultAccounts });
assert.strictEqual(activeRes.user.id, 'usr_reg_01', 'Normal active login should succeed');
console.log('✔ Case 1: Active user logs in successfully.');

// Case 2: Locked account via status tries to log in (even with WRONG password)
try {
    simulateLogin({ email: 'locked@test.vn', password: 'wrongpassword123', offlineUsers, defaultAccounts });
    assert.fail('Should throw locked error');
} catch (err) {
    assert.strictEqual(err.message, 'Tài khoản này đã bị khóa do vi phạm.', 'Locked user must receive vi phạm message');
}
console.log('✔ Case 2: Locked user receives "Tài khoản này đã bị khóa do vi phạm." even with wrong password.');

// Case 3: Admin locks a demo account
localStorage.setItem('goride_locked_user_ids', JSON.stringify(['usr_c101', 'customer@demo.com']));
try {
    simulateLogin({ email: 'customer@demo.com', password: '123456', offlineUsers, defaultAccounts });
    assert.fail('Should throw locked error for locked demo account');
} catch (err) {
    assert.strictEqual(err.message, 'Tài khoản này đã bị khóa do vi phạm.', 'Locked demo account must receive vi phạm message');
}
console.log('✔ Case 3: Admin-locked demo account receives "Tài khoản này đã bị khóa do vi phạm."');

// Case 4: Admin deletes a user account
localStorage.setItem('goride_deleted_user_ids', JSON.stringify(['usr_reg_01', 'drv_d202']));
try {
    simulateLogin({ email: 'registered@test.vn', password: 'secretpassword', offlineUsers, defaultAccounts });
    assert.fail('Should throw invalid credentials error for deleted account');
} catch (err) {
    assert.strictEqual(err.message, 'Tài khoản hoặc mật khẩu không chính xác.', 'Deleted user must appear as invalid account');
}
console.log('✔ Case 4: Deleted user receives "Tài khoản hoặc mật khẩu không chính xác."');

// Case 5: Deleted demo account cannot be bypassed
try {
    simulateLogin({ email: 'driver@demo.com', password: '123456', offlineUsers, defaultAccounts });
    assert.fail('Deleted demo account should not bypass');
} catch (err) {
    assert.strictEqual(err.message, 'Tài khoản hoặc mật khẩu không chính xác.', 'Deleted demo account must be blocked');
}
console.log('✔ Case 5: Deleted demo account is completely blocked.');

console.log('🎉 ALL LOGIN AUTH GUARD TESTS PASSED (100%)!');
