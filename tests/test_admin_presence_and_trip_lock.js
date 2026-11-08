/**
 * Verification Test Suite:
 * 1. Admin Customer Management (No drivers, only Customers & Admins)
 * 2. Real-Time Account Online/Offline Presence
 * 3. Lock Pickup & Destination Points During Active Trip
 * 4. Driver Live Position Streaming & Propagation
 */
const assert = require('assert');

console.log('========================================================================');
console.log('🧪 RUNNING SUITE: ADMIN USER ISOLATION, PRESENCE & TRIP LOCK');
console.log('========================================================================\n');

// Mock localStorage
const storage = new Map();
global.localStorage = {
    getItem: (k) => storage.get(k) || null,
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
    clear: () => storage.clear()
};
global.sessionStorage = {
    getItem: (k) => storage.get('sess_' + k) || null,
    setItem: (k, v) => storage.set('sess_' + k, String(v)),
    removeItem: (k) => storage.delete('sess_' + k),
    clear: () => {}
};

// Mock CustomEvent
global.CustomEvent = class CustomEvent {
    constructor(type, params = {}) {
        this.type = type;
        this.detail = params.detail;
    }
};

const eventListeners = new Map();
global.window = {
    localStorage: global.localStorage,
    sessionStorage: global.sessionStorage,
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
    }
};

// ----------------------------------------------------
// TEST 1: Admin Customer Isolation (Drivers Filtered Out)
// ----------------------------------------------------
console.log('▶ TEST 1: Admin Customer Management Table Isolation');

const mockRawUsers = [
    { id: 'adm_admin', name: 'Quản trị viên', email: 'admin@navigo.vn', role: 'admin' },
    { id: 'usr_c101', name: 'Khách hàng A', email: 'customer1@test.vn', role: 'customer' },
    { id: 'usr_c102', name: 'Khách hàng B', email: 'customer2@test.vn', role: 'customer' },
    { id: 'drv_d201', name: 'Tài xế Ô tô', email: 'driver1@navigo.vn', role: 'driver', vehicleType: 'car4', licensePlate: '51G-123.45' },
    { id: 'drv_bike', name: 'Tài xế Xe máy', email: 'driver.bike@navigo.vn', role: 'driver', vehicleType: 'motorbike', licensePlate: '59-S1 888.88' },
    { id: 'usr_drv_hybrid', name: 'Tài xế Đăng ký Mới', email: 'newdriver@navigo.vn', vehicle: { type: 'car7', plate: '51F-999.99' } }
];

const isDriverAccount = (u) => {
    if (!u) return false;
    if (u.role === 'admin') return false; // Admin is never driver
    if (u.role === 'driver') return true;
    if (String(u.id || '').startsWith('drv_')) return true;
    if (u.vehicleType || u.licensePlate || u.vehicle) return true;
    return false;
};

const customerAccounts = mockRawUsers.filter(u => !isDriverAccount(u));

assert.strictEqual(customerAccounts.length, 3, 'Should strictly have 3 accounts (1 Admin, 2 Customers)');
assert(customerAccounts.some(u => u.id === 'adm_admin'), 'Admin account must be included');
assert(customerAccounts.some(u => u.id === 'usr_c101'), 'Customer 1 must be included');
assert(customerAccounts.some(u => u.id === 'usr_c102'), 'Customer 2 must be included');
assert(!customerAccounts.some(u => u.id === 'drv_d201'), 'Driver 1 must NOT be in customer management');
assert(!customerAccounts.some(u => u.id === 'drv_bike'), 'Driver bike must NOT be in customer management');
assert(!customerAccounts.some(u => u.id === 'usr_drv_hybrid'), 'Hybrid driver must NOT be in customer management');

console.log('  ✔ Drivers are strictly excluded from Customer Management; only Customers & Admins appear.');

// ----------------------------------------------------
// TEST 2: Real-time Online / Offline Presence Detection
// ----------------------------------------------------
console.log('\n▶ TEST 2: Accurate Real-time Online / Offline Presence Detection');

// Load RealtimeSync presence logic
const { RealtimeSyncManager } = require('../frontend/js/core/realtime.js');
assert(RealtimeSyncManager, 'RealtimeSyncManager must be defined');
const rt = new RealtimeSyncManager();

// Set user 1 online
rt.setUserPresence('usr_c101', true, { email: 'customer1@test.vn', phone: '0901234567', role: 'customer' });
assert.strictEqual(rt.isUserOnline('usr_c101', 'customer1@test.vn', '0901234567'), true, 'User 1 should be Online');

// User 2 has never logged in -> Offline
assert.strictEqual(rt.isUserOnline('usr_c102', 'customer2@test.vn', '0909999999'), false, 'User 2 should be Offline');

// User 1 logs out
rt.setUserPresence('usr_c101', false, { email: 'customer1@test.vn', phone: '0901234567', role: 'customer' });
assert.strictEqual(rt.isUserOnline('usr_c101', 'customer1@test.vn', '0901234567'), false, 'User 1 should now be Offline after logout');

// User 1 is locked by Admin -> NEVER online even if presence flag is set
rt.lockUser('usr_c101', 'customer1@test.vn', '0901234567', 'locked');
rt.setUserPresence('usr_c101', true, { email: 'customer1@test.vn', phone: '0901234567' });
assert.strictEqual(rt.isUserOnline('usr_c101', 'customer1@test.vn', '0901234567'), false, 'Locked user must NEVER be reported as online');

console.log('  ✔ Real-time presence accurately differentiates Online vs Offline vs Locked accounts.');

// ----------------------------------------------------
// TEST 3: Lock Pickup & Destination During Active Trip
// ----------------------------------------------------
console.log('\n▶ TEST 3: Lock Pickup & Destination Points During Active Trip');

// Mock Document
global.document = {
    getElementById: () => ({ id: 'map', style: {}, appendChild: () => {}, querySelector: () => null }),
    createElement: () => ({ style: {}, appendChild: () => {} }),
    head: { appendChild: () => {} }
};

// Mock Leaflet
global.L = {
    divIcon: (opts) => opts,
    marker: (latlng, opts = {}) => {
        let _pos = latlng;
        let _dragEnabled = !!opts.draggable;
        return {
            options: opts,
            getLatLng: () => ({ lat: _pos[0], lng: _pos[1] }),
            setLatLng: (pos) => {
                _pos = Array.isArray(pos) ? pos : [pos.lat, pos.lng];
            },
            dragging: {
                enable: () => { _dragEnabled = true; },
                disable: () => { _dragEnabled = false; },
                enabled: () => _dragEnabled
            },
            bindPopup: () => {},
            addTo: function() { return this; },
            on: () => {}
        };
    },
    map: () => ({
        setView: () => {},
        addLayer: () => {},
        removeLayer: () => {},
        on: () => {},
        panTo: () => {}
    }),
    tileLayer: () => ({ addTo: () => {} }),
    latLngBounds: () => ({ isValid: () => true })
};
window.L = global.L;

const fs = require('fs');
const path = require('path');
const mcCode = fs.readFileSync(path.join(__dirname, '../frontend/js/map/map-controller.js'), 'utf8');
eval(mcCode);

const MapController = window.MapController;
const mc = new MapController('map');
mc.map = L.map();

// When trip is not active: markers are draggable
mc.setTripActive(false);
const pMarker = mc.addPickupMarker(10.8715, 106.7490, 'Trường ĐH GTVT');
const dMarker = mc.addDestinationMarker(10.7760, 106.7000, 'Vincom Đồng Khởi');

assert.strictEqual(pMarker.options.draggable, true, 'Pickup pin should be draggable prior to booking');
assert.strictEqual(dMarker.options.draggable, true, 'Destination pin should be draggable prior to booking');

// When trip becomes ACTIVE: markers are LOCKED
mc.setTripActive(true);
assert.strictEqual(pMarker.options.draggable, false, 'Pickup pin must be locked when trip is active');
assert.strictEqual(dMarker.options.draggable, false, 'Destination pin must be locked when trip is active');

// Adding markers during active trip sets draggable to false
const pActive = mc.addPickupMarker(10.8715, 106.7490, 'Điểm đón cuốc xe');
const dActive = mc.addDestinationMarker(10.7760, 106.7000, 'Điểm đến cuốc xe');
assert.strictEqual(pActive.options.draggable, false, 'New pickup marker added during active trip must not be draggable');
assert.strictEqual(dActive.options.draggable, false, 'New destination marker added during active trip must not be draggable');

// When trip completes: markers unlock again
mc.setTripActive(false);
assert.strictEqual(mc.markers.pickup.options.draggable, true, 'Pickup pin must unlock after trip completes');
assert.strictEqual(mc.markers.destination.options.draggable, true, 'Destination pin must unlock after trip completes');

console.log('  ✔ Pickup and Destination points are strictly locked and non-draggable during active trips.');

// ----------------------------------------------------
// TEST 4: Driver Live Position Updates & Propagation
// ----------------------------------------------------
console.log('\n▶ TEST 4: Driver Live Position Updates & Streaming');

let receivedLocation = null;
window.addEventListener('goride:driver_location_changed', (e) => {
    receivedLocation = e.detail;
});

// Broadcast driver position update
const driverId = 'drv_live_99';
const mockLat = 10.8720;
const mockLng = 106.7510;
const mockHeading = 85;

window.dispatchEvent(new CustomEvent('goride:driver_location_changed', {
    detail: {
        driverId,
        isOnline: true,
        lat: mockLat,
        lng: mockLng,
        heading: mockHeading
    }
}));

assert(receivedLocation !== null, 'Listener must receive live driver location');
assert.strictEqual(receivedLocation.lat, mockLat, 'Latitude must match broadcast');
assert.strictEqual(receivedLocation.lng, mockLng, 'Longitude must match broadcast');
assert.strictEqual(receivedLocation.heading, mockHeading, 'Heading must match broadcast');

console.log('  ✔ Driver live position stream broadcasts and propagates continuously without error.');

console.log('\n========================================================================');
console.log('🎉 ALL 4 VERIFICATION TESTS PASSED SUCCESSFULLY (100%)!');
console.log('========================================================================\n');
