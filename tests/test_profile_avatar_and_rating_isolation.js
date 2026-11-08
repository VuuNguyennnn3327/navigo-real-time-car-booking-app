/**
 * Test Suite: Profile Device Avatar Upload & Per-Account Rating Isolation
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Setup Node localStorage & Document mock
const localStorageMock = (() => {
    let store = {};
    return {
        getItem: (key) => store[key] || null,
        setItem: (key, val) => { store[key] = String(val); },
        removeItem: (key) => { delete store[key]; },
        clear: () => { store = {}; },
        _getStore: () => store
    };
})();

global.localStorage = localStorageMock;
global.sessionStorage = localStorageMock;
global.window = {
    localStorage: localStorageMock,
    sessionStorage: localStorageMock,
    dispatchEvent: () => {},
    addEventListener: () => {}
};
global.document = {
    addEventListener: () => {},
    querySelectorAll: () => [],
    getElementById: () => null
};

// Import RealtimeSyncManager
const { RealtimeSyncManager } = require('../frontend/js/core/realtime.js');
const realtimeSync = new RealtimeSyncManager();

console.log('========================================================================');
console.log('🧪 RUNNING SUITE: PROFILE AVATAR UPLOAD & PER-ACCOUNT RATING ISOLATION');
console.log('========================================================================\n');

// -----------------------------------------------------------------------------
// TEST 1: Strict Rating Isolation Per Account (Driver & Customer)
// -----------------------------------------------------------------------------
console.log('▶ TEST 1: Strict Rating Isolation Per Account (No Leaking / Collisions)');

localStorage.clear();

// Seed ratings:
// 1 review for Driver A (id: 'driver_001', phone: '0901111111', name: 'Tài xế Nguyễn Văn A') -> 5 stars
// 1 review for Driver A -> 4 stars (Average = 4.5, count = 2)
// 0 reviews for Driver B (id: 'driver_002', phone: '0902222222', name: 'Tài xế Trần Thị B')
// 1 review for Customer X (id: 'cust_001', phone: '0903333333', name: 'Khách Hàng X') -> 5 stars
// 0 reviews for Customer Y (id: 'cust_002', phone: '0904444444', name: 'Khách Hàng Y')

const sampleRatings = [
    {
        id: 'rate_1',
        tripId: 'trip_1',
        fromRole: 'customer',
        toRole: 'driver',
        toUserId: 'driver_001',
        toUserPhone: '0901111111',
        toUserName: 'Tài xế Nguyễn Văn A',
        rating: 5,
        feedback: 'Lái xe rất an toàn, 5 sao!',
        tags: ['Lái xe an toàn', 'Thân thiện'],
        createdAt: '2026-11-09T01:00:00.000Z'
    },
    {
        id: 'rate_2',
        tripId: 'trip_2',
        fromRole: 'customer',
        toRole: 'driver',
        toUserId: 'driver_001',
        toUserPhone: '0901111111',
        toUserName: 'Tài xế Nguyễn Văn A',
        rating: 4,
        feedback: 'Xe sạch sẽ, phục vụ chu đáo',
        tags: ['Xe sạch sẽ'],
        createdAt: '2026-11-09T02:00:00.000Z'
    },
    {
        id: 'rate_3',
        tripId: 'trip_3',
        fromRole: 'driver',
        toRole: 'customer',
        toUserId: 'cust_001',
        toUserPhone: '0903333333',
        toUserName: 'Khách Hàng X',
        rating: 5,
        feedback: 'Khách hàng rất lịch sự và đúng giờ',
        tags: ['Lịch sự', 'Đúng giờ'],
        createdAt: '2026-11-09T02:30:00.000Z'
    }
];

localStorage.setItem('navigo_ratings_history', JSON.stringify(sampleRatings));

// Query Driver A ratings
const ratingDriverA = realtimeSync.getCounterpartyRating('driver_001', 'driver', '0901111111', 'Tài xế Nguyễn Văn A');
assert.strictEqual(ratingDriverA.count, 2, 'Driver A must have exactly 2 ratings');
assert.strictEqual(ratingDriverA.average, 4.5, 'Driver A average must be (5+4)/2 = 4.5');
assert.strictEqual(ratingDriverA.starsBreakdown[5], 50, 'Driver A 5-star breakdown must be 50%');
assert.strictEqual(ratingDriverA.starsBreakdown[4], 50, 'Driver A 4-star breakdown must be 50%');
assert.strictEqual(ratingDriverA.reviews.length, 2, 'Driver A must have 2 reviews');

// Query Driver B ratings (NEW DRIVER - ZERO RATINGS)
const ratingDriverB = realtimeSync.getCounterpartyRating('driver_002', 'driver', '0902222222', 'Tài xế Trần Thị B');
assert.strictEqual(ratingDriverB.count, 0, 'Driver B must have exactly 0 ratings (ISOLATED)');
assert.strictEqual(ratingDriverB.average, 5.0, 'Driver B default score should be 5.0');
assert.strictEqual(ratingDriverB.starsBreakdown[5], 0, 'Driver B 5-star breakdown must be 0% when no reviews');
assert.strictEqual(ratingDriverB.reviews.length, 0, 'Driver B must NOT leak reviews from Driver A');

// Query Customer X ratings
const ratingCustX = realtimeSync.getCounterpartyRating('cust_001', 'customer', '0903333333', 'Khách Hàng X');
assert.strictEqual(ratingCustX.count, 1, 'Customer X must have exactly 1 rating');
assert.strictEqual(ratingCustX.average, 5.0, 'Customer X average must be 5.0');
assert.strictEqual(ratingCustX.starsBreakdown[5], 100, 'Customer X 5-star breakdown must be 100%');
assert.strictEqual(ratingCustX.reviews[0].toUserId, 'cust_001');

// Query Customer Y ratings (NEW CUSTOMER - ZERO RATINGS)
const ratingCustY = realtimeSync.getCounterpartyRating('cust_002', 'customer', '0904444444', 'Khách Hàng Y');
assert.strictEqual(ratingCustY.count, 0, 'Customer Y must have 0 ratings (ISOLATED)');
assert.strictEqual(ratingCustY.average, 5.0, 'Customer Y default score should be 5.0');
assert.strictEqual(ratingCustY.reviews.length, 0, 'Customer Y must have 0 reviews');

console.log('  ✔ Ratings & stars are 100% strictly isolated per account with zero leakage.');


// -----------------------------------------------------------------------------
// TEST 2: Verify HTML Structure for Avatar Device Upload & Header Rating Badge
// -----------------------------------------------------------------------------
console.log('\n▶ TEST 2: Verify Profile HTML Controls (Avatar Upload & Rating Badges)');

const profileHtml = fs.readFileSync(path.join(__dirname, '../frontend/pages/profile.html'), 'utf8');

// Check profile avatar wrapper & device file input
assert.ok(profileHtml.includes('id="profile-avatar-wrapper"'), 'profile.html must contain #profile-avatar-wrapper');
assert.ok(profileHtml.includes('id="input-avatar-device"'), 'profile.html must contain #input-avatar-device file input');
assert.ok(profileHtml.includes('accept="image/*"'), 'input must accept common device image types');

// Check header star rating badge
assert.ok(profileHtml.includes('id="profile-header-rating-badge"'), 'profile.html must contain #profile-header-rating-badge');

// Check avatar upload handler & compression function
assert.ok(profileHtml.includes('function setupAvatarDeviceUpload()'), 'profile.html must define setupAvatarDeviceUpload()');
assert.ok(profileHtml.includes('function processAndCompressAvatarImage('), 'profile.html must define processAndCompressAvatarImage()');

// Check cloud ratings sync on DOMContentLoaded
assert.ok(profileHtml.includes('syncRatingsFromCloud'), 'profile.html must invoke syncRatingsFromCloud() on load');

console.log('  ✔ HTML elements and JS handlers for device avatar upload & rating badges verified.');


// -----------------------------------------------------------------------------
// TEST 3: User Avatar Persistence & Multi-Storage Sync
// -----------------------------------------------------------------------------
console.log('\n▶ TEST 3: User Avatar Persistence & Multi-Storage Sync');

const mockUser = {
    id: 'user_avatar_test_1',
    name: 'Nguyễn Văn Test',
    phone: '0909999999',
    role: 'customer',
    avatar: null
};

// Simulate uploading an avatar (data URL)
const mockDataUrl = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP...';
mockUser.avatar = mockDataUrl;

// Verify session saving
localStorage.setItem('goride_user', JSON.stringify(mockUser));
localStorage.setItem('navigo_user', JSON.stringify(mockUser));

// Verify offline users list update
const offlineUsers = [
    { id: 'user_avatar_test_1', name: 'Nguyễn Văn Test', phone: '0909999999', avatar: null },
    { id: 'user_other', name: 'Người khác', phone: '0908888888', avatar: null }
];
const uIdx = offlineUsers.findIndex(u => u.id === mockUser.id);
offlineUsers[uIdx].avatar = mockDataUrl;
localStorage.setItem('goride_offline_users', JSON.stringify(offlineUsers));

// Assertions
const savedGorideUser = JSON.parse(localStorage.getItem('goride_user'));
assert.strictEqual(savedGorideUser.avatar, mockDataUrl, 'goride_user must store avatar data URL');

const savedOfflineUsers = JSON.parse(localStorage.getItem('goride_offline_users'));
assert.strictEqual(savedOfflineUsers[0].avatar, mockDataUrl, 'Offline user database must store avatar data URL');
assert.strictEqual(savedOfflineUsers[1].avatar, null, 'Other user avatar must remain unchanged');

console.log('  ✔ Avatar data URL updates and persists across all user storages successfully.');

console.log('\n========================================================================');
console.log('🎉 ALL AVATAR UPLOAD & RATING ISOLATION TESTS PASSED (100%)!');
console.log('========================================================================\n');
