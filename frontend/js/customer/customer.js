/**
 * GoRide - Customer App Controller (Phase 1.2 Redesign)
 * Real ride-hailing flow matching UI references:
 * - ref-02: Location Search with pickup/dropoff & suggestions
 * - ref-03: Confirm Pickup on Map with center pin & options
 * - ref-04: Vehicle Selection & Fare Estimate bottom sheet
 * - ref-05/06: Live Driver Matching & Trip Tracking
 */

class CustomerAppController {
    constructor() {
        this.mapController = null;
        this.mapRenderer = null;

        // Current Active View: 'search' | 'pickup-confirm' | 'vehicle-select' | 'tracking' | 'history'
        this.currentView = 'search';

        // Locations (default initialized to user's current GPS location on load)
        this.pickup = null;
        this.destination = null;

        // Selected Vehicle Type
        this.selectedService = 'car4'; // 'bike' | 'car4' | 'premium' | 'car7'

        // Preferences (ref-03)
        this.preferences = {
            quiet: false,
            luggage: false,
            aircon: true
        };

        // Payment Method (ref-04)
        this.paymentMethod = 'cash'; // 'cash' | 'wallet'

        // Promo Code Management (Discount calculations & strikethrough UI)
        this.appliedPromo = {
            code: 'NAVIGO20',
            discountPercent: 20,
            label: 'Giảm 20%'
        };
        this.availablePromos = {
            'NAVIGO20': { discountPercent: 20, label: 'Giảm 20% toàn bộ chuyến đi' },
            'NAVIGO25': { discountPercent: 25, label: 'Giảm 25% ưu đãi hôm nay' },
            'NAVIGO50': { discountPercent: 50, label: 'Giảm 50% siêu tiết kiệm' }
        };
        this.selectedVehicleFare = null;
        this.selectedOriginalFare = null;

        // Current Active Trip & Tracking state
        this.activeTrip = null;
        this.trackingInterval = null;
        this.driverCarMarker = null;
        this.radarMarker = null;
        this.simulationTimers = [];
        this._latestDriverPosition = null;
        this._lastApproachDriverPos = null;
        this._hasDrawnApproachRoute = false;
        this._hasFittedApproachBounds = false;
        this._hasEnsuredTripRoute = false;
        this._hasRestoredArrivedRoute = false;
        this._hasFittedArrivedBounds = false;

        // Phase 2A.3: Real Route State from C++ Dijkstra Backend
        this.currentRouteDistance = null; // meters
        this.currentRouteDuration = null; // seconds
        this.currentRouteGeometry = null; // [[lat, lng], ...]
        this.currentNodesVisited = 0;

        // Realistic HCMC Locations Pool (ref-02)
        this.locationsPool = [
            {
                id: 'loc_tan_son_nhat_t3',
                name: 'Ga Quốc Nội (Ga T3) - Sân Bay Quốc Tế Tân Sơn Nhất',
                address: 'Phường Tân Sơn, Thành phố Hồ Chí Minh, VNM',
                lat: 10.8190,
                lng: 106.6560,
                distanceKm: '11,8 km',
                icon: '✈'
            },
            {
                id: 'loc_tan_son_nhat_t1',
                name: 'Ga Quốc Nội (Ga T1) - Sân Bay Quốc Tế Tân Sơn Nhất',
                address: 'Trường Sơn, Phường Tân Sơn Hòa, Thành phố Hồ Chí Minh, Việt Nam',
                lat: 10.8165,
                lng: 106.6575,
                distanceKm: '11 km',
                icon: '✈'
            },
            {
                id: 'loc_tan_son_nhat_t2',
                name: 'Ga Quốc Tế (Ga T2) - Sân Bay Quốc Tế Tân Sơn Nhất',
                address: 'Trường Sơn, Phường Tân Sơn Hòa, Thành phố Hồ Chí Minh, Việt Nam',
                lat: 10.8175,
                lng: 106.6590,
                distanceKm: '10,8 km',
                icon: '✈'
            },
            {
                id: 'loc_ben_xe_mientay',
                name: 'Bến Xe Miền Đông Cũ',
                address: '292 Đường Đinh Bộ Lĩnh, Phường Bình Thạnh, Thành phố Hồ Chí Minh, Việt Nam',
                lat: 10.8142,
                lng: 106.7115,
                distanceKm: '8,7 km',
                icon: '🚌'
            },
            {
                id: 'loc_van_lang_cs3',
                name: 'Trường Đại Học Văn Lang - Cơ Sở 3',
                address: '69/68 Đặng Thùy Trâm, Phường Bình Lợi, Bình Thạnh, TP.HCM',
                lat: 10.8282,
                lng: 106.6967,
                distanceKm: '6,5 km',
                icon: '🎓'
            },
            {
                id: 'loc_vincom_dk',
                name: 'Vincom Center Đồng Khởi',
                address: '72 Lê Thánh Tôn & 45A Lý Tự Trọng, Bến Nghé, Quận 1, TP.HCM',
                lat: 10.7781,
                lng: 106.7023,
                distanceKm: '1,3 km',
                icon: '📍'
            },
            {
                id: 'loc_benthanh',
                name: 'Chợ Bến Thành',
                address: 'Cửa Nam, Đường Lê Lợi, Phường Bến Thành, Quận 1, TP.HCM',
                lat: 10.7725,
                lng: 106.6980,
                distanceKm: '0,8 km',
                icon: '📍'
            }
        ];

        // Vehicle specifications & dynamic rates (ref-04)
        this.vehicleCatalog = {
            car4: {
                id: 'car4',
                name: 'Green Car - 4 khách',
                seats: '4',
                icon: '🚗',
                thumb: '../assets/gsm/car_vf5.svg',
                baseFare: 22000,
                perKm: 10800,
                etaMin: 4,
                etaMax: 4,
                desc: 'Đón trong 4 phút',
                discountPercent: 5
            },
            premium: {
                id: 'premium',
                name: 'Green Premium - 4 khách',
                seats: '4',
                icon: '🚘',
                thumb: '../assets/gsm/car_vf5.svg',
                baseFare: 26000,
                perKm: 12100,
                etaMin: 5,
                etaMax: 5,
                desc: 'Đón trong 5 phút',
                discountPercent: 5
            },
            bike: {
                id: 'bike',
                name: 'Green Bike - 1 khách',
                seats: '1',
                icon: '🛵',
                thumb: '../assets/gsm/bike_feliz.svg',
                baseFare: 14000,
                perKm: 5200,
                etaMin: 3,
                etaMax: 3,
                desc: 'Đón trong 3 phút',
                discountPercent: 0
            },
            luxury: {
                id: 'luxury',
                name: 'Green Luxury - 5 khách',
                seats: '5',
                icon: '✨',
                thumb: '../assets/gsm/car_vf5.svg',
                baseFare: 45000,
                perKm: 18000,
                etaMin: 6,
                etaMax: 6,
                desc: 'Đón trong 6 phút • Xe thuần điện cao cấp',
                discountPercent: 0
            },
            car7: {
                id: 'car7',
                name: 'Green Taxi 7 chỗ',
                seats: '7',
                icon: '🚐',
                thumb: '../assets/gsm/car_vf5.svg',
                baseFare: 30000,
                perKm: 13500,
                etaMin: 5,
                etaMax: 5,
                desc: 'Đón trong 5 phút • Xe thuần điện cao cấp',
                discountPercent: 5
            },
            delivery: {
                id: 'delivery',
                name: 'Green Delivery',
                seats: '1',
                icon: '📦',
                thumb: '../assets/gsm/bike_feliz.svg',
                baseFare: 15000,
                perKm: 5500,
                etaMin: 4,
                etaMax: 4,
                desc: 'Giao hàng siêu tốc trong nội thành',
                discountPercent: 0
            }
        };
    }

    normalizeVehicleType(type) {
        if (!type) return 'car4';
        const s = String(type).toLowerCase().trim();
        const unacc = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        if (s === 'delivery' || unacc.includes('giao hang') || s.includes('delivery') || s.includes('package') || s.includes('box')) return 'delivery';
        if (s === 'bike' || s === 'motorbike' || s.includes('bike') || s.includes('moto') || unacc.includes('xe may') || s.includes('scooter') || s.includes('feliz') || s.includes('evo') || s.includes('klara')) return 'motorbike';
        if (s === 'car7' || s === 'xl' || unacc.includes('7 cho') || s.includes('7seats') || s.includes('xl')) return 'car7';
        if (s === 'premium' || s === 'luxury' || s === 'car4_plus' || s === 'plus' || s.includes('plus') || unacc.includes('xe sang') || s.includes('luxury') || s.includes('vip')) return 'premium';
        return 'car4';
    }

    resolveTripVehicleType(trip) {
        if (!trip) return this.normalizeVehicleType(this.selectedService || 'car4');

        // 1. Direct explicit vehicleType or serviceType properties
        const directType = trip.vehicleType || trip.serviceType || trip.service || trip.driverVehicleType || (trip.vehicle && typeof trip.vehicle === 'object' && trip.vehicle.type);
        if (directType) {
            const norm = this.normalizeVehicleType(directType);
            if (norm) return norm;
        }

        // 2. Infer from vehicleModel string (e.g. 'Navigo Bike E-Scooter', 'Navigo Taxi 7 chỗ')
        if (trip.vehicleModel) {
            const s = String(trip.vehicleModel).toLowerCase();
            const unacc = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            if (s.includes('bike') || s.includes('scooter') || unacc.includes('xe may') || s.includes('moto') || s.includes('feliz') || s.includes('evo') || s.includes('klara')) return 'motorbike';
            if (unacc.includes('7 cho') || s.includes('7seats') || s.includes('xl')) return 'car7';
            if (s.includes('luxury') || unacc.includes('sang') || s.includes('plus') || s.includes('vip')) return 'premium';
            if (s.includes('delivery') || unacc.includes('giao hang') || s.includes('box')) return 'delivery';
        }

        // 3. Infer from vehicle label string
        if (trip.vehicle && typeof trip.vehicle === 'string') {
            const s = trip.vehicle.toLowerCase();
            const unacc = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            if (s.includes('bike') || s.includes('scooter') || unacc.includes('xe may') || s.includes('moto')) return 'motorbike';
            if (unacc.includes('7 cho') || s.includes('xl')) return 'car7';
            if (s.includes('luxury') || unacc.includes('sang') || s.includes('plus')) return 'premium';
            if (s.includes('delivery') || unacc.includes('giao hang')) return 'delivery';
        }

        // 4. Match with active trip in localStorage
        try {
            const act = JSON.parse(localStorage.getItem('goride_active_trip') || '{}');
            if (act && (act.id === trip.id || !trip.id)) {
                if (act.vehicleType) return this.normalizeVehicleType(act.vehicleType);
                if (act.vehicleModel) {
                    const normModel = this.normalizeVehicleType(act.vehicleModel);
                    if (normModel !== 'car4') return normModel;
                }
            }
        } catch (e) {}

        // 5. Customer selected service
        if (this.selectedService && this.selectedService !== 'car4') {
            return this.normalizeVehicleType(this.selectedService);
        }

        // 6. Match with online driver profile in goride_online_drivers (only if non-car4)
        try {
            const onlineDrivers = JSON.parse(localStorage.getItem('goride_online_drivers') || '{}');
            const dEntry = Object.values(onlineDrivers).find(d => 
                d && (
                    (trip.driverName && d.name === trip.driverName) || 
                    (trip.licensePlate && (d.plate === trip.licensePlate || d.licensePlate === trip.licensePlate))
                )
            );
            if (dEntry && (dEntry.vehicleType || dEntry.type || dEntry.model || (dEntry.vehicle && dEntry.vehicle.type))) {
                const normD = this.normalizeVehicleType(dEntry.vehicleType || dEntry.type || dEntry.model || (dEntry.vehicle && dEntry.vehicle.type));
                if (normD && normD !== 'car4') return normD;
            }
        } catch (e) {}

        // 7. Match with admin trips in localStorage
        try {
            const adm = JSON.parse(localStorage.getItem('goride_admin_trips') || '[]');
            const found = adm.find(t => t && (t.id === trip.id));
            if (found && found.vehicleType) return this.normalizeVehicleType(found.vehicleType);
        } catch (e) {}

        return this.normalizeVehicleType(this.selectedService || 'car4');
    }

    isVehicleTypeMatch(typeA, typeB) {
        return this.normalizeVehicleType(typeA) === this.normalizeVehicleType(typeB);
    }

    getVehicleDetails(type) {
        const norm = this.normalizeVehicleType(type);
        switch (norm) {
            case 'delivery':
                return {
                    id: 'delivery',
                    type: 'delivery',
                    name: 'Navigo Delivery',
                    icon: '📦',
                    plate: '59-S2 788.12',
                    model: 'Navigo Delivery E-Box',
                    label: 'Giao hàng siêu tốc (Navigo Delivery)'
                };
            case 'motorbike':
                return {
                    id: 'bike',
                    type: 'motorbike',
                    name: 'Navigo Bike',
                    icon: '🛵',
                    plate: '59-S2 899.24',
                    model: 'Navigo Bike E-Scooter',
                    label: 'Xe máy điện (Navigo Bike)'
                };
            case 'premium':
                return {
                    id: 'premium',
                    type: 'premium',
                    name: 'Navigo Luxury',
                    icon: '🚘',
                    plate: '51K-999.88',
                    model: 'Navigo Luxury VIP',
                    label: 'Xe sang VIP (Navigo Luxury)'
                };
            case 'car7':
                return {
                    id: 'car7',
                    type: 'car7',
                    name: 'Navigo Taxi 7 chỗ',
                    icon: '🚐',
                    plate: '51H-778.66',
                    model: 'Xe thuần điện cao cấp',
                    label: 'Ô tô 7 chỗ (Navigo Taxi 7 chỗ)'
                };
            case 'car4':
            default:
                return {
                    id: 'car4',
                    type: 'car4',
                    name: 'Navigo Car',
                    icon: '🚗',
                    plate: '51G-889.24',
                    model: 'Navigo Car E-Series',
                    label: 'Ô tô điện 4 chỗ (Navigo Car)'
                };
        }
    }

    /**
     * Initialize app controller
     */
    async init() {
        console.log('[GoRide Customer] Initializing customer app flow...');
        this.initMap();
        this.bindEvents();
        this.renderSuggestions(this.locationsPool);
        this.renderVehicleOptions();
        this.handleUrlParameters();
        this.checkBackendStatus();

        // 100% Real Data Enforcement: Thorough purge of all legacy & default mock trips across all storage
        if (typeof purgeAllMockTrips === 'function') {
            purgeAllMockTrips();
        }

        // Check if customer already has an active trip on backend (P7.1)
        await this.checkActiveTripOnLoad();

        // Check if hash is #history
        if (window.location.hash === '#history') {
            this.switchView('history');
            this.loadTripHistory();
        }

        // Listen for browser navigation hash change
        window.addEventListener('hashchange', () => {
            if (window.location.hash === '#history') {
                this.switchView('history');
                this.loadTripHistory();
            } else if (this.currentView === 'history') {
                if (this.activeTrip) {
                    this.switchView('tracking');
                } else if (this.pickup && this.destination) {
                    this.switchView('vehicle-select');
                } else {
                    this.switchView('search');
                }
            }
        });

        // Universal user location permission & initial pickup initialization
        if (typeof window.navigoEnsureLocationPermission === 'function') {
            window.navigoEnsureLocationPermission((loc) => {
                if (loc && loc.lat && loc.lng) {
                    this.userGpsPosition = { lat: loc.lat, lng: loc.lng };
                    if (!this.pickup) {
                        this.pickup = {
                            lat: loc.lat,
                            lng: loc.lng,
                            name: (() => {
                                const raw = (loc.name || '').trim();
                                if (raw && raw.length > 2 && !/^(\d+[\s\/-]*[a-zA-Z]?|[a-zA-Z0-9\s-]{1,2})$/i.test(raw)) return raw;
                                if (loc.address && loc.address.trim().length > 2) {
                                    const parts = loc.address.split(',').map(s => s.trim()).filter(s => s.length > 2);
                                    return parts.slice(0, 2).join(', ') || loc.address.trim();
                                }
                                return 'Vị trí của tôi';
                            })(),
                            address: loc.address || 'Vị trí hiện tại của bạn'
                        };
                        const pickupInput = document.getElementById('input-pickup');
                        if (pickupInput && (!pickupInput.value || /^(\d+[\s\/-]*[a-zA-Z]?|[a-zA-Z0-9\s-]{1,2})$/i.test(pickupInput.value.trim()) || pickupInput.value.includes('789/12'))) {
                            pickupInput.value = this.pickup.name || this.pickup.address;
                        }
                        const pickupConfirmedTitle = document.getElementById('pickup-confirmed-title');
                        if (pickupConfirmedTitle) pickupConfirmedTitle.textContent = this.pickup.name;
                        const pickupConfirmedDesc = document.getElementById('pickup-confirmed-desc');
                        if (pickupConfirmedDesc) pickupConfirmedDesc.textContent = this.pickup.address;
                        const routeSumPickup = document.getElementById('route-sum-pickup');
                        if (routeSumPickup) routeSumPickup.textContent = this.pickup.name;
                    }
                    if (this.mapController && this.mapController.map) {
                        this.mapController.map.setView([loc.lat, loc.lng], 15);
                        if (typeof this.mapController.setUserLocation === 'function') {
                            this.mapController.setUserLocation(loc.lat, loc.lng);
                        }
                    }
                }
            });
        }

        // Realtime cross-tab sync with driver portal
        window.addEventListener('storage', (e) => {
            const isTripActive = this.activeTrip && ['ACCEPTED', 'ARRIVED', 'IN_PROGRESS'].includes((this.activeTrip.status || '').toUpperCase());
            if (e.key === 'goride_active_trip' || e.key === 'goride_admin_trips' || e.key === 'goride_trip_accepted_event' || e.key === 'goride_trip_progress_event' || (e.key === 'goride_online_drivers' && isTripActive)) {
                try {
                    let act = JSON.parse(localStorage.getItem('goride_active_trip') || 'null');
                    if (!act && e.key === 'goride_admin_trips') {
                        const adminTrips = JSON.parse(localStorage.getItem('goride_admin_trips') || '[]');
                        act = adminTrips.find(x => x.id === (this.activeTripId || this.activeTrip?.id));
                    }
                    if (act && (act.id === (this.activeTripId || this.activeTrip?.id) || !this.activeTripId)) {
                        const curStatus = (this.activeTrip?.status || 'REQUESTED').toUpperCase();
                        const newStatus = (act.status || 'REQUESTED').toUpperCase();

                        // Dynamic driver position check
                        const inLat = Number(act.driverLat || act.driverLocation?.lat);
                        const inLon = Number(act.driverLon || act.driverLng || act.driverLocation?.lng);
                        const inHeading = Number(act.driverHeading || act.driverLocation?.heading || 0);
                        const hasValidInLoc = !isNaN(inLat) && !isNaN(inLon) && inLat !== 0 && inLon !== 0;

                        if (hasValidInLoc) {
                            this._latestDriverPosition = {
                                lat: inLat,
                                lng: inLon,
                                heading: inHeading,
                                timestamp: Date.now()
                            };
                        }

                        const dLat = this._latestDriverPosition ? this._latestDriverPosition.lat : (act.driverLat || this.activeTrip?.driverLat);
                        const dLon = this._latestDriverPosition ? this._latestDriverPosition.lng : (act.driverLon || this.activeTrip?.driverLon);
                        const dHeading = this._latestDriverPosition ? this._latestDriverPosition.heading : (act.driverHeading || this.activeTrip?.driverHeading || 0);

                        const hasStatusChanged = newStatus !== curStatus;
                        const hasDriverChanged = act.driverName && act.driverName !== this.activeTrip?.driverName;
                        const hasPosChanged = hasValidInLoc && (inLat !== this.activeTrip?.driverLat || inLon !== this.activeTrip?.driverLon);

                        if (hasStatusChanged || hasDriverChanged || hasPosChanged) {
                            this.activeTrip = {
                                ...this.activeTrip,
                                ...act,
                                status: newStatus,
                                driverLat: dLat,
                                driverLon: dLon,
                                driverHeading: dHeading
                            };
                            this.activeTripId = act.id;
                            this.updateTrackingUI(this.activeTrip);
                        }
                    } else if (isTripActive) {
                        this.updateTrackingUI(this.activeTrip);
                    }
                } catch (err) {}
            }
        });

        // Also listen to window event if driver updates on same page / cross-component
        window.addEventListener('goride:driver_location_changed', (e) => {
            const isTripActive = this.activeTrip && ['ACCEPTED', 'ARRIVED', 'IN_PROGRESS'].includes((this.activeTrip.status || '').toUpperCase());
            if (isTripActive && e.detail) {
                const nLat = Number(e.detail.lat);
                const nLng = Number(e.detail.lng);
                const nHeading = Number(e.detail.heading || 0);
                if (!isNaN(nLat) && !isNaN(nLng) && nLat !== 0 && nLng !== 0) {
                    this._latestDriverPosition = {
                        lat: nLat,
                        lng: nLng,
                        heading: nHeading,
                        timestamp: Date.now()
                    };
                    this.activeTrip.driverLat = nLat;
                    this.activeTrip.driverLon = nLng;
                    this.activeTrip.driverHeading = nHeading;
                    this.updateTrackingUI(this.activeTrip);
                }
            }
        });

        console.log('[GoRide Customer] Ready.');
    }

    /**
     * Check real C++ backend status honestly
     */
    async checkBackendStatus() {
        const dot = document.getElementById('backend-status-dot');
        const text = document.getElementById('backend-status-text');
        const pill = document.getElementById('backend-status-indicator');

        // Start periodic interval if not already running
        if (!this._backendCheckInterval) {
            this._backendCheckInterval = setInterval(() => {
                this.checkBackendStatus();
            }, 12000);
        }

        try {
            if (typeof apiClient !== 'undefined') {
                const res = await (apiClient.checkHealth ? apiClient.checkHealth() : apiClient.get('/health', { timeout: 3000 }));
                if (res && res.ok && res.data && res.data.success) {
                    if (dot) dot.style.background = '#10b981';
                    const nodeCount = res.data.nodes ? Number(res.data.nodes).toLocaleString('vi-VN') : '16.305';
                    if (text) text.textContent = `Backend C++: Trực tuyến (${nodeCount} nút OSM)`;
                    if (pill) pill.classList.add('online');
                    return true;
                }
            }
        } catch (e) {
            // Expected when C++ backend is offline
        }

        if (dot) dot.style.background = '#ef4444';
        if (text) text.textContent = 'Backend C++: Ngoại tuyến';
        if (pill) pill.classList.remove('online');
        return false;
    }

    /**
     * Initialize Leaflet map and render nearby drivers
     */
    initMap() {
        const container = document.getElementById('customer-map-container');
        if (!container || typeof MapController === 'undefined') return;

        const defaultCenter = this.pickup ? [this.pickup.lat, this.pickup.lng] : [10.7769, 106.7009];
        this.mapController = new MapController('customer-map-container', {
            center: defaultCenter,
            zoom: 15,
            zoomControl: false
        });

        this.mapController.init();

        if (typeof MapRenderer !== 'undefined') {
            this.mapRenderer = new MapRenderer(this.mapController);
        }

        if (this.destination && this.mapController) {
            this.mapController.addDestinationMarker(this.destination.lat, this.destination.lng, this.destination.name);
        }

        // Real dispatch: only display real active driver when assigned by backend
        this.clearNearbyDrivers();

        // Map move event updates center pin callout in pickup confirm mode
        if (this.mapController.map) {
            this.mapController.map.on('move', () => {
                if (this.currentView === 'pickup-confirm') {
                    const center = this.mapController.getCenter();
                    this.updateCenterPinAddress(center.lat, center.lng);
                }
            });

            // Map click event: Allows seamless tapping on map across views
            this.mapController.map.on('click', async (e) => {
                if (this.activeTrip || this.currentView === 'tracking') {
                    // Cố định vị trí: Không cho phép đổi điểm đón hoặc điểm đến khi đang trong cuốc xe
                    return;
                }
                const { lat, lng } = e.latlng;

                // Pickup confirm mode: pan map to clicked spot & update address
                if (this.currentView === 'pickup-confirm') {
                    this.mapController.map.panTo([lat, lng]);
                    this.updateCenterPinAddress(lat, lng);
                    return;
                }

                // If in search or map-select-destination mode and click-to-select is not overriding
                if ((this.currentView === 'search' || this.currentView === 'map-select-destination') && !this.mapController.isClickToSelectActive) {
                    let placeName = `Vị trí đã chọn (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
                    let placeAddr = '';
                    if (typeof geocoderService !== 'undefined') {
                        try {
                            rev = await geocoderService.reverse(lat, lng);
                            if (rev && rev.name) {
                                placeName = rev.name;
                                placeAddr = rev.address || rev.name;
                            }
                        } catch (err) {}
                    }

                    if (!this.destination) {
                        this.selectDestination({
                            name: placeName,
                            address: placeAddr || placeName,
                            lat: lat,
                            lng: lng
                        });
                    } else if (!this.pickup) {
                        this.pickup = {
                            name: placeName,
                            address: placeAddr || placeName,
                            lat: lat,
                            lng: lng
                        };
                        const pInput = document.getElementById('input-pickup');
                        if (pInput) pInput.value = placeName;
                        this.switchView('vehicle-select');
                        this.renderRouteOnMap();
                    }
                }
            });
        }

        // Initialize Google Maps style real-time GPS pulsing blue dot
        this.initUserGeolocation();
    }

    /**
     * Initializes Google Maps-style pulsing blue dot representing self/device GPS position
     */
    initUserGeolocation() {
        if (!navigator.geolocation || !this.mapController) return;

        // Fast initial position acquisition
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const lat = pos.coords.latitude;
                const lng = pos.coords.longitude;
                const acc = pos.coords.accuracy;
                this.userGpsPosition = { lat, lng };
                if (typeof this.mapController.setUserLocation === 'function') {
                    this.mapController.setUserLocation(lat, lng, acc);
                }
            },
            (err) => {
                console.warn('[Customer] Initial GPS notice:', err.message);
                if (typeof this.mapController.setUserLocation === 'function') {
                    const fallbackCenter = this.pickup ? [this.pickup.lat, this.pickup.lng] : [10.7760, 106.7000];
                    this.mapController.setUserLocation(fallbackCenter[0], fallbackCenter[1]);
                }
            },
            { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
        );

        // Continuous watch to keep Google Maps pulsing blue dot updated as user moves
        try {
            if (this._gpsWatchId) {
                navigator.geolocation.clearWatch(this._gpsWatchId);
            }
            this._gpsWatchId = navigator.geolocation.watchPosition(
                (pos) => {
                    const lat = pos.coords.latitude;
                    const lng = pos.coords.longitude;
                    const acc = pos.coords.accuracy;
                    this.userGpsPosition = { lat, lng };
                    if (this.mapController && typeof this.mapController.setUserLocation === 'function') {
                        this.mapController.setUserLocation(lat, lng, acc);
                    }
                },
                (err) => {
                    console.debug('[Customer] Watch GPS update notice:', err.message);
                },
                { enableHighAccuracy: true, maximumAge: 10000 }
            );
        } catch (e) {}
    }

    /**
     * Clear driver markers (no fake drivers or ghost vehicles)
     */
    clearNearbyDrivers() {
        if (!this.mapController) return;
        this.mapController.clearMarkers('drivers');
    }

    scatterNearbyDrivers() {
        this.clearNearbyDrivers();
    }

    /**
     * Display green scanning radar pulse centered directly on customer pickup marker on Leaflet map
     * Automatically smooth-zooms to customer pickup coordinates (zoom: 16)
     */
    showRadarAtPickup(lat, lng) {
        if (!this.mapController || !this.mapController.map) return;

        let pLat = Number(lat);
        let pLng = Number(lng);

        if (isNaN(pLat) || isNaN(pLng)) {
            if (this.pickup && this.pickup.lat && this.pickup.lng) {
                pLat = Number(this.pickup.lat);
                pLng = Number(this.pickup.lng);
            } else if (this.activeTrip) {
                pLat = Number(this.activeTrip.pickupLat || (this.activeTrip.pickup && this.activeTrip.pickup.lat));
                pLng = Number(this.activeTrip.pickupLon || this.activeTrip.pickupLng || (this.activeTrip.pickup && (this.activeTrip.pickup.lng || this.activeTrip.pickup.lon)));
            }
        }

        if (isNaN(pLat) || isNaN(pLng)) return;

        // Hide static screen-center overlay
        const staticRadar = document.getElementById('tracking-radar');
        if (staticRadar) staticRadar.style.display = 'none';

        // Ensure pickup marker is visible on map
        if (typeof this.mapController.addPickupMarker === 'function') {
            this.mapController.addPickupMarker(pLat, pLng, (this.pickup && this.pickup.name) || 'Điểm đón của bạn');
        }

        // If radar marker already exists at this exact position, don't recreate
        if (this.radarMarker) {
            try {
                const curPos = this.radarMarker.getLatLng();
                if (Math.abs(curPos.lat - pLat) < 0.00001 && Math.abs(curPos.lng - pLng) < 0.00001) {
                    return;
                }
            } catch (e) {}
            this.hideRadar();
        }

        // Custom Leaflet DivIcon anchored directly on map coordinates
        if (typeof L !== 'undefined' && L.divIcon) {
            const radarIcon = L.divIcon({
                className: 'goride-radar-leaflet-marker',
                iconSize: [240, 240],
                iconAnchor: [120, 120],
                html: `
                    <div class="goride-radar-marker-wrap">
                        <div class="goride-radar-pulse"></div>
                        <div class="goride-radar-pulse goride-radar-pulse-2"></div>
                        <div class="goride-radar-text">
                            <span class="goride-radar-dot"></span> Đang tìm kiếm tài xế gần bạn nhất...
                        </div>
                    </div>
                `
            });

            this.radarMarker = L.marker([pLat, pLng], {
                icon: radarIcon,
                zIndexOffset: 300,
                interactive: false
            }).addTo(this.mapController.map);
        }

        // Smoothly zoom map to customer pickup location
        try {
            this.mapController.map.invalidateSize({ animate: false });
            if (typeof this.mapController.map.flyTo === 'function') {
                this.mapController.map.flyTo([pLat, pLng], 16, { duration: 0.9 });
            } else if (typeof this.mapController.setView === 'function') {
                this.mapController.setView(pLat, pLng, 16);
            }
        } catch (e) {}
    }

    /**
     * Remove map-anchored radar pulse marker
     */
    hideRadar() {
        if (this.radarMarker && this.mapController && this.mapController.map) {
            try {
                this.mapController.map.removeLayer(this.radarMarker);
            } catch (e) {}
            this.radarMarker = null;
        }
        const staticRadar = document.getElementById('tracking-radar');
        if (staticRadar) staticRadar.style.display = 'none';
    }

    /**
     * Switch visible flow view layer
     * @param {'search' | 'pickup-confirm' | 'vehicle-select' | 'tracking' | 'history'} viewName
     */
    switchView(viewName) {
        this.currentView = viewName;

        if (this.mapController && typeof this.mapController.setTripActive === 'function') {
            const isTracking = (viewName === 'tracking') || !!this.activeTrip;
            this.mapController.setTripActive(isTracking);
        }

        const views = {
            'search': document.getElementById('view-search'),
            'pickup-confirm': document.getElementById('view-pickup-confirm'),
            'vehicle-select': document.getElementById('view-vehicle-select'),
            'tracking': document.getElementById('view-tracking'),
            'history': document.getElementById('view-history')
        };

        Object.keys(views).forEach(key => {
            const el = views[key];
            if (el) {
                if (key === viewName) {
                    el.classList.add('active');
                    el.style.removeProperty('display');
                } else {
                    el.classList.remove('active');
                    el.style.setProperty('display', 'none', 'important');
                }
            }
        });

        const pickBanner = document.getElementById('floating-map-pick-banner');
        if (pickBanner && viewName !== 'map-select-destination') {
            pickBanner.style.display = 'none';
        }

        const sidebar = document.querySelector('.gsm-desktop-sidebar');
        if (sidebar) {
            if (viewName === 'map-select-destination') {
                sidebar.style.setProperty('pointer-events', 'none', 'important');
            } else {
                sidebar.style.removeProperty('pointer-events');
            }
        }

        if (this.mapController && this.mapController.map) {
            setTimeout(() => {
                this.mapController.map.invalidateSize();
            }, 100);
        }
        // Update active state of mobile bottom nav items
        const bNavBooking = document.getElementById('bnav-cust-booking') || document.getElementById('bnav-guest-booking');
        const bNavHistory = document.getElementById('bnav-cust-history') || document.getElementById('bnav-guest-activity');
        if (bNavBooking && bNavHistory) {
            if (viewName === 'history') {
                bNavHistory.classList.add('active');
                bNavBooking.classList.remove('active');
            } else {
                bNavBooking.classList.add('active');
                bNavHistory.classList.remove('active');
            }
        }

        // Update active state of desktop history button in top header
        const btnDesktopHistoryEl = document.getElementById('btn-desktop-history');
        if (btnDesktopHistoryEl) {
            if (viewName === 'history') {
                btnDesktopHistoryEl.classList.add('active');
            } else {
                btnDesktopHistoryEl.classList.remove('active');
            }
        }

        // Update header breadcrumb navigation
        const breadcrumbs = {
            'search': { step: 'Lộ trình', title: 'Chọn điểm đón & điểm đến' },
            'pickup-confirm': { step: 'Điểm đón', title: 'Xác nhận vị trí trên bản đồ' },
            'vehicle-select': { step: 'Chọn xe', title: 'Chọn dịch vụ & cước phí' },
            'tracking': { step: 'Theo dõi', title: 'Chuyến đi đang diễn ra' },
            'history': { step: 'Lịch sử', title: 'Các chuyến đi đã thực hiện' }
        };

        const bStep = document.getElementById('breadcrumb-step');
        const bTitle = document.getElementById('breadcrumb-title');
        if (breadcrumbs[viewName]) {
            if (bStep) bStep.textContent = breadcrumbs[viewName].step;
            if (bTitle) bTitle.textContent = breadcrumbs[viewName].title;
        }

        // Center pin overlay on map (only in pickup-confirm mode)
        const centerPin = document.getElementById('center-pin-badge');
        if (centerPin) {
            centerPin.style.display = viewName === 'pickup-confirm' ? 'flex' : 'none';
        }

        // Radar pulse overlay on map (anchored to customer pickup coordinates)
        const staticRadar = document.getElementById('tracking-radar');
        if (staticRadar) {
            staticRadar.style.display = 'none';
        }

        if (viewName === 'tracking') {
            // Explicitly ensure pickup & destination selection view and vehicle sheet are fully hidden
            const searchView = document.getElementById('view-search');
            if (searchView) searchView.style.setProperty('display', 'none', 'important');
            const pickupConfirmView = document.getElementById('view-pickup-confirm');
            if (pickupConfirmView) pickupConfirmView.style.setProperty('display', 'none', 'important');
            const vehicleSelectView = document.getElementById('view-vehicle-select');
            if (vehicleSelectView) vehicleSelectView.style.setProperty('display', 'none', 'important');
            const vSheet = document.getElementById('goride-vehicle-sheet');
            if (vSheet) vSheet.style.setProperty('display', 'none', 'important');
            const rBar = document.querySelector('.goride-route-summary-bar');
            if (rBar) rBar.style.setProperty('display', 'none', 'important');

            const isSearching = !this.activeTrip || this.activeTrip.status === 'REQUESTED' || this.activeTrip.status === 'OFFERED';
            if (isSearching) {
                this.showRadarAtPickup();
            } else {
                this.hideRadar();
            }
        } else {
            this.hideRadar();
        }

        const btnTrackRecenter = document.getElementById('btn-track-recenter');
        if (btnTrackRecenter) {
            btnTrackRecenter.style.display = viewName === 'tracking' ? 'flex' : 'none';
        }

        // Trigger map invalidate size on view transitions for responsive desktop/mobile
        if (this.mapController && this.mapController.map) {
            this.mapController.map.invalidateSize({ animate: false });
        }
        setTimeout(() => {
            if (this.mapController && this.mapController.map) {
                this.mapController.map.invalidateSize({ animate: false });
            }
        }, 100);
        setTimeout(() => {
            if (this.mapController && this.mapController.map) {
                this.mapController.map.invalidateSize({ animate: false });
            }
        }, 300);

        // View specific setups
        const distPill = document.getElementById('route-distance-pill');
        if (distPill && viewName !== 'vehicle-select') {
            distPill.style.display = 'none';
        }

        if (viewName === 'pickup-confirm') {
            if (this.mapController) {
                const centerLat = this.pickup ? this.pickup.lat : 10.7725;
                const centerLng = this.pickup ? this.pickup.lng : 106.6980;
                this.mapController.setView(centerLat, centerLng, 16);
                this.updateCenterPinAddress(centerLat, centerLng);
            }
        } else if (viewName === 'vehicle-select') {
            const vSheet = document.getElementById('goride-vehicle-sheet');
            if (vSheet) vSheet.style.removeProperty('display');
            const rBar = document.querySelector('.goride-route-summary-bar');
            if (rBar) rBar.style.removeProperty('display');
            this.renderRouteOnMap();
            if (typeof this.expandVehicleSheet === 'function') {
                this.expandVehicleSheet();
            }
        }

        if (typeof this.updatePersistentBanner === 'function') {
            this.updatePersistentBanner();
        }
    }

    /**
     * Read and react to query parameters (?service=..., ?dest=...)
     */
    handleUrlParameters() {
        const params = new URLSearchParams(window.location.search);
        const service = params.get('service');
        const dest = params.get('dest');

        if (service && this.vehicleCatalog[service]) {
            this.selectedService = service;
            this.updateVehicleTabsUI(service);
        } else if (service) {
            const inDevMap = {
                food: { name: 'Đồ ăn', icon: '🍔' },
                rental: { name: 'Thuê xe tự lái', icon: '🚗' },
                gift: { name: 'Thẻ quà tặng', icon: '🎁' },
                vinbus: { name: 'VinBus', icon: '🚌' },
                membership: { name: 'Hội viên', icon: '💎' }
            };
            if (inDevMap[service]) {
                setTimeout(() => {
                    if (typeof window.showFeatureInDevelopment === 'function') {
                        window.showFeatureInDevelopment(inDevMap[service].name, inDevMap[service].icon);
                    } else if (typeof window.showNavigoModal === 'function') {
                        window.showNavigoModal({
                            title: inDevMap[service].name,
                            message: 'Tính năng đang phát triển',
                            icon: inDevMap[service].icon,
                            confirmText: 'Đã hiểu',
                            showCancel: false,
                            onConfirm: () => {}
                        });
                    }
                }, 400);
            }
        }

        if (dest) {
            let matched = null;
            if (dest === 'home') {
                matched = this.locationsPool.find(l => l.id === 'loc_bachkhoa') || this.locationsPool[4];
            } else if (dest === 'work') {
                matched = this.locationsPool.find(l => l.id === 'loc_landmark81') || this.locationsPool[2];
            } else if (dest === 'benthanh') {
                matched = this.locationsPool.find(l => l.id === 'loc_benthanh') || this.locationsPool[1];
            } else if (dest === 'airport') {
                matched = this.locationsPool.find(l => l.id === 'loc_airport') || this.locationsPool[3];
            } else {
                matched = this.locationsPool.find(l => l.name.toLowerCase().includes(dest.toLowerCase()));
                if (!matched && typeof geocoderService !== 'undefined') {
                    geocoderService.search(dest, 1).then(results => {
                        if (results && results.length > 0) {
                            this.selectDestination(results[0]);
                        }
                    }).catch(() => {});
                    return;
                }
            }

            if (matched) {
                this.selectDestination(matched);
            }
        }
    }

    /**
     * Update search vehicle quick tabs
     */
    updateVehicleTabsUI(serviceType) {
        const v = serviceType || this.selectedService || 'car4';
        const vInfo = this.getVehicleDetails(v);
        const badge = document.getElementById('search-selected-vehicle-badge');
        if (badge) {
            badge.textContent = `${vInfo.icon} ${vInfo.name}`;
        }
        document.querySelectorAll('.vehicle-tab-btn').forEach(btn => {
            const match = btn.getAttribute('data-v') === v;
            btn.classList.toggle('active', match);
            if (match) {
                btn.style.border = '2px solid #00b1a9';
                btn.style.background = '#f0fdfa';
                const label = btn.querySelector('span:last-child');
                if (label) label.style.color = '#007d77';
            } else {
                btn.style.border = '1.5px solid #cbd5e1';
                btn.style.background = '#ffffff';
                const label = btn.querySelector('span:last-child');
                if (label) label.style.color = '#0f2d3c';
            }
        });
    }

    /**
     * Bind UI event handlers
     */
    bindEvents() {
        // Search state tracking: 'destination' | 'pickup'
        this.searchTarget = 'destination';
        this._searchDebounceTimer = null;

        // Pickup Search Input typing filter (ref-02)
        const pickupInput = document.getElementById('input-pickup');
        const clearPickupBtn = document.getElementById('btn-clear-pickup');

        if (pickupInput) {
            pickupInput.addEventListener('focus', () => {
                this.searchTarget = 'pickup';
                const q = pickupInput.value.trim();
                if (q.length >= 2 && typeof geocoderService !== 'undefined') {
                    this.executeSearch(q);
                } else {
                    this.renderSuggestions(this.locationsPool);
                }
            });

            pickupInput.addEventListener('input', (e) => {
                this.searchTarget = 'pickup';
                const query = e.target.value.trim();
                if (clearPickupBtn) {
                    clearPickupBtn.style.display = query.length > 0 ? 'flex' : 'none';
                }

                clearTimeout(this._searchDebounceTimer);
                if (!query) {
                    this.renderSuggestions(this.locationsPool);
                    return;
                }

                this.showSearchLoading();
                this._searchDebounceTimer = setTimeout(() => {
                    this.executeSearch(query);
                }, 320);
            });
        }

        if (clearPickupBtn && pickupInput) {
            clearPickupBtn.addEventListener('click', () => {
                pickupInput.value = '';
                this.pickup = null;
                clearPickupBtn.style.display = 'none';
                this.renderSuggestions(this.locationsPool);
                pickupInput.focus();
            });
        }

        // Destination Search Input typing filter (ref-02)
        const destInput = document.getElementById('input-destination');
        const clearDestBtn = document.getElementById('btn-clear-dest');

        if (destInput) {
            destInput.addEventListener('focus', () => {
                this.searchTarget = 'destination';
                const q = destInput.value.trim();
                if (q.length >= 2 && typeof geocoderService !== 'undefined') {
                    this.executeSearch(q);
                } else {
                    this.renderSuggestions(this.locationsPool);
                }
            });

            destInput.addEventListener('input', (e) => {
                this.searchTarget = 'destination';
                const query = e.target.value.trim();
                if (clearDestBtn) {
                    clearDestBtn.style.display = query.length > 0 ? 'flex' : 'none';
                }

                clearTimeout(this._searchDebounceTimer);
                if (!query) {
                    this.renderSuggestions(this.locationsPool);
                    return;
                }

                this.showSearchLoading();
                this._searchDebounceTimer = setTimeout(() => {
                    this.executeSearch(query);
                }, 320);
            });
        }

        if (clearDestBtn && destInput) {
            clearDestBtn.addEventListener('click', () => {
                destInput.value = '';
                this.destination = null;
                clearDestBtn.style.display = 'none';
                this.renderSuggestions(this.locationsPool);
                destInput.focus();
            });
        }

        // Use Current GPS Pill
        const btnGpsPill = document.getElementById('btn-use-current-gps');
        if (btnGpsPill) {
            btnGpsPill.addEventListener('click', () => {
                this.recenterMapOnGps(true);
            });
        }

        // Change Pickup Point directly from route preview capsule
        const btnChangePickup = document.getElementById('btn-change-pickup-pt');
        if (btnChangePickup) {
            btnChangePickup.addEventListener('click', () => {
                this.switchView('search');
                this.searchTarget = 'pickup';
                const pInp = document.getElementById('input-pickup');
                if (pInp) {
                    pInp.focus();
                    pInp.select();
                }
                this.renderSuggestions(this.locationsPool);
                this.showToast('Mời bạn chọn hoặc tìm kiếm điểm đón mới', 'info');
            });
        }

        // Change Destination Point directly from route preview capsule
        const btnChangeDest = document.getElementById('btn-change-dest-pt');
        if (btnChangeDest) {
            btnChangeDest.addEventListener('click', () => {
                this.switchView('search');
                this.searchTarget = 'destination';
                const dInp = document.getElementById('input-destination');
                if (dInp) {
                    dInp.focus();
                    dInp.select();
                }
                this.renderSuggestions(this.locationsPool);
                this.showToast('Mời bạn chọn hoặc tìm kiếm điểm đến mới', 'info');
            });
        }

        // Search Vehicle Quick Tabs
        document.querySelectorAll('.vehicle-tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const v = btn.getAttribute('data-v');
                if (v && this.vehicleCatalog[v]) {
                    this.selectedService = v;
                    this.updateVehicleTabsUI(v);
                    this.renderVehicleOptions();
                    const vInfo = this.getVehicleDetails(v);
                    this.showToast(`Đã chọn phương tiện: ${vInfo.icon} ${vInfo.name}`, 'info', 2000);
                }
            });
        });

        // Draggable Pickup Pin On Map
        const btnPinPickup = document.getElementById('btn-pin-pickup-on-map');
        if (btnPinPickup) {
            btnPinPickup.addEventListener('click', () => {
                if (this.activeTrip || this.currentView === 'tracking') {
                    this.showToast('Điểm đón đã được cố định trong suốt chuyến xe.', 'info', 3000);
                    return;
                }
                if (!this.mapController || !this.mapController.map) return;
                if (window.innerWidth <= 1024) {
                    this.switchView('pickup-confirm');
                }
                const pLat = this.pickup ? Number(this.pickup.lat) : 10.8715;
                const pLng = this.pickup ? Number(this.pickup.lng) : 106.7490;
                this.mapController.setView(pLat, pLng, 16);
                const marker = this.mapController.addPickupMarker(pLat, pLng, this.pickup ? this.pickup.name : 'Điểm đón');
                if (marker) {
                    marker.openPopup();
                }
                this.showToast('🟢 Kéo nút ghim xanh trên bản đồ để chọn điểm đón chính xác', 'info', 4000);
            });
        }

        // Draggable Destination Pin On Map
        const btnPinDest = document.getElementById('btn-pin-dest-on-map');
        if (btnPinDest) {
            btnPinDest.addEventListener('click', () => {
                if (this.activeTrip || this.currentView === 'tracking') {
                    this.showToast('Điểm đến đã được cố định trong suốt chuyến xe.', 'info', 3000);
                    return;
                }
                if (!this.mapController || !this.mapController.map) return;
                if (window.innerWidth <= 1024) {
                    if (this.pickup && this.destination) {
                        this.switchView('vehicle-select');
                    } else {
                        btnMapDest?.click();
                        return;
                    }
                }
                let dLat = this.destination ? Number(this.destination.lat) : null;
                let dLng = this.destination ? Number(this.destination.lng) : null;
                if (!dLat || !dLng) {
                    const baseLat = this.pickup ? Number(this.pickup.lat) : 10.7760;
                    const baseLng = this.pickup ? Number(this.pickup.lng) : 106.7000;
                    dLat = baseLat + 0.015;
                    dLng = baseLng + 0.012;
                    this.destination = {
                        name: 'Điểm đến trên bản đồ',
                        address: 'Thành phố Hồ Chí Minh',
                        lat: dLat,
                        lng: dLng
                    };
                    const dInp = document.getElementById('input-destination');
                    if (dInp) dInp.value = this.destination.name;
                }
                this.mapController.setView(dLat, dLng, 16);
                const marker = this.mapController.addDestinationMarker(dLat, dLng, this.destination.name);
                if (marker) {
                    marker.openPopup();
                }
                this.showToast('📍 Kéo nút ghim đỏ/cam trên bản đồ để chọn điểm đến chính xác', 'info', 4000);
                if (this.pickup) {
                    this.renderRouteOnMap();
                }
            });
        }

        // Listen for map pin dragend events
        window.addEventListener('navigo:pickup_dragend', async (e) => {
            if (this.activeTrip || this.currentView === 'tracking') {
                if (this.mapController && this.mapController.markers && this.mapController.markers.pickup && this.activeTrip) {
                    const pLat = Number(this.activeTrip.pickupLat || (this.activeTrip.pickup && this.activeTrip.pickup.lat) || (this.pickup && this.pickup.lat));
                    const pLon = Number(this.activeTrip.pickupLon || (this.activeTrip.pickup && this.activeTrip.pickup.lng) || (this.pickup && this.pickup.lng));
                    if (!isNaN(pLat) && !isNaN(pLon)) {
                        this.mapController.markers.pickup.setLatLng([pLat, pLon]);
                    }
                }
                this.showToast('Vị trí điểm đón được cố định trong suốt chuyến đi.', 'info', 3000);
                return;
            }
            const { lat, lng } = e.detail || {};
            if (!lat || !lng) return;
            let pName = `Tọa độ (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
            let pAddr = pName;
            if (typeof geocoderService !== 'undefined') {
                try {
                    const place = await geocoderService.reverse(lat, lng);
                    if (place && place.name) {
                        pName = place.name;
                        pAddr = place.address || place.name;
                    }
                } catch (err) {}
            }
            this.pickup = {
                id: `loc_${Date.now()}`,
                name: pName,
                address: pAddr,
                lat: Number(lat),
                lng: Number(lng)
            };
            const pInput = document.getElementById('input-pickup');
            if (pInput) pInput.value = pName;
            const pSum = document.getElementById('route-sum-pickup');
            if (pSum) pSum.textContent = pName;
            this.showToast(`🟢 Đã cập nhật điểm đón: ${pName}`, 'success', 3000);
            if (this.destination) {
                this.renderRouteOnMap();
            }
        });

        window.addEventListener('navigo:destination_dragend', async (e) => {
            if (this.activeTrip || this.currentView === 'tracking') {
                if (this.mapController && this.mapController.markers && this.mapController.markers.destination && this.activeTrip) {
                    const dLat = Number(this.activeTrip.dropoffLat || (this.activeTrip.destination && this.activeTrip.destination.lat) || (this.destination && this.destination.lat));
                    const dLon = Number(this.activeTrip.dropoffLon || (this.activeTrip.destination && this.activeTrip.destination.lng) || (this.destination && this.destination.lng));
                    if (!isNaN(dLat) && !isNaN(dLon)) {
                        this.mapController.markers.destination.setLatLng([dLat, dLon]);
                    }
                }
                this.showToast('Vị trí điểm đến được cố định trong suốt chuyến đi.', 'info', 3000);
                return;
            }
            const { lat, lng } = e.detail || {};
            if (!lat || !lng) return;
            let dName = `Tọa độ (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
            let dAddr = dName;
            if (typeof geocoderService !== 'undefined') {
                try {
                    const place = await geocoderService.reverse(lat, lng);
                    if (place && place.name) {
                        dName = place.name;
                        dAddr = place.address || place.name;
                    }
                } catch (err) {}
            }
            this.destination = {
                id: `dest_${Date.now()}`,
                name: dName,
                address: dAddr,
                lat: Number(lat),
                lng: Number(lng)
            };
            const dInput = document.getElementById('input-destination');
            if (dInput) dInput.value = dName;
            const dSum = document.getElementById('route-sum-dest');
            if (dSum) dSum.textContent = dName;
            this.showToast(`📍 Đã cập nhật điểm đến: ${dName}`, 'success', 3000);
            if (this.pickup) {
                this.switchView('vehicle-select');
                this.renderRouteOnMap();
            }
        });

        // Live stream driver GPS location updates
        window.addEventListener('goride:driver_location_changed', (e) => {
            if (this.activeTrip && e.detail && e.detail.lat && e.detail.lng) {
                const dLat = Number(e.detail.lat);
                const dLng = Number(e.detail.lng);
                if (!isNaN(dLat) && !isNaN(dLng) && dLat !== 0 && dLng !== 0) {
                    this._latestDriverPosition = {
                        lat: dLat,
                        lng: dLng,
                        heading: Number(e.detail.heading || 0),
                        timestamp: Date.now()
                    };
                    this.activeTrip.driverLat = dLat;
                    this.activeTrip.driverLon = dLng;
                    this.activeTrip.driverHeading = Number(e.detail.heading || 0);
                    if (typeof this.updateTrackingUI === 'function') {
                        this.updateTrackingUI(this.activeTrip);
                    }
                }
            }
        });

        // Swap Locations Button (ref-02)
        const btnSwap = document.getElementById('btn-swap-locations');
        if (btnSwap) {
            btnSwap.addEventListener('click', () => {
                if (!this.pickup || !this.destination) {
                    this.showToast('Vui lòng chọn cả điểm đón và điểm đến trước khi đổi vị trí', 'warning');
                    return;
                }
                const temp = this.pickup;
                this.pickup = this.destination;
                this.destination = temp;

                // Reset route state completely before fetching new reverse route
                this.currentRouteDistance = null;
                this.currentRouteGeometry = null;
                this.currentRouteDuration = null;
                this.currentNodesVisited = 0;

                const pInp = document.getElementById('input-pickup');
                const dInp = document.getElementById('input-destination');
                if (pInp) pInp.value = this.pickup.name;
                if (dInp) dInp.value = this.destination.name;

                const pSum = document.getElementById('route-sum-pickup');
                const dSum = document.getElementById('route-sum-dest');
                if (pSum) pSum.textContent = this.pickup.name;
                if (dSum) dSum.textContent = this.destination.name;

                this.showToast('Đã đảo chiều điểm đón và điểm đến', 'info');

                if (this.currentView === 'vehicle-select') {
                    this.renderRouteOnMap();
                } else {
                    this.switchView('vehicle-select');
                }
            });
        }

        // Trigger Map Pickup Mode
        const btnMapPickup = document.getElementById('btn-trigger-map-pickup');
        if (btnMapPickup) {
            btnMapPickup.addEventListener('click', () => {
                this.switchView('pickup-confirm');
            });
        }

        // Trigger Map Destination Mode (Choose destination directly by tapping on map)
        const btnMapDest = document.getElementById('btn-trigger-map-dest');
        if (btnMapDest) {
            btnMapDest.addEventListener('click', () => {
                this.switchView('map-select-destination');

                let banner = document.getElementById('floating-map-pick-banner');
                if (!banner) {
                    banner = document.createElement('div');
                    banner.id = 'floating-map-pick-banner';
                    banner.className = 'floating-map-pick-banner';
                    document.body.appendChild(banner);
                }
                banner.innerHTML = `
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span style="font-size:1.15rem;">🎯</span>
                        <span style="font-weight:700; font-size:0.88rem; color:#0f172a;">Chạm vào bản đồ để chọn điểm đến</span>
                    </div>
                    <button type="button" id="btn-cancel-map-dest-pick" style="border:none; background:#f1f5f9; color:#475569; border-radius:6px; padding:4px 10px; font-size:0.8rem; font-weight:700; cursor:pointer;">
                        ✕ Hủy
                    </button>
                `;
                banner.style.display = 'flex';

                const cancelBtn = banner.querySelector('#btn-cancel-map-dest-pick');
                if (cancelBtn) {
                    cancelBtn.onclick = (e) => {
                        e.stopPropagation();
                        if (this.mapController) this.mapController.disableClickToSelect();
                        banner.style.display = 'none';
                        this.switchView('search');
                    };
                }

                if (this.mapController) {
                    this.mapController.enableClickToSelect(async (location) => {
                        banner.style.display = 'none';
                        this.mapController.disableClickToSelect();
                        let placeName = `Điểm đến (${location.lat.toFixed(4)}, ${location.lng.toFixed(4)})`;
                        let placeAddr = '';
                        if (typeof geocoderService !== 'undefined') {
                            try {
                                const rev = await geocoderService.reverse(location.lat, location.lng);
                                if (rev && rev.name) {
                                    const raw = (rev.name || '').trim();
                                    const isTrivial = !raw || raw.length <= 2 || /^(\d+[\s\/-]*[a-zA-Z]?|[a-zA-Z0-9\s-]{1,2})$/i.test(raw);
                                    if (!isTrivial) {
                                        placeName = raw;
                                    } else if (rev.address && rev.address.trim().length > 2) {
                                        const parts = rev.address.split(',').map(s => s.trim()).filter(s => s.length > 2);
                                        placeName = parts.slice(0, 2).join(', ') || rev.address.trim();
                                    }
                                    if (rev.district && !rev.district.toLowerCase().includes('chi minh') && !placeName.toLowerCase().includes(rev.district.toLowerCase())) {
                                        placeName = `${placeName}, ${rev.district}`;
                                    }
                                    placeAddr = rev.address || placeName;
                                }
                            } catch (err) {}
                        }
                        this.selectDestination({
                            name: placeName,
                            address: placeAddr || placeName,
                            lat: location.lat,
                            lng: location.lng
                        });
                    });
                }

                this.showToast('Chạm vào điểm bất kỳ trên bản đồ để chọn điểm đến', 'info');
            });
        }

        // Floating Round GPS Button on Map (Mobile & Desktop) - Pans to user GPS without altering booked pickup
        const btnFloatingGps = document.getElementById('btn-floating-my-location');
        if (btnFloatingGps) {
            btnFloatingGps.addEventListener('click', () => {
                this.panToUserGps();
            });
        }

        // Desktop Map Recenter Button - Pans to user GPS without altering booked pickup
        const btnGps = document.getElementById('btn-gps-recenter');
        if (btnGps) {
            btnGps.addEventListener('click', () => {
                this.panToUserGps();
            });
        }

        document.querySelectorAll('.goride-pref-pill').forEach(pill => {
            pill.addEventListener('click', () => {
                const pref = pill.getAttribute('data-pref');
                pill.classList.toggle('active');
                if (pref && typeof this.preferences[pref] !== 'undefined') {
                    this.preferences[pref] = pill.classList.contains('active');
                }
            });
        });

        // Confirm Pickup CTA Button (ref-03)
        const btnConfirmPickup = document.getElementById('btn-confirm-pickup-cta');
        if (btnConfirmPickup) {
            btnConfirmPickup.addEventListener('click', () => {
                const isAuthed = (typeof sessionManager !== 'undefined' && sessionManager && typeof sessionManager.isAuthenticated === 'function') ? sessionManager.isAuthenticated() : false;
                const curUser = (typeof sessionManager !== 'undefined' && sessionManager) ? (sessionManager.getUser?.() || sessionManager.getCurrentUser?.()) : null;
                if (!isAuthed || !curUser || !curUser.id) {
                    if (typeof window.showNavigoModal === 'function') {
                        window.showNavigoModal({
                            title: 'Yêu cầu đăng nhập',
                            message: 'Vui lòng đăng nhập hoặc đăng ký tài khoản để tiếp tục đặt chuyến xe Navigo.',
                            icon: '👤',
                            confirmText: 'Đăng nhập ngay',
                            cancelText: 'Hủy',
                            onConfirm: () => {
                                window.location.href = 'login.html?redirect=customer.html';
                            }
                        });
                    } else {
                        window.location.href = 'login.html?redirect=customer.html';
                    }
                    return;
                }
                // If destination already chosen, proceed to vehicle selection; else go back to search
                if (this.destination) {
                    this.switchView('vehicle-select');
                } else {
                    this.showToast('Đã xác nhận điểm đón. Hãy chọn điểm đến!', 'success');
                    this.switchView('search');
                    const dInput = document.getElementById('input-destination');
                    if (dInput) dInput.focus();
                }
            });
        }

        // Back from Vehicle Select to Route Search (ref-04 -> ref-02)
        const btnBackToPickup = document.getElementById('btn-back-to-pickup');
        if (btnBackToPickup) {
            btnBackToPickup.addEventListener('click', () => {
                this.switchView('search');
            });
        }

        // Back from Pickup Confirm to Search
        const btnBackToSearch = document.getElementById('btn-back-to-search');
        if (btnBackToSearch) {
            btnBackToSearch.addEventListener('click', () => {
                this.switchView('search');
            });
        }

        // Top Search Capsule on Pickup Confirm Screen
        const btnPickupSearchCapsule = document.getElementById('btn-pickup-search-capsule');
        if (btnPickupSearchCapsule) {
            btnPickupSearchCapsule.addEventListener('click', () => {
                this.switchView('search');
            });
        }

        // Tap Pickup point text in Vehicle Select to edit pickup
        const btnChangePickupPt = document.getElementById('btn-change-pickup-pt');
        if (btnChangePickupPt) {
            btnChangePickupPt.addEventListener('click', () => {
                this.switchView('search');
                setTimeout(() => document.getElementById('input-pickup')?.focus(), 100);
            });
        }

        // Tap Destination point text in Vehicle Select to edit destination
        const btnChangeDestPt = document.getElementById('btn-change-dest-pt');
        if (btnChangeDestPt) {
            btnChangeDestPt.addEventListener('click', () => {
                this.switchView('search');
                setTimeout(() => document.getElementById('input-destination')?.focus(), 100);
            });
        }

        // Book For Other Passenger ("Đặt hộ")
        const btnBookForOther = document.getElementById('btn-book-for-other');
        if (btnBookForOther) {
            btnBookForOther.addEventListener('click', () => {
                const name = prompt('Nhập tên người đi xe bạn muốn đặt hộ:', this.bookForOtherName || '');
                if (name !== null && name.trim()) {
                    const phone = prompt('Nhập số điện thoại người nhận chuyến (để tài xế liên hệ):', this.bookForOtherPhone || '0901234567');
                    this.bookForOtherName = name.trim();
                    this.bookForOtherPhone = phone ? phone.trim() : '';
                    btnBookForOther.innerHTML = `<span style="color:#ef4444;">👤</span> Đặt hộ: ${this.bookForOtherName}`;
                    this.showToast(`Đã lưu thông tin đặt hộ cho ${this.bookForOtherName} (${this.bookForOtherPhone || 'Chưa có SĐT'})`, 'success');
                }
            });
        }

        // Safety & Insurance Shield ("Bảo hiểm Navigo BIC & BIDV")
        const btnShieldSafety = document.getElementById('btn-shield-safety');
        if (btnShieldSafety) {
            btnShieldSafety.addEventListener('click', () => {
                if (typeof window.showNavigoModal === 'function') {
                    window.showNavigoModal({
                        title: 'An toàn & Bảo hiểm Navigo',
                        message: '🛡️ Nhân đôi bảo vệ cùng BIC & BIDV: 100% cuốc xe Navigo đều được bảo hiểm hành trình tự động trị giá lên đến 100.000.000đ. Đội ngũ tổng đài SOS 1900 2088 hỗ trợ 24/7.',
                        icon: '🛡️',
                        confirmText: 'Đã hiểu',
                        showCancel: false
                    });
                } else {
                    alert('🛡️ 100% cuốc xe Navigo được bảo vệ bởi bảo hiểm hành trình BIC & BIDV lên tới 100.000.000đ.');
                }
            });
        }

        // Schedule Ride ("Hẹn giờ đón")
        const btnSchedule = document.getElementById('btn-schedule-action');
        if (btnSchedule) {
            btnSchedule.addEventListener('click', () => {
                const timeChoices = ['Sau 15 phút nữa', 'Sau 30 phút nữa', 'Sau 1 giờ nữa', 'Sau 2 giờ nữa'];
                const selected = prompt(`Hẹn giờ đón xe Navigo:\n1. ${timeChoices[0]}\n2. ${timeChoices[1]}\n3. ${timeChoices[2]}\n4. ${timeChoices[3]}\n\nNhập số (1-4) hoặc thời gian mong muốn (VD: 14:30):`, '1');
                if (selected !== null && selected.trim()) {
                    let timeStr = selected.trim();
                    if (selected === '1') timeStr = timeChoices[0];
                    else if (selected === '2') timeStr = timeChoices[1];
                    else if (selected === '3') timeStr = timeChoices[2];
                    else if (selected === '4') timeStr = timeChoices[3];
                    btnSchedule.style.background = '#e6f7f6';
                    btnSchedule.style.color = '#007d77';
                    btnSchedule.style.fontWeight = '700';
                    this.showToast(`Đã hẹn giờ xe đón: ${timeStr}`, 'success');
                }
            });
        }

        // NavigoNow Priority Matching
        const btnNavigoNow = document.getElementById('btn-navigonow-action');
        if (btnNavigoNow) {
            btnNavigoNow.addEventListener('click', () => {
                this.isNavigoNow = !this.isNavigoNow;
                btnNavigoNow.style.background = this.isNavigoNow ? '#ecfdf5' : '';
                btnNavigoNow.style.color = this.isNavigoNow ? '#047857' : '';
                btnNavigoNow.style.border = this.isNavigoNow ? '1.5px solid #10b981' : '';
                btnNavigoNow.style.fontWeight = this.isNavigoNow ? '800' : '';
                this.showToast(this.isNavigoNow ? '⚡ Đã bật NavigoNow: Ưu tiên tìm tài xế gần nhất trong 30 giây!' : 'Đã tắt chế độ ưu tiên NavigoNow', 'info');
            });
        }

        // Saved Places Button
        const btnSavedPlaces = document.getElementById('btn-saved-places');
        if (btnSavedPlaces) {
            btnSavedPlaces.addEventListener('click', () => {
                const choice = prompt('Chọn địa điểm nhanh:\n1. 🏠 Nhà riêng: 123 Lê Lợi, Bến Nghé, Quận 1\n2. 🏢 Công ty: Tòa nhà Bitexco Financial Tower, Quận 1\n3. ☕ Quán quen: Highlands Coffee Landmark 81\n\nNhập số (1, 2 hoặc 3):', '1');
                if (choice === '1') {
                    this.selectDestination({ name: 'Nhà riêng (123 Lê Lợi, Q.1)', address: '123 Lê Lợi, Bến Nghé, Quận 1', lat: 10.7735, lng: 106.6995 });
                } else if (choice === '2') {
                    this.selectDestination({ name: 'Bitexco Financial Tower', address: '2 Hải Triều, Bến Nghé, Quận 1', lat: 10.7717, lng: 106.7042 });
                } else if (choice === '3') {
                    this.selectDestination({ name: 'Highlands Coffee Landmark 81', address: '720A Điện Biên Phủ, Phường 22, Bình Thạnh', lat: 10.7950, lng: 106.7219 });
                }
            });
        }

        // Add Stop / Waypoint
        const handleAddStop = () => {
            const stopName = prompt('Nhập địa chỉ hoặc tên điểm dừng phụ:', 'Cây xăng gần nhất');
            if (stopName !== null && stopName.trim()) {
                this.showToast(`Đã thêm điểm dừng: ${stopName.trim()}`, 'success');
            }
        };
        const btnAddStop = document.getElementById('btn-add-stop');
        if (btnAddStop) btnAddStop.addEventListener('click', handleAddStop);
        const btnAddExtraStop = document.getElementById('btn-add-extra-stop');
        if (btnAddExtraStop) btnAddExtraStop.addEventListener('click', handleAddStop);

        // Change Route Button (ref-04)
        const btnChangeRoute = document.getElementById('btn-change-route');
        if (btnChangeRoute) {
            btnChangeRoute.addEventListener('click', () => {
                this.switchView('search');
            });
        }

        // Payment Method Toggle (ref-04)
        const btnPayment = document.getElementById('btn-toggle-payment');
        if (btnPayment) {
            btnPayment.addEventListener('click', () => {
                this.paymentMethod = this.paymentMethod === 'cash' ? 'wallet' : 'cash';
                const label = document.getElementById('current-payment-method');
                if (label) {
                    label.textContent = this.paymentMethod === 'cash' ? 'Tiền mặt/QR' : 'Ví Navigo Pay';
                }
                const iconSpan = btnPayment.querySelector('span:first-child');
                if (iconSpan) {
                    iconSpan.textContent = this.paymentMethod === 'cash' ? '💵' : '💳';
                }
                if (this.paymentMethod === 'wallet' && window.NaviWalletEngine) {
                    const curWallet = window.NaviWalletEngine.getCurrentWallet();
                    const bal = curWallet ? (window.formatVND ? window.formatVND(curWallet.balance) : (curWallet.balance + ' ₫')) : '0 ₫';
                    this.showToast(`💳 Đã chọn Ví Navigo Pay (Số dư: ${bal})`, 'success', 3500);
                } else {
                    this.showToast('💵 Đã chọn thanh toán Tiền mặt', 'info', 3000);
                }
            });
        }

        // Promo Code Click Handler (ref-04)
        const btnPromo = document.getElementById('btn-promo-tag');
        if (btnPromo) {
            btnPromo.addEventListener('click', () => {
                this.openPromoCodeDialog();
            });
        }

        // Solicitar CTA Button (ref-04) -> Request Ride
        const btnSolicitar = document.getElementById('btn-solicitar-ride');
        if (btnSolicitar) {
            btnSolicitar.addEventListener('click', () => {
                this.requestRideBooking();
            });
        }

        // Cancel Booking Button (When requesting/searching)
        const btnCancelRequest = document.getElementById('btn-cancel-request-booking');
        if (btnCancelRequest) {
            btnCancelRequest.addEventListener('click', (e) => {
                e.preventDefault();
                this.cancelPendingBooking();
            });
        }

        const btnCancelSearching = document.getElementById('btn-cancel-searching');
        const btnCloseSearchingCorner = document.getElementById('btn-close-searching-corner');
        if (btnCloseSearchingCorner) {
            btnCloseSearchingCorner.addEventListener('click', (e) => {
                e.preventDefault();
                this.cancelPendingBooking();
            });
        }
        if (btnCancelSearching) {
            btnCancelSearching.addEventListener('click', (e) => {
                e.preventDefault();
                this.cancelPendingBooking();
            });
        }

        // Tracking Actions (ref-05/06)
        const btnCall = document.getElementById('btn-call-driver');
        if (btnCall) {
            btnCall.addEventListener('click', () => {
                this.showCallDialog();
            });
        }

        const btnChat = document.getElementById('btn-chat-driver');
        if (btnChat) {
            btnChat.addEventListener('click', () => {
                this.showChatDialog();
            });
        }

        const btnCancel = document.getElementById('btn-cancel-trip');
        if (btnCancel) {
            btnCancel.addEventListener('click', () => {
                this.showCancelConfirmDialog();
            });
        }

        const btnTrackHome = document.getElementById('btn-tracking-home');
        if (btnTrackHome) {
            btnTrackHome.addEventListener('click', () => {
                // Exit to homepage without cancelling active ride
                window.location.href = '../index.html';
            });
        }

        const btnTrackRecenter = document.getElementById('btn-track-recenter');
        if (btnTrackRecenter) {
            btnTrackRecenter.addEventListener('click', () => {
                if (this.activeTrip && this.activeTrip.driverLat && this.activeTrip.driverLon && this.mapController && this.mapController.map) {
                    try {
                        this.mapController.map.flyTo([Number(this.activeTrip.driverLat), Number(this.activeTrip.driverLon)], 16, { duration: 0.8 });
                    } catch (e) {
                        this.mapController.setView(Number(this.activeTrip.driverLat), Number(this.activeTrip.driverLon), 16);
                    }
                } else if (this.pickup && this.mapController && this.mapController.map) {
                    try {
                        this.mapController.map.flyTo([Number(this.pickup.lat), Number(this.pickup.lng)], 16, { duration: 0.8 });
                    } catch (e) {
                        this.mapController.setView(Number(this.pickup.lat), Number(this.pickup.lng), 16);
                    }
                }
            });
        }

        // History modal buttons
        const btnCloseHistory = document.getElementById('btn-close-history');
        if (btnCloseHistory) {
            btnCloseHistory.addEventListener('click', () => {
                if (window.location.hash === '#history') {
                    try {
                        history.replaceState(null, '', window.location.pathname + window.location.search);
                    } catch (e) {
                        window.location.hash = '';
                    }
                }
                if (this.activeTrip) {
                    this.switchView('tracking');
                } else if (this.pickup && this.destination) {
                    this.switchView('vehicle-select');
                } else {
                    this.switchView('search');
                }
            });
        }

        const btnRefreshHistory = document.getElementById('btn-refresh-history');
        if (btnRefreshHistory) {
            btnRefreshHistory.addEventListener('click', () => {
                this.loadTripHistory();
            });
        }

        const btnDesktopHistory = document.getElementById('btn-desktop-history');
        if (btnDesktopHistory) {
            btnDesktopHistory.addEventListener('click', (e) => {
                e.preventDefault();
                window.location.href = 'activity.html';
            });
        }

        // Guarantee all top navbar buttons and links perform direct navigation without obstruction
        document.querySelectorAll('.gsm-pc-navbar a').forEach(a => {
            a.style.pointerEvents = 'auto';
            a.style.cursor = 'pointer';
            a.addEventListener('click', (e) => {
                const href = a.getAttribute('href');
                if (!href || href === '#' || href.startsWith('javascript:')) return;
                if (href.includes('customer.html?service=')) {
                    const sType = href.includes('service=bike') ? 'bike' : (href.includes('service=delivery') ? 'delivery' : null);
                    if (sType) {
                        e.preventDefault();
                        this.selectedService = sType;
                        this.selectedVehicleType = sType;
                        this.updateVehicleTabsUI(sType);
                        this.updateVehicleOptions();
                        try { history.pushState(null, '', href); } catch(err) {}
                        document.querySelectorAll('.gsm-pc-nav-link').forEach(l => l.classList.remove('active'));
                        a.classList.add('active');
                        return;
                    }
                }
                e.preventDefault();
                window.location.href = href;
            });
        });

        // Mobile Quick Navigation Pills Event Handlers
        const custPillBooking = document.getElementById('m-cust-pill-booking');
        const custPillHistory = document.getElementById('m-cust-pill-history');

        if (custPillBooking) {
            custPillBooking.addEventListener('click', (e) => {
                e.preventDefault();
                if (window.location.hash === '#history') {
                    try {
                        history.replaceState(null, '', window.location.pathname + window.location.search);
                    } catch (err) {
                        window.location.hash = '';
                    }
                }
                if (this.activeTrip) {
                    this.switchView('tracking');
                } else if (this.pickup && this.destination) {
                    this.switchView('vehicle-select');
                } else {
                    this.switchView('search');
                }
            });
        }

        if (custPillHistory) {
            custPillHistory.addEventListener('click', (e) => {
                e.preventDefault();
                if (window.location.hash !== '#history') {
                    window.location.hash = 'history';
                }
                this.switchView('history');
                this.loadTripHistory();
            });
        }

        // Role-based visibility for mobile pills in Customer Portal
        try {
            const role = (typeof sessionManager !== 'undefined' && sessionManager.getRole?.()) ||
                         JSON.parse(localStorage.getItem('goride_user') || sessionStorage.getItem('ride_rtree_user') || '{}')?.role;
            const mDriver = document.getElementById('m-cust-pill-driver');
            const mAdmin = document.getElementById('m-cust-pill-admin');

            if (role === 'customer') {
                if (mDriver) mDriver.style.display = 'none';
                if (mAdmin) mAdmin.style.display = 'none';
            } else if (role === 'driver') {
                if (mDriver) mDriver.style.display = '';
                if (mAdmin) mAdmin.style.display = 'none';
            } else if (role === 'admin') {
                if (mDriver) mDriver.style.display = '';
                if (mAdmin) mAdmin.style.display = '';
            } else {
                if (mDriver) mDriver.style.display = '';
                if (mAdmin) mAdmin.style.display = 'none';
            }
        } catch (e) {}

        // Universal logout handler for customer portal
        const handleCustLogout = (e) => {
            if (e) e.preventDefault();
            if (typeof sessionManager !== 'undefined' && typeof sessionManager.confirmLogout === 'function') {
                sessionManager.confirmLogout();
                return;
            }
            if (typeof sessionManager !== 'undefined' && typeof sessionManager.logoutWithConfirmation === 'function') {
                sessionManager.logoutWithConfirmation();
                return;
            }
            if (typeof window.showNavigoModal === 'function') {
                window.showNavigoModal({
                    title: 'Xác nhận đăng xuất',
                    message: 'Bạn có chắc chắn muốn đăng xuất khỏi tài khoản Navigo không?',
                    icon: '🚪',
                    confirmText: 'Xác nhận',
                    cancelText: 'Hủy',
                    danger: true,
                    onConfirm: () => {
                        if (typeof sessionManager !== 'undefined') sessionManager.logout();
                        sessionStorage.setItem('navigo_from_logout', 'true');
                        window.location.href = 'loading.html?from=logout';
                    }
                });
                return;
            }
            if (typeof sessionManager !== 'undefined') sessionManager.logout();
            sessionStorage.setItem('navigo_from_logout', 'true');
            window.location.href = 'loading.html?from=logout';
        };

        const btnCustLogout = document.getElementById('btn-customer-logout');
        if (btnCustLogout) {
            btnCustLogout.addEventListener('click', handleCustLogout);
        }
        document.querySelectorAll('[data-action="logout"]').forEach(el => {
            el.addEventListener('click', handleCustLogout);
        });

        // Initialize draggable & collapsible bottom sheet for vehicle selection
        this.setupVehicleSheetDrag();
    }

    /**
     * Interactive draggable & collapsible bottom sheet for vehicle selection
     * Allows user to pull/drag down or tap handle to view map freely,
     * and pull/drag up or tap handle to expand and choose vehicle / book ride.
    }

    /**
     * Pans map smoothly to current user GPS blue dot without altering or overriding custom booked pickup point
     * (Critical for booking a ride for someone else in another location)
     */
    panToUserGps() {
        if (this.userGpsPosition && this.userGpsPosition.lat && this.mapController) {
            if (this.mapController.map && typeof this.mapController.map.flyTo === 'function') {
                this.mapController.map.flyTo([this.userGpsPosition.lat, this.userGpsPosition.lng], 16, { animate: true, duration: 1.0 });
            } else if (typeof this.mapController.setView === 'function') {
                this.mapController.setView(this.userGpsPosition.lat, this.userGpsPosition.lng, 16);
            }
            this.showToast('Đang hiển thị vị trí của bạn trên bản đồ', 'info', 2000);
            return;
        }
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    const lat = pos.coords.latitude;
                    const lng = pos.coords.longitude;
                    this.userGpsPosition = { lat, lng };
                    if (this.mapController) {
                        this.mapController.setUserLocation(lat, lng, pos.coords.accuracy);
                        if (this.mapController.map && typeof this.mapController.map.flyTo === 'function') {
                            this.mapController.map.flyTo([lat, lng], 16, { animate: true, duration: 1.0 });
                        }
                    }
                },
                (err) => {
                    this.showToast('Không thể lấy tọa độ GPS của thiết bị.', 'warning');
                },
                { enableHighAccuracy: true, timeout: 6000 }
            );
        }
    }

    /**
     * Recenter Leaflet Map directly on User GPS Coordinates (Smooth FlyTo Animation)
     * and present Liquid Glass Modal with Confirm / Cancel options.
     */
    async recenterMapOnGps(confirmSelection = true) {
        const initialPickupInput = document.getElementById('input-pickup');
        if (initialPickupInput && (!initialPickupInput.value || this.searchTarget === 'pickup' || this.currentView === 'search')) {
            initialPickupInput.value = 'Đang xác định vị trí GPS...';
        }
        const doCenter = async (lat, lng, accuracy = 30) => {
            this.userGpsPosition = { lat, lng };

            // 1. Center map right on GPS position with smooth flyTo animation
            if (this.mapController) {
                if (typeof this.mapController.setUserLocation === 'function') {
                    this.mapController.setUserLocation(lat, lng, accuracy);
                }
                if (this.mapController.map && typeof this.mapController.map.flyTo === 'function') {
                    this.mapController.map.flyTo([lat, lng], 16, { animate: true, duration: 1.2 });
                } else if (typeof this.mapController.setView === 'function') {
                    this.mapController.setView(lat, lng, 16);
                }
            }

            // 2. Reverse geocode to resolve street address
            let locName = 'Tọa độ GPS (' + lat.toFixed(4) + ', ' + lng.toFixed(4) + ')';
            let locAddr = 'Khu vực TP. Hồ Chí Minh';
            let rev = null;
            if (typeof geocoderService !== 'undefined') {
                try {
                    rev = await geocoderService.reverse(lat, lng);
                    if (rev && rev.name) {
                        const raw = (rev.name || '').trim();
                        const isTrivial = !raw || raw.length <= 2 || /^(\d+[\s\/-]*[a-zA-Z]?|[a-zA-Z0-9\s-]{1,2})$/i.test(raw);
                        if (!isTrivial) {
                            locName = raw;
                        } else if (rev.address && rev.address.trim().length > 2) {
                            const parts = rev.address.split(',').map(s => s.trim()).filter(s => s.length > 2);
                            locName = parts.slice(0, 2).join(', ') || rev.address.trim();
                        } else {
                            locName = `Vị trí GPS (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
                        }
                        locAddr = rev.address || locName;
                    }
                } catch (e) {
                    console.warn('[GPS] Reverse geocode error:', e);
                }
            }

            if (rev && rev.district && !rev.district.toLowerCase().includes('chi minh')) {
                if (!locName.toLowerCase().includes(rev.district.toLowerCase())) {
                    locName = `${locName}, ${rev.district}`;
                }
            }
            if (!locName || locName.trim().length <= 2 || /^(\d+[\s\/-]*[a-zA-Z]?|[a-zA-Z0-9\s-]{1,2})$/i.test(locName.trim())) {
                if (locAddr && locAddr.trim().length > 2 && !locAddr.includes('Khu vực TP')) {
                    const parts = locAddr.split(',').map(s => s.trim()).filter(s => s.length > 1 && !s.toLowerCase().includes('chi minh'));
                    locName = parts.slice(0, 2).join(', ') || locAddr.split(',')[0].trim();
                } else {
                    locName = `Vị trí GPS (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
                }
            }

            // 3. Tự động điền điểm đón trên thanh tìm kiếm và cập nhật dữ liệu cuốc xe
            this.pickup = {
                id: `loc_gps_${Date.now()}`,
                name: locName,
                address: locAddr,
                lat: Number(lat),
                lng: Number(lng)
            };

            const pickupInputEl = document.getElementById('input-pickup');
            if (pickupInputEl) {
                pickupInputEl.value = locName;
            }

            const clearPickupBtn = document.getElementById('btn-clear-pickup');
            if (clearPickupBtn) {
                clearPickupBtn.style.display = 'flex';
            }

            const pSum = document.getElementById('route-sum-pickup');
            if (pSum) {
                pSum.textContent = locName;
                pSum.title = locAddr || locName;
            }

            const pickupConfirmedTitle = document.getElementById('pickup-confirmed-title');
            if (pickupConfirmedTitle) pickupConfirmedTitle.textContent = locName;

            const pickupConfirmedDesc = document.getElementById('pickup-confirmed-desc');
            if (pickupConfirmedDesc) pickupConfirmedDesc.textContent = locAddr;

            if (this.mapController && typeof this.mapController.addPickupMarker === 'function') {
                this.mapController.addPickupMarker(lat, lng, locName);
            }

            // Reset calculated route state
            this.currentRouteDistance = null;
            this.currentRouteDuration = null;
            this.currentRouteGeometry = null;

            this.showToast(`🟢 Đã lấy vị trí GPS làm điểm đón: ${locName}`, 'success', 2500);

            if (this.destination) {
                if (typeof this.renderRouteOnMap === 'function') {
                    this.renderRouteOnMap();
                }
                setTimeout(() => {
                    if (this.destination && this.pickup && this.currentView === 'search') {
                        this.switchView('vehicle-select');
                    }
                }, 500);
            } else {
                const destInput = document.getElementById('input-destination');
                if (destInput) destInput.focus();
                this.searchTarget = 'destination';
                this.renderSuggestions(this.locationsPool);
            }
            return;
            if (typeof window.showNavigoModal === 'function') {
                window.showNavigoModal({
                    title: 'Định vị GPS của bạn',
                    message: 'Bản đồ đã chuyển hướng về giữa vị trí GPS của bạn:\n"' + locName + '".\nBạn có muốn đặt vị trí này làm điểm đón không?',
                    icon: '🎯',
                    confirmText: 'Xác nhận điểm đón',
                    cancelText: 'Hủy / Chỉ xem',
                    onConfirm: () => {
                        this.pickup = {
                            name: locName,
                            address: locAddr,
                            lat: lat,
                            lng: lng
                        };
                        const pInput = document.getElementById('input-pickup');
                        if (pInput) pInput.value = locName;
                        const clearPickupBtn = document.getElementById('btn-clear-pickup');
                        if (clearPickupBtn) clearPickupBtn.style.display = 'flex';

                        if (this.destination) {
                            this.switchView('vehicle-select');
                        } else {
                            const destInput = document.getElementById('input-destination');
                            if (destInput) destInput.focus();
                        }
                    }
                });
            }
        };

        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    const lat = pos.coords.latitude;
                    const lng = pos.coords.longitude;
                    const acc = pos.coords.accuracy || 30;
                    doCenter(lat, lng, acc);
                },
                (err) => {
                    console.warn('[GPS] Browser Geolocation fallback:', err.message);
                    const fallbackLat = this.userGpsPosition?.lat || 10.8643;
                    const fallbackLng = this.userGpsPosition?.lng || 106.7570;
                    doCenter(fallbackLat, fallbackLng, 40);
                },
                { enableHighAccuracy: true, timeout: 5000, maximumAge: 30000 }
            );
        } else {
            const fallbackLat = this.userGpsPosition?.lat || 10.8643;
            const fallbackLng = this.userGpsPosition?.lng || 106.7570;
            doCenter(fallbackLat, fallbackLng, 40);
        }
    }

    setupVehicleSheetDrag() {
        const sheet = document.getElementById('goride-vehicle-sheet') || document.querySelector('.goride-vehicle-sheet');
        const handleZone = document.getElementById('goride-sheet-handle-zone') || sheet?.querySelector('.goride-sheet-drag-handle-zone') || sheet?.querySelector('.goride-sheet-handle');
        const appContainer = document.getElementById('customer-app') || document.body;
        if (!sheet || !handleZone) return;

        let startY = 0;
        let currentY = 0;
        let isDragging = false;
        let hasMoved = false;
        let isCollapsed = false;

        const updatePeekUI = () => {
            const peekTitle = document.getElementById('goride-sheet-peek-title');
            const peekIcon = document.getElementById('goride-sheet-peek-icon');
            const peekHint = document.getElementById('goride-sheet-peek-hint');
            const peekChevron = document.getElementById('goride-sheet-peek-chevron');

            const currentVehicle = this.vehicleCatalog[this.selectedService] || this.vehicleCatalog.car4;
            const fare = this.selectedVehicleFare || this.selectedOriginalFare || 45000;

            if (peekTitle && currentVehicle) {
                peekTitle.textContent = `${currentVehicle.name} • ${this.formatMoney(fare)}`;
            }
            if (peekIcon && currentVehicle) {
                peekIcon.textContent = currentVehicle.icon || '🚗';
            }
            if (peekHint) {
                peekHint.textContent = isCollapsed ? 'Vuốt lên để chọn xe & đặt chuyến' : 'Vuốt xuống để xem bản đồ';
            }
            if (peekChevron) {
                peekChevron.textContent = isCollapsed ? '▲' : '▼';
            }

            if (isCollapsed) {
                sheet.classList.add('is-collapsed');
                appContainer.classList.add('vehicle-sheet-collapsed');
            } else {
                sheet.classList.remove('is-collapsed');
                appContainer.classList.remove('vehicle-sheet-collapsed');
            }
        };

        const setCollapsed = (collapsed) => {
            isCollapsed = collapsed;
            sheet.style.transition = 'transform 0.32s cubic-bezier(0.16, 1, 0.3, 1)';
            sheet.style.transform = '';
            updatePeekUI();

            // Invalidate Leaflet map size so it centers smoothly
            if (this.mapController && this.mapController.map) {
                setTimeout(() => {
                    this.mapController.map.invalidateSize({ animate: false });
                }, 320);
            }
        };

        // Touch drag handlers
        handleZone.addEventListener('touchstart', (e) => {
            if (e.touches.length !== 1) return;
            startY = e.touches[0].clientY;
            currentY = startY;
            isDragging = true;
            hasMoved = false;
            sheet.style.transition = 'none';
        }, { passive: true });

        window.addEventListener('touchmove', (e) => {
            if (!isDragging || e.touches.length !== 1) return;
            currentY = e.touches[0].clientY;
            const deltaY = currentY - startY;

            if (Math.abs(deltaY) > 8) {
                hasMoved = true;
            }

            if (!isCollapsed) {
                // Expanded -> pulling down
                if (deltaY > 0) {
                    sheet.style.transform = `translateY(${deltaY}px)`;
                } else {
                    sheet.style.transform = `translateY(${deltaY * 0.25}px)`;
                }
            } else {
                // Collapsed -> pulling up
                if (deltaY < 0) {
                    sheet.style.transform = `translateY(calc(100% - 66px + ${deltaY}px))`;
                } else {
                    sheet.style.transform = `translateY(calc(100% - 66px + ${deltaY * 0.25}px))`;
                }
            }
        }, { passive: true });

        window.addEventListener('touchend', () => {
            if (!isDragging) return;
            isDragging = false;
            const deltaY = currentY - startY;

            if (!isCollapsed) {
                if (deltaY > 50) {
                    setCollapsed(true);
                } else {
                    setCollapsed(false);
                }
            } else {
                if (deltaY < -50) {
                    setCollapsed(false);
                } else {
                    setCollapsed(true);
                }
            }
        });

        // Mouse drag support for desktop/testing
        let isMouseDown = false;
        handleZone.addEventListener('mousedown', (e) => {
            startY = e.clientY;
            currentY = startY;
            isMouseDown = true;
            hasMoved = false;
            sheet.style.transition = 'none';
        });

        window.addEventListener('mousemove', (e) => {
            if (!isMouseDown) return;
            currentY = e.clientY;
            const deltaY = currentY - startY;
            if (Math.abs(deltaY) > 8) {
                hasMoved = true;
            }
            if (!isCollapsed) {
                if (deltaY > 0) sheet.style.transform = `translateY(${deltaY}px)`;
            } else {
                if (deltaY < 0) sheet.style.transform = `translateY(calc(100% - 66px + ${deltaY}px))`;
            }
        });

        window.addEventListener('mouseup', () => {
            if (!isMouseDown) return;
            isMouseDown = false;
            const deltaY = currentY - startY;
            if (!isCollapsed) {
                if (deltaY > 50) setCollapsed(true);
                else setCollapsed(false);
            } else {
                if (deltaY < -50) setCollapsed(false);
                else setCollapsed(true);
            }
        });

        // Click / Tap toggle on handle zone
        handleZone.addEventListener('click', () => {
            if (hasMoved) return;
            setCollapsed(!isCollapsed);
        });

        this.collapseVehicleSheet = () => setCollapsed(true);
        this.expandVehicleSheet = () => setCollapsed(false);
        this.updateVehicleSheetPeek = updatePeekUI;

        // Initial UI update
        updatePeekUI();
    }

    /**
     * Show loading skeleton in suggestions container
     */
    showSearchLoading() {
        const container = document.getElementById('suggestions-container');
        if (!container) return;
        container.innerHTML = `
            <div style="text-align:center; padding: 28px 16px; color:#64748b;">
                <div style="display:inline-block; width:22px; height:22px; border:2.5px solid #cbd5e1; border-top-color:#00897b; border-radius:50%; animation:spin 0.8s linear infinite; margin-bottom:8px;"></div>
                <div style="font-size:0.85rem; font-weight:600; color:#334155;">Đang tìm địa chỉ tại TP. Hồ Chí Minh...</div>
            </div>
        `;
    }

    /**
     * Execute live geocoding search across HCMC
     */
    async executeSearch(query) {
        if (!query || query.length < 2) {
            this.renderSuggestions(this.locationsPool);
            return;
        }

        try {
            if (typeof geocoderService !== 'undefined') {
                const results = await geocoderService.search(query, 10);
                this.renderSuggestions(results, query);
            } else {
                const normQ = query.toLowerCase();
                const filtered = this.locationsPool.filter(loc =>
                    loc.name.toLowerCase().includes(normQ) ||
                    loc.address.toLowerCase().includes(normQ)
                );
                this.renderSuggestions(filtered, query);
            }
        } catch (err) {
            if (err.name === 'AbortError') return;
            console.warn('[Customer] Search error:', err);
            const container = document.getElementById('suggestions-container');
            if (container) {
                container.innerHTML = `
                    <div style="text-align:center; padding: 24px 16px; color:#b91c1c;">
                        <div>⚠️ Lỗi kết nối dịch vụ địa chỉ.</div>
                        <div style="font-size:0.8rem; color:#64748b; margin-top:4px;">Bạn có thể chọn trực tiếp điểm đón/đến trên bản đồ.</div>
                    </div>
                `;
            }
        }
    }

    /**
     * Render suggestion items into container (ref-02)
     */
    renderSuggestions(locations, currentQuery = '') {
        const container = document.getElementById('suggestions-container');
        if (!container) return;

        if (!locations || locations.length === 0) {
            container.innerHTML = `
                <div style="text-align:center; padding: 32px 16px; color:#94a3b8;">
                    <div style="font-size:2rem; margin-bottom:8px;">🔍</div>
                    <div style="font-weight:600; color:#475569;">Không tìm thấy địa điểm ${currentQuery ? `"${currentQuery}"` : ''} tại TP.HCM</div>
                    <div style="font-size:0.8rem; margin-top:4px;">Thử nhập số nhà, tên đường hoặc chọn trực tiếp trên bản đồ</div>
                </div>
            `;
            return;
        }

        container.innerHTML = '';

        if (this.searchTarget === 'pickup' && !currentQuery) {
            const gpsItem = document.createElement('div');
            gpsItem.className = 'goride-suggestion-item';
            gpsItem.style.background = '#f0fdfa';
            gpsItem.style.border = '1.5px dashed #0d9488';
            gpsItem.style.borderRadius = '12px';
            gpsItem.style.marginBottom = '8px';
            gpsItem.style.cursor = 'pointer';
            gpsItem.innerHTML = `
                <div class="goride-sugg-icon-col">
                    <div class="goride-sugg-pin" style="background:#0d9488; color:#ffffff; border-radius:50%; width:32px; height:32px; display:flex; align-items:center; justify-content:center;">🎯</div>
                </div>
                <div class="goride-sugg-content">
                    <div class="goride-sugg-title" style="color:#0f766e; font-weight:700;">Lấy vị trí GPS hiện tại của tôi</div>
                    <div class="goride-sugg-address" style="color:#0d9488; font-size:0.75rem;">Chạm để tự động xác định vị trí đón chính xác</div>
                </div>
            `;
            gpsItem.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.recenterMapOnGps(true);



            });
            container.appendChild(gpsItem);
        }

        locations.forEach(loc => {
            const item = document.createElement('div');
            item.className = 'goride-suggestion-item';

            const badgeHtml = loc.isPopular
                ? `<div class="goride-sugg-badge">⭐ ${loc.popularText || 'Phổ biến'}</div>`
                : (loc.district ? `<div class="goride-sugg-badge" style="background:#f1f5f9; color:#475569;">📍 ${loc.district}</div>` : '');

            item.innerHTML = `
                <div class="goride-sugg-icon-col">
                    <div class="goride-sugg-pin">${this.searchTarget === 'pickup' ? '🟢' : '📍'}</div>
                </div>
                <div class="goride-sugg-content">
                    <div class="goride-sugg-title">${loc.name}</div>
                    <div class="goride-sugg-address">${loc.address}</div>
                    ${badgeHtml}
                </div>
            `;

            item.addEventListener('click', () => {
                this.selectLocation(loc);
            });

            container.appendChild(item);
        });
    }

    /**
     * User selects a location from search results
     */
    selectLocation(location) {
        if (this.searchTarget === 'pickup') {
            this.pickup = {
                id: location.id || `loc_${Date.now()}`,
                name: location.name,
                address: location.address,
                lat: Number(location.lat),
                lng: Number(location.lng)
            };

            const pInput = document.getElementById('input-pickup');
            if (pInput) pInput.value = location.name;

            const clearPickupBtn = document.getElementById('btn-clear-pickup');
            if (clearPickupBtn) clearPickupBtn.style.display = 'flex';

            const pSum = document.getElementById('route-sum-pickup');
            if (pSum) {
                pSum.textContent = location.name;
                pSum.title = location.address || location.name;
            }

            // Reset calculated route
            this.currentRouteDistance = null;
            this.currentRouteDuration = null;
            this.currentRouteGeometry = null;

            if (this.destination) {
                this.switchView('vehicle-select');
            } else {
                this.showToast(`Điểm đón: ${location.name}. Mời chọn điểm đến!`, 'info');
                const destInput = document.getElementById('input-destination');
                if (destInput) destInput.focus();
                this.searchTarget = 'destination';
                this.renderSuggestions(this.locationsPool);
            }
        } else {
            this.selectDestination(location);
        }
    }

    /**
     * User selects a destination from suggestions or presets
     */
    selectDestination(location) {
        this.destination = {
            id: location.id || `dest_${Date.now()}`,
            name: location.name,
            address: location.address,
            lat: Number(location.lat),
            lng: Number(location.lng)
        };

        // Reset previous calculated route
        this.currentRouteDistance = null;
        this.currentRouteDuration = null;
        this.currentRouteGeometry = null;

        const destInput = document.getElementById('input-destination');
        if (destInput) destInput.value = location.name;

        const clearDestBtn = document.getElementById('btn-clear-dest');
        if (clearDestBtn) clearDestBtn.style.display = 'flex';

        // Update summary texts in vehicle select view (ref-04)
        const pSum = document.getElementById('route-sum-pickup');
        const dSum = document.getElementById('route-sum-dest');
        if (pSum) {
            pSum.textContent = this.pickup ? this.pickup.name : 'Chưa chọn điểm đón';
            pSum.title = this.pickup ? (this.pickup.address || this.pickup.name) : '';
        }
        if (dSum) {
            dSum.textContent = this.destination.name;
            dSum.title = this.destination.address || this.destination.name;
        }

        // If pickup not chosen yet, prompt user to select pickup
        if (!this.pickup) {
            this.showToast(`Đã chọn điểm đến: ${location.name}. Vui lòng chọn hoặc nhập điểm đón!`, 'info');
            const pInput = document.getElementById('input-pickup');
            if (pInput) pInput.focus();
            this.searchTarget = 'pickup';
            this.renderSuggestions(this.locationsPool);
            return;
        }

        // Switch to vehicle selection view (ref-04)
        this.switchView('vehicle-select');
        this.renderRouteOnMap();
    }

    /**
     * Updates center pin address banner as map moves (ref-03)
     */
    updateCenterPinAddress(lat, lng) {
        const addressEl = document.getElementById('center-pin-address');
        if (!addressEl) return;

        addressEl.textContent = `Vị trí: ${lat.toFixed(4)}, ${lng.toFixed(4)}...`;

        clearTimeout(this._reverseDebounce);
        this._reverseDebounce = setTimeout(async () => {
            if (typeof geocoderService !== 'undefined') {
                const place = await geocoderService.reverse(lat, lng);
                if (place) {
                    let placeName = (place.name || '').trim();
                    const isTrivial = !placeName || placeName.length <= 2 || /^(\d+[\s\/-]*[a-zA-Z]?|[a-zA-Z0-9\s-]{1,2})$/i.test(placeName);
                    if (isTrivial) {
                        if (place.address && place.address.trim().length > 2) {
                            const parts = place.address.split(',').map(s => s.trim()).filter(s => s.length > 1 && !s.toLowerCase().includes('chi minh'));
                            placeName = parts.slice(0, 2).join(', ') || place.address.trim();
                        } else {
                            placeName = `Vị trí: ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
                        }
                    }
                    if (place.district && !place.district.toLowerCase().includes('chi minh') && !placeName.toLowerCase().includes(place.district.toLowerCase())) {
                        placeName = `${placeName}, ${place.district}`;
                    }
                    addressEl.textContent = placeName;
                    this.pickup = {
                        name: placeName,
                        address: place.address,
                        lat: lat,
                        lng: lng
                    };
                    const pInput = document.getElementById('input-pickup');
                    if (pInput) pInput.value = placeName;
                    return;
                }
            }

            const closest = this.findClosestLocation(lat, lng);
            if (closest && closest.distanceMeters < 300) {
                addressEl.textContent = closest.location.name;
                this.pickup = {
                    name: closest.location.name,
                    address: closest.location.address,
                    lat: lat,
                    lng: lng
                };
            } else {
                addressEl.textContent = `Vị trí: ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
                this.pickup = {
                    name: `Điểm đón (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
                    address: `Khu vực TP. Hồ Chí Minh`,
                    lat: lat,
                    lng: lng
                };
            }

            const pInput = document.getElementById('input-pickup');
            if (pInput) pInput.value = this.pickup.name;
        }, 300);
    }

    /**
     * Render vehicle cards list with calculated fares & strikethrough promo discount (ref-04)
     * @param {number} [overrideDistanceMeters]
     */
    renderVehicleOptions(overrideDistanceMeters) {
        const container = document.getElementById('vehicle-options-container');
        if (!container) return;

        const distanceMeters = (typeof overrideDistanceMeters === 'number')
            ? overrideDistanceMeters
            : (this.currentRouteDistance || this.calculateEstimatedDistance());
        const km = distanceMeters / 1000;

        container.innerHTML = '';

        const discountRate = (this.appliedPromo && this.appliedPromo.discountPercent) ? (this.appliedPromo.discountPercent / 100) : 0;

        Object.keys(this.vehicleCatalog).forEach(key => {
            const v = this.vehicleCatalog[key];
            const originalFare = Math.round((v.baseFare + km * v.perKm) / 1000) * 1000;
            const discountedFare = discountRate > 0 
                ? Math.round(originalFare * (1 - discountRate) / 1000) * 1000 
                : originalFare;
            const isSelected = key === this.selectedService;

            const card = document.createElement('div');
            card.className = `goride-vehicle-card ${isSelected ? 'selected' : ''}`;
            card.setAttribute('data-vehicle', key);

            // Display original price with strikethrough on top, and discounted price below
            const priceHtml = discountRate > 0 ? `
                <div class="goride-vehicle-price" style="display:flex; flex-direction:column; align-items:flex-end; justify-content:center; line-height:1.25;">
                    <span style="text-decoration: line-through; color: #94a3b8; font-size: 0.82rem; font-weight: 500;">${this.formatMoney(originalFare)}</span>
                    <span style="color: #00897b; font-size: 1.15rem; font-weight: 800;">${this.formatMoney(discountedFare)}</span>
                </div>
            ` : `
                <div class="goride-vehicle-price">
                    <span style="font-size: 1.15rem; font-weight: 800; color: #0f172a;">${this.formatMoney(originalFare)}</span>
                </div>
            `;

            card.innerHTML = `
                <div class="goride-vehicle-left">
                    <div class="goride-vehicle-img">${v.icon}</div>
                    <div class="goride-vehicle-meta">
                        <div class="goride-vehicle-name-row">
                            <span class="goride-vehicle-name">${v.name}</span>
                            <span class="goride-vehicle-seats">👤 ${v.seats}</span>
                        </div>
                        <div class="goride-vehicle-eta">${(v.etaMin === v.etaMax) ? `Đón trong ~${v.etaMin} phút` : `Đón trong ${v.etaMin}-${v.etaMax} phút`} &bull; <span class="goride-vehicle-desc">${v.desc}</span></div>
                    </div>
                </div>
                <div class="goride-vehicle-right">
                    ${priceHtml}
                </div>
            `;

            card.addEventListener('click', () => {
                this.selectedService = key;
                document.querySelectorAll('.goride-vehicle-card').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                this.selectedVehicleFare = discountedFare;
                this.selectedOriginalFare = originalFare;
                this.updateSolicitarButton(v, discountedFare, originalFare);
            });

            container.appendChild(card);
        });

        // Update CTA button initially
        const activeCfg = this.vehicleCatalog[this.selectedService] || this.vehicleCatalog.car4;
        const initialOriginalFare = Math.round((activeCfg.baseFare + km * activeCfg.perKm) / 1000) * 1000;
        const initialDiscountedFare = discountRate > 0 
            ? Math.round(initialOriginalFare * (1 - discountRate) / 1000) * 1000 
            : initialOriginalFare;
        this.selectedVehicleFare = initialDiscountedFare;
        this.selectedOriginalFare = initialOriginalFare;
        this.updateSolicitarButton(activeCfg, initialDiscountedFare, initialOriginalFare);
        this.updatePromoTagUI();
    }

    /**
     * Update "Đặt chuyến Navigo" button label and fare (ref-04)
     */
    updateSolicitarButton(vehicle, discountedFare, originalFare) {
        const btnText = document.getElementById('solicitar-text');
        if (btnText) {
            const hasDiscount = this.appliedPromo && this.appliedPromo.discountPercent > 0 && originalFare && originalFare > discountedFare;
            if (hasDiscount) {
                btnText.innerHTML = `Đặt ${vehicle.name} &bull; <span style="text-decoration:line-through; opacity:0.75; font-size:0.85em; margin-right:4px;">${this.formatMoney(originalFare)}</span> <strong>${this.formatMoney(discountedFare)}</strong>`;
            } else {
                btnText.textContent = `Đặt ${vehicle.name} • ${this.formatMoney(discountedFare || originalFare)}`;
            }
        }
        if (typeof this.updateVehicleSheetPeek === 'function') {
            this.updateVehicleSheetPeek();
        }
    }

    /**
     * Update Promo Tag UI Badge
     */
    updatePromoTagUI() {
        const promoBtn = document.getElementById('btn-promo-tag');
        if (!promoBtn) return;
        if (this.appliedPromo && this.appliedPromo.discountPercent > 0) {
            promoBtn.innerHTML = `🏷️ <strong>${this.appliedPromo.code}</strong> (-${this.appliedPromo.discountPercent}%) <span style="color:#10b981; font-weight:700; margin-left:3px;">✓</span>`;
            promoBtn.style.background = '#e6fffa';
            promoBtn.style.color = '#00897b';
            promoBtn.style.border = '1.5px solid #00897b';
            promoBtn.style.cursor = 'pointer';
            promoBtn.title = 'Nhấn để đổi hoặc nhập mã giảm giá khác';
        } else {
            promoBtn.innerHTML = `🏷️ Chọn mã giảm giá`;
            promoBtn.style.background = '#f1f5f9';
            promoBtn.style.color = '#475569';
            promoBtn.style.border = '1px solid #cbd5e1';
            promoBtn.style.cursor = 'pointer';
            promoBtn.title = 'Nhấn để nhập mã giảm giá';
        }
    }

    /**
     * Open interactive dialog to select / enter promo code
     */
    openPromoCodeDialog() {
        const currentCode = this.appliedPromo ? this.appliedPromo.code : '';
        const userPrompt = prompt(
            "NHẬP HOẶC CHỌN MÃ GIẢM GIÁ NAVIGO:\n\n" +
            "• NAVIGO20: Giảm 20% toàn bộ cuốc xe\n" +
            "• NAVIGO25: Giảm 25% ưu đãi hôm nay\n" +
            "• NAVIGO50: Giảm 50% siêu tiết kiệm\n\n" +
            "Nhập mã bạn muốn áp dụng (hoặc gõ HUY để bỏ mã):",
            currentCode || "NAVIGO20"
        );

        if (userPrompt === null) return; // Người dùng ấn Hủy

        const cleaned = userPrompt.trim().toUpperCase();
        if (!cleaned || cleaned === 'HUY' || cleaned === 'NONE' || cleaned === 'XOA') {
            this.appliedPromo = null;
            this.showToast('Đã hủy áp dụng mã giảm giá', 'info');
        } else if (this.availablePromos[cleaned]) {
            this.appliedPromo = {
                code: cleaned,
                discountPercent: this.availablePromos[cleaned].discountPercent,
                label: this.availablePromos[cleaned].label
            };
            this.showToast(`Áp dụng thành công mã ${cleaned} (-${this.appliedPromo.discountPercent}%)!`, 'success');
        } else {
            this.appliedPromo = {
                code: cleaned,
                discountPercent: 15,
                label: 'Mã ưu đãi đặc biệt (-15%)'
            };
            this.showToast(`Áp dụng mã ưu đãi ${cleaned} (-15%) thành công!`, 'success');
        }

        // Re-render vehicles with strikethrough price and updated button
        this.renderVehicleOptions();
    }

    /**
     * Draw route between pickup and destination.
     * Integrates with real C++ Dijkstra backend on port 8080.
     * Draws solid OSM polyline on success; falls back to honest dashed line if offline.
     */
    async renderRouteOnMap() {
        if (!this.mapController || !this.pickup || !this.destination) return;

        // Clear existing markers and route
        this.mapController.clearMarkers('pickup');
        this.mapController.clearMarkers('destination');
        this.mapController.clearRoute();

        // Add pickup (green) & destination (red)
        this.mapController.addPickupMarker(this.pickup.lat, this.pickup.lng, this.pickup.name);
        this.mapController.addDestinationMarker(this.destination.lat, this.destination.lng, this.destination.name);

        // Reset calculated route state before fetching
        this.currentRouteGeometry = null;
        this.currentRouteDistance = null;
        this.currentRouteDuration = null;
        this.currentNodesVisited = 0;

        let routeError = null;

        // Tier 1: Attempt local C++ Dijkstra routing (port 8080)
        try {
            if (typeof apiClient !== 'undefined') {
                const queryParams = {
                    from_lat: this.pickup.lat,
                    from_lon: this.pickup.lng,
                    to_lat: this.destination.lat,
                    to_lon: this.destination.lng
                };

                const res = await (apiClient.getRoute 
                    ? apiClient.getRoute(this.pickup.lat, this.pickup.lng, this.destination.lat, this.destination.lng)
                    : apiClient.get('/route', { params: queryParams, timeout: 3500 }));

                if (res && res.ok && res.data && res.data.success && Array.isArray(res.data.geometry)) {
                    // Geometry from backend is in GeoJSON format [longitude, latitude]
                    const leafletPath = res.data.geometry.map(([lon, lat]) => [lat, lon]);

                    this.applySuccessfulRoute(
                        leafletPath,
                        res.data.distance_m,
                        res.data.estimated_duration_s,
                        res.data.nodes_visited,
                        'Tuyến đường thực tế từ C++ Dijkstra (OSM)',
                        '<span style="font-size:0.75rem; color:#059669;">⚡ Tính toán trực tiếp bằng thuật toán Dijkstra trên đồ thị 16.305 nút OSM.</span>'
                    );
                    return;
                }
            }
        } catch (err) {
            console.warn('[GoRide Customer] C++ Dijkstra backend unavailable, engaging OSM road network router:', err.message);
        }

        // Tier 2: OpenStreetMap Routing Service (OSRM)
        try {
            const osrmRes = await this.fetchOsrmRoute(this.pickup.lat, this.pickup.lng, this.destination.lat, this.destination.lng);
            if (osrmRes && osrmRes.ok && Array.isArray(osrmRes.geometry) && osrmRes.geometry.length > 0) {
                this.applySuccessfulRoute(
                    osrmRes.geometry,
                    osrmRes.distance_m,
                    osrmRes.duration_s,
                    osrmRes.geometry.length,
                    'Tuyến đường thực tế bám sát mạng đường OSM (OpenStreetMap Router)',
                    '<span style="font-size:0.75rem; color:#059669;">💡 Tuyến đường men theo mạng lưới phố TP.HCM. Bật <code>ride_rtree_server.exe</code> để kích hoạt C++ Dijkstra nội bộ.</span>'
                );
                return;
            }
        } catch (osrmErr) {
            console.warn('[GoRide Customer] OSRM routing fallback error:', osrmErr.message);
        }

        // Tier 3: Street-Corridors Path (Offline road geometry following real street axes, NEVER diagonal)
        const streetPath = this.getStreetFollowingPath(this.pickup, this.destination);
        if (!streetPath || streetPath.length < 2) {
            this.showToast('Không thể kết nối đường bộ giữa điểm đón và điểm đến. Vui lòng kiểm tra lại vị trí.', 'warning');
            return;
        }

        const estDist = this.calculatePathDistance(streetPath);
        const estDur = Math.round(estDist / 6.944); // ~25 km/h in city traffic

        this.applySuccessfulRoute(
            streetPath,
            estDist,
            estDur,
            streetPath.length,
            'Lộ trình hành lang giao lộ dự phòng (Offline Corridor)',
            '<span style="font-size:0.75rem; color:#b45309;">⚠️ Backend C++ chưa kết nối. Tuyến đường đang men theo các trục giao lộ thực tế trung tâm TP.HCM. Bật <code>ride_rtree_server.exe</code> để kích hoạt Dijkstra chính thức.</span>'
        );
    }

    /**
     * Compute Haversine distance between 2 points in meters
     */
    calculateHaversineDistance(lat1, lon1, lat2, lon2) {
        const R = 6371000;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    /**
     * Compute total polyline distance in meters
     */
    calculatePathDistance(coords) {
        if (!Array.isArray(coords) || coords.length < 2) return 1000;
        let total = 0;
        for (let i = 0; i < coords.length - 1; i++) {
            total += this.calculateHaversineDistance(coords[i][0], coords[i][1], coords[i + 1][0], coords[i + 1][1]);
        }
        return Math.round(total);
    }

    /**
     * Compute forward azimuth (bearing) in degrees from point 1 to point 2 (0 - 360)
     */
    calculateBearing(lat1, lon1, lat2, lon2) {
        const toRad = Math.PI / 180;
        const toDeg = 180 / Math.PI;
        const phi1 = lat1 * toRad;
        const phi2 = lat2 * toRad;
        const deltaLambda = (lon2 - lon1) * toRad;

        const y = Math.sin(deltaLambda) * Math.cos(phi2);
        const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);
        const heading = Math.atan2(y, x) * toDeg;
        return ((heading % 360) + 360) % 360;
    }

    /**
     * Densifies a route polyline by interpolating intermediate sub-steps at a smooth distance (stepMeters).
     * Computes exact heading/bearing for every point so vehicle smoothly rotates and glides.
     */
    densifyPath(path, stepMeters = 14) {
        if (!Array.isArray(path) || path.length < 2) return [];

        const points = [];
        for (let i = 0; i < path.length - 1; i++) {
            const p1 = path[i];
            const p2 = path[i + 1];
            const lat1 = Array.isArray(p1) ? p1[0] : (p1.lat || p1.latitude);
            const lon1 = Array.isArray(p1) ? p1[1] : (p1.lng || p1.lon || p1.longitude);
            const lat2 = Array.isArray(p2) ? p2[0] : (p2.lat || p2.latitude);
            const lon2 = Array.isArray(p2) ? p2[1] : (p2.lng || p2.lon || p2.longitude);

            const dist = this.calculateHaversineDistance(lat1, lon1, lat2, lon2);
            const bearing = this.calculateBearing(lat1, lon1, lat2, lon2);
            const steps = Math.max(1, Math.round(dist / stepMeters));

            for (let s = 0; s < steps; s++) {
                const frac = s / steps;
                points.push({
                    lat: lat1 + (lat2 - lat1) * frac,
                    lng: lon1 + (lon2 - lon1) * frac,
                    heading: bearing
                });
            }
        }

        // Add terminal destination point
        const last = path[path.length - 1];
        const lastLat = Array.isArray(last) ? last[0] : (last.lat || last.latitude);
        const lastLng = Array.isArray(last) ? last[1] : (last.lng || last.lon || last.longitude);
        const lastHeading = points.length > 0 ? points[points.length - 1].heading : 0;
        points.push({ lat: lastLat, lng: lastLng, heading: lastHeading });

        return points;
    }

    /**
     * Generates a realistic street-following route on HCMC's actual road network.
     * Guarantees the line adheres to actual street corridors (never a straight line cutting through buildings).
     */
    getStreetFollowingPath(pickup, dest) {
        const pLat = Number(pickup.lat || pickup.latitude);
        const pLng = Number(pickup.lng || pickup.lon || pickup.longitude);
        const dLat = Number(dest.lat || dest.latitude);
        const dLng = Number(dest.lng || dest.lon || dest.longitude);

        // 1. Chợ Bến Thành -> Vincom Center Đồng Khởi (Đi qua Phan Bội Châu, Lê Thánh Tôn, Pasteur, Lý Tự Trọng, Đồng Khởi)
        if (Math.abs(pLat - 10.7725) < 0.003 && Math.abs(pLng - 106.6980) < 0.003 &&
            Math.abs(dLat - 10.7781) < 0.003 && Math.abs(dLng - 106.7023) < 0.003) {
            return [
                [10.77250, 106.69800], // Cửa Nam Chợ Bến Thành
                [10.77280, 106.69850], // Cửa Đông - Đường Phan Bội Châu
                [10.77380, 106.69960], // Lê Thánh Tôn x Nam Kỳ Khởi Nghĩa
                [10.77510, 106.70070], // Lê Thánh Tôn x Pasteur
                [10.77580, 106.70010], // Đường Pasteur (hướng về phía Bắc)
                [10.77615, 106.69900], // Pasteur x Lý Tự Trọng
                [10.77670, 106.69970], // Lý Tự Trọng x Nam Kỳ Khởi Nghĩa
                [10.77735, 106.70050], // Lý Tự Trọng x Pasteur
                [10.77800, 106.70135], // Lý Tự Trọng x Đồng Khởi
                [10.77810, 106.70230]  // Vincom Center Đồng Khởi
            ];
        }

        // 2. Vincom Center Đồng Khởi -> Chợ Bến Thành (Chiều ngược lại qua Lê Thánh Tôn)
        if (Math.abs(pLat - 10.7781) < 0.003 && Math.abs(pLng - 106.7023) < 0.003 &&
            Math.abs(dLat - 10.7725) < 0.003 && Math.abs(dLng - 106.6980) < 0.003) {
            return [
                [10.77810, 106.70230], // Vincom Center Đồng Khởi
                [10.77740, 106.70300], // Lê Thánh Tôn
                [10.77630, 106.70200], // Lê Thánh Tôn x Đồng Khởi
                [10.77510, 106.70070], // Lê Thánh Tôn x Pasteur
                [10.77400, 106.69960], // Lê Thánh Tôn x Nam Kỳ Khởi Nghĩa
                [10.77300, 106.69870], // Lê Thánh Tôn x Phan Bội Châu
                [10.77250, 106.69800]  // Chợ Bến Thành
            ];
        }

        // 3. Chợ Bến Thành -> Landmark 81
        if (Math.abs(pLat - 10.7725) < 0.003 && Math.abs(pLng - 106.6980) < 0.003 &&
            Math.abs(dLat - 10.7951) < 0.005 && Math.abs(dLng - 106.7219) < 0.005) {
            return [
                [10.77250, 106.69800], // Bến Thành
                [10.77330, 106.69980], // Lê Lợi x Nam Kỳ Khởi Nghĩa
                [10.77395, 106.70070], // Lê Lợi x Pasteur
                [10.77470, 106.70195], // Lê Lợi x Nguyễn Huệ
                [10.77490, 106.70650], // Bến Bạch Đằng / Tôn Đức Thắng
                [10.78120, 106.70610], // Tôn Đức Thắng
                [10.78750, 106.71180], // Nguyễn Hữu Cảnh
                [10.79150, 106.71750], // Cầu vượt Nguyễn Hữu Cảnh
                [10.79420, 106.72050], // Vinhomes Central Park
                [10.79510, 106.72190]  // Landmark 81
            ];
        }

        // 4. Chợ Bến Thành -> Nhà Thờ Đức Bà
        if (Math.abs(pLat - 10.7725) < 0.003 && Math.abs(pLng - 106.6980) < 0.003 &&
            Math.abs(dLat - 10.7798) < 0.004 && Math.abs(dLng - 106.6990) < 0.004) {
            return [
                [10.77250, 106.69800], // Bến Thành
                [10.77330, 106.69980], // Lê Lợi x Nam Kỳ Khởi Nghĩa
                [10.77395, 106.70070], // Lê Lợi x Pasteur
                [10.77480, 106.69980], // Pasteur
                [10.77615, 106.69900], // Pasteur x Lý Tự Trọng
                [10.77750, 106.69800], // Pasteur x Hàn Thuyên
                [10.77880, 106.69850], // Công xã Paris
                [10.77980, 106.69900]  // Nhà Thờ Đức Bà
            ];
        }

        // 5. Chợ Bến Thành -> Phố đi bộ Nguyễn Huệ
        if (Math.abs(pLat - 10.7725) < 0.003 && Math.abs(pLng - 106.6980) < 0.003 &&
            Math.abs(dLat - 10.7743) < 0.004 && Math.abs(dLng - 106.7036) < 0.004) {
            return [
                [10.77250, 106.69800], // Bến Thành
                [10.77290, 106.69890], // Lê Lợi
                [10.77330, 106.69980], // Lê Lợi x Nam Kỳ Khởi Nghĩa
                [10.77395, 106.70070], // Lê Lợi x Pasteur
                [10.77470, 106.70195], // Lê Lợi x Nguyễn Huệ
                [10.77430, 106.70360]  // Phố đi bộ Nguyễn Huệ
            ];
        }

        // 6. Real Street Network Graph for Greater HCMC (Central, East, North, West, Airport)
        // Authentic street intersections mapped to actual road corridors across all districts
        const intersections = [
            // Central D1/D3
            { id: 'bt', lat: 10.77250, lng: 106.69800 },         // Bến Thành
            { id: 'leloi_nkk', lat: 10.77330, lng: 106.69980 },   // Lê Lợi x Nam Kỳ Khởi Nghĩa (khớp tim đường OSM)
            { id: 'leloi_pas', lat: 10.77395, lng: 106.70070 },   // Lê Lợi x Pasteur (khớp tim đường OSM)
            { id: 'leloi_nh', lat: 10.77470, lng: 106.70195 },    // Lê Lợi x Nguyễn Huệ
            { id: 'leloi_dk', lat: 10.77535, lng: 106.70310 },    // Lê Lợi x Đồng Khởi
            { id: 'lt_td', lat: 10.77120, lng: 106.69600 },       // Lê Thánh Tôn x Trương Định
            { id: 'lt_nkk', lat: 10.77400, lng: 106.69960 },      // Lê Thánh Tôn x Nam Kỳ Khởi Nghĩa
            { id: 'lt_pas', lat: 10.77510, lng: 106.70070 },      // Lê Thánh Tôn x Pasteur
            { id: 'lt_dk', lat: 10.77740, lng: 106.70300 },       // Lê Thánh Tôn x Đồng Khởi
            { id: 'lt_hbt', lat: 10.77880, lng: 106.70420 },      // Lê Thánh Tôn x Hai Bà Trưng
            { id: 'ly_td', lat: 10.77250, lng: 106.69480 },       // Lý Tự Trọng x Trương Định
            { id: 'ly_nkk', lat: 10.77670, lng: 106.69970 },      // Lý Tự Trọng x Nam Kỳ Khởi Nghĩa
            { id: 'ly_pas', lat: 10.77615, lng: 106.69900 },      // Lý Tự Trọng x Pasteur
            { id: 'ly_dk', lat: 10.77800, lng: 106.70135 },       // Lý Tự Trọng x Đồng Khởi
            { id: 'ly_hbt', lat: 10.77950, lng: 106.70350 },      // Lý Tự Trọng x Hai Bà Trưng
            { id: 'nd_nkk', lat: 10.77850, lng: 106.69850 },      // Nguyễn Du x Nam Kỳ Khởi Nghĩa
            { id: 'nd_pas', lat: 10.77920, lng: 106.69950 },      // Nguyễn Du x Pasteur
            { id: 'nd_dk', lat: 10.77980, lng: 106.69900 },       // Nhà Thờ Đức Bà
            { id: 'nh_mtb', lat: 10.77430, lng: 106.70360 },      // Nguyễn Huệ x Mạc Thị Bưởi
            { id: 'nh_tdt', lat: 10.77200, lng: 106.70650 },      // Bến Bạch Đằng / Tôn Đức Thắng
            { id: 'tdt_ld', lat: 10.78450, lng: 106.70600 },      // Tôn Đức Thắng x Lê Duẩn
            { id: 'tdt_nhc', lat: 10.78750, lng: 106.71180 },     // Tôn Đức Thắng x Nguyễn Hữu Cảnh
            { id: 'pht_ngasau', lat: 10.77145, lng: 106.69365 },  // Ngã Sáu Phù Đổng
            { id: 'cmt8_ntmk', lat: 10.77200, lng: 106.69100 },   // CMT8 x NTMK
            { id: 'cmt8_dbp', lat: 10.77700, lng: 106.68300 },    // CMT8 x Điện Biên Phủ
            { id: 'bk_3t2', lat: 10.77200, lng: 106.65780 },      // ĐH Bách Khoa / Ba Tháng Hai
            { id: 'nkk_dbp', lat: 10.78520, lng: 106.68950 },     // Nam Kỳ Khởi Nghĩa x Điện Biên Phủ
            { id: 'nkk_lct', lat: 10.79050, lng: 106.68300 },     // Nam Kỳ Khởi Nghĩa x Lý Chính Thắng
            { id: 'nvt_thl', lat: 10.79550, lng: 106.67750 },     // Nguyễn Văn Trỗi x Trần Huy Liệu
            // Tan Binh & Airport
            { id: 'nvt_hvt', lat: 10.80100, lng: 106.66650 },     // Nguyễn Văn Trỗi x Hoàng Văn Thụ
            { id: 'lang_cha_ca', lat: 10.79900, lng: 106.65800 }, // Lăng Cha Cả
            { id: 'ts_airport', lat: 10.81200, lng: 106.66300 },  // Đường Trường Sơn (Sân bay)
            { id: 'cong_hoa_hht', lat: 10.80300, lng: 106.65000 },// Cộng Hòa x Hoàng Hoa Thám
            { id: 'cong_hoa_tc', lat: 10.80600, lng: 106.64300 }, // Cộng Hòa x Trường Chinh
            // Tan Phu & Dam Sen
            { id: 'dam_sen', lat: 10.76800, lng: 106.63500 },     // Công viên nước Đầm Sen
            { id: 'luy_ban_bich_hb', lat: 10.77100, lng: 106.63500 }, // Lũy Bán Bích x Hòa Bình
            { id: 'lbb_tnh', lat: 10.78500, lng: 106.63200 },     // Lũy Bán Bích x Thoại Ngọc Hầu
            { id: 'truong_chinh_au_co', lat: 10.79800, lng: 106.64200 }, // Trường Chinh x Âu Cơ / Ba Vân
            // Binh Thanh & Thu Duc & Pham Van Dong
            { id: 'lm81', lat: 10.79510, lng: 106.72190 },        // Landmark 81
            { id: 'cau_sg', lat: 10.79900, lng: 106.72500 },      // Cầu Sài Gòn
            { id: 'xlhn_thuduc', lat: 10.85100, lng: 106.77200 }, // Xa Lộ Hà Nội x Ngã Tư Thủ Đức
            { id: 'cau_binh_trieu', lat: 10.81500, lng: 106.71000 }, // Cầu Bình Triệu / Đinh Bộ Lĩnh
            { id: 'pvd_tsn', lat: 10.82200, lng: 106.67200 },     // Phạm Văn Đồng x Bạch Đằng (vòng ngoài sân bay)
            { id: 'pvd_govap', lat: 10.82000, lng: 106.68500 },   // Phạm Văn Đồng x Phan Văn Trị
            { id: 'pvd_ql13', lat: 10.82400, lng: 106.71200 },    // Phạm Văn Đồng x Quốc Lộ 13
            { id: 'ql13_hiepbinh', lat: 10.83500, lng: 106.71500 }, // QL13 x Hiệp Bình
            { id: 'ql13_binhphuoc', lat: 10.85000, lng: 106.72000 }, // Ngã Tư Bình Phước (QL13 x QL1A)
            // District 12 & An Phu Dong
            { id: 'truong_chinh_an_suong', lat: 10.84500, lng: 106.61800 }, // Ngã Tư An Sương
            { id: 'ql1a_tth', lat: 10.85500, lng: 106.64500 },    // QL1A x Tân Thới Hiệp
            { id: 'ql1a_nga_tu_ga', lat: 10.86000, lng: 106.67800 }, // QL1A x Ngã Tư Ga
            { id: 'an_phu_dong_d3', lat: 10.85200, lng: 106.69500 }  // Đường D3 / Vườn Lài (An Phú Đông)
        ];

        // Valid physical street connections between intersections
        const roadAdj = {
            bt: ['leloi_nkk', 'lt_td', 'pht_ngasau'],
            pht_ngasau: ['bt', 'cmt8_ntmk', 'ly_td'],
            leloi_nkk: ['bt', 'leloi_pas', 'lt_nkk'],
            leloi_pas: ['leloi_nkk', 'leloi_nh', 'lt_pas'],
            leloi_nh: ['leloi_pas', 'leloi_dk', 'nh_mtb'],
            leloi_dk: ['leloi_nh', 'lt_dk', 'nh_tdt'],
            lt_hbt: ['lt_dk'],
            lt_dk: ['lt_pas', 'leloi_dk'],
            lt_pas: ['lt_nkk', 'ly_pas'],
            lt_nkk: ['lt_td', 'leloi_nkk'],
            lt_td: ['bt'],
            ly_td: ['ly_nkk', 'pht_ngasau'],
            ly_nkk: ['ly_pas', 'lt_nkk'],
            ly_pas: ['ly_dk', 'nd_pas'],
            ly_dk: ['ly_hbt', 'lt_dk'],
            ly_hbt: ['lt_hbt'],
            nd_nkk: ['ly_nkk', 'nkk_dbp'],
            nkk_dbp: ['nd_nkk', 'nkk_lct'],
            nkk_lct: ['nkk_dbp', 'nvt_thl'],
            nvt_thl: ['nkk_lct', 'nvt_hvt'],
            nvt_hvt: ['nvt_thl', 'lang_cha_ca', 'ts_airport'],
            lang_cha_ca: ['nvt_hvt', 'cong_hoa_hht', 'ts_airport'],
            cong_hoa_hht: ['lang_cha_ca', 'cong_hoa_tc'],
            cong_hoa_tc: ['cong_hoa_hht', 'truong_chinh_au_co', 'truong_chinh_an_suong'],
            ts_airport: ['nvt_hvt', 'lang_cha_ca', 'pvd_tsn'],
            pvd_tsn: ['ts_airport', 'pvd_govap'],
            pvd_govap: ['pvd_tsn', 'pvd_ql13'],
            pvd_ql13: ['pvd_govap', 'cau_binh_trieu', 'ql13_hiepbinh'],
            cau_binh_trieu: ['pvd_ql13', 'tdt_nhc'],
            ql13_hiepbinh: ['pvd_ql13', 'ql13_binhphuoc'],
            ql13_binhphuoc: ['ql13_hiepbinh', 'an_phu_dong_d3', 'xlhn_thuduc'],
            xlhn_thuduc: ['ql13_binhphuoc', 'cau_sg'],
            cau_sg: ['xlhn_thuduc', 'lm81'],
            nd_pas: ['nd_dk', 'nd_nkk'],
            nd_dk: ['ly_dk', 'ly_hbt', 'nd_pas'],
            nh_mtb: ['leloi_nh', 'nh_tdt'],
            nh_tdt: ['nh_mtb', 'tdt_ld'],
            tdt_ld: ['tdt_nhc', 'nh_tdt'],
            tdt_nhc: ['lm81', 'tdt_ld', 'cau_binh_trieu'],
            lm81: ['tdt_nhc', 'cau_sg'],
            cmt8_ntmk: ['cmt8_dbp', 'pht_ngasau'],
            cmt8_dbp: ['bk_3t2', 'cmt8_ntmk'],
            bk_3t2: ['cmt8_dbp', 'dam_sen'],
            dam_sen: ['bk_3t2', 'luy_ban_bich_hb'],
            luy_ban_bich_hb: ['dam_sen', 'lbb_tnh'],
            lbb_tnh: ['luy_ban_bich_hb', 'truong_chinh_au_co'],
            truong_chinh_au_co: ['lbb_tnh', 'cong_hoa_tc', 'truong_chinh_an_suong'],
            truong_chinh_an_suong: ['truong_chinh_au_co', 'cong_hoa_tc', 'ql1a_tth'],
            ql1a_tth: ['truong_chinh_an_suong', 'ql1a_nga_tu_ga'],
            ql1a_nga_tu_ga: ['ql1a_tth', 'an_phu_dong_d3'],
            an_phu_dong_d3: ['ql1a_nga_tu_ga', 'ql13_binhphuoc']
        };

        // Snap pickup & dest to closest intersection
        const findNearestNode = (lat, lng) => {
            let best = intersections[0];
            let minDist = Infinity;
            for (const n of intersections) {
                const d = this.calculateHaversineDistance(lat, lng, n.lat, n.lng);
                if (d < minDist) {
                    minDist = d;
                    best = n;
                }
            }
            return { node: best, dist: minDist };
        };

        const startRes = findNearestNode(pLat, pLng);
        const endRes = findNearestNode(dLat, dLng);

        // BFS traversal on the real road network
        if (startRes.node.id !== endRes.node.id) {
            const queue = [[startRes.node.id]];
            const visited = new Set([startRes.node.id]);
            let bestPathIds = null;

            while (queue.length > 0) {
                const currentPath = queue.shift();
                const tail = currentPath[currentPath.length - 1];

                if (tail === endRes.node.id) {
                    bestPathIds = currentPath;
                    break;
                }

                const neighbors = roadAdj[tail] || [];
                for (const nxt of neighbors) {
                    if (!visited.has(nxt)) {
                        visited.add(nxt);
                        queue.push([...currentPath, nxt]);
                    }
                }
            }

            if (bestPathIds && bestPathIds.length > 1) {
                const nodeMap = new Map(intersections.map(n => [n.id, n]));
                const result = [[pLat, pLng]];
                for (const id of bestPathIds) {
                    const node = nodeMap.get(id);
                    if (node) result.push([node.lat, node.lng]);
                }
                result.push([dLat, dLng]);
                return result;
            }
        }

        // Tan Son Nhat Airport Runway Avoidance Guard:
        // Airport forbidden runway box: lat 10.810 to 10.830, lng 106.645 to 106.675
        const minLat = Math.min(pLat, dLat);
        const maxLat = Math.max(pLat, dLat);
        const minLng = Math.min(pLng, dLng);
        const maxLng = Math.max(pLng, dLng);
        const cutsAirport = !(maxLat < 10.808 || minLat > 10.832 || maxLng < 106.642 || minLng > 106.678);

        if (cutsAirport) {
            const path = [[pLat, pLng]];
            if (pLat < 10.810 && dLat > 10.825) {
                path.push([10.80100, 106.66650]); // Hoàng Văn Thụ
                path.push([10.81200, 106.66300]); // Trường Sơn
                path.push([10.82400, 106.67500]); // Bạch Đằng / Phạm Văn Đồng
            } else if (pLat > 10.825 && dLat < 10.810) {
                path.push([10.82400, 106.67500]); // Bạch Đằng / Phạm Văn Đồng
                path.push([10.81200, 106.66300]); // Trường Sơn
                path.push([10.80100, 106.66650]); // Hoàng Văn Thụ
            } else {
                path.push([10.80200, 106.65500]); // Cộng Hòa x Hoàng Hoa Thám
                path.push([10.80600, 106.64700]); // Cộng Hòa x Trường Chinh
            }
            path.push([dLat, dLng]);
            return path;
        }

        // Stepped street-corridor fallback
        const midLat = pLat + (dLat - pLat) * 0.45;
        const midLng = pLng + (dLng - pLng) * 0.55;
        return [
            [pLat, pLng],
            [pLat + (midLat - pLat) * 0.6, pLng + (dLng - pLng) * 0.05],
            [midLat, midLng],
            [dLat - (dLat - midLat) * 0.4, dLng - (dLng - midLng) * 0.05],
            [dLat, dLng]
        ];
    }

    /**
     * Query Public OpenStreetMap Routing Service (OSRM Primary + Mirror)
     * Real turn-by-turn geometry adhering to OSM street network
     */
    async fetchOsrmRoute(fromLat, fromLon, toLat, toLon) {
        const endpoints = [
            `https://router.project-osrm.org/route/v1/driving/${fromLon},${fromLat};${toLon},${toLat}?overview=full&geometries=geojson`,
            `https://routing.openstreetmap.de/routed-car/route/v1/driving/${fromLon},${fromLat};${toLon},${toLat}?overview=full&geometries=geojson`
        ];

        for (const url of endpoints) {
            try {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 6000);
                const res = await fetch(url, { signal: controller.signal });
                clearTimeout(timeout);
                if (res.ok) {
                    const data = await res.json();
                    if (data.code === 'Ok' && Array.isArray(data.routes) && data.routes.length > 0) {
                        const r = data.routes[0];
                        if (r.geometry && Array.isArray(r.geometry.coordinates) && r.geometry.coordinates.length > 1) {
                            return {
                                ok: true,
                                geometry: r.geometry.coordinates.map(([lon, lat]) => [lat, lon]),
                                distance_m: Math.round(r.distance),
                                duration_s: Math.round(r.duration)
                            };
                        }
                    }
                }
            } catch (e) {}
        }
        return null;
    }

    /**
     * Calculate navigation route from driver's location to customer's pickup point
     * Uses Shared Active Trip Geometry -> C++ Dijkstra -> OSRM -> Street Corridors
     * NEVER returns a diagonal 2-point straight line cutting across buildings.
     */
    async calculateDriverApproachRoute(fLat, fLng, tLat, tLng) {
        const fromLat = Number(fLat);
        const fromLng = Number(fLng);
        const toLat = Number(tLat);
        const toLng = Number(tLng);

        if (isNaN(fromLat) || isNaN(fromLng) || isNaN(toLat) || isNaN(toLng)) {
            return null;
        }

        if (Math.abs(fromLat - toLat) < 0.0001 && Math.abs(fromLng - toLng) < 0.0001) {
            return null;
        }

        // Validate cached geometry: must start near [fromLat, fromLng] (< 200m) and end near [toLat, toLng] (< 200m)
        const isValidApproachGeometry = (geom) => {
            if (!Array.isArray(geom) || geom.length < 3) return false;
            const start = geom[0];
            const end = geom[geom.length - 1];
            const startLat = Array.isArray(start) ? start[0] : (start.lat || start.latitude);
            const startLng = Array.isArray(start) ? start[1] : (start.lng || start.lon || start.longitude);
            const endLat = Array.isArray(end) ? end[0] : (end.lat || end.latitude);
            const endLng = Array.isArray(end) ? end[1] : (end.lng || end.lon || end.longitude);
            const dStart = Math.hypot((startLng - fromLng) * Math.cos(fromLat * Math.PI / 180), startLat - fromLat) * 111320;
            const dEnd = Math.hypot((endLng - toLng) * Math.cos(toLat * Math.PI / 180), endLat - toLat) * 111320;
            return dStart < 200 && dEnd < 200;
        };

        // Tier 0: Check if active trip already has driver approach geometry pre-calculated by driver
        if (this.activeTrip && isValidApproachGeometry(this.activeTrip.driverApproachGeometry)) {
            return this.activeTrip.driverApproachGeometry;
        }
        try {
            const act = JSON.parse(localStorage.getItem('goride_active_trip') || '{}');
            if (act && isValidApproachGeometry(act.driverApproachGeometry)) {
                return act.driverApproachGeometry;
            }
        } catch (e) {}

        // Tier 1: Local C++ Dijkstra Backend API (/api/route) if available
        if (typeof apiClient !== 'undefined' && apiClient && typeof apiClient.getRoute === 'function') {
            try {
                const routePromise = apiClient.getRoute(fromLat, fromLng, toLat, toLng);
                const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 1500));
                const res = await Promise.race([routePromise, timeoutPromise]);
                if (res && res.ok && res.data && res.data.success && Array.isArray(res.data.geometry) && res.data.geometry.length > 1) {
                    return res.data.geometry.map(([lon, lat]) => [lat, lon]);
                }
            } catch (e) {}
        }

        // Tier 2: Public OpenStreetMap Routing Service (OSRM Primary + Mirror)
        const osrm = await this.fetchOsrmRoute(fromLat, fromLng, toLat, toLng);
        if (osrm && osrm.ok && Array.isArray(osrm.geometry) && osrm.geometry.length > 1) {
            return osrm.geometry;
        }

        // Tier 3: Street-Network Fallback
        return this.getStreetFollowingPath({ lat: fromLat, lng: fromLng }, { lat: toLat, lng: toLng });
    }

    /**
     * Recalculates shortest road route to destination during Stage 2 (trip in progress) when driver goes off-route
     */
    async calculateNavigationRouteToDest(fLat, fLng, tLat, tLng) {
        const fromLat = Number(fLat);
        const fromLng = Number(fLng);
        const toLat = Number(tLat);
        const toLng = Number(tLng);

        if (isNaN(fromLat) || isNaN(fromLng) || isNaN(toLat) || isNaN(toLng)) {
            return null;
        }

        // Tier 1: Local C++ Dijkstra Backend API (/api/route) if available
        if (typeof apiClient !== 'undefined' && apiClient && typeof apiClient.getRoute === 'function') {
            try {
                const routePromise = apiClient.getRoute(fromLat, fromLng, toLat, toLng);
                const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 1500));
                const res = await Promise.race([routePromise, timeoutPromise]);
                if (res && res.ok && res.data && res.data.success && Array.isArray(res.data.geometry) && res.data.geometry.length > 1) {
                    return res.data.geometry.map(([lon, lat]) => [lat, lon]);
                }
            } catch (e) {}
        }

        // Tier 2: Public OpenStreetMap Routing Service (OSRM Primary + Mirror)
        const osrm = await this.fetchOsrmRoute(fromLat, fromLng, toLat, toLng);
        if (osrm && osrm.ok && Array.isArray(osrm.geometry) && osrm.geometry.length > 1) {
            return osrm.geometry;
        }

        // Tier 3: Street-Network Fallback
        return this.getStreetFollowingPath({ lat: fromLat, lng: fromLng }, { lat: toLat, lng: toLng });
    }

    /**
     * Generate stepped street-grid fallback path for driver approach
     * Strictly adheres to real road network corridors across HCMC
     */
    generateApproachFallbackPath(fromPoint, toPoint) {
        const fLat = Number(fromPoint[0]);
        const fLng = Number(fromPoint[1]);
        const tLat = Number(toPoint[0]);
        const tLng = Number(toPoint[1]);

        if (isNaN(fLat) || isNaN(fLng) || isNaN(tLat) || isNaN(tLng)) return null;

        const path = this.getStreetFollowingPath({ lat: fLat, lng: fLng }, { lat: tLat, lng: tLng });
        if (path && Array.isArray(path) && path.length >= 2) {
            return path;
        }

        return [[fLat, fLng], [tLat, tLng]];
    }

    /**
     * Centralized route application
     * Renders solid emerald road-following polyline (#10b981)
     */
    applySuccessfulRoute(leafletPath, distanceMeters, durationSeconds, nodesVisited, sourceTitle, bannerNotice = '') {
        this.currentRouteGeometry = leafletPath;
        this.currentRouteDistance = distanceMeters;
        this.currentRouteDuration = durationSeconds;
        this.currentNodesVisited = nodesVisited;

        // Invalidate size prior to fitBounds
        if (this.mapController && this.mapController.map) {
            this.mapController.map.invalidateSize({ animate: false });
        }

        // Draw solid emerald green polyline (#10b981) following the street network
        this.mapController.drawRoute(leafletPath, {
            color: '#10b981',
            weight: 5,
            opacity: 0.9,
            dashArray: null,
            lineCap: 'round',
            lineJoin: 'round'
        });

        // Fit map bounds
        this.mapController.fitBounds(leafletPath, {
            padding: [50, 50]
        });

        // Update banner and route distance pill
        const distKm = (distanceMeters / 1000).toFixed(1);
        const durMin = Math.ceil(durationSeconds / 60);

        const distPill = document.getElementById('route-distance-pill');
        const distVal = document.getElementById('route-distance-value');
        if (distPill && distVal) {
            distVal.textContent = `${distKm} km • ${durMin} phút`;
            distPill.style.display = 'inline-flex';
        }

        const banner = document.getElementById('backend-routing-banner');
        if (banner) {
            banner.style.display = 'none';
        }

        // Update prices with real distance
        this.renderVehicleOptions(distanceMeters);
    }

    /**
     * Calculate route distance in meters
     */
    calculateEstimatedDistance() {
        if (!this.pickup || !this.destination) return 3500;

        const dLat = (this.destination.lat - this.pickup.lat) * 111000;
        const dLng = (this.destination.lng - this.pickup.lng) * 111000 * Math.cos(this.pickup.lat * Math.PI / 180);
        const directDist = Math.sqrt(dLat * dLat + dLng * dLng);

        return Math.max(800, Math.round(directDist * 1.35));
    }

    /**
     * Check if user currently has an active trip on backend (P7.1 Active Trip Locking & Recovery)
     */
    async checkActiveTripOnLoad() {
        let trip = null;

        // 1. Try Live C++ Backend if authenticated
        if (typeof apiClient !== 'undefined' && typeof sessionManager !== 'undefined' && sessionManager.isAuthenticated()) {
            try {
                const res = await apiClient.getActiveTrip();
                if (res && res.data && res.data.has_active_trip && res.data.trip) {
                    trip = res.data.trip;
                }
            } catch (e) {
                console.warn('[CustomerApp] Check active trip on load warning:', e.message);
            }
        }

        // 2. Check localStorage goride_active_trip specifically for this customer
        if (!trip) {
            try {
                const raw = localStorage.getItem('goride_active_trip');
                if (raw) {
                    const parsed = JSON.parse(raw);
                    if (parsed && typeof isMockTrip === 'function' && isMockTrip(parsed)) {
                        localStorage.removeItem('goride_active_trip');
                        parsed = null;
                    }
                    if (parsed && parsed.driverName && (parsed.driverName.includes('Nguyễn Văn Thành') || parsed.driverName.includes('Trần Văn Bình'))) {
                        localStorage.removeItem('goride_active_trip');
                        parsed = null;
                    }
                    const validStatuses = ['REQUESTED', 'OFFERED', 'ACCEPTED', 'ARRIVED', 'IN_PROGRESS'];
                    const tripTime = parsed?.createdAt ? new Date(parsed.createdAt).getTime() : 0;
                    const isFresh = (Date.now() - tripTime) < (2 * 60 * 60 * 1000); // within 2 hours
                    if (parsed && parsed.status && validStatuses.includes(parsed.status.toUpperCase()) && isFresh) {
                        trip = parsed;
                    } else {
                        // Stale or expired active trip, clean it up
                        localStorage.removeItem('goride_active_trip');
                    }
                }
            } catch (e) {
                try { localStorage.removeItem('goride_active_trip'); } catch (err) {}
            }
        }

        if (trip) {
            this.activeTrip = trip;
            this.activeTripId = trip.id;
            this.paymentMethod = trip.paymentMethod || (trip.paidByWallet || trip.walletDeducted ? 'wallet' : 'cash');

            // Sync pickup & dropoff coordinates
            if (trip.pickup && trip.pickup.lat && (trip.pickup.lng || trip.pickup.lon)) {
                this.pickup = {
                    name: trip.pickup.name || trip.pickup.address || 'Điểm đón',
                    address: trip.pickup.address || trip.pickup.name || 'Điểm đón',
                    lat: Number(trip.pickup.lat),
                    lng: Number(trip.pickup.lng || trip.pickup.lon)
                };
            } else if (trip.pickupLat && (trip.pickupLng || trip.pickupLon)) {
                this.pickup = {
                    name: trip.pickupName || 'Điểm đón',
                    address: trip.pickupName || 'Điểm đón',
                    lat: Number(trip.pickupLat),
                    lng: Number(trip.pickupLng || trip.pickupLon)
                };
            }

            if (trip.destination && trip.destination.lat && (trip.destination.lng || trip.destination.lon)) {
                this.destination = {
                    name: trip.destination.name || trip.destination.address || 'Điểm đến',
                    address: trip.destination.address || trip.destination.name || 'Điểm đến',
                    lat: Number(trip.destination.lat),
                    lng: Number(trip.destination.lng || trip.destination.lon)
                };
            } else if (trip.dropoffLat && (trip.dropoffLng || trip.dropoffLon)) {
                this.destination = {
                    name: trip.dropoffName || 'Điểm đến',
                    address: trip.dropoffName || 'Điểm đến',
                    lat: Number(trip.dropoffLat),
                    lng: Number(trip.dropoffLng || trip.dropoffLon)
                };
            }

            // Sync search fields
            const pInput = document.getElementById('input-pickup');
            const dInput = document.getElementById('input-destination');
            if (pInput && this.pickup) pInput.value = this.pickup.name;
            if (dInput && this.destination) dInput.value = this.destination.name;

            // Render markers & route on map
            if (this.pickup && this.destination) {
                await this.renderRouteOnMap();
            }

            // Switch to tracking view and resume polling
            this.switchView('tracking');
            this.updateTrackingUI(trip);
            this.startActiveTripPolling(trip.id);
            this.showToast(`Đang tiếp tục theo dõi chuyến xe hiện tại của bạn (#${trip.id})`, 'info', 3500);
        }
    }

    /**
     * Execute real ride booking request (Phase C.3 / P1 / P7.1)
     */

    /**
     * Request Ride Booking
     */
    async requestRideBooking() {
        const isAuthed = (typeof sessionManager !== 'undefined' && sessionManager && typeof sessionManager.isAuthenticated === 'function') ? sessionManager.isAuthenticated() : false;
        const curUser = (typeof sessionManager !== 'undefined' && sessionManager) ? (sessionManager.getUser?.() || sessionManager.getCurrentUser?.()) : null;

        if (!isAuthed || !curUser || !curUser.id) {
            if (typeof window.showNavigoModal === 'function') {
                window.showNavigoModal({
                    title: 'Yêu cầu đăng nhập',
                    message: 'Vui lòng đăng nhập hoặc đăng ký tài khoản để tiếp tục đặt chuyến xe Navigo.',
                    icon: '👤',
                    confirmText: 'Đăng nhập ngay',
                    cancelText: 'Hủy',
                    onConfirm: () => {
                        window.location.href = 'login.html?redirect=customer.html';
                    }
                });
            } else {
                this.showToast('Vui lòng đăng nhập để đặt chuyến xe Navigo.', 'warning');
                setTimeout(() => {
                    window.location.href = 'login.html?redirect=customer.html';
                }, 1200);
            }
            return;
        }

        if (this.activeTrip && ['REQUESTED', 'OFFERED', 'ACCEPTED', 'ARRIVED', 'IN_PROGRESS'].includes(this.activeTrip.status)) {
            if (typeof window.showNavigoModal === 'function') {
                window.showNavigoModal({
                    title: 'Chuyến xe đang hoạt động',
                    message: 'Bạn đang có một chuyến xe đang diễn ra. Chuyển sang màn hình theo dõi hành trình.',
                    icon: '🚗',
                    confirmText: 'Xem hành trình',
                    cancelText: 'Hủy',
                    onConfirm: () => {
                        this.switchView('tracking');
                        this.startActiveTripPolling(this.activeTrip.id);
                    }
                });
            } else {
                this.showToast('Bạn đang có một chuyến xe đang hoạt động. Đang chuyển tới màn hình theo dõi.', 'info');
                this.switchView('tracking');
                this.startActiveTripPolling(this.activeTrip.id);
            }
            return;
        }

        if (!this.pickup || !this.destination) {
            if (typeof window.showNavigoModal === 'function') {
                window.showNavigoModal({
                    title: 'Thiếu điểm hành trình',
                    message: 'Vui lòng chọn đầy đủ điểm đón và điểm đến trước khi tiến hành đặt xe Navigo.',
                    icon: '📍',
                    confirmText: 'Chọn điểm đến',
                    cancelText: 'Hủy',
                    onConfirm: () => {
                        this.switchView('search');
                    }
                });
            } else {
                this.showToast('Vui lòng chọn đầy đủ điểm đón và điểm đến trước khi đặt xe.', 'warning');
                this.switchView('search');
            }
            return;
        }

        const btnSolicitar = document.getElementById('btn-solicitar-ride');
        const btnCancelRequest = document.getElementById('btn-cancel-request-booking');
        if (btnSolicitar) {
            btnSolicitar.disabled = true;
            btnSolicitar.innerHTML = `<span class="spinner" style="display:inline-block;width:16px;height:16px;border:2px solid #fff;border-top-color:transparent;border-radius:50%;animation:spin 0.8s linear infinite;"></span> Đang gửi yêu cầu...`;
        }
        if (btnCancelRequest) {
            btnCancelRequest.style.display = 'none';
        }

        const vType = this.selectedService || 'car4';
        const vInfo = this.getVehicleDetails(vType);
        const vConfig = this.vehicleCatalog[vType] || this.vehicleCatalog.car4;
        const estDist = this.currentRouteDistance || this.calculateDirectDistance();
        const estFare = this.selectedVehicleFare || this.calculateFare(vType, estDist);

        let isWalletPaid = false;
        const currentUser = (typeof sessionManager !== 'undefined') ? (sessionManager.getUser?.() || sessionManager.getCurrentUser?.()) : null;
        let custWalletPhone = currentUser?.phone || currentUser?.id || '';

        // Check wallet balance if paymentMethod is wallet
        if (this.paymentMethod === 'wallet' && window.NaviWalletEngine) {
            const curWallet = window.NaviWalletEngine.getCurrentWallet();
            if (!curWallet || !curWallet.activated) {
                if (btnSolicitar) {
                    btnSolicitar.disabled = false;
                    btnSolicitar.innerHTML = `Xác nhận đặt ${vConfig.name} &bull; ${this.formatMoney(estFare)}`;
                }
                if (typeof window.showNavigoModal === 'function') {
                    window.showNavigoModal({
                        title: 'Kích hoạt Ví NaviPay',
                        message: 'Bạn chưa kích hoạt Ví NaviPay. Vui lòng thiết lập ví để thanh toán tự động, hoặc đổi sang Tiền mặt.',
                        icon: '💳',
                        confirmText: 'Mở Ví Navi',
                        cancelText: 'Đổi sang Tiền mặt',
                        onConfirm: () => { window.location.href = 'wallet.html'; },
                        onCancel: () => {
                            this.paymentMethod = 'cash';
                            const label = document.getElementById('current-payment-method');
                            if (label) label.textContent = 'Tiền mặt';
                            this.showToast('Đã đổi phương thức sang Tiền mặt', 'info');
                        }
                    });
                } else {
                    alert('Vui lòng kích hoạt Ví Navi trước khi đặt xe.');
                }
                return;
            }
            if ((curWallet.balance || 0) < estFare) {
                if (btnSolicitar) {
                    btnSolicitar.disabled = false;
                    btnSolicitar.innerHTML = `Xác nhận đặt ${vConfig.name} &bull; ${this.formatMoney(estFare)}`;
                }
                const curBalStr = window.formatVND ? window.formatVND(curWallet.balance) : (curWallet.balance + ' ₫');
                const fareStr = window.formatVND ? window.formatVND(estFare) : (estFare + ' ₫');
                if (typeof window.showNavigoModal === 'function') {
                    window.showNavigoModal({
                        title: 'Số dư Ví NaviPay không đủ',
                        message: `Số dư ví hiện tại là ${curBalStr}, cước chuyến đi là ${fareStr}. Bạn có muốn nạp thêm tiền qua Ngân hàng số NaviPay không?`,
                        icon: '⚠️',
                        confirmText: 'Nạp tiền Ví Navi',
                        cancelText: 'Đổi sang Tiền mặt',
                        onConfirm: () => { window.location.href = 'wallet.html'; },
                        onCancel: () => {
                            this.paymentMethod = 'cash';
                            const label = document.getElementById('current-payment-method');
                            if (label) label.textContent = 'Tiền mặt';
                            this.showToast('Đã đổi phương thức sang Tiền mặt', 'info');
                        }
                    });
                } else {
                    alert(`Số dư ví không đủ (${curBalStr}). Cần: ${fareStr}.`);
                }
                return;
            }

            custWalletPhone = curWallet.accountNumber || custWalletPhone;
            const tripTrackingId = `TRP-${Math.floor(10000 + Math.random() * 90000)}`;
            this._lastWalletTxnTripId = tripTrackingId;
            // Balance is sufficient: do NOT deduct upfront. Money is only deducted upon SUCCESSFUL completion.
            isWalletPaid = true;
        }

        const canonicalVehicleType = this.normalizeVehicleType(this.selectedService || vInfo.type || 'car4');

        const tripPayload = {
            vehicleType: canonicalVehicleType,
            vehicleTypeName: vInfo.name,
            vehicleIcon: vInfo.icon,
            pickupLat: Number(this.pickup.lat),
            pickupLon: Number(this.pickup.lng),
            pickupName: this.pickup.address || this.pickup.name || 'Điểm đón',
            dropoffLat: Number(this.destination.lat),
            dropoffLon: Number(this.destination.lng),
            dropoffName: this.destination.address || this.destination.name || 'Điểm đến',
            distanceMeters: estDist,
            fareAmount: estFare,
            originalFare: this.selectedOriginalFare || estFare,
            promoCode: this.appliedPromo ? this.appliedPromo.code : null,
            discountPercent: this.appliedPromo ? this.appliedPromo.discountPercent : 0,
            paymentMethod: this.paymentMethod || 'cash'
        };

        try {
            const res = await apiClient.requestTrip(tripPayload);
            if (res && res.data && res.data.success && res.data.trip) {
                const createdTrip = res.data.trip;
                createdTrip.pickupCoords = [Number(this.pickup.lat), Number(this.pickup.lng)];
                createdTrip.destinationCoords = [Number(this.destination.lat), Number(this.destination.lng)];
                createdTrip.pickupLat = Number(this.pickup.lat);
                createdTrip.pickupLon = Number(this.pickup.lng);
                createdTrip.dropoffLat = Number(this.destination.lat);
                createdTrip.dropoffLon = Number(this.destination.lng);
                createdTrip.pickup = {
                    name: this.pickup.name,
                    address: this.pickup.address || this.pickup.name,
                    lat: Number(this.pickup.lat),
                    lng: Number(this.pickup.lng)
                };
                createdTrip.destination = {
                    name: this.destination.name,
                    address: this.destination.address || this.destination.name,
                    lat: Number(this.destination.lat),
                    lng: Number(this.destination.lng)
                };
                createdTrip.routeGeometry = (Array.isArray(this.currentRouteGeometry) && this.currentRouteGeometry.length > 1) ? this.currentRouteGeometry : (typeof this.getStreetFollowingPath === 'function' ? this.getStreetFollowingPath(this.pickup, this.destination) : null);
                createdTrip.walletDeducted = false;
                createdTrip.paidByWallet = isWalletPaid;
                createdTrip.paymentMethod = this.paymentMethod || 'cash';
                createdTrip.customerPhone = custWalletPhone;
                createdTrip.vehicleType = canonicalVehicleType;
                createdTrip.vehicleTypeName = vInfo.name;
                createdTrip.fare = estFare;
                createdTrip.fareAmount = estFare;
                createdTrip.targetedDriverIds = ['*'];
                this.activeTrip = createdTrip;
                this.activeTripId = createdTrip.id;

                // Sync to shared admin trips
                try {
                    const adminTrips = JSON.parse(localStorage.getItem('goride_admin_trips') || '[]');
                    const currentUser = (typeof sessionManager !== 'undefined') ? (sessionManager.getUser?.() || sessionManager.getCurrentUser?.()) : null;
                    const custName = currentUser?.name || 'Khách hàng Navigo';
                    const custPhone = currentUser?.phone || '';
                    const custId = currentUser?.id || ('cust_' + Date.now());
                    createdTrip.customerName = custName;
                    createdTrip.customerPhone = custPhone;
                    createdTrip.customerId = custId;
                    createdTrip.distance = (estDist / 1000).toFixed(1);
                    createdTrip.duration = Math.max(3, Math.round(estDist / 350));
                    createdTrip.fareAmount = estFare;
                    createdTrip.pickupName = this.pickup.name || this.pickup.address;
                    createdTrip.dropoffName = this.destination.name || this.destination.address;

                    adminTrips.unshift({
                        id: createdTrip.id,
                        customerName: custName,
                        customerPhone: custPhone,
                        customerId: custId,
                        routeGeometry: createdTrip.routeGeometry,
                        driverName: createdTrip.driverName || 'Chưa gán',
                        pickup: this.pickup?.name || this.pickup?.address || 'Điểm đón',
                        pickupName: this.pickup?.name || this.pickup?.address || 'Điểm đón',
                        pickupAddress: this.pickup?.address || this.pickup?.name || 'Điểm đón',
                        destination: this.destination?.name || this.destination?.address || 'Điểm đến',
                        dropoffName: this.destination?.name || this.destination?.address || 'Điểm đến',
                        dropoffAddress: this.destination?.address || this.destination?.name || 'Điểm đến',
                        pickupCoords: [Number(this.pickup.lat), Number(this.pickup.lng)],
                        destinationCoords: [Number(this.destination.lat), Number(this.destination.lng)],
                        pickupLat: Number(this.pickup.lat),
                        pickupLon: Number(this.pickup.lng),
                        dropoffLat: Number(this.destination.lat),
                        dropoffLon: Number(this.destination.lng),
                        routeGeometry: (Array.isArray(this.currentRouteGeometry) && this.currentRouteGeometry.length > 1) ? this.currentRouteGeometry : (typeof this.getStreetFollowingPath === 'function' ? this.getStreetFollowingPath(this.pickup, this.destination) : null),
                        fare: estFare,
                        fareAmount: estFare,
                        distance: (estDist / 1000).toFixed(1),
                        duration: Math.max(3, Math.round(estDist / 350)),
                        vehicleType: canonicalVehicleType,
                        vehicleTypeName: vInfo.name,
                        status: 'requested',
                        paymentMethod: this.paymentMethod || 'cash',
                        paidByWallet: isWalletPaid,
                        walletDeducted: false,
                        targetedDriverIds: ['*'],
                        createdAt: new Date().toISOString()
                    });
                    localStorage.setItem('goride_admin_trips', JSON.stringify(adminTrips));
                    localStorage.setItem('goride_pending_trip_offers', JSON.stringify([createdTrip]));
                    localStorage.setItem('goride_last_trip_event', JSON.stringify({ id: createdTrip.id, time: Date.now() }));
                    localStorage.setItem('goride_active_trip', JSON.stringify({
                        id: createdTrip.id,
                        status: (createdTrip.status || 'REQUESTED').toUpperCase(),
                        customerName: custName,
                        customerPhone: custPhone,
                        driverName: createdTrip.driverName || 'Chưa gán',
                        licensePlate: createdTrip.licensePlate || '',
                        vehicleModel: createdTrip.vehicleModel || '',
                        driverRating: createdTrip.driverRating || '5.0',
                        paymentMethod: this.paymentMethod || 'cash',
                        paidByWallet: isWalletPaid,
                        walletDeducted: false,
                        pickup: {
                            name: this.pickup.name,
                            address: this.pickup.address || this.pickup.name,
                            lat: Number(this.pickup.lat),
                            lng: Number(this.pickup.lng)
                        },
                        destination: {
                            name: this.destination.name,
                            address: this.destination.address || this.destination.name,
                            lat: Number(this.destination.lat),
                            lng: Number(this.destination.lng)
                        },
                        fareAmount: estFare,
                        distanceMeters: estDist,
                        vehicleType: canonicalVehicleType,
                        routeGeometry: createdTrip.routeGeometry,
                        targetedDriverIds: ['*'],
                        createdAt: new Date().toISOString()
                    }));
                } catch (e) {}

                // Broadcast to Firebase Realtime Cloud for instant cross-device sync
                if (typeof realtimeSync !== 'undefined') {
                    realtimeSync.createTrip(createdTrip);
                }

                // Immediately switch to tracking view (hide vehicle selection screen)
                this.switchView('tracking');
                this.showRadarAtPickup(Number(this.pickup.lat), Number(this.pickup.lng));
                this.updateTrackingUI(createdTrip);
                this.startActiveTripPolling(createdTrip.id);
                this.initiateDriverDispatch(createdTrip, vType, this.pickup.lat, this.pickup.lng);
                this.showToast('Yêu cầu đặt xe thành công! Đang phát tín hiệu tìm tài xế gần nhất...', 'success');
                if (typeof navigoNotifications !== 'undefined') {
                    navigoNotifications.addNotification({
                        id: 'trip_req_' + createdTrip.id,
                        category: 'trips',
                        title: 'ĐÃ ĐẶT CHUYẾN XE #' + createdTrip.id,
                        body: 'Điểm đón: ' + (this.pickup.name || this.pickup.address) + ' → Điểm đến: ' + (this.destination.name || this.destination.address) + '. Giá cước dự kiến: ' + this.formatMoney(estFare) + '. Hệ thống đang điều phối xe gần bạn nhất.',
                        icon: '🚗',
                        actionUrl: 'customer.html',
                        actionText: 'Theo dõi chuyến'
                    });
                }
                return;
            } else {
                throw new Error(res?.data?.error || 'Không thể tạo yêu cầu chuyến đi.');
            }
        } catch (err) {
            console.error('[CustomerApp] Ride booking fallback notice:', err);

            if (err.status === 409) {
                if (isWalletPaid && window.NaviWalletEngine && this.activeTrip?.walletDeducted === true) {
                    try { window.NaviWalletEngine.refundTrip(custWalletPhone, estFare, 'ERR_409', 'Chuyến xe đang hoạt động'); } catch (e) {}
                }
                if (btnCancelRequest) btnCancelRequest.style.display = 'none';
                this.showToast('Bạn đang có một chuyến xe đang hoạt động. Chuyển sang màn hình theo dõi...', 'info');
                await this.checkActiveTripOnLoad();
                this.switchView('tracking');
                return;
            }

            if (err.status === 422) {
                if (isWalletPaid && window.NaviWalletEngine && this.activeTrip?.walletDeducted === true) {
                    try { window.NaviWalletEngine.refundTrip(custWalletPhone, estFare, 'ERR_422', 'Tọa độ ngoài phạm vi mạng lưới'); } catch (e) {}
                }
                if (btnSolicitar) {
                    btnSolicitar.disabled = false;
                    btnSolicitar.innerHTML = `Xác nhận đặt ${vConfig.name} &bull; ${this.formatMoney(estFare)}`;
                }
                if (btnCancelRequest) btnCancelRequest.style.display = 'none';
                this.showToast('Tọa độ đón/trả nằm ngoài phạm vi mạng lưới OSM. Vui lòng chọn điểm khác.', 'error', 5000);
                return;
            }

            // Real unified sync for offline / web preview / cross-tab driver testing
            this.showToast('Đang phát tín hiệu tìm tài xế gần bạn nhất...', 'info');
            const currentUser = (typeof sessionManager !== 'undefined') ? (sessionManager.getUser?.() || sessionManager.getCurrentUser?.()) : null;
            if (!currentUser || !currentUser.id) {
                if (btnSolicitar) {
                    btnSolicitar.disabled = false;
                    btnSolicitar.innerHTML = `Xác nhận đặt ${vConfig.name} &bull; ${this.formatMoney(estFare)}`;
                }
                return;
            }

            const offlineTrip = {
                id: this._lastWalletTxnTripId || `TRP-${Math.floor(10000 + Math.random() * 90000)}`,
                status: 'REQUESTED',
                customerName: currentUser?.name || 'Khách hàng Navigo',
                customerPhone: currentUser?.phone || '',
                customerId: currentUser?.id || ('cust_' + Date.now()),
                driverName: null,
                licensePlate: '',
                vehicleModel: '',
                driverRating: '5.0',
                driverLat: null,
                driverLon: null,
                pickupName: this.pickup.name,
                dropoffName: this.destination.name,
                pickupLat: Number(this.pickup.lat),
                pickupLon: Number(this.pickup.lng),
                dropoffLat: Number(this.destination.lat),
                dropoffLon: Number(this.destination.lng),
                pickupCoords: [Number(this.pickup.lat), Number(this.pickup.lng)],
                destinationCoords: [Number(this.destination.lat), Number(this.destination.lng)],
                targetedDriverIds: ['*'],
                pickup: {
                    name: this.pickup.name,
                    address: this.pickup.address || this.pickup.name,
                    lat: Number(this.pickup.lat),
                    lng: Number(this.pickup.lng)
                },
                destination: {
                    name: this.destination.name,
                    address: this.destination.address || this.destination.name,
                    lat: Number(this.destination.lat),
                    lng: Number(this.destination.lng)
                },
                fareAmount: estFare,
                originalFare: this.selectedOriginalFare || estFare,
                promoCode: this.appliedPromo ? this.appliedPromo.code : null,
                discountPercent: this.appliedPromo ? this.appliedPromo.discountPercent : 0,
                distanceMeters: estDist,
                distance: (estDist / 1000).toFixed(1),
                duration: Math.max(3, Math.round(estDist / 350)),
                customerId: currentUser?.id || 'cust_01',
                vehicleType: canonicalVehicleType,
                vehicleTypeName: vInfo.name,
                vehicleIcon: vInfo.icon,
                walletDeducted: false,
                paidByWallet: isWalletPaid,
                paymentMethod: this.paymentMethod || 'cash',
                customerPhone: custWalletPhone,
                routeGeometry: (Array.isArray(this.currentRouteGeometry) && this.currentRouteGeometry.length > 1) ? this.currentRouteGeometry : (typeof this.getStreetFollowingPath === 'function' ? this.getStreetFollowingPath(this.pickup, this.destination) : null),
                fare: estFare
            };

            // Sync immediately to goride_admin_trips so Driver tab detects it instantly!
            try {
                const adminTrips = JSON.parse(localStorage.getItem('goride_admin_trips') || '[]');
                adminTrips.unshift({
                    id: offlineTrip.id,
                    customerName: offlineTrip.customerName,
                    customerPhone: offlineTrip.customerPhone,
                    routeGeometry: offlineTrip.routeGeometry,
                    driverName: 'Chưa gán',
                    pickup: offlineTrip.pickupName,
                    destination: offlineTrip.dropoffName,
                    pickupCoords: [Number(this.pickup.lat), Number(this.pickup.lng)],
                    destinationCoords: [Number(this.destination.lat), Number(this.destination.lng)],
                    pickupLat: Number(this.pickup.lat),
                    pickupLon: Number(this.pickup.lng),
                    dropoffLat: Number(this.destination.lat),
                    dropoffLon: Number(this.destination.lng),
                    routeGeometry: (Array.isArray(this.currentRouteGeometry) && this.currentRouteGeometry.length > 1) ? this.currentRouteGeometry : (typeof this.getStreetFollowingPath === 'function' ? this.getStreetFollowingPath(this.pickup, this.destination) : null),
                    fare: estFare,
                    fareAmount: estFare,
                    distance: (estDist / 1000).toFixed(1),
                    vehicleType: canonicalVehicleType,
                    vehicleTypeName: vInfo.name,
                    status: 'requested',
                    paymentMethod: this.paymentMethod || 'cash',
                    paidByWallet: isWalletPaid,
                    walletDeducted: false,
                    targetedDriverIds: ['*'],
                    createdAt: new Date().toISOString()
                });
                localStorage.setItem('goride_admin_trips', JSON.stringify(adminTrips));
                localStorage.setItem('goride_pending_trip_offers', JSON.stringify([offlineTrip]));
                localStorage.setItem('goride_last_trip_event', JSON.stringify({ id: offlineTrip.id, time: Date.now() }));
                localStorage.setItem('goride_active_trip', JSON.stringify({
                    id: offlineTrip.id,
                    status: 'REQUESTED',
                    customerName: offlineTrip.customerName,
                    customerPhone: offlineTrip.customerPhone,
                    routeGeometry: offlineTrip.routeGeometry,
                    driverName: null,
                    licensePlate: '',
                    vehicleModel: '',
                    driverRating: '5.0',
                    driverLat: null,
                    driverLon: null,
                    paymentMethod: this.paymentMethod || 'cash',
                    paidByWallet: isWalletPaid,
                    walletDeducted: false,
                    pickup: {
                        name: this.pickup.name,
                        address: this.pickup.address || this.pickup.name,
                        lat: Number(this.pickup.lat),
                        lng: Number(this.pickup.lng)
                    },
                    destination: {
                        name: this.destination.name,
                        address: this.destination.address || this.destination.name,
                        lat: Number(this.destination.lat),
                        lng: Number(this.destination.lng)
                    },
                    fareAmount: estFare,
                    distanceMeters: estDist,
                    vehicleType: canonicalVehicleType,
                    vehicleTypeName: vInfo.name,
                    vehicleIcon: vInfo.icon,
                    walletDeducted: false,
                    paidByWallet: isWalletPaid,
                    customerPhone: custWalletPhone,
                    targetedDriverIds: ['*'],
                    createdAt: new Date().toISOString()
                }));
            } catch (e) {}

            this.activeTrip = offlineTrip;
            this.activeTripId = offlineTrip.id;

            // Broadcast to Firebase Realtime Cloud for instant cross-device sync
            if (typeof realtimeSync !== 'undefined') {
                realtimeSync.createTrip(offlineTrip);
            }

            // Immediately switch to tracking view and show waiting screen
            this.switchView('tracking');
            this.showRadarAtPickup(Number(this.pickup.lat), Number(this.pickup.lng));
            this.updateTrackingUI(offlineTrip);
            this.startActiveTripPolling(offlineTrip.id);
            this.initiateDriverDispatch(offlineTrip, canonicalVehicleType, this.pickup.lat, this.pickup.lng);
            if (typeof navigoNotifications !== 'undefined') {
                navigoNotifications.addNotification({
                    id: 'trip_req_' + offlineTrip.id,
                    category: 'trips',
                    title: 'ĐÃ ĐẶT CHUYẾN XE #' + offlineTrip.id,
                    body: 'Điểm đón: ' + (this.pickup.name || this.pickup.address) + ' → Điểm đến: ' + (this.destination.name || this.destination.address) + '. Giá cước dự kiến: ' + this.formatMoney(estFare) + '. Hệ thống đang điều phối xe gần bạn nhất.',
                    icon: '🚗',
                    actionUrl: 'customer.html',
                    actionText: 'Theo dõi chuyến'
                });
            }

            this.simulationTimers = [];
            return;
        }
    }

    /**
     * Haversine distance calculator between two coordinates (in km)
     */
    calculateDistanceKm(lat1, lon1, lat2, lon2) {
        if (!lat1 || !lon1 || !lat2 || !lon2) return 999999;
        const R = 6371; // km
        const dLat = (Number(lat2) - Number(lat1)) * Math.PI / 180;
        const dLon = (Number(lon2) - Number(lon1)) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(Number(lat1) * Math.PI / 180) * Math.cos(Number(lat2) * Math.PI / 180) *
                  Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    /**
     * Intelligent Progressive Driver Dispatch Algorithm:
     * - Default: Select 2 online drivers closest to the pickup point.
     * - If neither accepts within 30s, expand to 4 closest drivers.
     * - Further expand if unaccepted, but NEVER select drivers > 15km from pickup point.
     * - Auto cancel trip if unaccepted after 15 minutes.
     * @param {Object} trip 
     * @param {string} vType 
     * @param {number} pickupLat 
     * @param {number} pickupLng 
     */
    async initiateDriverDispatch(trip, vType, pickupLat, pickupLng) {
        if (!trip || !trip.id) return;

        // Clear existing dispatch expansion timers
        if (this.dispatchExpandTimers && Array.isArray(this.dispatchExpandTimers)) {
            this.dispatchExpandTimers.forEach(t => clearTimeout(t));
        }
        this.dispatchExpandTimers = [];

        if (!trip.createdAt) {
            trip.createdAt = new Date().toISOString();
        }

        const pLat = Number(pickupLat);
        const pLng = Number(pickupLng);

        // Helper: Quét toàn bộ tài xế đang trực tuyến từ LocalStorage & Firebase Realtime Cloud
        const fetchEligibleDrivers = async () => {
            let driversList = [];
            try {
                const rawOnline = localStorage.getItem('goride_online_drivers');
                if (rawOnline) {
                    const parsed = JSON.parse(rawOnline);
                    if (Array.isArray(parsed)) driversList.push(...parsed);
                    else if (typeof parsed === 'object') driversList.push(...Object.values(parsed));
                }
            } catch (e) {}

            try {
                const rawAdminDrivers = localStorage.getItem('goride_admin_drivers');
                if (rawAdminDrivers) {
                    const parsed = JSON.parse(rawAdminDrivers);
                    if (Array.isArray(parsed)) {
                        parsed.forEach(ad => {
                            if (!driversList.some(d => d.id === ad.id || (ad.phone && d.phone === ad.phone))) {
                                driversList.push(ad);
                            }
                        });
                    }
                }
            } catch (e) {}

            // Truy vấn Firebase Realtime Cloud (Đa thiết bị)
            if (typeof realtimeSync !== 'undefined') {
                if (realtimeSync.isAvailable()) {
                    try {
                        const snap = await realtimeSync.db.ref('goride_online_drivers').once('value');
                        const val = snap.val() || {};
                        Object.values(val).forEach(fd => {
                            if (fd && !driversList.some(d => d.id === fd.id || (fd.phone && d.phone === fd.phone))) {
                                driversList.push(fd);
                            }
                        });
                    } catch (e) {}
                } else if (typeof realtimeSync._restGet === 'function') {
                    try {
                        const val = await realtimeSync._restGet('goride_online_drivers') || {};
                        Object.values(val).forEach(fd => {
                            if (fd && !driversList.some(d => d.id === fd.id || (fd.phone && d.phone === fd.phone))) {
                                driversList.push(fd);
                            }
                        });
                    } catch (e) {}
                }
            }

            // Lọc tài xế hợp lệ: Đang online, khớp loại xe, tọa độ chuẩn xác, BÁN KÍNH <= 15KM
            const eligible = driversList.filter(d => {
                if (!d) return false;
                if (d.isOnline === false) return false;
                const tripVType = this.normalizeVehicleType(vType || trip.vehicleType);
                const drvVType = this.normalizeVehicleType(d.vehicleType || d.vehicle?.type || d.type);
                if (tripVType !== drvVType) return false;
                const dLat = Number(d.lat || (d.location && d.location.lat));
                const dLng = Number(d.lng || (d.location && d.location.lng));
                if (isNaN(dLat) || isNaN(dLng) || (dLat === 0 && dLng === 0)) return false;

                const distKm = this.calculateDistanceKm(pLat, pLng, dLat, dLng);
                d._distToPickup = distKm;

                // RÀNG BUỘC CỨNG: Nếu tài xế xa hơn điểm đón khách 15km thì tài xế đó TUYỆT ĐỐI không nhận được thông tin cuốc xe này
                return distKm <= 15;
            });

            // Sắp xếp tăng dần theo khoảng cách tới điểm đón (GẦN NHẤT ĐỨNG ĐẦU TIÊN)
            eligible.sort((a, b) => (a._distToPickup || 0) - (b._distToPickup || 0));
            return eligible;
        };

        const updateTripTargets = (targetedIds) => {
            trip.targetedDriverIds = targetedIds;
            trip.pickupCoords = [pLat, pLng];
            trip.pickupLat = pLat;
            trip.pickupLon = pLng;

            try {
                const active = JSON.parse(localStorage.getItem('goride_active_trip') || '{}');
                if (active && active.id === trip.id) {
                    active.targetedDriverIds = targetedIds;
                    active.pickupCoords = [pLat, pLng];
                    active.pickupLat = pLat;
                    active.pickupLon = pLng;
                    localStorage.setItem('goride_active_trip', JSON.stringify(active));
                }
            } catch (e) {}

            try {
                localStorage.setItem('goride_pending_trip_offers', JSON.stringify([trip]));
            } catch (e) {}

            try {
                const adminTrips = JSON.parse(localStorage.getItem('goride_admin_trips') || '[]');
                const at = adminTrips.find(t => t.id === trip.id);
                if (at) {
                    at.targetedDriverIds = targetedIds;
                    at.pickupCoords = [pLat, pLng];
                    at.pickupLat = pLat;
                    at.pickupLon = pLng;
                    localStorage.setItem('goride_admin_trips', JSON.stringify(adminTrips));
                }
            } catch (e) {}

            if (typeof realtimeSync !== 'undefined') {
                const patchData = {
                    targetedDriverIds: targetedIds,
                    pickupCoords: [pLat, pLng],
                    pickupLat: pLat,
                    pickupLon: pLng
                };
                if (realtimeSync.isAvailable()) {
                    realtimeSync.db.ref(`goride_active_offers/${trip.id}`).update(patchData);
                    realtimeSync.db.ref(`goride_trips/${trip.id}`).update(patchData);
                } else if (typeof realtimeSync._restPatch === 'function') {
                    realtimeSync._restPatch(`goride_active_offers/${trip.id}`, patchData);
                    realtimeSync._restPatch(`goride_trips/${trip.id}`, patchData);
                }
            }
        };

        const initialEligible = await fetchEligibleDrivers();

        // Luôn phát sóng tới các tài xế trực tuyến có cùng loại xe trong bán kính hoạt động
        const targetedIdsPhase1 = ['*', ...initialEligible.map(d => d.id || d.phone || d.name)];
        updateTripTargets(targetedIdsPhase1);

        if (initialEligible.length === 0) {
            const statusText = document.getElementById('tracking-status-text');
            if (statusText) {
                statusText.textContent = 'Đang phát tín hiệu tìm xe gần bạn nhất...';
            }
        }

        // Giai đoạn 2 (30s): Mở rộng tới 4 tài xế gần nhất trong bán kính <= 15km
        const timerPhase2 = setTimeout(async () => {
            if (this.activeTrip && this.activeTrip.id === trip.id && (this.activeTrip.status === 'REQUESTED' || this.activeTrip.status === 'OFFERED')) {
                const refreshedEligible = await fetchEligibleDrivers();
                if (refreshedEligible.length > 0) {
                    const phase2Drivers = refreshedEligible.slice(0, 4);
                    const targetedIdsPhase2 = phase2Drivers.map(d => d.id || d.phone || d.name);
                    updateTripTargets(targetedIdsPhase2);
                    this.showToast('Hệ thống đang mở rộng phát tín hiệu tới 4 tài xế gần bạn nhất (trong 15km)...', 'info', 3500);
                } else {
                    updateTripTargets([]);
                }
            }
        }, 30000);
        this.dispatchExpandTimers.push(timerPhase2);

        // Giai đoạn 3 (60s): Mở rộng tới TOÀN BỘ tài xế trực tuyến trong bán kính <= 15km
        const timerPhase3 = setTimeout(async () => {
            if (this.activeTrip && this.activeTrip.id === trip.id && (this.activeTrip.status === 'REQUESTED' || this.activeTrip.status === 'OFFERED')) {
                const refreshedEligible = await fetchEligibleDrivers();
                if (refreshedEligible.length > 0) {
                    const targetedIdsPhase3 = refreshedEligible.map(d => d.id || d.phone || d.name);
                    updateTripTargets(targetedIdsPhase3);
                    this.showToast('Đang phát tín hiệu tới toàn bộ tài xế trong bán kính 15km...', 'info', 3500);
                } else {
                    updateTripTargets([]);
                }
            }
        }, 60000);
        this.dispatchExpandTimers.push(timerPhase3);

        // Tự động quét lại định kỳ mỗi 12s nếu hiện tại chưa có tài xế trong 15km nhận
        const periodicRescan = setInterval(async () => {
            if (!this.activeTrip || this.activeTrip.id !== trip.id || (this.activeTrip.status !== 'REQUESTED' && this.activeTrip.status !== 'OFFERED')) {
                clearInterval(periodicRescan);
                return;
            }
            if (!trip.targetedDriverIds || trip.targetedDriverIds.length === 0) {
                const currentEligible = await fetchEligibleDrivers();
                if (currentEligible.length > 0) {
                    const newPhase = currentEligible.slice(0, 2);
                    updateTripTargets(newPhase.map(d => d.id || d.phone || d.name));
                    const statusText = document.getElementById('tracking-status-text');
                    if (statusText) statusText.textContent = 'Đã tìm thấy tài xế trong phạm vi 15km! Đang gửi tín hiệu...';
                    this.showToast('Đã phát hiện tài xế trong bán kính 15km, đang gửi yêu cầu...', 'info', 3000);
                }
            }
        }, 12000);
        this.dispatchExpandTimers.push(periodicRescan);

        // TỰ ĐỘNG HỦY SAU 15 PHÚT (15 * 60 * 1000 ms) nếu không có tài xế nhận cuốc và khách hàng không nhấn hủy
        // Sau 15 phút sẽ tự động hủy cuốc và không gửi thông báo đến tài xế nào khác hết
        const autoCancel15MinTimer = setTimeout(() => {
            if (this.activeTrip && this.activeTrip.id === trip.id) {
                const s = (this.activeTrip.status || '').toUpperCase();
                if (s === 'REQUESTED' || s === 'OFFERED') {
                    updateTripTargets([]);
                    this.cancelPendingBooking('Tự động hủy do hết 15 phút không có tài xế nhận cuốc');
                }
            }
        }, 15 * 60 * 1000);
        this.dispatchExpandTimers.push(autoCancel15MinTimer);
    }

    /**
     * Cancel pending booking request (When searching or before in-progress)
     */
    cancelPendingBooking(reason = 'Khách hàng hủy khi đang tìm xe') {
        // Clear dispatch expansion timers
        if (this.dispatchExpandTimers && Array.isArray(this.dispatchExpandTimers)) {
            this.dispatchExpandTimers.forEach(t => clearTimeout(t));
            this.dispatchExpandTimers = [];
        }

        // 1. Clear any active progression timers
        if (Array.isArray(this.simulationTimers)) {
            this.simulationTimers.forEach(t => clearTimeout(t));
            this.simulationTimers = [];
        }

        // 2. Cancel backend / storage trip
        const tripId = this.activeTripId || (this.activeTrip && this.activeTrip.id);
        if (tripId) {
            // Save to account-isolated trip history
            this.saveUserTrip({
                id: tripId,
                status: 'cancelled',
                cancelReason: reason,
                pickup: this.pickup,
                destination: this.destination,
                fare: this.selectedVehicleFare || 45000,
                vehicleType: this.selectedService || 'car4'
            });

            if (typeof apiClient !== 'undefined') {
                apiClient.cancelTrip(tripId, reason).catch(() => {});
            }
            if (typeof realtimeSync !== 'undefined') {
                realtimeSync.updateTripStatus(tripId, 'CANCELLED');
                if (realtimeSync.isAvailable()) {
                    realtimeSync.db.ref(`goride_active_offers/${tripId}`).remove();
                } else if (typeof realtimeSync._restDelete === 'function') {
                    realtimeSync._restDelete(`goride_active_offers/${tripId}`);
                }
            }
            try {
                const adminTrips = JSON.parse(localStorage.getItem('goride_admin_trips') || '[]');
                const idx = adminTrips.findIndex(t => t.id === tripId);
                if (idx !== -1) {
                    adminTrips[idx].status = 'cancelled';
                    adminTrips[idx].cancelReason = reason;
                    adminTrips[idx].targetedDriverIds = [];
                    localStorage.setItem('goride_admin_trips', JSON.stringify(adminTrips));
                }
                localStorage.removeItem('goride_pending_trip_offers');

                // Broadcast instant cancellation signal to any listening driver portals
                localStorage.setItem('goride_trip_cancelled_event', JSON.stringify({
                    tripId: tripId,
                    timestamp: Date.now(),
                    reason: reason
                }));
                // Refund fare to customer wallet ONLY if trip was actually deducted before
                if (window.NaviWalletEngine && this.activeTrip && this.activeTrip.walletDeducted === true) {
                    const curUser = (typeof sessionManager !== 'undefined') ? (sessionManager.getUser?.() || sessionManager.getCurrentUser?.()) : null;
                    const refundPhone = this.activeTrip.customerPhone || curUser?.phone || curUser?.id || '';
                    const refundFare = Number(this.activeTrip.fareAmount || this.activeTrip.fare || this.selectedVehicleFare || 0);
                    if (refundFare > 0 && refundPhone) {
                        try {
                            window.NaviWalletEngine.refundTrip(refundPhone, refundFare, tripId, reason);
                        } catch (refErr) {
                            console.warn('[CustomerApp] Wallet refund notice:', refErr);
                        }
                    }
                }
            } catch (e) {}

            if (typeof navigoNotifications !== 'undefined' && tripId) {
                navigoNotifications.addNotification({
                    id: 'trip_cnc_' + tripId + '_' + Date.now(),
                    category: 'trips',
                    title: 'ĐÃ HỦY CHUYẾN XE #' + tripId,
                    body: reason.includes('15') ? 'Hết thời gian chờ 15 phút không có tài xế nhận. Cuốc xe đã tự động hủy.' : ('Bạn đã hủy yêu cầu chuyến xe #' + tripId + '. Bạn có thể đặt lại chuyến bất kỳ lúc nào.'),
                    icon: '🛑',
                    actionUrl: 'customer.html',
                    actionText: 'Đặt chuyến mới'
                });
            }
        }

        // 3. Clear active state & intervals
        this.activeTrip = null;
        this.activeTripId = null;
        if (this.mapController && typeof this.mapController.setTripActive === 'function') {
            this.mapController.setTripActive(false);
        }
        this._latestDriverPosition = null;
        this._lastApproachDriverPos = null;
        this._hasDrawnApproachLine = false;
        this._hasDrawnApproachRoute = false;
        this._hasFittedApproachBounds = false;
        this._hasEnsuredTripRoute = false;
        this._hasRestoredArrivedRoute = false;
        this._hasFittedArrivedBounds = false;
        try {
            localStorage.removeItem('goride_active_trip');
        } catch (e) {}
        if (this.trackingInterval) {
            clearInterval(this.trackingInterval);
            this.trackingInterval = null;
        }
        this.hideRadar();

        const searchingPanel = document.getElementById('tracking-searching-panel');
        if (searchingPanel) searchingPanel.style.display = 'none';

        // 4. Reset Solicitar button & Cancel button
        const btnSolicitar = document.getElementById('btn-solicitar-ride');
        const btnCancelRequest = document.getElementById('btn-cancel-request-booking');
        if (btnSolicitar) {
            btnSolicitar.disabled = false;
            const vType = this.selectedService || 'car4';
            const vConfig = this.vehicleCatalog[vType] || this.vehicleCatalog.car4;
            const estFare = this.selectedVehicleFare || 45000;
            btnSolicitar.innerHTML = `<span id="solicitar-text">Xác nhận đặt ${vConfig.name} &bull; ${this.formatMoney(estFare)}</span>`;
        }
        if (btnCancelRequest) {
            btnCancelRequest.style.display = 'none';
        }

        // 5. If user was on tracking view, return to vehicle-select
        if (this.currentView === 'tracking') {
            this.switchView('vehicle-select');
        }

        this.updatePersistentBanner();
        if (reason && reason.includes('15')) {
            this.showToast('Đã hết thời gian chờ (15 phút) mà chưa có tài xế nhận cuốc. Hệ thống đã tự động hủy yêu cầu.', 'warning', 6000);
        } else {
            this.showToast('Đã hủy yêu cầu đặt xe thành công. Bạn có thể chọn loại xe khác hoặc đặt lại bất cứ lúc nào.', 'info', 4000);
        }
    }

    /**
     * Start live polling of active trip from C++ backend or shared storage dispatch
     */
    startActiveTripPolling(tripId) {
        if (this.mapController && typeof this.mapController.setTripActive === 'function') {
            this.mapController.setTripActive(true);
        }

        if (this.trackingInterval) {
            clearInterval(this.trackingInterval);
            this.trackingInterval = null;
        }

        // 1. Firebase Realtime Cloud Listener (Instant push between devices)
        if (typeof realtimeSync !== 'undefined') {
            if (this.realtimeTripUnsub) {
                this.realtimeTripUnsub();
                this.realtimeTripUnsub = null;
            }
            this.realtimeTripUnsub = realtimeSync.listenTrip(tripId, (cloudTrip) => {
                if (cloudTrip && cloudTrip.status) {
                    const prevStatus = this.activeTrip ? this.activeTrip.status : 'REQUESTED';
                    this.activeTrip = { ...this.activeTrip, ...cloudTrip };
                    this.activeTripId = cloudTrip.id;

                    const cLat = Number(cloudTrip.driverLocation?.lat || cloudTrip.driverLat);
                    const cLng = Number(cloudTrip.driverLocation?.lng || cloudTrip.driverLon || cloudTrip.driverLng);
                    const cHeading = Number(cloudTrip.driverLocation?.heading || cloudTrip.driverHeading || 0);

                    if (!isNaN(cLat) && !isNaN(cLng) && cLat !== 0 && cLng !== 0) {
                        this._latestDriverPosition = {
                            lat: cLat,
                            lng: cLng,
                            heading: cHeading,
                            timestamp: Date.now()
                        };
                        this.activeTrip.driverLat = cLat;
                        this.activeTrip.driverLon = cLng;
                        this.activeTrip.driverLng = cLng;
                        this.activeTrip.driverHeading = cHeading;
                    } else if (this._latestDriverPosition) {
                        this.activeTrip.driverLat = this._latestDriverPosition.lat;
                        this.activeTrip.driverLon = this._latestDriverPosition.lng;
                        this.activeTrip.driverLng = this._latestDriverPosition.lng;
                        this.activeTrip.driverHeading = this._latestDriverPosition.heading;
                    }

                    // CRITICAL: Synchronize cloud status immediately into local storage so local interval never reads stale 'requested'
                    try {
                        const adminTrips = JSON.parse(localStorage.getItem('goride_admin_trips') || '[]');
                        const idx = adminTrips.findIndex(x => x.id === tripId);
                        if (idx !== -1) {
                            adminTrips[idx].status = (cloudTrip.status || 'requested').toLowerCase();
                            if (cloudTrip.driverName && cloudTrip.driverName !== 'Chưa gán') adminTrips[idx].driverName = cloudTrip.driverName;
                            if (cloudTrip.licensePlate) adminTrips[idx].licensePlate = cloudTrip.licensePlate;
                            if (cloudTrip.vehicleModel) adminTrips[idx].vehicleModel = cloudTrip.vehicleModel;
                            if (cloudTrip.vehicleType) adminTrips[idx].vehicleType = cloudTrip.vehicleType;
                            if (cloudTrip.driverLat) adminTrips[idx].driverLat = cloudTrip.driverLat;
                            if (cloudTrip.driverLon || cloudTrip.driverLng) adminTrips[idx].driverLon = cloudTrip.driverLon || cloudTrip.driverLng;
                            localStorage.setItem('goride_admin_trips', JSON.stringify(adminTrips));
                        }
                        const act = JSON.parse(localStorage.getItem('goride_active_trip') || '{}');
                        if (act.id === tripId) {
                            act.status = (cloudTrip.status || 'REQUESTED').toUpperCase();
                            if (cloudTrip.driverName && cloudTrip.driverName !== 'Chưa gán') act.driverName = cloudTrip.driverName;
                            if (cloudTrip.licensePlate) act.licensePlate = cloudTrip.licensePlate;
                            if (cloudTrip.vehicleModel) act.vehicleModel = cloudTrip.vehicleModel;
                            if (cloudTrip.vehicleType) act.vehicleType = cloudTrip.vehicleType;
                            if (cloudTrip.driverLat) act.driverLat = cloudTrip.driverLat;
                            if (cloudTrip.driverLon || cloudTrip.driverLng) act.driverLon = cloudTrip.driverLon || cloudTrip.driverLng;
                            localStorage.setItem('goride_active_trip', JSON.stringify(act));
                        }
                    } catch (e) {}

                    this.updateTrackingUI(this.activeTrip);

                    if (prevStatus === 'REQUESTED' && (cloudTrip.status === 'ACCEPTED' || cloudTrip.status === 'ARRIVED')) {
                        this.showToast(`Tài xế ${cloudTrip.driverName || 'đối tác'} đã nhận chuyến! Đang đến đón bạn.`, 'success', 5000);
                        if (typeof navigoNotifications !== 'undefined') {
                            const notifVType = this.resolveTripVehicleType(cloudTrip);
                            const notifDetails = this.getVehicleDetails(notifVType);
                            navigoNotifications.addNotification({
                                id: 'trip_acc_' + (cloudTrip.id || this.activeTripId),
                                category: 'trips',
                                title: 'TÀI XẾ ĐÃ NHẬN CHUYẾN #' + (cloudTrip.id || this.activeTripId),
                                body: 'Tài xế ' + (cloudTrip.driverName || 'đối tác') + ' (' + (cloudTrip.licensePlate || 'Xe thuần điện') + ') đã nhận chuyến và đang di chuyển tới điểm đón bạn.',
                                icon: notifDetails.icon || '🚗',
                                actionUrl: 'customer.html',
                                actionText: 'Xem tài xế'
                            });
                        }
                    } else if (prevStatus === 'ACCEPTED' && cloudTrip.status === 'ARRIVED') {
                        this.showToast('Tài xế đã có mặt tại điểm đón! Xin vui lòng ra xe.', 'info', 4500);
                    } else if (prevStatus === 'ARRIVED' && cloudTrip.status === 'IN_PROGRESS') {
                        this.showToast('Chuyến xe bắt đầu lăn bánh...', 'info', 4000);
                    } else if (cloudTrip.status === 'COMPLETED') {
                        if (this.trackingInterval) {
                            clearInterval(this.trackingInterval);
                            this.trackingInterval = null;
                        }
                        if (this.realtimeTripUnsub) {
                            this.realtimeTripUnsub();
                            this.realtimeTripUnsub = null;
                        }
                        this.completeTrip(this.activeTrip);
                    } else if (cloudTrip.status === 'CANCELLED') {
                        this.cancelPendingBooking();
                    }

                    // Tự động hủy nếu đã quá 15 phút mà không có tài xế nhận
                    let cCreatedAt = cloudTrip.createdAt ? new Date(cloudTrip.createdAt).getTime() : 0;
                    if (cCreatedAt > 0 && (cloudTrip.status === 'REQUESTED' || cloudTrip.status === 'OFFERED') && (Date.now() - cCreatedAt >= 15 * 60 * 1000)) {
                        this.cancelPendingBooking('Tự động hủy do hết 15 phút không có tài xế nhận cuốc');
                        return;
                    }
                }
            });
        }

        if (!this._storageTripListenerAttached) {
            this._storageTripListenerAttached = true;
            window.addEventListener('storage', (e) => {
                if (e.key === 'goride_trip_arrived_event') {
                    try {
                        const arrEv = JSON.parse(e.newValue || '{}');
                        if (this.activeTrip && String(this.activeTrip.id) === String(arrEv.tripId)) {
                            this.activeTrip.status = 'ARRIVED';
                            this.showToast('🔔 Tài xế đã có mặt tại điểm hẹn đón! Xin vui lòng ra xe.', 'warning', 6000);
                            this.updateTrackingUI(this.activeTrip);
                        }
                    } catch(err) {}
                }
            });
        }

        let pollCount = 0;
        this.trackingInterval = setInterval(async () => {
            pollCount++;
            try {
                let currentTrip = null;

                // 1. Try Live C++ Backend API
                if (typeof apiClient !== 'undefined') {
                    try {
                        const res = await apiClient.getActiveTrip();
                        if (res && res.data && res.data.has_active_trip && res.data.trip) {
                            currentTrip = res.data.trip;
                        }
                    } catch (e) {}
                }

                // 2. Real-time shared storage sync (cross-tab with Driver portal)
                if (!currentTrip) {
                    try {
                        const adminTrips = JSON.parse(localStorage.getItem('goride_admin_trips') || '[]');
                        const t = adminTrips.find(x => x.id === tripId);
                        if (t) {
                            currentTrip = {
                                id: t.id,
                                status: (t.status || 'requested').toUpperCase(),
                                customerName: t.customerName || 'Khách hàng',
                                driverName: t.driverName !== 'Chưa gán' ? t.driverName : null,
                                licensePlate: t.licensePlate || '',
                                vehicleModel: t.vehicleModel || '',
                                vehicleType: t.vehicleType || this.selectedService || 'motorbike',
                                pickupName: t.pickup || this.pickup?.name,
                                dropoffName: t.destination || this.destination?.name,
                                createdAt: t.createdAt || null,
                                fareAmount: Number(t.fare) || this.selectedVehicleFare || 45000,
                                distanceMeters: (Number(t.distance) || 3) * 1000,
                                driverLat: (t.driverLat !== undefined && t.driverLat !== null) ? Number(t.driverLat) : null,
                                driverLon: (t.driverLon !== undefined && t.driverLon !== null) ? Number(t.driverLon) : null,
                                driverHeading: Number(t.driverHeading || 0)
                            };
                        }
                    } catch (e) {}
                }

                // 3. Fallback to goride_active_trip if currentTrip still not found
                if (!currentTrip) {
                    try {
                        const act = JSON.parse(localStorage.getItem('goride_active_trip') || '{}');
                        if (act && (act.id === tripId || (!tripId && act.id))) {
                            currentTrip = {
                                id: act.id,
                                status: (act.status || 'requested').toUpperCase(),
                                customerName: act.customerName || 'Khách hàng',
                                driverName: act.driverName || null,
                                licensePlate: act.licensePlate || '',
                                vehicleModel: act.vehicleModel || '',
                                vehicleType: act.vehicleType || this.selectedService || 'motorbike',
                                pickupName: act.pickup?.name || act.pickup || this.pickup?.name,
                                dropoffName: act.destination?.name || act.destination || this.destination?.name,
                                createdAt: act.createdAt || null,
                                fareAmount: Number(act.fare || act.fareAmount) || this.selectedVehicleFare || 45000,
                                distanceMeters: (Number(act.distance) || 3) * 1000,
                                driverLat: (act.driverLat !== undefined && act.driverLat !== null) ? Number(act.driverLat) : null,
                                driverLon: (act.driverLon !== undefined && act.driverLon !== null) ? Number(act.driverLon) : null,
                                driverHeading: Number(act.driverHeading || 0),
                                routeGeometry: act.routeGeometry || null
                            };
                        }
                    } catch (e) {}
                }

                // Check live dynamic coordinates stream from driver broadcast
                let liveCoord = null;
                try {
                    const act = JSON.parse(localStorage.getItem('goride_active_trip') || '{}');
                    if (act && (act.id === tripId || (!tripId && act.id) || (currentTrip && act.id === currentTrip.id))) {
                        const aLat = Number(act.driverLat || act.driverLocation?.lat);
                        const aLng = Number(act.driverLon || act.driverLng || act.driverLocation?.lng);
                        if (!isNaN(aLat) && !isNaN(aLng) && aLat !== 0 && aLng !== 0) {
                            liveCoord = { lat: aLat, lng: aLng, heading: Number(act.driverHeading || act.driverLocation?.heading || 0) };
                        }
                    }
                } catch (e) {}

                if (!liveCoord) {
                    try {
                        const onlineDrivers = JSON.parse(localStorage.getItem('goride_online_drivers') || '{}');
                        const dEntry = Object.values(onlineDrivers).find(d => 
                            (currentTrip && currentTrip.driverName && d.name === currentTrip.driverName) || 
                            (currentTrip && currentTrip.licensePlate && d.plate === currentTrip.licensePlate) ||
                            (this.activeTrip && this.activeTrip.driverName && d.name === this.activeTrip.driverName) ||
                            (this.activeTrip && this.activeTrip.licensePlate && d.plate === this.activeTrip.licensePlate)
                        );
                        if (dEntry && dEntry.isOnline) {
                            const dLat = Number(dEntry.location?.lat !== undefined ? dEntry.location.lat : dEntry.lat);
                            const dLng = Number(dEntry.location?.lng !== undefined ? dEntry.location.lng : dEntry.lng);
                            if (!isNaN(dLat) && !isNaN(dLng) && dLat !== 0 && dLng !== 0) {
                                liveCoord = { lat: dLat, lng: dLng, heading: Number(dEntry.location?.heading || dEntry.heading || 0) };
                            }
                        }
                    } catch (e) {}
                }

                if (liveCoord) {
                    this._latestDriverPosition = {
                        lat: liveCoord.lat,
                        lng: liveCoord.lng,
                        heading: liveCoord.heading,
                        timestamp: Date.now()
                    };
                }

                if (currentTrip) {
                    // CRITICAL FIX: Eliminate Default Location Anchors.
                    // All positions are transient. When driver moves, marker follows updates.
                    // If no new update has arrived between polling cycles, HOLD the most recent update position!
                    // NEVER jump back to the initial accept-time position!
                    if (this._latestDriverPosition) {
                        currentTrip.driverLat = this._latestDriverPosition.lat;
                        currentTrip.driverLon = this._latestDriverPosition.lng;
                        currentTrip.driverHeading = this._latestDriverPosition.heading;
                    } else if (currentTrip.driverLat && currentTrip.driverLon) {
                        this._latestDriverPosition = {
                            lat: Number(currentTrip.driverLat),
                            lng: Number(currentTrip.driverLon),
                            heading: Number(currentTrip.driverHeading || 0),
                            timestamp: Date.now()
                        };
                    }

                    const prevStatus = this.activeTrip ? this.activeTrip.status : 'REQUESTED';

                    // MONOTONIC STATUS PROGRESSION:
                    const STATUS_WEIGHT = {
                        'REQUESTED': 1,
                        'OFFERED': 2,
                        'ACCEPTED': 3,
                        'ARRIVED': 4,
                        'IN_PROGRESS': 5,
                        'COMPLETED': 6,
                        'CANCELLED': 7
                    };
                    const curWeight = STATUS_WEIGHT[(this.activeTrip?.status || 'REQUESTED').toUpperCase()] || 1;
                    const newWeight = STATUS_WEIGHT[(currentTrip.status || 'REQUESTED').toUpperCase()] || 1;

                    if (newWeight < curWeight) {
                        currentTrip.status = this.activeTrip.status;
                        if (!currentTrip.driverName || currentTrip.driverName === 'Chưa gán') {
                            currentTrip.driverName = this.activeTrip.driverName;
                        }
                        if (!currentTrip.licensePlate) currentTrip.licensePlate = this.activeTrip.licensePlate;
                        if (!currentTrip.vehicleModel) currentTrip.vehicleModel = this.activeTrip.vehicleModel;
                    }

                    this.activeTrip = currentTrip;
                    this.activeTripId = currentTrip.id;

                    // Sync to localStorage goride_active_trip with latest dynamic coordinates
                    try {
                        const existing = JSON.parse(localStorage.getItem('goride_active_trip') || '{}');
                        existing.id = currentTrip.id;
                        existing.status = (currentTrip.status || 'REQUESTED').toUpperCase();
                        if (currentTrip.driverName && currentTrip.driverName !== 'Chưa gán') existing.driverName = currentTrip.driverName;
                        if (currentTrip.licensePlate) existing.licensePlate = currentTrip.licensePlate;
                        if (currentTrip.vehicleModel) existing.vehicleModel = currentTrip.vehicleModel;
                        if (currentTrip.vehicleType) existing.vehicleType = currentTrip.vehicleType;
                        if (currentTrip.fareAmount) existing.fareAmount = currentTrip.fareAmount;
                        if (this._latestDriverPosition) {
                            existing.driverLat = this._latestDriverPosition.lat;
                            existing.driverLon = this._latestDriverPosition.lng;
                            existing.driverHeading = this._latestDriverPosition.heading;
                        }
                        localStorage.setItem('goride_active_trip', JSON.stringify(existing));
                    } catch (e) {}

                    this.updateTrackingUI(currentTrip, pollCount);

                    if (prevStatus === 'REQUESTED' && (currentTrip.status === 'ACCEPTED' || currentTrip.status === 'ARRIVED')) {
                        this.showToast(`Tài xế ${currentTrip.driverName || 'đối tác'} đã nhận chuyến! Đang đến đón bạn.`, 'success', 5000);
                        if (typeof navigoNotifications !== 'undefined') {
                            navigoNotifications.addNotification({
                                id: 'trip_acc_' + currentTrip.id,
                                category: 'trips',
                                title: 'TÀI XẾ ĐÃ NHẬN CHUYẾN #' + currentTrip.id,
                                body: 'Tài xế ' + (currentTrip.driverName || 'đối tác') + ' (' + (currentTrip.licensePlate || 'Xe thuần điện') + ') đã nhận chuyến và đang di chuyển tới điểm đón bạn.',
                                icon: '🚗',
                                actionUrl: 'customer.html',
                                actionText: 'Xem tài xế'
                            });
                        }
                    } else if (currentTrip.status === 'ARRIVED' && prevStatus !== 'ARRIVED') {
                        this.showToast('🔔 Tài xế đã có mặt tại điểm đón! Xin vui lòng ra xe.', 'warning', 6000);
                        if (typeof navigoNotifications !== 'undefined') {
                            navigoNotifications.addNotification({
                                id: 'trip_arrived_' + currentTrip.id + '_' + Date.now(),
                                category: 'trips',
                                title: 'TÀI XẾ ĐÃ ĐẾN NƠI!',
                                body: 'Tài xế ' + (currentTrip.driverName || 'đối tác') + ' đã có mặt tại điểm hẹn. Vui lòng di chuyển ra xe để bắt đầu chuyến đi.',
                                icon: '📍',
                                actionUrl: 'customer.html',
                                actionText: 'Xem vị trí xe'
                            });
                        }
                    } else if (prevStatus === 'ARRIVED' && currentTrip.status === 'IN_PROGRESS') {
                        this.showToast('Chuyến xe bắt đầu lăn bánh...', 'info', 4000);
                    } else if (currentTrip.status === 'COMPLETED') {
                        clearInterval(this.trackingInterval);
                        this.trackingInterval = null;
                        this.completeTrip(currentTrip);
                    } else if (currentTrip.status === 'CANCELLED') {
                        this.cancelPendingBooking();
                    }

                    // Tự động hủy nếu đã quá 15 phút mà không có tài xế nhận
                    let tripCreatedTime = currentTrip.createdAt ? new Date(currentTrip.createdAt).getTime() : 0;
                    if (tripCreatedTime > 0 && (currentTrip.status === 'REQUESTED' || currentTrip.status === 'OFFERED') && (Date.now() - tripCreatedTime >= 15 * 60 * 1000)) {
                        this.cancelPendingBooking('Tự động hủy do hết 15 phút không có tài xế nhận cuốc');
                        return;
                    }
                } else if (pollCount > 8 && !this.activeTrip) {
                    // Trip ended or cancelled
                    clearInterval(this.trackingInterval);
                    this.trackingInterval = null;
                    this.activeTrip = null;
                    this.activeTripId = null;
                    try {
                        localStorage.removeItem('goride_active_trip');
                    } catch (e) {}
                    this.updatePersistentBanner();
                    this.showToast('Chuyến đi đã hoàn tất hoặc đã được xử lý xong.', 'info');
                    this.switchView('search');
                    this.resetBookingState();
                }
            } catch (err) {
                console.warn('[CustomerApp] Active trip poll warning:', err.message);
            }
        }, 1200);
    }

    /**
     * Update tracking UI components according to real backend trip state
     */
    updateTrackingUI(trip, pollCount = 0) {
        const radar = document.getElementById('tracking-radar');
        const driverSheet = document.getElementById('tracking-driver-sheet');
        const statusText = document.getElementById('tracking-status-text');
        const prog1 = document.getElementById('prog-step-1');
        const prog2 = document.getElementById('prog-step-2');
        const prog3 = document.getElementById('prog-step-3');
        const prog4 = document.getElementById('prog-step-4');
        const cancelBtn = document.getElementById('btn-cancel-trip') || document.querySelector('[data-action="cancel-ride"]');

        const status = trip.status;

        // Reset progress steps
        [prog1, prog2, prog3, prog4].forEach(p => p && p.classList.remove('active'));
        if (prog1) prog1.classList.add('active');

        const searchingPanel = document.getElementById('tracking-searching-panel');

        if (status === 'REQUESTED' || status === 'OFFERED') {
            if (this.mapController) {
                this.mapController.clearMarkers('drivers');
            }
            if (radar) radar.style.setProperty('display', 'none', 'important');
            this.showRadarAtPickup(trip.pickupLat || (trip.pickup && trip.pickup.lat), trip.pickupLon || trip.pickupLng || (trip.pickup && (trip.pickup.lng || trip.pickup.lon)));
            if (driverSheet) driverSheet.style.setProperty('display', 'none', 'important');
            if (searchingPanel) {
                searchingPanel.style.setProperty('display', 'block', 'important');
                const sPickup = document.getElementById('searching-pickup-text');
                const sDropoff = document.getElementById('searching-dropoff-text');
                if (sPickup) sPickup.textContent = trip.pickupName || (this.pickup && this.pickup.name) || '--';
                if (sDropoff) sDropoff.textContent = trip.dropoffName || (this.destination && this.destination.name) || '--';
            }

            // Cancellation is PERMITTED during REQUESTED / OFFERED
            if (cancelBtn) {
                cancelBtn.disabled = false;
                cancelBtn.style.opacity = '1';
                cancelBtn.style.cursor = 'pointer';
                cancelBtn.title = 'Hủy yêu cầu đặt xe';
            }

            if (status === 'REQUESTED') {
                if (pollCount > 20) {
                    if (statusText) statusText.textContent = 'Chưa có tài xế trực tuyến nào gần bạn nhận chuyến. Tiếp tục tìm kiếm hoặc bạn có thể hủy yêu cầu.';
                } else {
                    if (statusText) statusText.textContent = 'Đang quét tìm tài xế gần bạn nhất trong khu vực...';
                }
            } else if (status === 'OFFERED') {
                if (statusText) statusText.textContent = 'Đã gửi yêu cầu tới tài xế gần nhất! Đang chờ tài xế xác nhận (15s)...';
            }
        } else if (status === 'ACCEPTED' || status === 'ARRIVED' || status === 'IN_PROGRESS') {
            if (radar) radar.style.setProperty('display', 'none', 'important');
            this.hideRadar();
            if (searchingPanel) searchingPanel.style.setProperty('display', 'none', 'important');
            if (driverSheet) driverSheet.style.setProperty('display', 'flex', 'important');

            // Cancellation is allowed when driver is en route or at pickup. Only forbidden when vehicle is in progress.
            if (cancelBtn) {
                if (status === 'IN_PROGRESS') {
                    cancelBtn.disabled = true;
                    cancelBtn.style.opacity = '0.4';
                    cancelBtn.style.cursor = 'not-allowed';
                    cancelBtn.title = 'Chuyến xe đang di chuyển, không thể hủy.';
                } else {
                    cancelBtn.disabled = false;
                    cancelBtn.style.opacity = '1';
                    cancelBtn.style.cursor = 'pointer';
                    cancelBtn.title = 'Hủy chuyến xe';
                }
            }

            // Update driver information from real backend or driver profile (Support all ID variants)
            const driverNameEl = document.getElementById('track-driver-name') || document.getElementById('driver-name');
            const driverPlateEl = document.getElementById('track-driver-plate') || document.getElementById('driver-vehicle');
            const driverModelEl = document.getElementById('track-driver-model');
            const driverRatingEl = document.getElementById('track-driver-rating') || document.getElementById('driver-rating');
            const driverAvatarEl = document.getElementById('track-driver-avatar') || document.getElementById('driver-avatar');

            const tripVType = this.resolveTripVehicleType(trip);
            const vDetails = this.getVehicleDetails(tripVType);

            if (driverAvatarEl) {
                driverAvatarEl.textContent = vDetails.icon || '🛵';
            }

            if (driverNameEl) driverNameEl.textContent = trip.driverName || 'Tài xế Navigo đối tác';
            if (driverPlateEl) {
                if (trip.licensePlate) {
                    driverPlateEl.textContent = trip.licensePlate;
                    driverPlateEl.style.display = '';
                } else {
                    driverPlateEl.textContent = '';
                    driverPlateEl.style.display = 'none';
                }
            }
            if (driverModelEl) {
                if (trip.vehicleModel) {
                    const cleanModel = String(trip.vehicleModel).replace(/^[\p{Emoji}\u2000-\u3300\s]+/u, '').trim();
                    driverModelEl.textContent = `${vDetails.icon} ${cleanModel || vDetails.name}`;
                } else {
                    driverModelEl.textContent = `${vDetails.icon} ${vDetails.name}`;
                }
            }
            if (driverRatingEl) driverRatingEl.textContent = trip.driverRating ? `★ ${trip.driverRating}` : '★ 5.0';

            const statusIcon = document.getElementById('tracking-status-icon');
            if (statusIcon) statusIcon.textContent = vDetails.icon || '🛵';

            const btnCallDriver = document.getElementById('btn-call-driver');
            if (btnCallDriver) {
                btnCallDriver.onclick = () => {
                    const phone = trip.driverPhone || '0901234567';
                    window.location.href = `tel:${phone}`;
                };
            }
            const btnChatDriver = document.getElementById('btn-chat-driver');
            if (btnChatDriver) {
                btnChatDriver.onclick = () => {
                    this.showChatDialog();
                };
            }

            // Real-time trip chat listener for background message notification
            const curTripId = trip.id || trip.tripCode;
            if (curTripId && typeof realtimeSync !== 'undefined' && realtimeSync.listenTripChat) {
                realtimeSync.listenTripChat(curTripId, (msg) => {
                    if (msg && msg.senderRole === 'driver') {
                        if (!this.isChatOpen) {
                            this.unreadChatCount = (this.unreadChatCount || 0) + 1;
                            this.updateChatBadge();
                            this.showToast(`💬 Tài xế ${msg.senderName || ''}: ${msg.text}`, 'info', 4500);
                        }
                    }
                });
            }

            if (status === 'ACCEPTED') {
                if (prog2) prog2.classList.add('active');
                if (statusText) statusText.textContent = `Tài xế ${trip.driverName || 'đối tác'} đã nhận cuốc!`;
            } else if (status === 'ARRIVED') {
                if (prog2) prog2.classList.add('active');
                if (statusText) statusText.textContent = 'Tài xế đã có mặt tại điểm đón! Xin vui lòng ra xe.';
            } else if (status === 'IN_PROGRESS') {
                if (prog2) prog2.classList.add('active');
                if (prog3) prog3.classList.add('active');
                if (statusText) statusText.textContent = 'Chuyến đi đang thực hiện. Đang di chuyển đến điểm trả khách...';
            }

            // Render real driver marker & blue movement line if position available
            if (this.mapController) {
                const pLat = Number(trip.pickupLat || (trip.pickup && (trip.pickup.lat || trip.pickup.latitude)) || (this.pickup && this.pickup.lat) || 10.7725);
                const pLon = Number(trip.pickupLon || trip.pickupLng || (trip.pickup && (trip.pickup.lng || trip.pickup.lon || trip.pickup.longitude)) || (this.pickup && this.pickup.lng) || 106.6980);
                const destLat = Number(trip.dropoffLat || trip.destinationLat || (trip.destination && (trip.destination.lat || trip.destination.latitude)) || (this.destination && this.destination.lat));
                const destLon = Number(trip.dropoffLon || trip.dropoffLng || trip.destinationLon || trip.destinationLng || (trip.destination && (trip.destination.lng || trip.destination.lon || trip.destination.longitude)) || (this.destination && this.destination.lng));

                let dLat = null;
                let dLon = null;
                let dHeading = 0;

                // Priority 1: Check if trip or incoming payload has a fresh driver location
                const freshLat = Number(trip.driverLat !== undefined ? trip.driverLat : (trip.driverLocation && trip.driverLocation.lat));
                const freshLon = Number(trip.driverLon !== undefined ? trip.driverLon : (trip.driverLng !== undefined ? trip.driverLng : (trip.driverLocation && (trip.driverLocation.lng || trip.driverLocation.lon))));
                const freshHeading = Number(trip.driverHeading !== undefined ? trip.driverHeading : (trip.driverLocation && trip.driverLocation.heading) || 0);

                if (!isNaN(freshLat) && !isNaN(freshLon) && freshLat !== 0 && freshLon !== 0) {
                    dLat = freshLat;
                    dLon = freshLon;
                    dHeading = freshHeading;
                    this._latestDriverPosition = { lat: dLat, lng: dLon, heading: dHeading, timestamp: Date.now() };
                } else if (this._latestDriverPosition && !isNaN(this._latestDriverPosition.lat) && this._latestDriverPosition.lat !== 0) {
                    // Between 2 updates: maintain last known position steadily (no jumping, no teleporting)
                    dLat = Number(this._latestDriverPosition.lat);
                    dLon = Number(this._latestDriverPosition.lng);
                    dHeading = Number(this._latestDriverPosition.heading || 0);
                }

                // Initial fallbacks if _latestDriverPosition not yet populated
                if (dLat === null || isNaN(dLat) || dLat === 0) {
                    if (this.activeTrip && this.activeTrip.driverLat) {
                        dLat = Number(this.activeTrip.driverLat);
                        dLon = Number(this.activeTrip.driverLon || this.activeTrip.driverLng);
                        dHeading = Number(this.activeTrip.driverHeading || 0);
                        this._latestDriverPosition = { lat: dLat, lng: dLon, heading: dHeading, timestamp: Date.now() };
                    }
                }
                if (dLat === null || isNaN(dLat) || dLat === 0) {
                    try {
                        const act = JSON.parse(localStorage.getItem('goride_active_trip') || '{}');
                        const aLat = Number(act.driverLat || act.driverLocation?.lat);
                        const aLon = Number(act.driverLon || act.driverLng || act.driverLocation?.lng);
                        if (!isNaN(aLat) && !isNaN(aLon) && aLat !== 0 && aLon !== 0) {
                            dLat = aLat;
                            dLon = aLon;
                            dHeading = Number(act.driverHeading || act.driverLocation?.heading || 0);
                            this._latestDriverPosition = { lat: dLat, lng: dLon, heading: dHeading, timestamp: Date.now() };
                        }
                    } catch (e) {}
                }
                if (dLat === null || isNaN(dLat) || dLat === 0) {
                    try {
                        const onlineDrivers = JSON.parse(localStorage.getItem('goride_online_drivers') || '{}');
                        const dEntry = Object.values(onlineDrivers).find(d => 
                            (trip.driverName && d.name === trip.driverName) || 
                            (trip.licensePlate && d.plate === trip.licensePlate)
                        ) || Object.values(onlineDrivers).find(d => d && d.isOnline);
                        if (dEntry) {
                            const oLat = Number(dEntry.lat !== undefined ? dEntry.lat : dEntry.location?.lat);
                            const oLon = Number(dEntry.lng !== undefined ? dEntry.lng : (dEntry.lon !== undefined ? dEntry.lon : dEntry.location?.lng));
                            if (!isNaN(oLat) && !isNaN(oLon) && oLat !== 0) {
                                dLat = oLat;
                                dLon = oLon;
                                dHeading = Number(dEntry.heading || dEntry.location?.heading || 0);
                                this._latestDriverPosition = { lat: dLat, lng: dLon, heading: dHeading, timestamp: Date.now() };
                            }
                        }
                    } catch (e) {}
                }
                if (dLat === null || isNaN(dLat) || dLat === 0) {
                    try {
                        const lastLoc = JSON.parse(localStorage.getItem('goride_driver_last_location') || '{}');
                        if (lastLoc && lastLoc.lat && lastLoc.lng) {
                            dLat = Number(lastLoc.lat);
                            dLon = Number(lastLoc.lng);
                            this._latestDriverPosition = { lat: dLat, lng: dLon, heading: 0, timestamp: Date.now() };
                        }
                    } catch (e) {}
                }

                // Gỡ bỏ hoàn toàn vị trí mặc định giả lập (+0.0035). Chỉ render khi có tọa độ thực tế.
                if (dLat !== null && dLon !== null && !isNaN(dLat) && !isNaN(dLon) && dLat !== 0 && dLon !== 0) {
                    trip.driverLat = dLat;
                    trip.driverLon = dLon;
                    trip.driverHeading = dHeading;
                    if (this.activeTrip) {
                        this.activeTrip.driverLat = dLat;
                        this.activeTrip.driverLon = dLon;
                        this.activeTrip.driverHeading = dHeading;
                    }
                    this._latestDriverPosition = { lat: dLat, lng: dLon, heading: dHeading, timestamp: Date.now() };

                    let vType = tripVType || this.resolveTripVehicleType(trip);
                    // Do not allow stale or default onlineDrivers entry to overwrite an explicit non-car4 trip
                    if (!vType || vType === 'car4') {
                        try {
                            const onlineDrivers = JSON.parse(localStorage.getItem('goride_online_drivers') || '{}');
                            const dEntry = Object.values(onlineDrivers).find(d => 
                                d && (
                                    (trip.driverName && d.name === trip.driverName) || 
                                    (trip.licensePlate && (d.plate === trip.licensePlate || d.licensePlate === trip.licensePlate))
                                )
                            );
                            if (dEntry && (dEntry.vehicleType || dEntry.type)) {
                                const normD = this.normalizeVehicleType(dEntry.vehicleType || dEntry.type);
                                if (normD && normD !== 'car4') vType = normD;
                            }
                        } catch (e) {}
                    }

                    const tripGeometry = (Array.isArray(trip.routeGeometry) && trip.routeGeometry.length > 1)
                        ? trip.routeGeometry
                        : ((Array.isArray(this.currentRouteGeometry) && this.currentRouteGeometry.length > 1) ? this.currentRouteGeometry : null);

                    this.mapController.updateDriverMarker('active_driver', dLat, dLon, dHeading, {
                        name: trip.driverName || 'Tài xế',
                        vehicle: `${vDetails.label}${trip.licensePlate ? ' - ' + trip.licensePlate : ''}`,
                        vehicleType: vType,
                        iconType: vType,
                        vehicleModel: trip.vehicleModel || vDetails.name,
                        status: status,
                        routeGeometry: tripGeometry,
                        isActive: true
                    });

                    // STAGE 1: Driver heading to pickup -> Show pickup pin, destination pin, and blue approach route (#0288d1)
                    if (status === 'ACCEPTED') {
                        if (typeof this.mapController.addPickupMarker === 'function') {
                            this.mapController.addPickupMarker(pLat, pLon, trip.pickupName || (this.pickup && this.pickup.name) || 'Điểm đón của bạn');
                        }

                        if (!isNaN(destLat) && !isNaN(destLon) && destLat !== 0 && destLon !== 0 && typeof this.mapController.addDestinationMarker === 'function') {
                            this.mapController.addDestinationMarker(destLat, destLon, trip.dropoffName || (this.destination && this.destination.name) || 'Điểm đến');
                        }

                        // Ensure main trip route (Pickup -> Destination) remains pristine between pickup & dest (NEVER trimmed by driver's approach location)
                        if (tripGeometry && tripGeometry.length > 1) {
                            if (!this._hasEnsuredTripRoute || !this.mapController.routePolyline) {
                                this.mapController.drawRoute(tripGeometry, {
                                    color: '#10b981',
                                    weight: 5,
                                    opacity: 0.85,
                                    dashArray: null,
                                    lineCap: 'round',
                                    lineJoin: 'round'
                                });
                                this._hasEnsuredTripRoute = true;
                            }
                        }

                        // Dynamically trim blue driver approach route behind current position ("snake eating the path")
                        let trimRes = null;
                        if (typeof this.mapController.trimDriverRoute === 'function') {
                            trimRes = this.mapController.trimDriverRoute(dLat, dLon);
                        }

                        const isOffRoute = trimRes && trimRes.isOffRoute;
                        const needsInitialRoute = !this._hasDrawnApproachRoute || !this.mapController.driverRoutePolyline;

                        if (needsInitialRoute || isOffRoute) {
                            if (isOffRoute) {
                                this._custOffRouteTicks = (this._custOffRouteTicks || 0) + 1;
                            } else {
                                this._custOffRouteTicks = 0;
                            }

                            const now = Date.now();
                            const canReroute = needsInitialRoute || (this._custOffRouteTicks >= 2 && (!this._lastApproachRerouteTime || (now - this._lastApproachRerouteTime > 6000)));

                            if (canReroute) {
                                this._lastApproachRerouteTime = now;
                                this._custOffRouteTicks = 0;
                                const approachToken = ++this._approachRouteSeq || (this._approachRouteSeq = 1);

                                // Calculate realistic turn-by-turn road route via Shared Driver Geometry / C++ Dijkstra / OSRM / Street graph
                                this.calculateDriverApproachRoute(dLat, dLon, pLat, pLon).then(routePath => {
                                    if (this._approachRouteSeq === approachToken && Array.isArray(routePath) && routePath.length > 1) {
                                        if (this.mapController) {
                                            if (this.mapController.driverRoutePolyline && typeof this.mapController.updateDriverRouteGeometry === 'function') {
                                                this.mapController.updateDriverRouteGeometry(routePath, {
                                                    color: '#0288d1',
                                                    weight: 6,
                                                    opacity: 0.95
                                                });
                                            } else if (typeof this.mapController.drawDriverRoute === 'function') {
                                                this.mapController.drawDriverRoute(routePath, {
                                                    color: '#0288d1',
                                                    weight: 6,
                                                    opacity: 0.95
                                                });
                                            }
                                            this._hasDrawnApproachRoute = true;
                                            this.mapController.trimDriverRoute(dLat, dLon);
                                        }
                                        if (this.mapController && typeof this.mapController.fitBounds === 'function' && !this._hasFittedApproachBounds) {
                                            this._hasFittedApproachBounds = true;
                                            this.mapController.fitBounds([[dLat, dLon], [pLat, pLon]], { padding: [75, 75] });
                                        }
                                    }
                                });
                            }
                        } else {
                            this._custOffRouteTicks = 0;
                        }
                    } else if (status === 'ARRIVED') {
                        // Driver arrived at pickup -> clear blue approach line and highlight trip route
                        this._lastApproachDriverPos = null;
                        this._hasFittedApproachBounds = false;
                        this._hasDrawnApproachRoute = false;
                        if (typeof this.mapController.clearDriverRoute === 'function') {
                            this.mapController.clearDriverRoute();
                        }

                        if (typeof this.mapController.addPickupMarker === 'function') {
                            this.mapController.addPickupMarker(pLat, pLon, trip.pickupName || (this.pickup && this.pickup.name) || 'Điểm đón của bạn');
                        }

                        if (!isNaN(destLat) && !isNaN(destLon) && destLat !== 0 && destLon !== 0 && typeof this.mapController.addDestinationMarker === 'function') {
                            this.mapController.addDestinationMarker(destLat, destLon, trip.dropoffName || (this.destination && this.destination.name) || 'Điểm đến');
                        }

                        if (tripGeometry && tripGeometry.length > 1) {
                            if (!this._hasRestoredArrivedRoute || !this.mapController.routePolyline) {
                                this.mapController.drawRoute(tripGeometry, {
                                    color: '#10b981',
                                    weight: 6,
                                    opacity: 0.95,
                                    dashArray: null,
                                    lineCap: 'round',
                                    lineJoin: 'round'
                                });
                                this._hasRestoredArrivedRoute = true;
                            }
                            if (!this._hasFittedArrivedBounds && typeof this.mapController.fitBounds === 'function') {
                                this._hasFittedArrivedBounds = true;
                                this.mapController.fitBounds(tripGeometry, { padding: [60, 60] });
                            }
                        }
                    } else if (status === 'IN_PROGRESS') {
                        // Trip in progress -> clear blue approach line & dynamically trim trip route behind vehicle position
                        this._lastApproachDriverPos = null;
                        this._hasFittedApproachBounds = false;
                        this._hasDrawnApproachRoute = false;
                        if (typeof this.mapController.clearDriverRoute === 'function') {
                            this.mapController.clearDriverRoute();
                        }

                        if (!isNaN(destLat) && !isNaN(destLon) && destLat !== 0 && destLon !== 0 && typeof this.mapController.addDestinationMarker === 'function') {
                            this.mapController.addDestinationMarker(destLat, destLon, trip.dropoffName || (this.destination && this.destination.name) || 'Điểm đến');
                        }

                        // STAGE 2: Trip in progress -> dynamically trim trip route behind vehicle position ("snake eating the path")
                        let trimRes = null;
                        if (typeof this.mapController.trimRoute === 'function') {
                            trimRes = this.mapController.trimRoute(dLat, dLon);
                        }

                        const needsTripRoute = !this.mapController.routePolyline;
                        const isOffRoute = trimRes && trimRes.isOffRoute;

                        if (needsTripRoute || isOffRoute) {
                            if (isOffRoute) {
                                this._custTripOffRouteTicks = (this._custTripOffRouteTicks || 0) + 1;
                            } else {
                                this._custTripOffRouteTicks = 0;
                            }

                            const now = Date.now();
                            const canReroute = needsTripRoute || (this._custTripOffRouteTicks >= 2 && (!this._lastTripRerouteTime || (now - this._lastTripRerouteTime > 6000)));

                            if (canReroute && !isNaN(destLat) && !isNaN(destLon) && destLat !== 0) {
                                this._lastTripRerouteTime = now;
                                this._custTripOffRouteTicks = 0;

                                this.calculateNavigationRouteToDest(dLat, dLon, destLat, destLon).then(newPath => {
                                    if (Array.isArray(newPath) && newPath.length > 1) {
                                        this.currentRouteGeometry = newPath;
                                        if (this.activeTrip) this.activeTrip.routeGeometry = newPath;
                                        if (this.mapController) {
                                            if (this.mapController.routePolyline && typeof this.mapController.updateRouteGeometry === 'function') {
                                                this.mapController.updateRouteGeometry(newPath, {
                                                    color: '#10b981',
                                                    weight: 5,
                                                    opacity: 0.9
                                                });
                                            } else if (typeof this.mapController.drawRoute === 'function') {
                                                this.mapController.drawRoute(newPath, {
                                                    color: '#10b981',
                                                    weight: 5,
                                                    opacity: 0.9
                                                });
                                            }
                                            this.mapController.trimRoute(dLat, dLon);
                                        }
                                    }
                                });
                            }
                        } else {
                            this._custTripOffRouteTicks = 0;
                        }
                    } else {
                        this._lastApproachDriverPos = null;
                        this._hasFittedApproachBounds = false;
                        this._hasDrawnApproachRoute = false;
                        if (typeof this.mapController.clearDriverRoute === 'function') {
                            this.mapController.clearDriverRoute();
                        }
                    }
                } else {
                    this.mapController.clearMarkers('drivers');
                    if (typeof this.mapController.clearDriverRoute === 'function') {
                        this.mapController.clearDriverRoute();
                    }
                }
            }
        } else if (status === 'COMPLETED') {
            this.hideRadar();
            this._lastApproachDriverPos = null;
            this._hasFittedApproachBounds = false;
            this._hasDrawnApproachLine = false;
            if (this.mapController && typeof this.mapController.clearDriverRoute === 'function') {
                this.mapController.clearDriverRoute();
            }
            if (prog1) prog1.classList.add('active');
            if (prog2) prog2.classList.add('active');
            if (prog3) prog3.classList.add('active');
            if (prog4) prog4.classList.add('active');

            if (this.trackingInterval) {
                clearInterval(this.trackingInterval);
                this.trackingInterval = null;
            }
                        this.completeTrip(trip);
        } else if (status === 'CANCELLED') {
            this.hideRadar();
            if (this.trackingInterval) {
                clearInterval(this.trackingInterval);
                this.trackingInterval = null;
            }
            this.showToast('Chuyến đi đã bị hủy.', 'info');
            this.activeTrip = null;
            this.activeTripId = null;
            try {
                localStorage.removeItem('goride_active_trip');
            } catch (e) {}
            this.updatePersistentBanner();
            this.switchView('search');
            this.resetBookingState();
        }

        this.updatePersistentBanner();
    }

    /**
     * Real Trip Completion Modal with Fare Receipt & Rating
     */
    completeTrip(trip) {
        this.hideRadar();
        this._latestDriverPosition = null;
        this._lastApproachDriverPos = null;
        this._hasDrawnApproachLine = false;
        this._hasDrawnApproachRoute = false;
        this._hasFittedApproachBounds = false;
        this._hasEnsuredTripRoute = false;
        this._hasRestoredArrivedRoute = false;
        this._hasFittedArrivedBounds = false;
        try {
            localStorage.removeItem('goride_active_trip');
        } catch (e) {}

        // Save completed trip to account-isolated trip history (100% real data)
        const tripData = trip || this.activeTrip;
        let ecoResult = null;
        if (tripData) {
            this.saveUserTrip({ ...tripData, status: 'completed' });
            // Đồng bộ điểm sự kiện & chỉ số xanh Navigo Race
            ecoResult = this.updateUserEcoStats(tripData);
        }

        const prog4 = document.getElementById('prog-step-4');
        const statusText = document.getElementById('tracking-status-text');

        if (prog4) prog4.classList.add('active');
        if (statusText) statusText.textContent = 'Chuyến đi đã hoàn thành an toàn! 🎉';

        this.showToast('Bạn đã đến nơi an toàn. Cảm ơn bạn đã đồng hành cùng Navigo!', 'success', 5000);

        const fareAmount = this.formatMoney(trip ? trip.fareAmount : 45000);
        const tripCode = trip ? trip.id : `TRP-${Date.now()}`;
        const driverTitle = trip && trip.driverName ? `${trip.driverName} (${trip.licensePlate || 'Xe đối tác'})` : 'Tài xế Navigo đối tác';

        // Only truly deduct customer wallet upon successful completion
        const isPaidWallet = !!(
            this.paymentMethod === 'wallet' ||
            tripData?.paidByWallet ||
            tripData?.paymentMethod === 'wallet'
        );
        if (isPaidWallet && window.NaviWalletEngine) {
            // 1. Deduct customer wallet upon successful completion (isolated)
            try {
                const currentUser = (typeof sessionManager !== 'undefined') ? (sessionManager.getUser?.() || sessionManager.getCurrentUser?.()) : null;
                const custPhone = tripData?.customerPhone || currentUser?.phone || currentUser?.id || '';
                const fareNum = Number(tripData?.fareAmount || tripData?.fare) || 45000;
                if (custPhone) {
                    const curW = window.NaviWalletEngine.getWallet(custPhone);
                    const alreadyDeducted = curW && Array.isArray(curW.transactions) && curW.transactions.some(t => t.tripId === tripCode || (t.id && t.id.includes(tripCode)));
                    if (!alreadyDeducted) {
                        window.NaviWalletEngine.payTrip(custPhone, fareNum, tripCode, {
                            pickupName: tripData?.pickupName || (tripData?.pickup && tripData.pickup.name) || 'Điểm đón',
                            dropoffName: tripData?.dropoffName || (tripData?.destination && tripData.destination.name) || 'Điểm đến'
                        });
                    }
                }
            } catch (err) {
                console.warn('[CustomerWallet] Completion deduction sync notice:', err);
            }

            // 2. ALSO credit driver wallet immediately upon trip completion (isolated & guaranteed!)
            try {
                const fareNum = Number(tripData?.fareAmount || tripData?.fare) || 45000;
                const targetDriverPhones = new Set();
                if (tripData?.driverPhone) targetDriverPhones.add(tripData.driverPhone);
                if (trip && trip.driverPhone) targetDriverPhones.add(trip.driverPhone);
                try {
                    const adm = JSON.parse(localStorage.getItem('goride_admin_trips') || '[]');
                    const tMatch = adm.find(t => t && (t.id === tripCode));
                    if (tMatch && tMatch.driverPhone) targetDriverPhones.add(tMatch.driverPhone);
                } catch(e) {}

                targetDriverPhones.forEach(dPhone => {
                    if (!dPhone) return;
                    window.NaviWalletEngine.creditDriverTrip(dPhone, fareNum, tripCode, {
                        customerName: tripData?.customerName || (typeof sessionManager !== 'undefined' ? sessionManager.getUser?.()?.name : 'Khách hàng Navigo') || 'Khách hàng Navigo',
                        customerPhone: tripData?.customerPhone || (currentUser?.phone || ''),
                        pickup: tripData?.pickupName || (tripData?.pickup && tripData.pickup.name) || 'Điểm đón',
                        destination: tripData?.dropoffName || (tripData?.destination && tripData.destination.name) || 'Điểm đến'
                    });
                });
            } catch (drvErr) {
                console.warn('[CustomerWallet] Driver credit notice:', drvErr);
            }
        }
        if (typeof navigoNotifications !== 'undefined') {
            navigoNotifications.addNotification({
                id: 'trip_done_' + tripCode,
                category: 'trips',
                title: 'HOÀN THÀNH CHUYẾN XE #' + tripCode,
                body: 'Chuyến xe đã kết thúc an toàn! Cước phí: ' + fareAmount + '. Cảm ơn bạn đã lựa chọn di chuyển thuần điện cùng Navigo.',
                icon: '🎉',
                actionUrl: 'activity.html',
                actionText: 'Xem lịch sử'
            });
        }

        setTimeout(() => {
            let selectedRating = 5;

            this.showDialog(`
                <div style="position:relative;">
                    <button type="button" class="btn-dialog-corner-close" id="btn-close-rating-corner" aria-label="Đóng" title="Đóng thông báo" style="position:absolute; top:-4px; right:-4px; width:30px; height:30px; border-radius:50%; border:none; background:#f1f5f9; font-size:1.3rem; line-height:1; display:flex; align-items:center; justify-content:center; cursor:pointer; color:#64748b; z-index:10;">&times;</button>
                    
                    <div style="text-align:center;">
                        <div style="font-size:3rem; margin-bottom:8px;">🎉</div>
                        <h3 style="margin:0 0 4px; color:#0f172a; font-size:1.25rem;">Hành trình kết thúc!</h3>
                        <p style="margin:0; font-size:0.85rem; color:#64748b;">Mã chuyến: #${tripCode}</p>
                    </div>

                    <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:14px; padding:12px; margin:14px 0; font-size:0.85rem;">
                        <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
                            <span style="color:#64748b;">Tài xế:</span>
                            <strong>${driverTitle}</strong>
                        </div>
                        <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
                            <span style="color:#64748b;">Cước phí:</span>
                            <strong style="color:var(--goride-teal); font-size:1.1rem;">${fareAmount}</strong>
                        </div>
                        <div style="display:flex; justify-content:space-between;">
                            <span style="color:#64748b;">Thanh toán:</span>
                            <span>${this.paymentMethod === 'cash' ? 'Tiền mặt' : 'Ví Navigo'}</span>
                        </div>
                    </div>

                    <!-- Banner Điểm Sự Kiện Navigo Race (Gamification & Eco Stats) -->
                    <div style="background:linear-gradient(135deg, #ecfdf5, #d1fae5); border:1.5px solid #a7f3d0; border-radius:14px; padding:10px 14px; margin:10px 0 14px; display:flex; align-items:center; justify-content:space-between; box-shadow:0 2px 8px rgba(16,185,129,0.08);">
                        <div style="display:flex; align-items:center; gap:8px;">
                            <span style="font-size:1.5rem;">🌱</span>
                            <div style="text-align:left;">
                                <div style="font-size:0.75rem; color:#047857; font-weight:800; text-transform:uppercase; letter-spacing:0.5px;">Navigo Race 2024</div>
                                <div style="font-size:0.85rem; color:#065f46; font-weight:800;">+${ecoResult ? ecoResult.earnedPoints : 25} điểm sự kiện</div>
                            </div>
                        </div>
                        <div style="text-align:right;">
                            <div style="font-size:0.72rem; color:#047857;">Cắt giảm CO₂</div>
                            <div style="font-size:0.88rem; color:#065f46; font-weight:800;">-${ecoResult ? ecoResult.co2Saved : '0.45'} KG</div>
                        </div>
                    </div>

                    <div>
                        <div style="text-align:center; font-size:0.85rem; color:#334155; font-weight:600; margin-bottom:8px;">
                            Đánh giá chất lượng chuyến đi:
                        </div>
                        <div style="display:flex; justify-content:center; gap:8px; font-size:2rem; cursor:pointer; user-select:none;" id="rating-stars">
                            <span data-star="1" style="color:#f59e0b;">⭐</span>
                            <span data-star="2" style="color:#f59e0b;">⭐</span>
                            <span data-star="3" style="color:#f59e0b;">⭐</span>
                            <span data-star="4" style="color:#f59e0b;">⭐</span>
                            <span data-star="5" style="color:#f59e0b;">⭐</span>
                        </div>
                        <div style="text-align:center; font-size:0.8rem; color:#64748b; margin-top:4px;" id="rating-label">Tuyệt vời (5 sao)</div>
                        <textarea id="customer-rating-comment" rows="2" placeholder="Góp ý thêm về tài xế hoặc chuyến đi (tùy chọn)..." style="width:100%; border:1px solid #cbd5e1; border-radius:12px; padding:8px 12px; font-size:0.85rem; font-family:inherit; resize:none; box-sizing:border-box; outline:none; margin-top:10px;"></textarea>
                    </div>

                    <div style="display:flex; gap:10px; margin-top:16px;">
                        <button type="button" id="btn-skip-rating" style="flex:1; height:44px; border-radius:12px; border:1px solid #cbd5e1; background:#f8fafc; color:#64748b; font-weight:700; font-size:0.92rem; cursor:pointer;">
                            Bỏ qua
                        </button>
                        <button type="button" class="goride-btn-solicitar" id="btn-finish-trip-dialog" style="flex:1.4; height:44px; margin-top:0; font-size:0.92rem;">
                            Gửi đánh giá
                        </button>
                    </div>
                </div>
            `);

            // Wire star selection
            const starContainer = document.getElementById('rating-stars');
            const starLabel = document.getElementById('rating-label');
            const labels = {
                1: 'Rất không hài lòng (1 sao)',
                2: 'Chưa tốt (2 sao)',
                3: 'Bình thường (3 sao)',
                4: 'Hài lòng (4 sao)',
                5: 'Tuyệt vời (5 sao)'
            };

            if (starContainer) {
                const stars = starContainer.querySelectorAll('span');
                stars.forEach(st => {
                    st.onclick = () => {
                        const val = Number(st.getAttribute('data-star')) || 5;
                        selectedRating = val;
                        stars.forEach((s, idx) => {
                            s.style.opacity = (idx < val) ? '1' : '0.3';
                        });
                        if (starLabel) starLabel.textContent = labels[val] || `${val} sao`;
                    };
                });
            }

            // Wire corner close button & skip button (allows user to skip rating)
            const handleSkipRating = (e) => {
                if (e) e.preventDefault();
                if (tripData) {
                    this.saveUserTrip({ ...tripData, status: 'completed' });
                }
                this.closeDialog();
                this.activeTrip = null;
                this.activeTripId = null;
                try {
                    localStorage.removeItem('goride_active_trip');
                } catch (err) {}
                this.updatePersistentBanner();
                this.switchView('search');
                this.resetBookingState();
                this.showToast('Đã hoàn tất chuyến xe.', 'info', 2500);
            };

            const btnCloseCorner = document.getElementById('btn-close-rating-corner');
            if (btnCloseCorner) {
                btnCloseCorner.addEventListener('click', handleSkipRating);
            }
            const btnSkipRating = document.getElementById('btn-skip-rating');
            if (btnSkipRating) {
                btnSkipRating.addEventListener('click', handleSkipRating);
            }

            const btnFinish = document.getElementById('btn-finish-trip-dialog');
            if (btnFinish) {
                btnFinish.addEventListener('click', () => {
                    const comment = (document.getElementById('customer-rating-comment')?.value || '').trim();
                    // Update rating in saved user trip history
                    if (tripData) {
                        this.saveUserTrip({ ...tripData, status: 'completed', rating: selectedRating, feedback: comment });
                    }
                    if (typeof realtimeSync !== 'undefined' && tripCode) {
                        const curCust = (typeof sessionManager !== 'undefined') ? (sessionManager.getUser?.() || sessionManager.getCurrentUser?.()) : null;
                        realtimeSync.saveTripRating(tripCode, {
                            rating: selectedRating,
                            feedback: comment,
                            driverId: tripData?.driverId || tripData?.driver?.id,
                            driverName: tripData?.driverName || driverTitle || 'Tài xế',
                            driverPhone: tripData?.driverPhone || tripData?.driver?.phone || tripData?.phone || '',
                            customerName: curCust?.name || tripData?.customerName || 'Khách hàng',
                            customerId: curCust?.id || tripData?.customerId || '',
                            customerPhone: curCust?.phone || tripData?.customerPhone || '',
                            userKey: this.getCurrentUserKey()
                        });
                    }
                    this.showToast(`Cảm ơn bạn đã đánh giá tài xế (${selectedRating} ⭐)!`, 'success', 3500);
                    this.closeDialog();
                    this.activeTrip = null;
                    this.activeTripId = null;
                    try {
                        localStorage.removeItem('goride_active_trip');
                    } catch (e) {}
                    this.updatePersistentBanner();
                    this.switchView('search');
                    this.resetBookingState();
                });
            }
        }, 1200);
    }

    /**
     * Update persistent floating banner across views (P7.1)
     * Suppressed on Customer portal booking section to keep the UI clean
     */
    updatePersistentBanner() {
        const banner = document.getElementById('goride-persistent-active-banner');
        if (banner) banner.remove();
        const floatingGlobal = document.getElementById('goride-floating-active-trip');
        if (floatingGlobal) floatingGlobal.remove();
        return;
    }

    /**
     * Reset booking state for subsequent rides
     */
    resetBookingState() {
        this.hideRadar();
        this._lastApproachDriverPos = null;
        this._hasFittedApproachBounds = false;
        this._hasDrawnApproachLine = false;
        this._hasDrawnApproachRoute = false;
        this._hasEnsuredTripRoute = false;
        this._hasRestoredArrivedRoute = false;
        this._hasFittedArrivedBounds = false;
        if (this.mapController && typeof this.mapController.clearDriverRoute === 'function') {
            this.mapController.clearDriverRoute();
        }
        if (this.mapController && typeof this.mapController.setTripActive === 'function') {
            this.mapController.setTripActive(false);
        }
        if (this.trackingInterval) {
            clearInterval(this.trackingInterval);
            this.trackingInterval = null;
        }

        const btnSolicitar = document.getElementById('btn-solicitar-ride');
        if (btnSolicitar) {
            btnSolicitar.disabled = false;
        }

        if (this.mapController) {
            this.mapController.clearMarkers('drivers');
            this.scatterNearbyDrivers();
        }

        document.querySelectorAll('.goride-prog-step').forEach(step => {
            step.classList.remove('active');
        });
        const prog1 = document.getElementById('prog-step-1');
        if (prog1) prog1.classList.add('active');
    }

    /**
     * Show Call Driver Simulated Dialog
     */
    showCallDialog() {
        const dName = (this.activeTrip && this.activeTrip.driverName) ? this.activeTrip.driverName : 'Tài xế';
        const dPhone = (this.activeTrip && (this.activeTrip.driverPhone || this.activeTrip.phone)) ? (this.activeTrip.driverPhone || this.activeTrip.phone) : '09xx xxx xxx';
        this.showDialog(`
            <div style="position:relative; text-align:center; padding:10px 0;">
                <button type="button" class="btn-dialog-corner-close" id="btn-close-call-corner" aria-label="Đóng thông báo" title="Đóng" style="position:absolute; top:-4px; right:-4px; width:30px; height:30px; border-radius:50%; border:none; background:#f1f5f9; font-size:1.3rem; line-height:1; display:flex; align-items:center; justify-content:center; cursor:pointer; color:#64748b; z-index:10;">&times;</button>
                <div style="width:60px; height:60px; border-radius:50%; background:#ecfdf5; color:#059669; font-size:1.8rem; display:flex; align-items:center; justify-content:center; margin:0 auto 12px;">📞</div>
                <h3 style="margin:0 0 4px; color:#0f172a;">Gọi cho tài xế <span style="font-size:0.75rem; color:#dc2626; font-weight:700;">[CHƯA HỖ TRỢ]</span></h3>
                <p style="margin:0; font-size:0.9rem; color:#64748b;">${this.escapeHtml(dName)} &bull; ${this.escapeHtml(dPhone)}</p>
                <div style="background:#fef2f2; border:1px solid #fecaca; padding:10px 14px; border-radius:12px; margin:14px 0; font-size:0.8rem; color:#991b1b; line-height:1.4;">
                    ⚠️ <strong>Bản xem trước:</strong> Tính năng gọi thoại trực tiếp qua mạng viễn thông hiện chưa được triển khai. Hệ thống đang chờ tích hợp cổng VoIP từ Backend.
                </div>
                <button type="button" class="btn btn-outline btn-block" id="btn-close-call-dialog">Đóng</button>
            </div>
        `);

        const closeBtn = document.getElementById('btn-close-call-dialog');
        if (closeBtn) closeBtn.addEventListener('click', () => this.closeDialog());

    }

    /**
     * Show Real-Time Interactive In-App Chat Modal with Driver
     */
    showChatDialog() {
        const trip = this.activeTrip;
        const tripId = trip ? (trip.id || trip.tripCode) : (this.activeTripId || 'trip_active');
        const dName = (trip && trip.driverName) ? trip.driverName : 'Tài xế đối tác';
        const dPlate = (trip && (trip.licensePlate || trip.driverPlate || trip.plate)) ? (trip.licensePlate || trip.driverPlate || trip.plate) : '';
        const dVehicle = (trip && (trip.vehicleModel || trip.vehicleTypeName)) ? (trip.vehicleModel || trip.vehicleTypeName) : '';
        const driverInfoStr = [dPlate, dVehicle].filter(Boolean).join(' • ');

        this.isChatOpen = true;
        this.unreadChatCount = 0;
        this.updateChatBadge();

        const messages = (typeof realtimeSync !== 'undefined' && realtimeSync.getTripChatMessages)
            ? realtimeSync.getTripChatMessages(tripId)
            : [];

        const renderMessagesHtml = (msgs) => {
            if (!msgs || msgs.length === 0) {
                return `
                    <div id="customer-chat-empty" style="text-align:center; padding:32px 12px; color:#94a3b8; font-size:0.85rem;">
                        <div style="font-size:2rem; margin-bottom:6px;">💬</div>
                        <div style="font-weight:700; color:#64748b;">Chưa có tin nhắn nào.</div>
                        <div style="font-size:0.75rem; margin-top:2px;">Hãy gửi tin nhắn để trao đổi vị trí hoặc điểm hẹn với tài xế!</div>
                    </div>
                `;
            }
            return msgs.map(m => {
                const isMe = (m.senderRole === 'customer');
                const timeStr = m.timestamp ? new Date(m.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '';
                return `
                    <div style="display:flex; flex-direction:column; align-items:${isMe ? 'flex-end' : 'flex-start'}; margin-bottom:8px;">
                        <div style="font-size:0.68rem; color:#94a3b8; margin-bottom:2px; padding:0 4px;">
                            ${isMe ? 'Bạn' : this.escapeHtml(m.senderName || dName)} • ${timeStr}
                        </div>
                        <div style="${isMe 
                            ? 'background:linear-gradient(135deg, #00b1a9, #059669); color:#fff; border-radius:14px 14px 2px 14px;' 
                            : 'background:#ffffff; color:#0f172a; border:1px solid #e2e8f0; border-radius:14px 14px 14px 2px; box-shadow:0 1px 3px rgba(0,0,0,0.05);'} 
                            padding:9px 13px; max-width:82%; font-size:0.88rem; line-height:1.4; word-break:break-word;">
                            ${this.escapeHtml(m.text)}
                        </div>
                    </div>
                `;
            }).join('');
        };

        this.showDialog(`
            <div style="position:relative; display:flex; flex-direction:column; max-height:85vh;">
                <!-- Chat Header -->
                <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #e2e8f0; padding-bottom:10px; margin-bottom:10px;">
                    <div style="display:flex; align-items:center; gap:10px;">
                        <div style="width:38px; height:38px; border-radius:50%; background:linear-gradient(135deg, #00b1a9, #0f2d3c); color:#fff; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:1.1rem;">
                            🛵
                        </div>
                        <div>
                            <div style="font-weight:800; color:#0f172a; font-size:1rem; display:flex; align-items:center; gap:6px;">
                                ${this.escapeHtml(dName)}
                                <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#10b981;" title="Trực tuyến"></span>
                            </div>
                            <div style="font-size:0.75rem; color:#64748b;">${this.escapeHtml(driverInfoStr || 'Tài xế đang phục vụ')}</div>
                        </div>
                    </div>
                    <button type="button" id="btn-close-chat" style="background:#f1f5f9; border:none; width:30px; height:30px; border-radius:50%; font-size:1.2rem; cursor:pointer; color:#64748b; display:flex; align-items:center; justify-content:center;">&times;</button>
                </div>

                <!-- Chat Messages Feed -->
                <div id="customer-chat-feed" style="flex:1; max-height:240px; min-height:160px; overflow-y:auto; padding:8px 4px; display:flex; flex-direction:column; margin-bottom:10px; scroll-behavior:smooth;">
                    ${renderMessagesHtml(messages)}
                </div>

                <!-- Quick Replies Chips -->
                <div style="display:flex; gap:6px; overflow-x:auto; padding-bottom:8px; margin-bottom:8px; -webkit-overflow-scrolling:touch;" id="chat-quick-chips">
                    <button type="button" class="btn-customer-chat-chip" data-msg="Tôi đang xuống sảnh ngay ạ" style="white-space:nowrap; background:#f0fdf4; border:1px solid #bbf7d0; color:#15803d; border-radius:9999px; padding:4px 10px; font-size:0.75rem; font-weight:600; cursor:pointer;">Tôi đang xuống sảnh ngay</button>
                    <button type="button" class="btn-customer-chat-chip" data-msg="Tôi mặc áo đen, đứng gần cổng" style="white-space:nowrap; background:#eff6ff; border:1px solid #bfdbfe; color:#1d4ed8; border-radius:9999px; padding:4px 10px; font-size:0.75rem; font-weight:600; cursor:pointer;">Tôi đứng gần cổng</button>
                    <button type="button" class="btn-customer-chat-chip" data-msg="Bác tài đợi tôi khoảng 1-2 phút nhé" style="white-space:nowrap; background:#fef3c7; border:1px solid #fde68a; color:#b45309; border-radius:9999px; padding:4px 10px; font-size:0.75rem; font-weight:600; cursor:pointer;">Đợi tôi 1-2 phút nhé</button>
                    <button type="button" class="btn-customer-chat-chip" data-msg="Vâng, tôi đã thấy xe của bạn rồi!" style="white-space:nowrap; background:#f5f3ff; border:1px solid #ddd6fe; color:#6d28d9; border-radius:9999px; padding:4px 10px; font-size:0.75rem; font-weight:600; cursor:pointer;">Đã thấy xe</button>
                </div>

                <!-- Chat Input Row -->
                <form id="customer-chat-form" style="display:flex; gap:8px; margin:0;" onsubmit="return false;">
                    <input type="text" id="customer-chat-input" placeholder="Nhập tin nhắn tới tài xế..." class="form-input" style="flex:1; height:42px; font-size:0.88rem; border-radius:12px; padding:0 14px;" autocomplete="off" autofocus>
                    <button type="submit" id="btn-customer-send-chat" style="height:42px; padding:0 18px; border-radius:12px; background:linear-gradient(135deg, #00b1a9, #0f2d3c); color:#fff; border:none; font-weight:700; font-size:0.88rem; cursor:pointer; display:flex; align-items:center; gap:4px; box-shadow:0 3px 10px rgba(0,177,169,0.3);">
                        <span>Gửi</span> ➤
                    </button>
                </form>
            </div>
        `);

        const feed = document.getElementById('customer-chat-feed');
        if (feed) feed.scrollTop = feed.scrollHeight;

        const closeBtn = document.getElementById('btn-close-chat');
        if (closeBtn) {
            closeBtn.onclick = () => {
                this.isChatOpen = false;
                this.closeDialog();
            };
        }

        const inputEl = document.getElementById('customer-chat-input');
        const formEl = document.getElementById('customer-chat-form');

        const doSend = async (textToSend) => {
            const txt = (textToSend || inputEl?.value || '').trim();
            if (!txt) return;
            if (inputEl) inputEl.value = '';

            const curCust = (typeof sessionManager !== 'undefined') ? (sessionManager.getUser?.() || sessionManager.getCurrentUser?.()) : null;
            const cName = curCust?.name || trip?.customerName || 'Khách hàng';
            const cId = curCust?.id || trip?.customerId || '';

            if (typeof realtimeSync !== 'undefined' && realtimeSync.sendChatMessage) {
                await realtimeSync.sendChatMessage(tripId, {
                    text: txt,
                    senderRole: 'customer',
                    senderName: cName,
                    senderId: cId
                });
            }

            if (feed) {
                const timeStr = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
                const empty = document.getElementById('customer-chat-empty');
                if (empty) empty.remove();

                const msgDiv = document.createElement('div');
                msgDiv.style.cssText = 'display:flex; flex-direction:column; align-items:flex-end; margin-bottom:8px;';
                msgDiv.innerHTML = `
                    <div style="font-size:0.68rem; color:#94a3b8; margin-bottom:2px; padding:0 4px;">Bạn • ${timeStr}</div>
                    <div style="background:linear-gradient(135deg, #00b1a9, #059669); color:#fff; border-radius:14px 14px 2px 14px; padding:9px 13px; max-width:82%; font-size:0.88rem; line-height:1.4; word-break:break-word;">
                        ${this.escapeHtml(txt)}
                    </div>
                `;
                feed.appendChild(msgDiv);
                feed.scrollTop = feed.scrollHeight;
            }
        };

        if (formEl) {
            formEl.onsubmit = (e) => {
                e.preventDefault();
                doSend();
            };
        }

        // Wire quick reply chips
        document.querySelectorAll('.btn-customer-chat-chip').forEach(chip => {
            chip.onclick = () => {
                const msg = chip.getAttribute('data-msg');
                if (msg) doSend(msg);
            };
        });

        // Setup real-time listener for this trip
        if (typeof realtimeSync !== 'undefined' && realtimeSync.listenTripChat) {
            realtimeSync.listenTripChat(tripId, (msg) => {
                if (msg && msg.senderRole === 'driver') {
                    if (this.isChatOpen && feed) {
                        const empty = document.getElementById('customer-chat-empty');
                        if (empty) empty.remove();
                        const timeStr = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '';
                        const msgDiv = document.createElement('div');
                        msgDiv.style.cssText = 'display:flex; flex-direction:column; align-items:flex-start; margin-bottom:8px;';
                        msgDiv.innerHTML = `
                            <div style="font-size:0.68rem; color:#94a3b8; margin-bottom:2px; padding:0 4px;">${this.escapeHtml(msg.senderName || dName)} • ${timeStr}</div>
                            <div style="background:#ffffff; color:#0f172a; border:1px solid #e2e8f0; border-radius:14px 14px 14px 2px; box-shadow:0 1px 3px rgba(0,0,0,0.05); padding:9px 13px; max-width:82%; font-size:0.88rem; line-height:1.4; word-break:break-word;">
                                ${this.escapeHtml(msg.text)}
                            </div>
                        `;
                        feed.appendChild(msgDiv);
                        feed.scrollTop = feed.scrollHeight;
                    } else {
                        this.unreadChatCount = (this.unreadChatCount || 0) + 1;
                        this.updateChatBadge();
                        this.showToast(`💬 Tài xế ${msg.senderName || ''}: ${msg.text}`, 'info', 4500);
                    }
                }
            });
        }
    }

    updateChatBadge() {
        const btnChat = document.getElementById('btn-chat-driver');
        if (!btnChat) return;
        let badge = btnChat.querySelector('.chat-unread-badge');
        if (this.unreadChatCount && this.unreadChatCount > 0) {
            if (!badge) {
                badge = document.createElement('span');
                badge.className = 'chat-unread-badge';
                badge.style.cssText = 'position:absolute; top:-6px; right:-6px; background:#ef4444; color:#fff; font-size:0.7rem; font-weight:800; border-radius:9999px; padding:1px 6px; box-shadow:0 2px 4px rgba(0,0,0,0.25);';
                btnChat.style.position = 'relative';
                btnChat.appendChild(badge);
            }
            badge.textContent = this.unreadChatCount;
            badge.style.display = 'inline-block';
        } else if (badge) {
            badge.style.display = 'none';
        }
    }

    /**
     * Show Cancel Confirmation Dialog (P7.1 Cancellation Rules)
     */
    showCancelConfirmDialog() {
        if (!this.activeTrip && !this.activeTripId) {
            this.cancelPendingBooking();
            return;
        }

        const s = this.activeTrip ? this.activeTrip.status : 'REQUESTED';
        if (s === 'IN_PROGRESS' || s === 'COMPLETED') {
            this.showToast('Chuyến xe đang di chuyển hoặc đã hoàn thành, không thể hủy vào lúc này.', 'warning', 4500);
            return;
        }

        const isDriverComing = (s === 'ACCEPTED' || s === 'ARRIVED');
        const warningMsg = isDriverComing
            ? 'Tài xế đang trên đường đến đón bạn. Bạn có chắc chắn muốn hủy chuyến xe này không?'
            : 'Hệ thống đang quét tìm tài xế gần bạn nhất qua chỉ mục R-Tree. Bạn có chắc muốn dừng tìm kiếm và hủy yêu cầu không?';

        this.showDialog(`
            <div style="position:relative; text-align:center;">
                <button type="button" class="btn-dialog-corner-close" id="btn-close-cancel-corner" aria-label="Đóng thông báo" title="Đóng" style="position:absolute; top:-4px; right:-4px; width:30px; height:30px; border-radius:50%; border:none; background:#f1f5f9; font-size:1.3rem; line-height:1; display:flex; align-items:center; justify-content:center; cursor:pointer; color:#64748b; z-index:10;">&times;</button>
                <div style="width:50px; height:50px; border-radius:50%; background:#fee2e2; color:#dc2626; font-size:1.6rem; display:flex; align-items:center; justify-content:center; margin:0 auto 10px;">⚠️</div>
                <h3 style="margin:0 0 6px; color:#0f172a;">Hủy chuyến xe?</h3>
                <p style="margin:0; font-size:0.85rem; color:#64748b;">${warningMsg}</p>
                <div style="display:flex; gap:10px; margin-top:16px;">
                    <button type="button" class="btn btn-outline" style="flex:1;" id="btn-keep-trip">Giữ chuyến xe</button>
                    <button type="button" class="btn btn-danger" style="flex:1;" id="btn-do-cancel">Xác nhận hủy</button>
                </div>
            </div>
        `);

        const btnKeep = document.getElementById('btn-keep-trip');
        const btnDoCancel = document.getElementById('btn-do-cancel');

        if (btnKeep) btnKeep.addEventListener('click', () => this.closeDialog());
        const btnCloseCancelCorner = document.getElementById('btn-close-cancel-corner');
        if (btnCloseCancelCorner) btnCloseCancelCorner.addEventListener('click', () => this.closeDialog());
        if (btnDoCancel) {
            btnDoCancel.addEventListener('click', () => {
                this.closeDialog();
                this.cancelPendingBooking();
            });
        }
    }

    /**
     * Generic Modal Dialog Helper
     */
    showDialog(htmlContent) {
        const overlay = document.getElementById('dialog-overlay');
        const card = document.getElementById('dialog-card-content');
        if (overlay && card) {
            card.innerHTML = htmlContent;
            card.style.position = 'relative';
            if (!card.querySelector('.btn-dialog-corner-close, #btn-close-chat, #btn-close-rating-corner, #btn-close-cancel-corner, #btn-close-call-corner, .toast-close, .modal-close')) {
                const cornerClose = document.createElement('button');
                cornerClose.type = 'button';
                cornerClose.className = 'btn-dialog-corner-close';
                cornerClose.setAttribute('aria-label', 'Đóng thông báo');
                cornerClose.title = 'Đóng';
                cornerClose.innerHTML = '&times;';
                cornerClose.style.cssText = 'position:absolute; top:10px; right:12px; width:30px; height:30px; border-radius:50%; border:none; background:#f1f5f9; color:#64748b; font-size:1.3rem; line-height:1; display:flex; align-items:center; justify-content:center; cursor:pointer; z-index:20; transition:all 0.15s ease;';
                cornerClose.onmouseenter = () => { cornerClose.style.background = '#fee2e2'; cornerClose.style.color = '#dc2626'; };
                cornerClose.onmouseleave = () => { cornerClose.style.background = '#f1f5f9'; cornerClose.style.color = '#64748b'; };
                cornerClose.onclick = () => this.closeDialog();
                card.appendChild(cornerClose);
            }
            if (!overlay.dataset.clickBound) {
                overlay.dataset.clickBound = 'true';
                overlay.addEventListener('click', (e) => {
                    if (e.target === overlay) this.closeDialog();
                });
            }
            overlay.classList.add('active');
        }
    }

    closeDialog() {
        const overlay = document.getElementById('dialog-overlay');
        if (overlay) {
            overlay.classList.remove('active');
        }
    }

    /**
     * Get active customer identity key for account-isolated storage
     */
    getCurrentUserKey() {
        try {
            let u = null;
            if (typeof sessionManager !== 'undefined' && typeof sessionManager.getCurrentUser === 'function') {
                u = sessionManager.getCurrentUser();
            }
            if (!u) {
                u = JSON.parse(localStorage.getItem('goride_user') || sessionStorage.getItem('ride_rtree_user') || 'null');
            }
            if (u) {
                const rawKey = u.id || u.email || u.phone;
                if (rawKey) {
                    return String(rawKey).trim().toLowerCase().replace(/[^a-z0-9_@.-]/gi, '_');
                }
            }
        } catch (e) {}
        return 'guest';
    }

    /**
     * Save trip to account-isolated trip history (100% real data)
     */
    /**
     * Cập nhật điểm sự kiện & chỉ số xanh Navigo Race sau mỗi cuốc xe hoàn tất
     * Lưu vào bộ nhớ cục bộ và đồng bộ đa thiết bị qua Firebase Realtime Cloud
     */
    updateUserEcoStats(tripData) {
        if (!tripData) return null;
        try {
            const userKey = this.getCurrentUserKey();
            const storageKey = `navigo_eco_stats_${userKey}`;
            let stats = null;
            try {
                stats = JSON.parse(localStorage.getItem(storageKey) || 'null');
            } catch (e) {}

            if (!stats || typeof stats !== 'object') {
                stats = {
                    totalKm: 0,
                    co2Kg: 0,
                    trees: 0,
                    greenFundVnd: 0,
                    eventPoints: 0,
                    tripsCompleted: 0,
                    medal: 'Người Khởi Đầu',
                    medalIcon: '🥉',
                    history: []
                };
            }

            const distMeters = Number(tripData.distanceMeters || tripData.distance || (this.currentRouteDistance || 3000));
            const tripKm = Math.max(0.1, Number((distMeters > 100 ? distMeters / 1000 : distMeters).toFixed(1)));
            const earnedPoints = Math.max(5, Math.round(tripKm * 10)); // 10 điểm sự kiện / 1 km
            const co2Saved = Number((tripKm * 0.15).toFixed(2));

            stats.totalKm = Number((stats.totalKm + tripKm).toFixed(1));
            stats.co2Kg = Number((stats.totalKm * 0.15).toFixed(1));
            stats.trees = Math.max(1, Math.floor(stats.totalKm / 5));
            stats.greenFundVnd = Math.round(stats.totalKm * 500);
            stats.eventPoints = (stats.eventPoints || 0) + earnedPoints;
            stats.tripsCompleted = (stats.tripsCompleted || 0) + 1;

            if (stats.totalKm < 10) {
                stats.medal = 'Người Khởi Đầu';
                stats.medalIcon = '🥉';
            } else if (stats.totalKm < 50) {
                stats.medal = 'Người Ươm Mầm';
                stats.medalIcon = '🥈';
            } else if (stats.totalKm < 150) {
                stats.medal = 'Sứ Giả Xanh';
                stats.medalIcon = '🥇';
            } else {
                stats.medal = 'Hiệp Sĩ Môi Trường';
                stats.medalIcon = '🏆';
            }

            if (!Array.isArray(stats.history)) stats.history = [];
            stats.history.unshift({
                tripId: tripData.id,
                km: tripKm,
                earnedPoints: earnedPoints,
                co2Saved: co2Saved,
                timestamp: new Date().toISOString()
            });
            if (stats.history.length > 50) stats.history = stats.history.slice(0, 50);

            // Lưu vào bộ nhớ cục bộ
            localStorage.setItem(storageKey, JSON.stringify(stats));
            localStorage.setItem('goride_eco_stats', JSON.stringify(stats));

            // Đồng bộ đa thiết bị qua Firebase Realtime Cloud
            if (typeof realtimeSync !== 'undefined' && typeof realtimeSync.syncEcoStats === 'function') {
                realtimeSync.syncEcoStats(userKey, stats);
            }

            // Phát sự kiện toàn cục để profile.html cập nhật tức thì
            window.dispatchEvent(new CustomEvent('navigo:eco_stats_updated', { detail: { userKey, stats } }));
            return { stats, earnedPoints, tripKm, co2Saved };
        } catch (e) {
            console.warn('[Navigo] updateUserEcoStats warning:', e);
            return null;
        }
    }

    saveUserTrip(tripData) {
        if (!tripData || !tripData.id) return;
        try {
            const userKey = this.getCurrentUserKey();
            const storageKey = `goride_trips_${userKey}`;
            let list = JSON.parse(localStorage.getItem(storageKey) || '[]');
            
            // Clean out any legacy mock trips
            const checkMock = (typeof isMockTrip === 'function') ? isMockTrip : (t => ['trip_vn_101', 'trip_vn_102', 'trip_vn_103', 'trip_vn_104'].includes(t?.id));
            list = list.filter(t => !checkMock(t));

            const pName = tripData.pickupName || (tripData.pickup && (tripData.pickup.name || tripData.pickup.address)) || (this.pickup && this.pickup.name) || 'Điểm đón';
            const dName = tripData.dropoffName || (tripData.destination && (tripData.destination.name || tripData.destination.address)) || (this.destination && this.destination.name) || 'Điểm đến';
            const fare = Number(tripData.fareAmount || tripData.fare || this.selectedVehicleFare || 45000);
            const dist = Number(tripData.distanceMeters || tripData.distance || (this.currentRouteDistance || 3000));
            const vType = tripData.vehicleType || this.selectedService || 'car4';
            const vName = (this.vehicleCatalog && this.vehicleCatalog[vType] && this.vehicleCatalog[vType].name) || 'GoRide Car';

            const record = {
                id: tripData.id,
                userId: userKey,
                status: (tripData.status || 'completed').toLowerCase(),
                pickup: { 
                    name: pName, 
                    lat: tripData.pickupLat || (tripData.pickup && tripData.pickup.lat) || (this.pickup && this.pickup.lat), 
                    lng: tripData.pickupLon || (tripData.pickup && tripData.pickup.lng) || (this.pickup && this.pickup.lng) 
                },
                destination: { 
                    name: dName, 
                    lat: tripData.dropoffLat || (tripData.destination && tripData.destination.lat) || (this.destination && this.destination.lat), 
                    lng: tripData.dropoffLon || (tripData.destination && tripData.destination.lng) || (this.destination && this.destination.lng) 
                },
                pickupCoords: tripData.pickupCoords || (tripData.pickupLat ? [Number(tripData.pickupLat), Number(tripData.pickupLon)] : null) || (this.pickup ? [Number(this.pickup.lat), Number(this.pickup.lng)] : null),
                destinationCoords: tripData.destinationCoords || (tripData.dropoffLat ? [Number(tripData.dropoffLat), Number(tripData.dropoffLon)] : null) || (this.destination ? [Number(this.destination.lat), Number(this.destination.lng)] : null),
                pickupLat: Number(tripData.pickupLat || (this.pickup && this.pickup.lat) || 0),
                pickupLon: Number(tripData.pickupLon || (this.pickup && this.pickup.lng) || 0),
                dropoffLat: Number(tripData.dropoffLat || (this.destination && this.destination.lat) || 0),
                dropoffLon: Number(tripData.dropoffLon || (this.destination && this.destination.lng) || 0),
                routeGeometry: tripData.routeGeometry || this.currentRouteGeometry || null,
                fare: fare,
                fareAmount: fare,
                distance: dist,
                distanceMeters: dist,
                vehicleType: vType,
                vehicleName: vName,
                driver: (tripData.driverName && tripData.driverName !== 'Chưa gán') ? {
                    name: tripData.driverName,
                    plate: tripData.licensePlate || '',
                    model: tripData.vehicleModel || (vName || 'GoRide'),
                    rating: tripData.driverRating || 5.0
                } : (tripData.driver || null),
                rating: (tripData.rating !== undefined ? Number(tripData.rating) : (tripData.userRating ? Number(tripData.userRating) : 5)),
                userRating: (tripData.rating !== undefined ? Number(tripData.rating) : 5),
                cancelReason: tripData.cancelReason || null,
                createdAt: tripData.createdAt || new Date().toISOString(),
                completedAt: tripData.completedAt || (['completed', 'COMPLETED'].includes(tripData.status) ? new Date().toISOString() : null)
            };

            const existingIdx = list.findIndex(x => x.id === tripData.id);
            if (existingIdx !== -1) {
                list[existingIdx] = { ...list[existingIdx], ...record };
            } else {
                list.unshift(record);
            }
            localStorage.setItem(storageKey, JSON.stringify(list));

            // Persist to Database (Firebase RTDB Cloud)
            if (typeof realtimeSync !== 'undefined' && typeof realtimeSync.saveUserTrip === 'function') {
                realtimeSync.saveUserTrip(userKey, record);
            }
        } catch (e) {
            console.warn('[GoRide] Error saving user trip:', e);
        }
    }

    /**
     * Load Customer Trip History - 100% Real data isolated per user account (No mock data)
     */
    async loadTripHistory() {
        const container = document.getElementById('history-trips-container');
        if (!container) return;

        // Ensure all legacy mock trips are thoroughly purged across all storage first
        if (typeof purgeAllMockTrips === 'function') {
            purgeAllMockTrips();
        }

        container.innerHTML = `
            <div style="text-align:center; padding:24px; color:#64748b;">
                <div class="spinner" style="display:inline-block; width:24px; height:24px; border:3px solid #e2e8f0; border-top-color:var(--goride-teal); border-radius:50%; animation:spin 1s linear infinite;"></div>
                <div style="margin-top:8px; font-size:0.85rem;">Đang tải lịch sử chuyến đi...</div>
            </div>
        `;

        try {
            const userKey = this.getCurrentUserKey();
            const storageKey = `goride_trips_${userKey}`;
            
            const checkMock = (typeof isMockTrip === 'function') ? isMockTrip : (t => ['trip_vn_101', 'trip_vn_102', 'trip_vn_103', 'trip_vn_104'].includes(t?.id));

            let userTrips = [];
            try {
                userTrips = JSON.parse(localStorage.getItem(storageKey) || '[]');

            // Sync from Database (Firebase RTDB Cloud)
            if (typeof realtimeSync !== 'undefined' && typeof realtimeSync.getUserTrips === 'function') {
                try {
                    const dbTrips = await realtimeSync.getUserTrips(userKey);
                    if (Array.isArray(dbTrips) && dbTrips.length > 0) {
                        dbTrips.forEach(dt => {
                            if (dt && dt.id && !checkMock(dt)) {
                                const idx = userTrips.findIndex(x => x.id === dt.id);
                                if (idx !== -1) {
                                    userTrips[idx] = { ...userTrips[idx], ...dt };
                                } else {
                                    userTrips.push(dt);
                                }
                            }
                        });
                        localStorage.setItem(storageKey, JSON.stringify(userTrips));
                    }
                } catch (dbErr) {
                    console.warn('[CustomerApp] Error syncing trips from database:', dbErr);
                }
            }
                userTrips = userTrips.filter(t => !checkMock(t));
                localStorage.setItem(storageKey, JSON.stringify(userTrips));
            } catch (e) {
                userTrips = [];
            }

            // Also check alternate email key if user has email different from userKey
            try {
                const u = (typeof sessionManager !== 'undefined' && sessionManager.getCurrentUser?.()) ||
                          JSON.parse(localStorage.getItem('goride_user') || 'null');
                if (u && u.email && u.email.toLowerCase().trim() !== userKey) {
                    const emailKey = `goride_trips_${u.email.toLowerCase().trim()}`;
                    const emailTrips = JSON.parse(localStorage.getItem(emailKey) || '[]').filter(t => !checkMock(t));
                    if (emailTrips.length > 0) {
                        emailTrips.forEach(et => {
                            if (!userTrips.some(ut => ut.id === et.id)) {
                                userTrips.push(et);
                            }
                        });
                        localStorage.setItem(storageKey, JSON.stringify(userTrips));
                    }
                }
            } catch (e) {}

            // Zero mock fallback: If empty, display clean Empty State (never fallback to fake data)
            if (!userTrips || userTrips.length === 0) {
                container.innerHTML = `
                    <div style="text-align:center; padding:44px 16px; color:#94a3b8;">
                        <div style="font-size:2.8rem; margin-bottom:12px;">📋</div>
                        <div style="font-weight:700; color:#334155; font-size:1.05rem;">Chưa có chuyến đi nào</div>
                        <div style="font-size:0.85rem; color:#64748b; margin-top:6px; max-width:280px; margin-left:auto; margin-right:auto; line-height:1.45;">
                            Các chuyến xe bạn đã đặt trên tài khoản này sẽ hiển thị chi tiết tại đây.
                        </div>
                    </div>
                `;
                return;
            }

            // Sort descending by creation date
            userTrips.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

            container.innerHTML = '';
            userTrips.forEach(t => {
                const card = document.createElement('div');
                card.className = 'trip-card';
                card.style.marginBottom = '12px';

                const pickupName = t.pickup ? (t.pickup.name || t.pickup.address || t.pickup) : (t.pickupName || 'Điểm đón');
                const destName = t.destination ? (t.destination.name || t.destination.address || t.destination) : (t.dropoffName || 'Điểm đến');
                const fareFormatted = this.formatMoney(t.fare || t.fareAmount || 0);
                const isCompleted = (t.status === 'completed' || t.status === 'COMPLETED');

                card.innerHTML = `
                    <div class="trip-card-header">
                        <span class="trip-card-date">${this.formatDate(t.createdAt)}</span>
                        <span class="trip-card-status status-${t.status.toLowerCase()}">${isCompleted ? 'Hoàn thành' : 'Đã hủy'}</span>
                    </div>
                    <div class="trip-card-route">
                        <div class="trip-route-stop">${this.escapeHtml(pickupName)}</div>
                        <div class="trip-route-stop stop-destination">${this.escapeHtml(destName)}</div>
                    </div>
                    <div class="trip-card-info">
                        <span>${this.escapeHtml(t.vehicleName || 'GoRide Car')}</span>
                        <span class="trip-card-fare">${fareFormatted}</span>
                    </div>
                `;
                container.appendChild(card);
            });
        } catch (e) {
            console.error('[GoRide] Error loading trips:', e);
            container.innerHTML = `<div style="text-align:center; padding:20px; color:#ef4444;">Không thể tải danh sách chuyến đi.</div>`;
        }
    }

    escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    /**
     * Haversine distance finder helper
     */
    findClosestLocation(lat, lng) {
        let closest = null;
        let minDist = Infinity;

        this.locationsPool.forEach(loc => {
            const dLat = (loc.lat - lat) * 111000;
            const dLng = (loc.lng - lng) * 111000 * Math.cos(lat * Math.PI / 180);
            const dist = Math.sqrt(dLat * dLat + dLng * dLng);

            if (dist < minDist) {
                minDist = dist;
                closest = { location: loc, distanceMeters: dist };
            }
        });

        return closest;
    }

    /**
     * Helpers
     */
    formatMoney(val) {
        return `${Number(val).toLocaleString('vi-VN')} ₫`;
    }

    formatDate(dateStr) {
        if (!dateStr) return 'Gần đây';
        try {
            const d = new Date(dateStr);
            return `${d.getHours()}:${d.getMinutes() < 10 ? '0' : ''}${d.getMinutes()} - ${d.getDate()}/${d.getMonth() + 1}`;
        } catch (e) {
            return 'Gần đây';
        }
    }

    showToast(msg, type = 'info', duration = 3000) {
        if (typeof showToast === 'function') {
            showToast(msg, type, duration);
        } else {
            console.log(`[Toast ${type}]: ${msg}`);
        }
    }
}

// Global initialization
if (typeof window !== 'undefined') {
    window.CustomerAppController = CustomerAppController;
}
document.addEventListener('DOMContentLoaded', () => {
    window.customerAppController = new CustomerAppController();
    window.customerAppController.init();
});
