/**
 * Comprehensive Test Suite for Vehicle Icon Synchronization across Customer & Driver Views
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('========================================================================');
console.log('🧪 VERIFYING VEHICLE ICON FIX: CUSTOMER & DRIVER SYNCHRONIZATION');
console.log('========================================================================\n');

// 1. Setup Mock DOM & Storage Environment
const mockStorage = {};
const mockLocalStorage = {
    getItem: (k) => mockStorage[k] !== undefined ? mockStorage[k] : null,
    setItem: (k, v) => { mockStorage[k] = String(v); },
    removeItem: (k) => { delete mockStorage[k]; },
    clear: () => { Object.keys(mockStorage).forEach(k => delete mockStorage[k]); }
};

global.window = {
    localStorage: mockLocalStorage,
    sessionStorage: mockLocalStorage,
    location: { href: 'http://localhost/customer.html' },
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {}
};
global.localStorage = mockLocalStorage;
global.sessionStorage = mockLocalStorage;

// Mock Leaflet
global.L = {
    divIcon: (opts) => ({
        options: opts,
        html: opts.html,
        className: opts.className
    }),
    marker: (latlng, opts) => {
        let _icon = opts.icon;
        let _latlng = latlng;
        let _popup = null;
        let _domElement = null;

        function updateDomFromIcon(icon) {
            if (!icon || !icon.options || !icon.options.html) return;
            const html = icon.options.html;
            let currentClass = 'rtree-car-body';
            if (html.includes('rtree-bike-body')) currentClass = 'rtree-bike-body';
            else if (html.includes('rtree-delivery-body')) currentClass = 'rtree-delivery-body';
            else if (html.includes('rtree-car7-body')) currentClass = 'rtree-car7-body';
            else if (html.includes('rtree-premium-body')) currentClass = 'rtree-premium-body';

            const dummyMarker = { style: { transform: '' } };
            _domElement = {
                querySelector: (sel) => {
                    if (sel.includes('.rtree-driver-marker')) return dummyMarker;
                    if (sel.includes('.rtree-bike-body') || sel.includes('.rtree-car-body')) {
                        return {
                            classList: {
                                contains: (c) => c === currentClass
                            }
                        };
                    }
                    return null;
                }
            };
        }

        updateDomFromIcon(_icon);

        return {
            options: opts,
            getLatLng: () => _latlng,
            setLatLng: (pos) => { _latlng = pos; },
            setIcon: (ic) => {
                _icon = ic;
                updateDomFromIcon(ic);
            },
            getIcon: () => _icon,
            bindPopup: (content) => { _popup = content; },
            setPopupContent: (content) => { _popup = content; },
            getPopup: () => ({ setContent: (c) => { _popup = c; } }),
            getElement: () => _domElement,
            addTo: function() { return this; }
        };
    },
    map: () => ({
        setView: () => {},
        addLayer: () => {},
        removeLayer: () => {},
        on: () => {},
        panTo: () => {},
        fitBounds: () => {},
        invalidateSize: () => {}
    }),
    tileLayer: () => ({ addTo: () => {}, on: () => {} })
};
window.L = global.L;

global.document = {
    getElementById: () => ({ style: {}, appendChild: () => {}, addEventListener: () => {} }),
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => ({ style: {}, appendChild: () => {}, addEventListener: () => {} }),
    head: { appendChild: () => {} },
    addEventListener: () => {},
    removeEventListener: () => {}
};

// Load MapController
const mapControllerPath = path.join(__dirname, '../frontend/js/map/map-controller.js');
eval(fs.readFileSync(mapControllerPath, 'utf8'));
const MapController = window.MapController;
assert(MapController, 'MapController must be defined');

// ----------------------------------------------------
// TEST 1: MapController diacritic-insensitive resolution
// ----------------------------------------------------
console.log('▶ TEST 1: Diacritic-insensitive Vehicle Type Resolution in MapController');
const mc = new MapController('map');
mc.init();

assert.strictEqual(mc._resolveVehicleType({ vehicleType: 'motorbike' }), 'motorbike');
assert.strictEqual(mc._resolveVehicleType({ vehicleModel: 'Navigo Bike E-Scooter' }), 'motorbike');
assert.strictEqual(mc._resolveVehicleType({ vehicle: 'Xe máy điện (Navigo Bike) - 36F-98788' }), 'motorbike');
assert.strictEqual(mc._resolveVehicleType({ vehicle: 'Xe may dien (Navigo Bike)' }), 'motorbike');
assert.strictEqual(mc._resolveVehicleType({ vehicleType: 'car7' }), 'car7');
assert.strictEqual(mc._resolveVehicleType({ vehicleModel: 'Ô tô 7 chỗ (Navigo Taxi 7 chỗ)' }), 'car7');
assert.strictEqual(mc._resolveVehicleType({ vehicleType: 'premium' }), 'premium');
assert.strictEqual(mc._resolveVehicleType({ vehicleModel: 'Xe sang VIP (Navigo Luxury)' }), 'premium');
assert.strictEqual(mc._resolveVehicleType({ vehicleType: 'delivery' }), 'delivery');
console.log('  ✔ All Vietnamese and ASCII vehicle names resolve with 100% precision.\n');

// ----------------------------------------------------
// TEST 2: Active Driver Marker Dynamic Switch from Car to Bike
// ----------------------------------------------------
console.log('▶ TEST 2: Dynamic Marker Switching when Driver accepts Bike Trip');
mc.markers.drivers.clear();

// Driver starts online as car4
const dMarker = mc.addDriverMarker({
    id: 'active_driver',
    lat: 10.7725,
    lng: 106.6980,
    heading: 0,
    vehicleType: 'car4',
    name: 'Tài xế b',
    plate: '36F-98788'
});
assert.strictEqual(dMarker._renderedVehicleType, 'car4');
assert(dMarker.getIcon().options.html.includes('rtree-car-body'), 'Must start as car');

// Customer books Navigo Bike trip and driver accepts:
// Update called with bike metadata
mc.updateDriverMarker('active_driver', 10.7726, 106.6981, 45, {
    vehicleType: 'motorbike',
    iconType: 'motorbike',
    vehicleModel: 'Navigo Bike E-Scooter',
    vehicle: '🛵 Xe máy điện (Navigo Bike) - 36F-98788',
    isActive: true
});

assert.strictEqual(dMarker._renderedVehicleType, 'motorbike', 'Rendered vehicle type must update to motorbike');
assert(dMarker.getIcon().options.html.includes('rtree-bike-body'), 'Icon must update to rtree-bike-body');
assert(dMarker.getIcon().options.html.includes('<svg width="28" height="50"'), 'SVG must be top-down bike SVG');

// Consecutive GPS ticks with null metadata or heading update:
mc.updateDriverMarker('active_driver', 10.7728, 106.6983, 50);
assert.strictEqual(dMarker._renderedVehicleType, 'motorbike', 'Must remain motorbike on GPS movement');
assert(dMarker.getIcon().options.html.includes('rtree-bike-body'), 'DOM element must maintain rtree-bike-body');
console.log('  ✔ Active driver marker smoothly transitions to Bike and persists across GPS ticks.\n');

// ----------------------------------------------------
// TEST 3: Driver Portal Map Marker Verification
// ----------------------------------------------------
console.log('▶ TEST 3: Driver Portal Marker ("current-driver") on Active Bike Trip');
mc.markers.drivers.clear();

// Mock user "b" in driver controller
const driverUser = {
    id: 'drv_b',
    name: 'b',
    phone: '0909999888',
    role: 'driver',
    licensePlate: '36F-98788',
    vehicle: { plate: '36F-98788', type: 'motorbike' }
};
mockStorage['goride_user'] = JSON.stringify(driverUser);

// Load DriverController logic
const driverJsPath = path.join(__dirname, '../frontend/js/driver/driver.js');
const driverJsCode = fs.readFileSync(driverJsPath, 'utf8');
eval(driverJsCode);

const dc = new window.DriverController();
dc.mapController = mc;
dc.isOnline = true;
dc.currentPosition = { lat: 10.85, lng: 106.75, heading: 90, address: 'Test Location' };

// When driver is on an active bike trip
dc.activeTrip = {
    id: 'trip_123',
    vehicleType: 'motorbike',
    vehicleModel: 'Navigo Bike E-Scooter',
    licensePlate: '36F-98788'
};

dc.updateDriverMapMarker();

const curDriverMarker = mc.markers.drivers.get('current-driver');
assert(curDriverMarker, 'current-driver marker must exist on map');
assert.strictEqual(curDriverMarker._renderedVehicleType, 'motorbike', 'Driver screen must render motorbike');
assert(curDriverMarker.getIcon().options.html.includes('rtree-bike-body'), 'Driver marker HTML must contain rtree-bike-body');
console.log('  ✔ Driver portal renders top-down Navigo Bike e-scooter icon synchronously.\n');

// ----------------------------------------------------
// TEST 4: Customer Portal Tracking Protection from Online Drivers Stale Car Overwrite
// ----------------------------------------------------
console.log('▶ TEST 4: Customer Portal Tracking preserves booked Bike vehicle');
const customerJsPath = path.join(__dirname, '../frontend/js/customer/customer.js');
const customerJsCode = fs.readFileSync(customerJsPath, 'utf8');
eval(customerJsCode);

const cc = new window.CustomerAppController();
cc.selectedService = 'motorbike';

// Even if onlineDrivers had a stale 'car4' entry for driver 'b'
mockStorage['goride_online_drivers'] = JSON.stringify({
    'drv_b': { name: 'b', plate: '36F-98788', vehicleType: 'car4' }
});

const bookedTrip = {
    id: 'trip_123',
    driverName: 'b',
    licensePlate: '36F-98788',
    vehicleModel: 'Navigo Bike E-Scooter',
    vehicleType: 'motorbike'
};

const resolvedVType = cc.resolveTripVehicleType(bookedTrip);
assert.strictEqual(resolvedVType, 'motorbike', 'resolveTripVehicleType MUST prioritize trip vehicleModel & vehicleType over stale onlineDrivers');

console.log('  ✔ Customer portal prevents stale onlineDrivers from overriding booked Bike trip.\n');

console.log('========================================================================');
console.log('🎉 ALL VEHICLE ICON SYNCHRONIZATION TESTS PASSED SUCCESSFULLY (100%)!');
console.log('========================================================================\n');
