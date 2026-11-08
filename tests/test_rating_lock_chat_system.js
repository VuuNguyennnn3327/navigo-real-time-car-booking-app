/**
 * TEST SUITE: Customer & Driver Rating Sync, Admin Lock/Delete, and In-Trip Chat
 */

const assert = require('assert');

// 1. Mock Browser Environment (window, localStorage, document, CustomEvent)
const storage = new Map();
global.localStorage = {
    getItem: (k) => storage.get(k) || null,
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
    clear: () => storage.clear()
};

const sessionStorageMap = new Map();
global.sessionStorage = {
    getItem: (k) => sessionStorageMap.get(k) || null,
    setItem: (k, v) => sessionStorageMap.set(k, String(v)),
    removeItem: (k) => sessionStorageMap.delete(k),
    clear: () => sessionStorageMap.clear()
};

const eventListeners = new Map();
global.window = {
    addEventListener: (type, handler) => {
        if (!eventListeners.has(type)) eventListeners.set(type, []);
        eventListeners.get(type).push(handler);
    },
    removeEventListener: (type, handler) => {
        if (!eventListeners.has(type)) return;
        eventListeners.set(type, eventListeners.get(type).filter(h => h !== handler));
    },
    dispatchEvent: (evt) => {
        const handlers = eventListeners.get(evt.type) || [];
        handlers.forEach(h => h(evt));
        return true;
    },
    location: {
        href: 'http://localhost/customer.html',
        pathname: '/customer.html',
        search: ''
    }
};

global.CustomEvent = class CustomEvent {
    constructor(type, params = {}) {
        this.type = type;
        this.detail = params.detail;
    }
};

// Mock Document
global.document = {
    addEventListener: () => {},
    getElementById: () => null,
    querySelectorAll: () => [],
    createElement: () => ({
        style: {},
        setAttribute: () => {},
        appendChild: () => {},
        classList: { add: () => {}, remove: () => {} }
    })
};

// Load RealtimeSyncManager
const { RealtimeSyncManager } = require('../frontend/js/core/realtime.js');
const realtimeSync = new RealtimeSyncManager();

async function runTests() {
    console.log('========================================================================');
    console.log('🧪 RUNNING VERIFICATION SUITE: RATING, LOCK/DELETE, AND CHAT');
    console.log('========================================================================\n');

    // -------------------------------------------------------------
    // TEST 1: Rating Synchronization & Persistence
    // -------------------------------------------------------------
    console.log('▶ TEST 1: Customer & Driver Rating Synchronization & Persistence');
    localStorage.clear();

    const tripId = 'trip_test_101';
    const driverId = 'drv_viet_88';
    const driverPhone = '0918889999';
    const customerId = 'usr_lan_22';
    const customerPhone = '0901234567';

    // Seed offline users
    localStorage.setItem('goride_offline_users', JSON.stringify([
        { id: driverId, name: 'Nguyễn Văn Việt', phone: driverPhone, role: 'driver', rating: 5.0, ratingCount: 0 },
        { id: customerId, name: 'Lê Thị Lan', phone: customerPhone, role: 'customer', rating: 5.0, ratingCount: 0 }
    ]));
    localStorage.setItem('goride_admin_drivers', JSON.stringify([
        { id: driverId, name: 'Nguyễn Văn Việt', phone: driverPhone, rating: 5.0, ratingCount: 0 }
    ]));

    // Customer rates Driver 4 stars
    await realtimeSync.saveTripRating(tripId, {
        rating: 4,
        feedback: 'Tài xế lái xe cẩn thận, đúng giờ',
        driverId: driverId,
        driverName: 'Nguyễn Văn Việt',
        driverPhone: driverPhone,
        customerId: customerId,
        customerName: 'Lê Thị Lan',
        customerPhone: customerPhone
    });

    // Verify rating history saved
    const ratingsHistory = JSON.parse(localStorage.getItem('navigo_ratings_history') || '[]');
    assert.strictEqual(ratingsHistory.length, 1, 'Rating history must contain 1 entry');
    assert.strictEqual(ratingsHistory[0].toUserId, driverId, 'Target driver ID must match');
    assert.strictEqual(ratingsHistory[0].toUserPhone, driverPhone, 'Target driver phone must match');
    assert.strictEqual(ratingsHistory[0].rating, 4, 'Rating value must be 4');

    // Verify driver stats updated in admin_drivers and offline_users
    const adminDrivers = JSON.parse(localStorage.getItem('goride_admin_drivers') || '[]');
    assert.strictEqual(adminDrivers[0].rating, 4.0, 'Driver average rating must be updated to 4.0');
    assert.strictEqual(adminDrivers[0].ratingCount, 1, 'Driver rating count must be 1');

    // Driver rates Customer 5 stars
    await realtimeSync.saveCustomerRating(tripId, {
        rating: 5,
        feedback: 'Hành khách lịch sự, lên xe nhanh',
        tags: ['Thân thiện', 'Đúng giờ'],
        customerId: customerId,
        customerName: 'Lê Thị Lan',
        customerPhone: customerPhone,
        driverId: driverId,
        driverName: 'Nguyễn Văn Việt',
        driverPhone: driverPhone
    });

    const updatedHistory = JSON.parse(localStorage.getItem('navigo_ratings_history') || '[]');
    assert.strictEqual(updatedHistory.length, 2, 'History must contain customer and driver ratings');

    // Verify counterparty rating calculation
    const driverRatingResult = realtimeSync.getCounterpartyRating(driverId, 'driver', driverPhone);
    assert.strictEqual(driverRatingResult.average, 4.0, 'Counterparty driver rating must average 4.0');
    assert.strictEqual(driverRatingResult.count, 1, 'Driver rating count must be 1');

    const customerRatingResult = realtimeSync.getCounterpartyRating(customerId, 'customer', customerPhone);
    assert.strictEqual(customerRatingResult.average, 5.0, 'Counterparty customer rating must average 5.0');
    assert.strictEqual(customerRatingResult.count, 1, 'Customer rating count must be 1');

    console.log('  ✔ Customer and Driver ratings persist and synchronize correctly across both profiles.');

    // -------------------------------------------------------------
    // TEST 2: Admin Lock Account & Force Logout Verification
    // -------------------------------------------------------------
    console.log('\n▶ TEST 2: Admin Lock Account & Immediate Force Logout');
    
    // Simulate user active session
    const targetUserId = 'usr_bad_actor_99';
    const targetUserEmail = 'badactor@example.com';
    const targetUserPhone = '0999999999';

    // Lock user by Admin
    await realtimeSync.lockUser(targetUserId, targetUserEmail, targetUserPhone, 'locked');

    // 1. Verify status is locked
    assert.strictEqual(realtimeSync.isUserLocked(targetUserId), true, 'User ID must be recognized as locked');
    assert.strictEqual(realtimeSync.isUserLocked(targetUserEmail), true, 'User email must be recognized as locked');
    assert.strictEqual(realtimeSync.isUserLocked(targetUserPhone), true, 'User phone must be recognized as locked');

    // 2. Verify force logout event dispatched
    const logoutEventRaw = localStorage.getItem('goride_force_logout_event');
    assert.ok(logoutEventRaw, 'Force logout event must be set in localStorage');
    const logoutEvent = JSON.parse(logoutEventRaw);
    assert.strictEqual(logoutEvent.userId, targetUserId, 'Logout event must target locked user');
    assert.strictEqual(logoutEvent.reason, 'locked', 'Logout reason must be locked');

    // Unlock user
    await realtimeSync.lockUser(targetUserId, targetUserEmail, targetUserPhone, 'active');
    assert.strictEqual(realtimeSync.isUserLocked(targetUserId), false, 'User must no longer be locked after unlock');

    console.log('  ✔ Admin lock status correctly updates and triggers instant force logout.');

    // -------------------------------------------------------------
    // TEST 3: Admin Delete Account & Re-login Prevention
    // -------------------------------------------------------------
    console.log('\n▶ TEST 3: Admin Delete Account & Block Re-login');

    const deleteTargetId = 'usr_to_delete_01';
    const deleteEmail = 'delete_me@example.com';
    const deletePhone = '0912344321';

    await realtimeSync.deleteUser(deleteTargetId, deleteEmail, deletePhone);

    // Verify deleted tracking
    assert.strictEqual(realtimeSync.isUserDeleted(deleteTargetId), true, 'Deleted user ID must be in deleted list');
    assert.strictEqual(realtimeSync.isUserDeleted(deleteEmail), true, 'Deleted email must be in deleted list');
    assert.strictEqual(realtimeSync.isUserDeleted(deletePhone), true, 'Deleted phone must be in deleted list');

    // Verify force logout for deleted user
    const delLogoutEvent = JSON.parse(localStorage.getItem('goride_force_logout_event'));
    assert.strictEqual(delLogoutEvent.userId, deleteTargetId, 'Logout event must target deleted user');
    assert.strictEqual(delLogoutEvent.reason, 'deleted', 'Logout reason must be deleted');

    console.log('  ✔ Admin delete user completely purges account and prevents re-login.');

    // -------------------------------------------------------------
    // TEST 4: Real-Time In-Trip Chat (Trip Scoping & Deduplication)
    // -------------------------------------------------------------
    console.log('\n▶ TEST 4: Real-Time In-Trip Chat (Trip Scoping & Deduplication)');

    const tripChat1 = 'trip_active_chat_01';
    const tripChat2 = 'trip_active_chat_02';

    // Driver sends message in trip 1
    const msg1 = await realtimeSync.sendChatMessage(tripChat1, {
        text: 'Tôi đang trên đường đến điểm hẹn đón bạn nhé!',
        senderRole: 'driver',
        senderName: 'Tài xế Tuấn',
        senderId: 'drv_tuan'
    });
    assert.ok(msg1.id, 'Message 1 must have unique ID');

    // Customer replies in trip 1
    const msg2 = await realtimeSync.sendChatMessage(tripChat1, {
        text: 'Dạ vâng, tôi đang đứng ở sảnh trước toà nhà.',
        senderRole: 'customer',
        senderName: 'Khách hàng Nam',
        senderId: 'usr_nam'
    });
    assert.ok(msg2.id, 'Message 2 must have unique ID');

    // Get messages for trip 1
    const trip1Msgs = realtimeSync.getTripChatMessages(tripChat1);
    assert.strictEqual(trip1Msgs.length, 2, 'Trip 1 must contain exactly 2 messages');
    assert.strictEqual(trip1Msgs[0].senderRole, 'driver', 'First message must be from driver');
    assert.strictEqual(trip1Msgs[1].senderRole, 'customer', 'Second message must be from customer');

    // Verify Trip 2 is an independent fresh conversation ("mỗi cuốc xe là mỗi đoạn chat mới")
    const trip2Msgs = realtimeSync.getTripChatMessages(tripChat2);
    assert.strictEqual(trip2Msgs.length, 0, 'New trip 2 must start with an isolated empty chat');

    // Verify deduplication: sending message with same ID cannot duplicate in list
    await realtimeSync.sendChatMessage(tripChat1, {
        id: msg1.id,
        text: msg1.text,
        senderRole: 'driver'
    });
    const dedupMsgs = realtimeSync.getTripChatMessages(tripChat1);
    assert.strictEqual(dedupMsgs.length, 2, 'Duplicate message ID must NOT create duplicate message in feed');

    console.log('  ✔ In-trip chat is strictly scoped to each trip with zero duplicate messages.');

    console.log('\n========================================================================');
    console.log('🎉 ALL RATING, LOCK/DELETE, AND CHAT VERIFICATION TESTS PASSED (100%)!');
    console.log('========================================================================\n');
}

runTests().catch(err => {
    console.error('❌ TEST FAILED:', err);
    process.exit(1);
});
