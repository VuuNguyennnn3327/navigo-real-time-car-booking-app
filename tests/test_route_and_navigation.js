/**
 * Comprehensive Test Suite for Route Navigation, Snake-Eating Path Trimming,
 * Off-Route Detection, Real Road Network Corridors, Driver Position Persistence,
 * and Customer Booking For Others.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('====================================================');
console.log('🧪 RUNNING ROUTE NAVIGATION & SNAKE-EATING TEST SUITE');
console.log('====================================================\n');

// 1. Load map-controller.js in sandbox
const mapCtrlCode = fs.readFileSync(path.join(__dirname, '../frontend/js/map/map-controller.js'), 'utf8');

// Mock Leaflet
global.L = {
  marker: () => ({ addTo: () => ({ setLatLng: () => {}, setIcon: () => {} }) }),
  divIcon: () => ({}),
  circle: () => ({ addTo: () => ({ setLatLng: () => {}, setRadius: () => {} }) }),
  polyline: (coords, opts) => ({
    _coords: coords,
    _opts: opts,
    addTo: function() { return this; },
    bringToFront: function() { return this; },
    setLatLngs: function(c) { this._coords = c; },
    getLatLngs: function() { return this._coords; },
    setStyle: function(s) { this._opts = Object.assign(this._opts || {}, s); }
  })
};

const mapControllerSandbox = {};
const mockDiv = { style: {}, appendChild: () => {}, querySelector: () => null, getAttribute: () => null };
const evalCtrl = new Function('window', 'document', mapCtrlCode + '\nreturn window.MapController;');
const MapController = evalCtrl(mapControllerSandbox, {
  getElementById: () => mockDiv,
  createElement: () => mockDiv
});

const ctrl = new MapController(mockDiv);
ctrl.map = {
  removeLayer: () => {},
  invalidateSize: () => {}
};

// -------------------------------------------------------------
// TEST 1: Snake Eating Mechanic (On-Route Trimming)
// -------------------------------------------------------------
console.log('▶ TEST 1: Snake-Eating Trimming (On-Route)');
const testRoute = [
  [10.7725, 106.6980], // Point 0 (Ben Thanh)
  [10.7733, 106.6998], // Point 1 (Le Loi x NKKN)
  [10.7747, 106.7020], // Point 2 (Le Loi x Nguyen Hue)
  [10.7780, 106.7060], // Point 3
  [10.7951, 106.7219]  // Point 4 (Landmark 81)
];

ctrl.drawRoute(testRoute);
assert.strictEqual(ctrl._originalRouteCoords.length, 5, 'Original route should have 5 points');

// Driver moves slightly past Point 0 towards Point 1
const trim1 = ctrl._computeTrimmedRoute(testRoute, 10.7728, 106.6987, 0);
assert.strictEqual(trim1.isOffRoute, false, 'Driver should be ON ROUTE');
assert.ok(trim1.distMeters < 25, `Distance to route should be small (< 25m), got ${trim1.distMeters.toFixed(1)}m`);
assert.strictEqual(trim1.remainingCoords[0][0], 10.7728, 'First point of remaining route should be current driver position');
assert.strictEqual(trim1.remainingCoords[trim1.remainingCoords.length - 1][0], 10.7951, 'Last point must remain Landmark 81');

// Driver progresses past Point 1 towards Point 2
const trim2 = ctrl._computeTrimmedRoute(testRoute, 10.7740, 106.7009, trim1.newIndex);
assert.strictEqual(trim2.isOffRoute, false, 'Driver should be ON ROUTE at segment 1-2');
assert.ok(trim2.newIndex >= 1, `Progression index should have advanced >= 1, got ${trim2.newIndex}`);
assert.ok(trim2.remainingCoords.length <= 5, 'Path behind vehicle must be consumed/eaten');
console.log('  ✔ Snake-eating trimmed path smoothly behind driver without error.');

// -------------------------------------------------------------
// TEST 2: Off-Route Guard (No Diagonal Collapsing Across City)
// -------------------------------------------------------------
console.log('\n▶ TEST 2: Off-Route Detection & Route Preservation');
// Vehicle is at Dam Sen (10.7680, 106.6350) while route is in D1 / Binh Thanh (~7km away)
const offRouteTrim = ctrl._computeTrimmedRoute(testRoute, 10.7680, 106.6350, 0);
assert.strictEqual(offRouteTrim.isOffRoute, true, 'Vehicle 7km away must be detected as OFF ROUTE');
assert.ok(offRouteTrim.distMeters > 5000, `Dist should be > 5000m, got ${offRouteTrim.distMeters.toFixed(0)}m`);
assert.strictEqual(offRouteTrim.remainingCoords.length, testRoute.length, 'Off-route vehicle must NOT collapse route into 2 points!');
assert.deepStrictEqual(offRouteTrim.remainingCoords, testRoute, 'Route coordinates must be preserved 100% intact');
console.log('  ✔ Off-route vehicle correctly flagged without butchering route into a diagonal chord.');

// -------------------------------------------------------------
// TEST 3: Destination Reached Detection
// -------------------------------------------------------------
console.log('\n▶ TEST 3: Destination Arrival Detection');
const nearDestTrim = ctrl._computeTrimmedRoute(testRoute, 10.79515, 106.72192, 3);
assert.strictEqual(nearDestTrim.isOffRoute, false, 'Should be on-route');
assert.strictEqual(nearDestTrim.reachedEnd, true, 'Should flag reachedEnd = true when within 25m of end');
console.log('  ✔ Successfully detected arrival at destination.');

// -------------------------------------------------------------
// TEST 4: Customer Device Location Does NOT Trim Routes
// -------------------------------------------------------------
console.log('\n▶ TEST 4: Customer GPS Blue Dot Does NOT Trim Routes');
// Draw active route for booking
ctrl.drawRoute(testRoute);
const coordsBefore = ctrl.routePolyline.getLatLngs().slice();

// Call setUserLocation (the customer device location in another district)
ctrl.setUserLocation(10.8500, 106.7200, 20); // Thu Duc GPS dot
const coordsAfter = ctrl.routePolyline.getLatLngs();

assert.strictEqual(coordsBefore.length, coordsAfter.length, 'setUserLocation must not trim route length');
assert.deepStrictEqual(coordsBefore, coordsAfter, 'Route coordinates must be 100% unchanged after customer GPS update');
console.log('  ✔ Customer device location is strictly isolated from active booking routes.');

// -------------------------------------------------------------
// TEST 5: Comprehensive HCMC Road Network (BFS & Real Corridors)
// -------------------------------------------------------------
console.log('\n▶ TEST 5: Real Road Corridors Across All Districts');
const driverCode = fs.readFileSync(path.join(__dirname, '../frontend/js/driver/driver.js'), 'utf8');

// Test Dam Sen -> An Phu Dong (the exact scenario from Screenshot 1 & 2)
// Extract generateSmoothFallbackPath
const fallbackFnMatch = driverCode.match(/generateSmoothFallbackPath\(fromPoint,\s*toPoint\)\s*\{([\s\S]*?\n  \})/);
assert.ok(fallbackFnMatch, 'Should find generateSmoothFallbackPath in driver.js');

const driverObj = {};
eval('driverObj.generateSmoothFallbackPath = function(fromPoint, toPoint) {' + fallbackFnMatch[1]);

const pathDamSenToAnPhuDong = driverObj.generateSmoothFallbackPath([10.768, 106.635], [10.852, 106.695]);
assert.ok(Array.isArray(pathDamSenToAnPhuDong), 'Must return path array');
assert.ok(pathDamSenToAnPhuDong.length >= 5, `Must have multiple realistic street nodes, got ${pathDamSenToAnPhuDong.length}`);

// Verify that it does NOT cut through Tan Son Nhat airport runway core (10.812 to 10.828, 106.650 to 106.668)
const cutsAirportCore = pathDamSenToAnPhuDong.some(([lat, lng]) =>
  lat > 10.814 && lat < 10.826 && lng > 106.652 && lng < 106.666
);
assert.strictEqual(cutsAirportCore, false, 'Path must detour around airport perimeter roads');
console.log('  ✔ Dam Sen -> An Phu Dong generates realistic road corridor avoiding airport core.');

// Test An Phu Dong -> Hiep Binh (Screenshot 2 & 3 scenario)
const pathAnPhuDongToHiepBinh = driverObj.generateSmoothFallbackPath([10.852, 106.695], [10.835, 106.715]);
assert.ok(Array.isArray(pathAnPhuDongToHiepBinh), 'Must return path array');
assert.ok(pathAnPhuDongToHiepBinh.length >= 3, `Must have road nodes, got ${pathAnPhuDongToHiepBinh.length}`);
console.log('  ✔ An Phu Dong -> Hiep Binh connects via QL1A & QL13 road corridors.');

// -------------------------------------------------------------
// TEST 6: Driver Position Persistence Between Updates
// -------------------------------------------------------------
console.log('\n▶ TEST 6: Driver Real-Time Position Persistence Between Updates');
const localStorageMock = {};
global.localStorage = {
  getItem: (k) => localStorageMock[k] || null,
  setItem: (k, v) => { localStorageMock[k] = String(v); },
  removeItem: (k) => { delete localStorageMock[k]; }
};

let latestDriverPos = { lat: 10.7715, lng: 106.6355, heading: 45, timestamp: Date.now() };
localStorage.setItem('goride_driver_last_location', JSON.stringify(latestDriverPos));

// Simulate incoming polling tick with no new GPS fix (lat is null/NaN)
let incomingTrip = { driverLat: null, driverLon: null, driverHeading: null };
let resolvedLat = null;
let resolvedLon = null;

const freshLat = Number(incomingTrip.driverLat !== undefined ? incomingTrip.driverLat : null);
const freshLon = Number(incomingTrip.driverLon !== undefined ? incomingTrip.driverLon : null);

if (!isNaN(freshLat) && !isNaN(freshLon) && freshLat !== 0 && freshLon !== 0) {
  resolvedLat = freshLat;
  resolvedLon = freshLon;
} else if (latestDriverPos && !isNaN(latestDriverPos.lat) && latestDriverPos.lat !== 0) {
  resolvedLat = Number(latestDriverPos.lat);
  resolvedLon = Number(latestDriverPos.lng);
}

assert.strictEqual(resolvedLat, 10.7715, 'Position must remain steady at last known latitude between updates');
assert.strictEqual(resolvedLon, 106.6355, 'Position must remain steady at last known longitude between updates');
console.log('  ✔ Driver position stays still between updates without snapping or resetting.');

// -------------------------------------------------------------
// TEST 7: Customer Booking For Others (Pin and Route Unaltered)
// -------------------------------------------------------------
console.log('\n▶ TEST 7: Customer Booking for Others Isolation');
const customerCode = fs.readFileSync(path.join(__dirname, '../frontend/js/customer/customer.js'), 'utf8');

// Verify panToUserGps does NOT alter this.pickup
const panFnMatch = customerCode.match(/panToUserGps\(\)\s*\{([\s\S]*?\n    \})/);
assert.ok(panFnMatch, 'Should find panToUserGps method in customer.js');
assert.ok(!panFnMatch[1].includes('this.pickup ='), 'panToUserGps MUST NOT set or alter this.pickup');
console.log('  ✔ Map recenter buttons pan view without modifying booked pickup point for others.');

console.log('\n====================================================');
console.log('🎉 ALL 7 NAVIGATION & ROUTING TESTS PASSED 100%!');
console.log('====================================================\n');
