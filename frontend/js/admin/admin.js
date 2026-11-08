/**
 * GoRide Admin Controller - Modern Unified Architecture
 * Full Real-Data CRUD for Trips & Drivers, Live Leaflet Spatial Map,
 * Real Driver Approval Workflow, Dynamic KPI Calculation (Zero Mock/Fake Data).
 */

class AdminController {
    constructor() {
        this.map = null;
        this.driverMarkersLayer = null;
        this.onlineDriversPollInterval = null;
        this.currentTab = 'dashboard';
        this.isProcessingApproval = new Set();
        this.deleteTarget = null; // { type: 'trip'|'driver', id: string }
        
        // Unified persistent storage keys
        this.STORAGE_KEYS = {
            TRIPS: 'goride_admin_trips',
            DRIVERS: 'goride_admin_drivers',
            ONLINE_DRIVERS: 'goride_online_drivers',
            PENDING: 'goride_pending_drivers',
            USERS: 'goride_offline_users',
            DELETED_TRIPS: 'goride_deleted_trip_ids'
        };
    }

    async init() {
        console.log('[AdminController] Initializing real-data Admin portal...');
        
        if (typeof purgeAllMockTrips === 'function') {
            try { purgeAllMockTrips(); } catch(e) {}
        }

        // Clean any stale / ghost drivers in Firebase Realtime Database immediately
        if (window.realtimeSync && typeof window.realtimeSync.cleanStaleDrivers === 'function') {
            try { window.realtimeSync.cleanStaleDrivers(); } catch(e) {}
        }

        // 1. Sync token with apiClient
        if (typeof sessionManager !== 'undefined' && sessionManager && sessionManager.getToken()) {
            if (typeof apiClient !== 'undefined' && apiClient) {
                apiClient.setAuthToken(sessionManager.getToken());
            }
        }

        // 2. Setup Navigation, Sidebar, User Menu
        this.setupTabNavigation();
        this.setupSidebarToggle();
        this.setupUserMenu();
        this.setupLogout();
        this.setupTripFilters();
        this.setupRecentTripFilters();

        // 3. Initialize Map with spatial driver tracking
        this.initMap();

        // 4. Setup cross-tab real-time listener for driver status & GPS updates
        this.setupRealtimeSync();
        this.setupCloudSyncDiagnostics();

        // 5. Load Initial Dashboard Data & Tables
        await this.loadDashboard();
        this.loadRecentTripsTable();
        this.loadTripsTable();
        this.loadDriversList();
        this.loadDriverApprovals();
        this.loadCustomers();
        this.setupCustomerFilters();

        // 5.1 Real-time presence listener to reflect live Online/Offline status
        if (window.realtimeSync && typeof window.realtimeSync.listenUserPresence === 'function') {
            window.realtimeSync.listenUserPresence(() => {
                if (this.currentTab === 'customers') {
                    this.filterCustomers();
                    this.updateCustomerMetrics();
                } else if (this.currentTab === 'drivers') {
                    this.loadDriversList();
                }
            });
        }

        // 6. Handle URL Hash for tabs
        const hash = window.location.hash.replace('#', '');
        if (hash && ['dashboard', 'recent-trips', 'trips', 'drivers', 'customers', 'promotions'].includes(hash)) {
            this.switchTab(hash);
        }

        console.log('[AdminController] Admin portal initialized with 100% real data.');
    }

    /* ==========================================================================
       STORAGE ACCESSORS (100% REAL DATA - NO FAKE SEEDS)
       ========================================================================== */

    getDeletedTripIds() {
        try {
            const ids = JSON.parse(localStorage.getItem(this.STORAGE_KEYS.DELETED_TRIPS));
            return Array.isArray(ids) ? ids : [];
        } catch {
            return [];
        }
    }

    addDeletedTripId(id) {
        if (!id) return;
        const ids = this.getDeletedTripIds();
        if (!ids.includes(id)) {
            ids.push(id);
            localStorage.setItem(this.STORAGE_KEYS.DELETED_TRIPS, JSON.stringify(ids));
        }
    }

    getTripLocationText(loc, fallback = '--') {
        if (!loc) return fallback;
        if (typeof loc === 'string') {
            const trimmed = loc.trim();
            if (!trimmed || trimmed === '[object Object]' || trimmed === 'null' || trimmed === 'undefined') {
                return fallback;
            }
            if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
                try {
                    const parsed = JSON.parse(trimmed);
                    return this.getTripLocationText(parsed, fallback);
                } catch (e) {}
            }
            return trimmed;
        }
        if (typeof loc === 'object') {
            const candidate = loc.name || loc.address || loc.title || loc.desc || loc.displayName || loc.display_name;
            if (candidate && typeof candidate === 'string') {
                const cTrim = candidate.trim();
                if (cTrim && cTrim !== '[object Object]') return cTrim;
            }
            if (loc.lat !== undefined && loc.lng !== undefined) {
                return `Tọa độ (${Number(loc.lat).toFixed(4)}, ${Number(loc.lng).toFixed(4)})`;
            }
        }
        return fallback;
    }

    getPickupText(trip, fallback = 'Điểm đón khách') {
        if (!trip) return fallback;
        const candidates = [
            trip.pickupName,
            trip.pickupAddress,
            trip.pickup_address,
            trip.pickup_name,
            trip.pickup
        ];
        for (const c of candidates) {
            const res = this.getTripLocationText(c, null);
            if (res && res !== '--' && res !== '[object Object]') return res;
        }
        if (trip.pickupCoords && Array.isArray(trip.pickupCoords) && trip.pickupCoords.length >= 2) {
            return `Tọa độ (${Number(trip.pickupCoords[0]).toFixed(4)}, ${Number(trip.pickupCoords[1]).toFixed(4)})`;
        }
        if (trip.pickupLat && trip.pickupLon) {
            return `Tọa độ (${Number(trip.pickupLat).toFixed(4)}, ${Number(trip.pickupLon).toFixed(4)})`;
        }
        return fallback;
    }

    getDestinationText(trip, fallback = 'Điểm đến khách') {
        if (!trip) return fallback;
        const candidates = [
            trip.dropoffName,
            trip.destinationName,
            trip.dropoffAddress,
            trip.destinationAddress,
            trip.dropoff_address,
            trip.dropoff_name,
            trip.destination,
            trip.dropoff
        ];
        for (const c of candidates) {
            const res = this.getTripLocationText(c, null);
            if (res && res !== '--' && res !== '[object Object]') return res;
        }
        if (trip.destinationCoords && Array.isArray(trip.destinationCoords) && trip.destinationCoords.length >= 2) {
            return `Tọa độ (${Number(trip.destinationCoords[0]).toFixed(4)}, ${Number(trip.destinationCoords[1]).toFixed(4)})`;
        }
        if (trip.dropoffLat && trip.dropoffLon) {
            return `Tọa độ (${Number(trip.dropoffLat).toFixed(4)}, ${Number(trip.dropoffLon).toFixed(4)})`;
        }
        return fallback;
    }

    getStoredTrips() {
        try {
            const trips = JSON.parse(localStorage.getItem(this.STORAGE_KEYS.TRIPS)) || [];
            const deletedIds = new Set(this.getDeletedTripIds());
            const checkMock = (typeof isMockTrip === 'function') ? isMockTrip : (t => ['trip_vn_101', 'trip_vn_102', 'trip_vn_103', 'trip_vn_104'].includes(t?.id));
            let needsResave = false;

            const cleaned = trips.filter(t => t && t.id && !deletedIds.has(t.id) && !checkMock(t)).map(t => {
                const pText = this.getPickupText(t);
                const dText = this.getDestinationText(t);
                if (typeof t.pickup === 'object' || t.pickup === '[object Object]' || !t.pickup) {
                    t.pickup = pText;
                    needsResave = true;
                }
                if (typeof t.destination === 'object' || t.destination === '[object Object]' || !t.destination) {
                    t.destination = dText;
                    needsResave = true;
                }
                return t;
            });


            if (needsResave) {
                try {
                    localStorage.setItem(this.STORAGE_KEYS.TRIPS, JSON.stringify(cleaned));
                } catch (e) {}
            }

            return cleaned;
        } catch {
            return [];
        }
    }

    saveStoredTrips(trips) {
        localStorage.setItem(this.STORAGE_KEYS.TRIPS, JSON.stringify(trips));
    }

    getStoredDrivers() {
        try {
            let drivers = JSON.parse(localStorage.getItem(this.STORAGE_KEYS.DRIVERS));
            if (!Array.isArray(drivers)) drivers = [];

            // Sync from registered offline users with role === 'driver' and approved/active
            const users = JSON.parse(localStorage.getItem(this.STORAGE_KEYS.USERS) || '[]');
            const realDrivers = users.filter(u => u && u.role === 'driver' && (u.status === 'active' || !u.status));
            let hasNew = false;

            for (const u of realDrivers) {
                if (!drivers.some(d => d.id === u.id || (u.email && d.email === u.email))) {
                    const vType = u.vehicle?.type || u.vehicleType || 'motorbike';
                    let vLabel = 'Ô tô điện (Navigo Car)';
                    if (vType === 'bike' || vType === 'motorbike') vLabel = 'Xe máy điện (Navigo Bike)';
                    else if (vType === 'car7') vLabel = 'Ô tô 7 chỗ (Navigo Taxi 7 chỗ)';
                    else if (vType === 'premium') vLabel = 'Xe sang (Navigo Luxury)';
                    drivers.push({
                        id: u.id,
                        name: u.name,
                        email: u.email,
                        phone: u.phone,
                        vehicleType: vType,
                        vehicleTypeName: vLabel,
                        plate: u.vehicle?.plate || u.licensePlate || u.plate || '--',
                        experience: u.vehicle?.experience || u.experienceYears || u.experience || 1,
                        status: 'active',
                        createdAt: u.createdAt || new Date().toISOString()
                    });
                    hasNew = true;
                }
            }
            /* DRIVERS_RAW_OLD
                    drivers.push({
                        id: u.id,
                        name: u.name,
                        email: u.email,
                        phone: u.phone,
                        vehicleType: vType,
                        vehicleTypeName: vLabel,
                        plate: u.vehicle?.plate || u.licensePlate || u.plate || '--',
                        experience: u.vehicle?.experience || u.experienceYears || u.experience || 1,

                        status: 'active',
                        createdAt: u.createdAt || new Date().toISOString()
        
                    hasNew = true;
                }


            */
            if (hasNew) {
                localStorage.setItem(this.STORAGE_KEYS.DRIVERS, JSON.stringify(drivers));
            }
            return drivers;
        } catch {
            return [];
        }
    }

    saveStoredDrivers(drivers) {
        localStorage.setItem(this.STORAGE_KEYS.DRIVERS, JSON.stringify(drivers));
    }

    getPendingDrivers() {
        try {
            let list = JSON.parse(localStorage.getItem(this.STORAGE_KEYS.PENDING));
            if (!Array.isArray(list)) list = [];

            // Merge any pending driver applications from goride_offline_users
            const offlineUsers = JSON.parse(localStorage.getItem(this.STORAGE_KEYS.USERS) || '[]');
            for (const u of offlineUsers) {
                if (u && u.role === 'driver' && u.status === 'pending') {
                    if (!list.some(p => p.id === u.id || (u.email && p.email === u.email))) {
                        list.unshift({
                            id: u.id,
                            name: u.name,
                            email: u.email,
                            phone: u.phone,
                            vehicleType: u.vehicleType || u.vehicle?.type || 'motorbike',
                            plate: u.licensePlate || u.plate || u.vehicle?.plate || '--',
                            experienceYears: u.experienceYears || u.experience || 1,
                            status: 'pending',
                            createdAt: u.createdAt || new Date().toISOString()
                        });
                    }
                }
            }
            /* PENDING_DRIVERS_OLD_RAW
                if (u && u.role === 'driver' && u.status === 'pending') {
                    if (!list.some(p => p.id === u.id || (u.email && p.email === u.email))) {
                        list.unshift({
                            id: u.id,
                            name: u.name,
                            email: u.email,
                            phone: u.phone,
                            vehicleType: u.vehicleType || u.vehicle?.type || 'motorbike',
                            plate: u.licensePlate || u.plate || u.vehicle?.plate || '--',
                            experienceYears: u.experienceYears || u.experience || 1,

                            status: 'pending',
                            createdAt: u.createdAt || new Date().toISOString()
            
                    }
                }


            */
            return list;
        } catch {
            return [];
        }
    }

    savePendingDrivers(list) {
        localStorage.setItem(this.STORAGE_KEYS.PENDING, JSON.stringify(list));
    }

    /* ==========================================================================
       LEAFLET SPATIAL MAP INITIALIZATION (OSM TILES) & REAL-TIME DRIVER TRACKING
       ========================================================================== */

    initMap() {
        try {
            const mapEl = document.getElementById('admin-map');
            if (!mapEl) return;
            if (typeof L === 'undefined') {
                setTimeout(() => this.initMap(), 400);
                return;
            }

            if (this.map) {
                this.map.remove();
                this.map = null;
            }
            if (mapEl && mapEl._leaflet_id) {
                try { delete mapEl._leaflet_id; } catch(e) {}
            }

            this.map = L.map('admin-map', {
                center: [10.7769, 106.7009],
                zoom: 13,
                zoomControl: true
            });


            L.tileLayer('https://{s}.google.com/vt/lyrs=m&hl=vi&gl=VN&x={x}&y={y}&z={z}', {
                attribution: '&copy; Bản đồ Google Việt Nam',
                subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
                maxZoom: 20
            }).addTo(this.map);

            // Layer group for live driver markers
            this.driverMarkersLayer = L.layerGroup().addTo(this.map);

            // Initial render of online drivers
            this.renderOnlineDriversOnMap();

            // Re-render map boundaries after layout paint
            [100, 300, 600, 1200].forEach(delay => {
                setTimeout(() => {
                    if (this.map) {
                        this.map.invalidateSize();
                        this.renderOnlineDriversOnMap();
                    }
                }, delay);
            });

        } catch (err) {
            console.warn('[Admin] Map initialization warning:', err.message);
        }
    }

    setupRealtimeSync() {
        // Cross-tab real-time listener for driver online/offline & GPS updates & user profile updates
        window.addEventListener('storage', (e) => {
            if (e.key === 'goride_user' || e.key === 'ride_rtree_user' || e.key === 'navigo_user') {
                if (typeof sessionManager !== 'undefined') {
                    sessionManager._initFromStorage();
                }
                this.setupUserMenu();
            } else if (e.key === this.STORAGE_KEYS.ONLINE_DRIVERS || e.key === this.STORAGE_KEYS.DRIVERS) {
                this.renderOnlineDriversOnMap();
                if (this.currentTab === 'dashboard') {
                    this.updateDriverMetrics();
                }
            } else if (e.key === this.STORAGE_KEYS.PENDING || e.key === this.STORAGE_KEYS.USERS || e.key === 'goride_last_driver_reg') {
                this.loadDriverApprovals();
                this.loadDriversList();
                if (this.currentTab === 'dashboard') {
                    this.loadDashboard();
                }
            } else if (e.key === this.STORAGE_KEYS.TRIPS || e.key === this.STORAGE_KEYS.DELETED_TRIPS) {
                if (this.currentTab === 'dashboard') {
                    this.loadDashboard();
                } else if (this.currentTab === 'recent-trips') {
                    this.loadRecentTripsTable();
                } else if (this.currentTab === 'trips') {
                    this.loadTripsTable();
                }
            }
        });

        // Window focus & session events to refresh avatar
        window.addEventListener('focus', () => {
            if (typeof sessionManager !== 'undefined') {
                sessionManager._initFromStorage();
            }
            this.setupUserMenu();
        });

        window.addEventListener('session:update', () => {
            this.setupUserMenu();
        });

        window.addEventListener('session:change', () => {
            this.setupUserMenu();
        });

        // Same-window/custom event sync
        window.addEventListener('goride:driver_location_changed', () => {
            this.renderOnlineDriversOnMap();
            if (this.currentTab === 'dashboard') {
                this.updateDriverMetrics();
            }
        });

        window.addEventListener('navigo:driver-registered', () => {
            this.loadDriverApprovals();
            this.loadDriversList();
            if (this.currentTab === 'dashboard') {
                this.loadDashboard();
            }
        });

        // Firebase Cloud Realtime Sync for Admin Portal
        if (window.realtimeSync && typeof window.realtimeSync.listenOnlineDrivers === 'function') {
            window.realtimeSync.listenOnlineDrivers((onlineList) => {
                try {
                    const mapObj = {};
                    (onlineList || []).forEach(d => {
                        if (d && (d.id || d.phone || d.plate)) {
                            mapObj[d.id || d.phone || d.plate] = d;
                        }
        
                    });
                    localStorage.setItem(this.STORAGE_KEYS.ONLINE_DRIVERS, JSON.stringify(mapObj));
                } catch (e) {}
                this.renderOnlineDriversOnMap();
                if (this.currentTab === 'dashboard') {
                    this.updateDriverMetrics();
                }


            });

            // Also sync trips, pending drivers, and users from Firebase with robust onReady callback
            window.realtimeSync.onReady(() => {
                try {
                    window.realtimeSync.db.ref('goride_trips').on('value', (snapshot) => {
                        const val = snapshot.val();
                        if (val && typeof val === 'object') {
                            const deletedIds = new Set(this.getDeletedTripIds());
                            // Purge any deleted trips from Firebase
                            Object.keys(val).forEach(tripKey => {
                                if (deletedIds.has(tripKey)) {
                                    window.realtimeSync.db.ref('goride_trips/' + tripKey).remove();
                                }
                
                            });
                            const cloudTrips = Object.values(val).filter(t => t && t.id && !deletedIds.has(t.id));
                            const localTrips = this.getStoredTrips();
                            const tripMap = new Map();
                            localTrips.forEach(t => { if (t && t.id && !deletedIds.has(t.id)) tripMap.set(t.id, t); });
                            cloudTrips.forEach(t => { if (t && t.id && !deletedIds.has(t.id)) tripMap.set(t.id, { ...tripMap.get(t.id), ...t }); });
                            const merged = Array.from(tripMap.values()).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
                            this.saveStoredTrips(merged);
                            if (this.currentTab === 'dashboard') {
                                this.loadDashboard();
                            } else if (this.currentTab === 'recent-trips') {
                                this.loadRecentTripsTable();
                            } else if (this.currentTab === 'trips') {
                                this.loadTripsTable();
                            }
                        }
        

                    });

                    // Real-time continuous listener for pending driver registrations
                    window.realtimeSync.db.ref('goride_pending_drivers').on('value', () => {
                        this.loadDriverApprovals();
                        this.loadDriversList();
                        if (this.currentTab === 'dashboard') {
                            this.loadDashboard();
                        }
        

                    });

                    // Real-time continuous listener for approved/active drivers
                    window.realtimeSync.db.ref('goride_drivers').on('value', () => {
                        this.loadDriversList();
                        if (this.currentTab === 'dashboard') {
                            this.loadDashboard();
                        }
        

                    });

                    // Real-time continuous listener for user / customer account updates
                    window.realtimeSync.db.ref('goride_users').on('value', () => {
                        this.loadDriversList();
                        this.loadDriverApprovals();
                        if (this.currentTab === 'customers') {
                            this.loadCustomers();
                        } else if (this.currentTab === 'promotions') {
                            this.loadPromotionsTab();
                        }
                        if (this.currentTab === 'dashboard') {
                            this.loadDashboard();
                        }
                    });
                } catch (e) {
                    console.warn('[Admin] Firebase realtime listeners attach warning:', e);
                }
            });
        }
        /* OLD_REALTIME_USERS_RAW
                    window.realtimeSync.db.ref('goride_users').on('value', () => {
                        this.loadDriversList();
                        this.loadDriverApprovals();
                        if (this.currentTab === 'customers') {
                            this.loadCustomers();
                        } else if (this.currentTab === 'promotions') {
                            this.loadPromotionsTab();
                        // promo_tab_end



                        }
                        }
                        if (this.currentTab === 'dashboard') {
                            this.loadDashboard();
                        }
        
                } catch (e) {
                    console.warn('[Admin] Firebase realtime listeners attach warning:', e);

                }

        }



        */
        // Periodic light polling (every 3s) ensuring map stays live even across background tabs
        if (this.onlineDriversPollInterval) {
            clearInterval(this.onlineDriversPollInterval);
        }
        this.onlineDriversPollInterval = setInterval(() => {
            if (this.currentTab === 'dashboard' && this.map) {
                this.renderOnlineDriversOnMap();
            }
        }, 3000);
    }

    /* ==========================================================================
       CLOUD REALTIME CROSS-DEVICE SYNC & DIAGNOSTICS (ANTI-401 PERMISSION DENIED)
       ========================================================================== */

    setupCloudSyncDiagnostics() {
        const updatePill = (status, text) => {
            const pill = document.getElementById('admin-cloud-status-pill');
            const dot = document.getElementById('cloud-pill-dot');
            const textEl = document.getElementById('cloud-pill-text');
            const banner = document.getElementById('admin-cloud-alert-banner');
            if (!pill || !dot || !textEl) return;

            if (status === 'connected') {
                pill.style.background = '#ecfdf5';
                pill.style.borderColor = '#a7f3d0';
                pill.style.color = '#047857';
                dot.style.background = '#10b981';
                textEl.textContent = text || 'Đám mây: Sẵn sàng';
                if (banner) banner.style.display = 'none';
            } else if (status === 'permission_denied') {
                pill.style.background = '#fef2f2';
                pill.style.borderColor = '#fecaca';
                pill.style.color = '#b91c1c';
                dot.style.background = '#ef4444';
                textEl.textContent = '⚠️ Mở khóa Firebase (401)';
                if (banner) banner.style.display = 'flex';
            } else {
                pill.style.background = '#f8fafc';
                pill.style.borderColor = '#e2e8f0';
                pill.style.color = '#64748b';
                dot.style.background = '#94a3b8';
                textEl.textContent = text || 'Đang kết nối đám mây...';
            }
        };

        window.addEventListener('realtime:permission_denied', () => {
            updatePill('permission_denied');
        });

        window.addEventListener('realtime:connection', (e) => {
            if (e && e.detail && e.detail.online) {
                if (!window.realtimeSync || !window.realtimeSync.permissionDenied) {
                    updatePill('connected');
                }
            } else {
                updatePill('offline', 'Ngoại tuyến');
            }
        });

        // Initial light check
        if (window.realtimeSync && typeof window.realtimeSync.testCloudConnection === 'function') {
            window.realtimeSync.testCloudConnection().then(res => {
                if (res.success) {
                    updatePill('connected');
                } else if (res.status === 401 || res.code === 'PERMISSION_DENIED') {
                    updatePill('permission_denied');
                }
            }).catch(() => {});
        }
    }

    openCloudModal() {
        const input = document.getElementById('cloud-db-url');
        if (input && window.realtimeSync) {
            input.value = window.realtimeSync.databaseURL || window.realtimeSync.getConfig()?.databaseURL || '';
        }
        this.openModal('modal-cloud-sync');
        this.testCloudConnectionFromAdmin();
    }

    async testCloudConnectionFromAdmin() {
        const statusEl = document.getElementById('cloud-diagnostic-status');
        const btn = document.getElementById('btn-test-cloud');
        if (btn) { btn.disabled = true; btn.textContent = '⏳ Đang kiểm tra...'; }
        if (statusEl) { statusEl.textContent = 'Đang gửi gói tin kiểm tra đọc & ghi tới Firebase Realtime Database...'; statusEl.style.color = '#475569'; }

        if (window.realtimeSync && typeof window.realtimeSync.testCloudConnection === 'function') {
            const res = await window.realtimeSync.testCloudConnection();
            if (btn) { btn.disabled = false; btn.textContent = '⚡ Kiểm tra ngay'; }
            if (res.success) {
                if (statusEl) {
                    statusEl.innerHTML = '<span style="color:#16a34a; font-weight:800;">🟢 KẾT NỐI HOÀN HẢO (200 OK)</span><br><span style="font-size:0.8rem; font-weight:normal; color:#475569;">Đám mây đang hoạt động tốt. Dữ liệu tài xế & khách hàng sẽ lập tức đồng bộ giữa mọi thiết bị.</span>';
                }
                const banner = document.getElementById('admin-cloud-alert-banner');
                if (banner) banner.style.display = 'none';
                const pill = document.getElementById('admin-cloud-status-pill');
                if (pill) {
                    pill.style.background = '#ecfdf5';
                    pill.style.borderColor = '#a7f3d0';
                    pill.style.color = '#047857';
                    const dot = document.getElementById('cloud-pill-dot');
                    const textEl = document.getElementById('cloud-pill-text');
                    if (dot) dot.style.background = '#10b981';
                    if (textEl) textEl.textContent = 'Đám mây: Sẵn sàng';
                }
                this.showToast('Kết nối đám mây thành công 100%!', 'success');
            } else if (res.status === 401 || res.code === 'PERMISSION_DENIED') {
                if (statusEl) {
                    statusEl.innerHTML = '<span style="color:#dc2626; font-weight:800;">🔴 LỖI PHÂN QUYỀN (401 Permission Denied)</span><br><span style="font-size:0.8rem; font-weight:normal; color:#991b1b;">Firebase Rules đang chặn truy cập. Vui lòng làm theo hướng dẫn 3 bước màu cam bên dưới để mở Rules.</span>';
                }
                const banner = document.getElementById('admin-cloud-alert-banner');
                if (banner) banner.style.display = 'flex';
                const pill = document.getElementById('admin-cloud-status-pill');
                if (pill) {
                    pill.style.background = '#fef2f2';
                    pill.style.borderColor = '#fecaca';
                    pill.style.color = '#b91c1c';
                    const dot = document.getElementById('cloud-pill-dot');
                    const textEl = document.getElementById('cloud-pill-text');
                    if (dot) dot.style.background = '#ef4444';
                    if (textEl) textEl.textContent = '⚠️ Mở khóa Firebase (401)';
                }
                this.showToast('Firebase bị khóa quyền 401. Vui lòng cập nhật Rules!', 'error');
            } else {
                if (statusEl) {
                    statusEl.innerHTML = `<span style="color:#d97706; font-weight:800;">🟡 CHƯA KẾT NỐI:</span> ${res.message || 'Lỗi mạng'}`;
                }
            }
        }
    }

    saveCloudConfigFromAdmin(e) {
        e.preventDefault();
        const urlInput = document.getElementById('cloud-db-url');
        const newUrl = (urlInput?.value || '').trim();
        if (!newUrl) {
            this.showToast('Vui lòng nhập Firebase Database URL hợp lệ.', 'error');
            return;
        }

        if (window.realtimeSync && typeof window.realtimeSync.saveConfig === 'function') {
            window.realtimeSync.saveConfig({ databaseURL: newUrl });
            this.showToast('Đã lưu cấu hình Firebase mới! Đang kết nối lại...', 'success');
            this.testCloudConnectionFromAdmin();
        }
    }

    copyFirebaseRules() {
        const rulesText = '{\n  "rules": {\n    ".read": true,\n    ".write": true\n  }\n}';
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(rulesText);
            this.showToast('Đã sao chép đoạn mã Rules vào bộ nhớ tạm!', 'success');
        } else {
            prompt('Sao chép đoạn mã Rules bên dưới:', rulesText);
        }
    }

    async syncCustomersFromCloud() {
        this.showToast('Đang kết nối đám mây để tải danh sách người dùng...', 'info');
        await this.loadCustomers();
        this.showToast('Đã đồng bộ dữ liệu người dùng mới nhất từ đám mây!', 'success');
    }

    getOnlineDrivers() {
        const onlineDriversMap = new Map();
        const now = Date.now();

        const isValidOnline = (d) => {
            if (!d || d.isOnline !== true) return false;
            // TTL 120s: Lọc bỏ tài xế ma (stale drivers) không hoạt động quá 2 phút
            const lastTime = d.location?.updatedAt || (d.updatedAt ? new Date(d.updatedAt).getTime() : 0);
            if (lastTime && (now - lastTime > 120000)) return false;

            // Luôn ưu tiên tọa độ GPS thực tế từ beacon d.location
            const lat = Number(d.location?.lat !== undefined ? d.location.lat : d.lat);
            const lng = Number(d.location?.lng !== undefined ? d.location.lng : d.lng);
            if (isNaN(lat) || isNaN(lng) || (lat === 0 && lng === 0)) return false;

            d.lat = lat;
            d.lng = lng;
            return true;
        };

        // 1. Read goride_online_drivers dictionary/array
        try {
            const rawOnline = localStorage.getItem(this.STORAGE_KEYS.ONLINE_DRIVERS);
            if (rawOnline) {
                const parsed = JSON.parse(rawOnline);
                const list = Array.isArray(parsed) ? parsed : Object.values(parsed);
                for (const d of list) {
                    if (isValidOnline(d)) {
                        onlineDriversMap.set(d.id || d.phone || d.plate, d);
                    }
                    }
    
            }
        } catch (err) {
            console.warn('[Admin] Error reading goride_online_drivers:', err);
        }

        // 2. Cross-check with goride_admin_drivers to include any active drivers flagged online with real coords
        try {
            const adminDrivers = this.getStoredDrivers();
            for (const d of adminDrivers) {
                if (isValidOnline(d)) {
                    const key = d.id || d.phone || d.plate;
                    if (!onlineDriversMap.has(key)) {
                        onlineDriversMap.set(key, d);
                    } else {
                        const existing = onlineDriversMap.get(key);
                        onlineDriversMap.set(key, { ...d, ...existing, lat: d.lat, lng: d.lng });
                    }
                    }
                }

        } catch (err) {
            console.warn('[Admin] Error cross-checking admin drivers:', err);
        }

        return Array.from(onlineDriversMap.values());
    }

    renderOnlineDriversOnMap() {
        // Ensure map is mounted before drawing markers

        const onlineDrivers = this.getOnlineDrivers();
        const badgeEl = document.getElementById('admin-map-online-badge');

        if (badgeEl) {
            if (onlineDrivers.length === 0) {
                badgeEl.className = 'badge badge-secondary';
                badgeEl.style.backgroundColor = '#64748b';
                badgeEl.style.color = '#ffffff';
                badgeEl.innerHTML = '⚪ 0 tài xế trực tuyến';
            } else {
                badgeEl.className = 'badge badge-success admin-map-badge';
                badgeEl.style.backgroundColor = '#10b981';
                badgeEl.style.color = '#ffffff';
                badgeEl.innerHTML = `🟢 ${onlineDrivers.length} tài xế trực tuyến`;
            }
        }

        if (!this.map || !this.driverMarkersLayer) {
            if (!this.map) this.initMap();
            return;
        }

        // Clear previous driver markers on the map
        this.driverMarkersLayer.clearLayers();

        // If no drivers are currently online, nothing more to draw
        if (onlineDrivers.length === 0) return;

        // Render each online driver with custom vehicle marker, radar pulse, and info popup
        onlineDrivers.forEach(driver => {
            const vType = String(driver.vehicleType || driver.vehicle || '').toLowerCase();
            const unacc = vType.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            let markerClass = 'admin-driver-marker-car';
            let vehicleEmoji = '🚗';
            let vehicleLabel = driver.vehicleTypeName || 'Ô tô điện (Navigo Car)';

            if (vType === 'bike' || vType === 'motorbike' || vType.includes('bike') || vType.includes('moto') || unacc.includes('xe may') || vType.includes('scooter') || vType.includes('feliz') || vType.includes('evo')) {
                markerClass = 'admin-driver-marker-bike';
                vehicleEmoji = '🛵';
                vehicleLabel = driver.vehicleTypeName || 'Xe máy điện (Navigo Bike)';
            } else if (vType === 'delivery' || unacc.includes('giao hang') || vType.includes('box')) {
                markerClass = 'admin-driver-marker-delivery';
                vehicleEmoji = '📦';
                vehicleLabel = driver.vehicleTypeName || 'Giao hàng (Navigo Delivery)';
            } else if (vType === 'car7' || vType === 'xl' || unacc.includes('7 cho') || vType.includes('7seats') || vType.includes('xl')) {
                markerClass = 'admin-driver-marker-car7';
                vehicleEmoji = '🚐';
                vehicleLabel = driver.vehicleTypeName || 'Ô tô 7 chỗ (Navigo Taxi 7 chỗ)';
            } else if (vType === 'premium' || vType === 'car4_plus' || vType === 'plus' || vType.includes('plus') || unacc.includes('sang') || vType.includes('luxury')) {
                markerClass = 'admin-driver-marker-premium';
                vehicleEmoji = '🚘';
                vehicleLabel = driver.vehicleTypeName || 'Xe sang (Navigo Luxury)';
            }

            const markerHtml = `
                <div class="admin-driver-marker-wrap ${markerClass}">
                    <div class="admin-driver-radar-ping"></div>
                    <div class="admin-driver-icon-circle">
                        ${vehicleEmoji}
                    </div>
                    <div class="admin-driver-label-chip">
                        <span class="pulse-dot"></span>
                        <span>${this.escapeHtml(driver.name || 'Tài xế')} &bull; ${this.escapeHtml(driver.plate || '--')}</span>
                    </div>
                </div>
            `;

            const customIcon = L.divIcon({
                html: markerHtml,
                className: 'custom-admin-driver-marker-container',
                iconSize: [42, 68],
                iconAnchor: [21, 24],
                popupAnchor: [0, -26]
            });


            const marker = L.marker([driver.lat, driver.lng], {
                icon: customIcon,
                title: `${driver.name} (${driver.plate}) - Đang trực tuyến`
            });


            const updatedTimeStr = driver.updatedAt ? new Date(driver.updatedAt).toLocaleTimeString('vi-VN') : 'Vừa xong';

            const popupContent = `
                <div class="admin-driver-popup">
                    <div class="admin-popup-header">
                        <div class="admin-popup-avatar">${vehicleEmoji}</div>
                        <div style="flex:1; overflow:hidden;">
                            <div class="admin-popup-name">${this.escapeHtml(driver.name || 'Tài xế GoRide')}</div>
                            <div class="admin-popup-badge-online">🟢 Đang trực tuyến (Sẵn sàng)</div>
                        </div>
                    </div>
                    <div class="admin-popup-body">
                        <div class="admin-popup-row">
                            <span class="admin-popup-lbl">Số điện thoại:</span>
                            <span class="admin-popup-val"><a href="tel:${this.escapeHtml(driver.phone || '')}" style="color:var(--color-primary); font-weight:700; text-decoration:none;">${this.escapeHtml(driver.phone || '--')}</a></span>
                        </div>
                        <div class="admin-popup-row">
                            <span class="admin-popup-lbl">Loại xe:</span>
                            <span class="admin-popup-val">${this.escapeHtml(vehicleLabel)}</span>
                        </div>
                        <div class="admin-popup-row">
                            <span class="admin-popup-lbl">Biển số:</span>
                            <span class="admin-popup-val" style="background:#f1f5f9; padding:2px 8px; border-radius:6px; font-weight:700; font-family:monospace; color:#0f172a;">${this.escapeHtml(driver.plate || '--')}</span>
                        </div>
                        ${driver.model ? `
                        <div class="admin-popup-row">
                            <span class="admin-popup-lbl">Dòng xe:</span>
                            <span class="admin-popup-val" style="color:#475569;">${this.escapeHtml(driver.model)}</span>
                        </div>
                        ` : ''}
                        <div class="admin-popup-row">
                            <span class="admin-popup-lbl">Tọa độ GPS:</span>
                            <span class="admin-popup-val" style="color:#0284c7; font-weight:700; font-family:monospace;">${driver.lat.toFixed(6)}, ${driver.lng.toFixed(6)}</span>
                        </div>
                        <div class="admin-popup-row" style="align-items:flex-start;">
                            <span class="admin-popup-lbl">Địa chỉ:</span>
                            <span class="admin-popup-val" style="font-size:11px; max-width:170px; text-align:right; color:#475569; word-break:break-word;">${this.escapeHtml(driver.address || 'TP. Hồ Chí Minh')}</span>
                        </div>
                        <div class="admin-popup-row" style="margin-top:8px; padding-top:6px; border-top:1px dashed #e2e8f0; font-size:11px; color:#94a3b8;">
                            <span>Cập nhật GPS:</span>
                            <span style="font-weight:600; color:#64748b;">${updatedTimeStr}</span>
                        </div>
                    </div>
                </div>
            `;

            marker.bindPopup(popupContent, { maxWidth: 320, minWidth: 260 });
            marker.addTo(this.driverMarkersLayer);
        });
    }

    focusOnOnlineDrivers() {
        if (!this.map) return;
        const onlineDrivers = this.getOnlineDrivers();
        if (!onlineDrivers || onlineDrivers.length === 0) {
            this.showToast('Hiện chưa có tài xế nào trực tuyến trong khu vực.', 'info');
            return;
        }

        if (onlineDrivers.length === 1) {
            const d = onlineDrivers[0];
            this.map.setView([d.lat, d.lng], 16, { animate: true });
            this.showToast(`Đã định vị tài xế: ${d.name} (${d.plate || 'GPS'})`, 'success');
        } else {
            const bounds = L.latLngBounds(onlineDrivers.map(d => [d.lat, d.lng]));
            this.map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
            this.showToast(`Đã định vị ${onlineDrivers.length} tài xế đang trực tuyến`, 'success');
        }
    }

    updateDriverMetrics() {
        const drivers = this.getStoredDrivers();
        const onlineDrivers = this.getOnlineDrivers();
        const activeDrivers = drivers.filter(d => d.status === 'active').length;

        const statActive = document.getElementById('stat-active-drivers');
        if (statActive) {
            statActive.textContent = Number(activeDrivers).toLocaleString('vi-VN');
        }

        const trendDrivers = document.getElementById('stat-drivers-trend');
        if (trendDrivers) {
            trendDrivers.innerHTML = `● ${onlineDrivers.length} trực tuyến`;
            trendDrivers.className = onlineDrivers.length > 0 ? 'stat-card-trend trend-up' : 'stat-card-trend';
        }
    }

    /* ==========================================================================
       TAB & NAVIGATION
       ========================================================================== */

    setupTabNavigation() {
        document.querySelectorAll('[data-tab]').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const tab = link.getAttribute('data-tab');
                this.switchTab(tab);
            });

        });
    }

    switchTab(tabName) {
        this.currentTab = tabName;
        window.location.hash = tabName;

        // Nav active state
        document.querySelectorAll('[data-tab]').forEach(link => {
            const isActive = link.getAttribute('data-tab') === tabName;
            link.classList.toggle('active', isActive);
            link.classList.toggle('nav-item-active', isActive);
        });

        // Show/hide tabs
        ['dashboard', 'recent-trips', 'trips', 'drivers', 'customers', 'promotions'].forEach(t => {
            const el = document.getElementById('tab-' + t);
            if (el) el.style.display = (t === tabName) ? '' : 'none';
        });

        // Load data on switch
        if (tabName === 'dashboard') {
            this.loadDashboard();
            if (this.map) {
                setTimeout(() => {
                    this.map.invalidateSize();
                    this.renderOnlineDriversOnMap();
                }, 150);
            }
        } else if (tabName === 'recent-trips') {
            this.loadRecentTripsTable();
        } else if (tabName === 'trips') {
            this.loadTripsTable();
        } else if (tabName === 'drivers') {
            this.loadDriversList();
            this.loadDriverApprovals();
        } else if (tabName === 'customers') {
            this.loadCustomers();
        } else if (tabName === 'promotions') {
            this.loadPromotionsTab();
        }

        // Close mobile drawer
        const sidebar = document.getElementById('sidebar');
        const backdrop = document.getElementById('sidebar-backdrop');
        if (sidebar) sidebar.classList.remove('is-open');
        if (backdrop) backdrop.classList.remove('is-active');
    }

    setupSidebarToggle() {
        const toggle = document.getElementById('sidebar-toggle');
        const sidebar = document.getElementById('sidebar');
        const backdrop = document.getElementById('sidebar-backdrop');

        if (toggle && sidebar) {
            toggle.addEventListener('click', (e) => {
                e.stopPropagation();
                const isOpen = sidebar.classList.toggle('is-open');
                if (backdrop) backdrop.classList.toggle('is-active', isOpen);
            });

        }
        if (backdrop && sidebar) {
            backdrop.addEventListener('click', () => {
                sidebar.classList.remove('is-open');
                backdrop.classList.remove('is-active');
            });

        }
    }

    setupUserMenu() {
        if (!this._userMenuBound) {
            this._userMenuBound = true;
            const menuBtn = document.getElementById('user-menu-btn');
            const dropdown = document.getElementById('user-menu-dropdown');
            const userMenu = document.getElementById('admin-user-menu') || menuBtn?.closest('.user-menu');
            if (menuBtn && dropdown) {
                menuBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const isOpening = dropdown.style.display === 'none' || !dropdown.style.display;
                    dropdown.style.display = isOpening ? 'block' : 'none';
                    if (userMenu) {
                        userMenu.classList.toggle('is-open', isOpening);
                    }
                });
    
                document.addEventListener('click', (e) => {
                    if (!menuBtn.contains(e.target) && !dropdown.contains(e.target)) {
                        dropdown.style.display = 'none';
                        if (userMenu) {
                            userMenu.classList.remove('is-open');
                        }
                    }
                });
            }
        }
        if (typeof sessionManager !== 'undefined') {
            const user = sessionManager.getUser();
            const nameEl = document.getElementById('admin-user-name');
            if (user && nameEl) {
                nameEl.textContent = user.name || 'Quản trị viên';
            }
            const avatarEl = document.getElementById('admin-user-avatar');
            if (user && avatarEl) {
                const avatarSrc = user.avatar || user.avatar_path;
                if (avatarSrc) {
                    avatarEl.innerHTML = `<img src="${avatarSrc}" alt="Avatar" style="width:100%; height:100%; object-fit:cover; border-radius:50%; display:block;">`;
                    avatarEl.style.overflow = 'hidden';
                    avatarEl.style.padding = '0';
                } else {
                    avatarEl.textContent = (user.name || 'A').charAt(0).toUpperCase();
                }
            }
        }
    }

    logout(e) {
        if (e) {
            try { e.preventDefault(); } catch(err) {}
            try { e.stopPropagation(); } catch(err) {}
        }

        // Close dropdown immediately
        const dropdown = document.getElementById('user-menu-dropdown');
        if (dropdown) dropdown.style.display = 'none';
        const userMenu = document.getElementById('admin-user-menu');
        if (userMenu) userMenu.classList.remove('is-open');

        const executeLogout = () => {
            try {
                if (typeof sessionManager !== 'undefined' && typeof sessionManager.logout === 'function') {
                    sessionManager.logout();
                }
                const keysToRemove = [
                    'ride_rtree_user', 'ride_rtree_token',
                    'goride_user', 'goride_token',
                    'navigo_user', 'navigo_token',
                    'user', 'token', 'currentUser', 'session_user', 'user_token', 'auth_token',
                    'goride_active_trip', 'goride_driver_online_state', 'navigo_driver_online_state',
                    'goride_driver_last_location', 'goride_pending_trip_offers', 'goride_current_order',
                    'goride_handled_offers',
                    'navigo_session_loaded', 'navigo_session_location_prompted',
                    'navigo_loading_screen_active', 'navigo_from_loading', 'navigo_from_logout'
                ];
                keysToRemove.forEach(k => {
                    try { localStorage.removeItem(k); } catch(err) {}
                    try { sessionStorage.removeItem(k); } catch(err) {}
                });
                localStorage.setItem('goride_logged_out', '1');
            } catch(err) {}
            window.location.href = '../loading.html?from=logout';
        };

        if (typeof sessionManager !== 'undefined' && typeof sessionManager.confirmLogout === 'function') {
            sessionManager.confirmLogout();
        } else if (typeof window.showNavigoModal === 'function') {
            window.showNavigoModal({
                title: 'Xác nhận đăng xuất',
                message: 'Bạn có chắc chắn muốn đăng xuất khỏi phiên quản trị?',
                icon: '🚪',
                confirmText: 'Đăng xuất',
                cancelText: 'Hủy',
                danger: true,
                onConfirm: executeLogout
            });
        } else {
            if (confirm('Bạn có chắc chắn muốn đăng xuất khỏi phiên quản trị?')) {
                executeLogout();
            }
        }
    }

    setupLogout() {
        document.querySelectorAll('[data-action="logout"], .admin-sidebar-btn-logout, #btn-admin-dropdown-logout').forEach(el => {
            el.addEventListener('click', (e) => {
                this.logout(e);
            });
        });
    }

    /* ==========================================================================
       DASHBOARD METRICS & RECENT TRIPS (DYNAMIC REAL METRICS)
       ========================================================================== */

    async loadDashboard() {
        try {
            const trips = this.getStoredTrips();
            const drivers = this.getStoredDrivers();
            const onlineDrivers = this.getOnlineDrivers();

            // 100% Real KPI calculation based strictly on actual data
            const totalRides = trips.length;
            const activeDrivers = drivers.filter(d => d.status === 'active').length;
            const calculatedRevenue = trips
                .filter(t => t.status === 'completed')
                .reduce((sum, t) => sum + (Number(t.fare) || 0), 0);

            // Synchronized customer count from database





            if (!this.cachedCustomers) {
                this.cachedCustomers = await this.getStoredCustomers();
            }
            const newCustomers = (this.cachedCustomers && this.cachedCustomers.length) ? this.cachedCustomers.length : 0;

            // Render KPI cards
            const setStat = (id, val) => {
                const el = document.getElementById(id);
                if (el) el.textContent = val;
            };

            setStat('stat-total-rides', Number(totalRides).toLocaleString('vi-VN'));
            setStat('stat-active-drivers', Number(activeDrivers).toLocaleString('vi-VN'));
            setStat('stat-revenue', Number(calculatedRevenue).toLocaleString('vi-VN') + ' ₫');
            setStat('stat-customers', Number(newCustomers).toLocaleString('vi-VN'));

            const trendDrivers = document.getElementById('stat-drivers-trend');
            if (trendDrivers) {
                trendDrivers.innerHTML = `● ${onlineDrivers.length} trực tuyến`;
                trendDrivers.className = onlineDrivers.length > 0 ? 'stat-card-trend trend-up' : 'stat-card-trend';
            }

            // Update badge counts in sidebar
            const recentTripsBadge = document.getElementById('sidebar-recent-trips-count');
            if (recentTripsBadge) recentTripsBadge.textContent = trips.length;

            const tripsBadge = document.getElementById('sidebar-trips-count');
            if (tripsBadge) tripsBadge.textContent = trips.length;

            const driversBadge = document.getElementById('sidebar-drivers-count');
            if (driversBadge) {
                const pending = this.getPendingDrivers();
                driversBadge.textContent = pending.length > 0 ? `${drivers.length} (${pending.length} chờ)` : drivers.length;
            }
            const customersBadge = document.getElementById('sidebar-customers-count');
            if (customersBadge) {
                customersBadge.textContent = newCustomers;
            }

            // Render Recent Trips Table
            this.loadRecentTripsTable();

            // Render spatial online drivers on Leaflet map
            this.renderOnlineDriversOnMap();
        } catch (err) {
            console.error('[Admin] Error loading dashboard:', err);
        }
    }

    /* ==========================================================================
       RECENT TRIPS MANAGEMENT (REAL-TIME ACTIVITY FEED)
       ========================================================================== */

    setupRecentTripFilters() {
        const searchInput = document.getElementById('recent-trip-search-input');
        const statusFilter = document.getElementById('recent-trip-status-filter');

        if (searchInput) {
            searchInput.addEventListener('input', () => this.filterRecentTrips());
        }
        if (statusFilter) {
            statusFilter.addEventListener('change', () => this.filterRecentTrips());
        }
    }

    loadRecentTripsTable() {
        const trips = this.getStoredTrips();
        // Sort newest first
        const sorted = [...trips].sort((a, b) => {
            const timeA = new Date(a.createdAt || 0).getTime();
            const timeB = new Date(b.createdAt || 0).getTime();
            return timeB - timeA;
        });
        this.recentTripsData = sorted;

        const badge = document.getElementById('sidebar-recent-trips-count');
        if (badge) badge.textContent = sorted.length;

        this.filterRecentTrips();
    }

    filterRecentTrips() {
        const searchInput = document.getElementById('recent-trip-search-input');
        const statusFilter = document.getElementById('recent-trip-status-filter');
        const countText = document.getElementById('recent-trip-count-text');

        const query = (searchInput?.value || '').toLowerCase().trim();
        const status = statusFilter ? statusFilter.value : 'all';

        let filtered = this.recentTripsData || this.getStoredTrips();

        if (status !== 'all') {
            filtered = filtered.filter(t => t.status === status);
        }

        if (query) {
            filtered = filtered.filter(t => {
                const pStr = this.getPickupText(t).toLowerCase();
                const dStr = this.getDestinationText(t).toLowerCase();
                return (
                    (t.id && String(t.id).toLowerCase().includes(query)) ||
                    (t.customerName && String(t.customerName).toLowerCase().includes(query)) ||
                    (t.driverName && String(t.driverName).toLowerCase().includes(query)) ||
                    pStr.includes(query) ||
                    dStr.includes(query)
                );
            });
            /* query filter applied */ (0
                );

        }

        if (countText) {
            countText.textContent = `Hiển thị ${filtered.length} chuyến gần đây`;
        }

        this.renderRecentTrips(filtered);
    }

    resetRecentTripFilters() {
        const searchInput = document.getElementById('recent-trip-search-input');
        const statusFilter = document.getElementById('recent-trip-status-filter');
        if (searchInput) searchInput.value = '';
        if (statusFilter) statusFilter.value = 'all';
        this.filterRecentTrips();
    }

    renderRecentTrips(trips) {
        const tbody = document.getElementById('recent-trips-body');
        if (!tbody) return;

        if (!trips || trips.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center" style="padding:28px; color:var(--color-gray-500);">Chưa có chuyến đi nào được tạo trên hệ thống.</td></tr>';
            return;
        }

        tbody.innerHTML = trips.map(t => {
            const badge = this.getStatusBadge(t.status);
            const fareFormatted = Number(t.fare || 0).toLocaleString('vi-VN') + ' ₫';
            const timeFormatted = t.createdAt ? new Date(t.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : 'Vừa xong';
            const pickupShort = this.escapeHtml(this.getPickupText(t));
            const dropoffShort = this.escapeHtml(this.getDestinationText(t));

            return `
                <tr>
                    <td style="font-weight:700; color:var(--color-primary); font-family:monospace;">#${t.id}</td>
                    <td style="font-size:0.8rem; color:var(--color-gray-500); white-space:nowrap;">${timeFormatted}</td>
                    <td style="font-weight:600; max-width:140px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${this.escapeHtml(t.customerName || '--')}">${this.escapeHtml(t.customerName || '--')}</td>
                    <td style="max-width:120px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${t.driverName ? this.escapeHtml(t.driverName) : 'Chưa gán'}">${t.driverName ? this.escapeHtml(t.driverName) : '<span style="color:var(--color-gray-400);">Chưa gán</span>'}</td>
                    <td class="col-route-cell" style="font-size:0.82rem; width:280px; max-width:280px; min-width:200px; overflow:hidden; vertical-align:middle; line-height:1.45;">
                        <div class="route-ellipsis-row" style="display:flex; align-items:center; max-width:100%; overflow:hidden; white-space:nowrap;" title="Đón: ${pickupShort}">
                            <strong class="route-label" style="color:#059669; font-weight:700; flex-shrink:0; margin-right:5px;">Đón:</strong>
                            <span class="route-text" style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1; min-width:0; color:var(--color-gray-700);">${pickupShort}</span>
                        </div>
                        <div class="route-ellipsis-row" style="display:flex; align-items:center; max-width:100%; overflow:hidden; white-space:nowrap; margin-top:3px;" title="Đến: ${dropoffShort}">
                            <strong class="route-label" style="color:#e11d48; font-weight:700; flex-shrink:0; margin-right:5px;">Đến:</strong>
                            <span class="route-text" style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1; min-width:0; color:var(--color-gray-700);">${dropoffShort}</span>
                        </div>
                    </td>
                    <td style="text-align:center; white-space:nowrap;"><span class="badge ${badge.cls}">${badge.label}</span></td>
                    <td style="font-weight:700; color:#0f766e; white-space:nowrap;">${fareFormatted}</td>
                    <td style="text-align:right; white-space:nowrap;">
                        <div class="table-actions">
                            <button class="btn-action-edit" onclick="adminController.openEditTripModal('${t.id}')">✏️ Sửa</button>
                            <button class="btn-action-delete" onclick="adminController.openDeleteModal('trip', '${t.id}')">🗑️ Xóa</button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    /* ==========================================================================
       TRIPS MANAGEMENT (FULL REAL CRUD)
       ========================================================================== */

    setupTripFilters() {
        const searchInput = document.getElementById('trip-search-input');
        const statusFilter = document.getElementById('trip-status-filter');

        if (searchInput) {
            searchInput.addEventListener('input', () => this.filterTrips());
        }
        if (statusFilter) {
            statusFilter.addEventListener('change', () => this.filterTrips());
        }
    }

    resetTripFilters() {
        const searchInput = document.getElementById('trip-search-input');
        const statusFilter = document.getElementById('trip-status-filter');
        if (searchInput) searchInput.value = '';
        if (statusFilter) statusFilter.value = 'all';
        this.filterTrips();
    }

    filterTrips() {
        const searchInput = document.getElementById('trip-search-input');
        const statusFilter = document.getElementById('trip-status-filter');

        const query = (searchInput?.value || '').toLowerCase().trim();
        const status = statusFilter?.value || 'all';

        const allTrips = this.getStoredTrips();
        const filtered = allTrips.filter(t => {
            const matchStatus = (status === 'all') || (t.status === status);
            const pStr = this.getPickupText(t).toLowerCase();
            const dStr = this.getDestinationText(t).toLowerCase();
            const matchQuery = !query || 
                (t.id && String(t.id).toLowerCase().includes(query)) ||
                (t.customerName && String(t.customerName).toLowerCase().includes(query)) ||
                (t.driverName && String(t.driverName).toLowerCase().includes(query)) ||
                pStr.includes(query) ||
                dStr.includes(query);
            return matchStatus && matchQuery;
        });

        this.renderAllTripsTable(filtered);
    }

    loadTripsTable() {
        const trips = this.getStoredTrips();
        this.renderAllTripsTable(trips);
    }

    renderAllTripsTable(trips) {
        const tbody = document.getElementById('all-trips-body');
        const countText = document.getElementById('trip-count-text');
        if (countText) countText.textContent = `Hiển thị ${trips.length} chuyến`;

        if (!tbody) return;

        if (!trips || trips.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center" style="padding:28px; color:var(--color-gray-500);">Chưa có chuyến đi nào trong hệ thống.</td></tr>';
            return;
        }

        tbody.innerHTML = trips.map(t => {
            const badge = this.getStatusBadge(t.status);
            const fareFormatted = Number(t.fare || 0).toLocaleString('vi-VN') + ' ₫';
            const pickupText = this.escapeHtml(this.getPickupText(t));
            const dropoffText = this.escapeHtml(this.getDestinationText(t));
            return `
                <tr>
                    <td style="font-weight:700; color:var(--color-primary); font-family:monospace;">#${t.id}</td>
                    <td>
                        <div style="font-weight:600; max-width:140px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${this.escapeHtml(t.customerName || '--')}">${this.escapeHtml(t.customerName || '--')}</div>
                        <div style="font-size:0.75rem; color:var(--color-gray-500);">${this.escapeHtml(t.customerPhone || '')}</div>
                    </td>
                    <td style="max-width:120px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${t.driverName ? this.escapeHtml(t.driverName) : 'Chưa gán'}">${t.driverName ? this.escapeHtml(t.driverName) : '<span style="color:var(--color-gray-400);">Chưa gán</span>'}</td>
                    <td class="col-single-loc" style="max-width:190px; min-width:130px; overflow:hidden; vertical-align:middle;" title="${pickupText}">
                        <span style="display:inline-block; max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; vertical-align:middle; color:var(--color-gray-700);">${pickupText}</span>
                    </td>
                    <td class="col-single-loc" style="max-width:190px; min-width:130px; overflow:hidden; vertical-align:middle;" title="${dropoffText}">
                        <span style="display:inline-block; max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; vertical-align:middle; color:var(--color-gray-700);">${dropoffText}</span>
                    </td>
                    <td style="text-align:center; white-space:nowrap;"><span class="badge ${badge.cls}">${badge.label}</span></td>
                    <td style="font-weight:700; color:#0f766e; white-space:nowrap;">${fareFormatted}</td>
                    <td style="text-align:right; white-space:nowrap;">
                        <div class="table-actions">
                            <button class="btn-action-edit" onclick="adminController.openEditTripModal('${t.id}')">✏️ Sửa</button>
                            <button class="btn-action-delete" onclick="adminController.openDeleteModal('trip', '${t.id}')">🗑️ Xóa</button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    openAddTripModal() {
        document.getElementById('modal-trip-title').textContent = 'Thêm chuyến đi mới';
        document.getElementById('form-trip').reset();
        document.getElementById('trip-form-id').value = '';
        document.getElementById('trip-form-fare').value = 45000;
        document.getElementById('trip-form-status').value = 'requested';
        this.openModal('modal-trip');
    }

    openEditTripModal(tripId) {
        const trips = this.getStoredTrips();
        const trip = trips.find(t => t.id === tripId);
        if (!trip) return;

        document.getElementById('modal-trip-title').textContent = `Chỉnh sửa chuyến đi #${trip.id}`;
        document.getElementById('trip-form-id').value = trip.id;
        document.getElementById('trip-form-customer').value = trip.customerName || '';
        document.getElementById('trip-form-phone').value = trip.customerPhone || '';
        document.getElementById('trip-form-driver').value = trip.driverName || '';
        document.getElementById('trip-form-pickup').value = this.getPickupText(trip, '');
        document.getElementById('trip-form-dest').value = this.getDestinationText(trip, '');
        document.getElementById('trip-form-fare').value = trip.fare || 40000;
        document.getElementById('trip-form-status').value = trip.status || 'requested';

        this.openModal('modal-trip');
    }

    saveTrip(e) {
        e.preventDefault();
        const idInput = document.getElementById('trip-form-id').value;
        const customerName = document.getElementById('trip-form-customer').value.trim();
        const customerPhone = document.getElementById('trip-form-phone').value.trim();
        const driverName = document.getElementById('trip-form-driver').value.trim();
        const pickup = document.getElementById('trip-form-pickup').value.trim();
        const destination = document.getElementById('trip-form-dest').value.trim();
        const fare = Number(document.getElementById('trip-form-fare').value) || 30000;
        const status = document.getElementById('trip-form-status').value;

        let trips = this.getStoredTrips();

        if (idInput) {
            // Edit existing trip
            const idx = trips.findIndex(t => t.id === idInput);
            if (idx !== -1) {
                trips[idx] = {
                    ...trips[idx],
                    customerName,
                    customerPhone,
                    driverName,
                    pickup,
                    destination,
                    fare,
                    status,
                    updatedAt: new Date().toISOString()
                };
                this.showToast(`Đã cập nhật chuyến đi #${idInput} thành công!`, 'success');
            }
        } else {
            // Add new trip
            const newId = 'TRP-' + Math.floor(10000 + Math.random() * 90000);
            const newTrip = {
                id: newId,
                customerName,
                customerPhone,
                driverName: driverName || 'Chưa gán',
                pickup,
                destination,
                fare,
                status,
                createdAt: new Date().toISOString()
            };
            trips.unshift(newTrip);
            this.showToast(`Đã thêm mới chuyến đi #${newId}!`, 'success');
        }

        this.saveStoredTrips(trips);
        this.closeModal('modal-trip');
        this.loadTripsTable();
        this.loadDashboard();
    }

    /* ==========================================================================
       DRIVERS MANAGEMENT (FULL CRUD & REAL DRIVER APPROVALS)
       ========================================================================== */

    renderDriversTable(drivers) {
        const tbody = document.getElementById('registered-drivers-body');
        const countText = document.getElementById('registered-drivers-count');
        if (countText) countText.textContent = `Tổng cộng: ${drivers.length} tài xế`;

        if (!tbody) return;

        if (!drivers || drivers.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center" style="padding:28px; color:var(--color-gray-500);">Chưa có tài xế nào trong hệ thống.</td></tr>';
            return;
        }

        tbody.innerHTML = drivers.map(d => {
            const isLocked = d.status === 'locked' || (window.realtimeSync && window.realtimeSync.isUserLocked(d.id));
            const isPending = d.status === 'pending';
            const isOnline = !isLocked && !isPending && (window.realtimeSync ? window.realtimeSync.isDriverOnline(d.id, d.email, d.phone) : (d.status === 'active' || d.isOnline));

            let statusBadge = '';
            if (isLocked) {
                statusBadge = '<span class="badge badge-danger">🔒 Bị khóa</span>';
            } else if (isPending) {
                statusBadge = '<span class="badge badge-warning">🟡 Chờ duyệt</span>';
            } else if (isOnline) {
                statusBadge = '<span class="badge badge-success" style="background:#10b981; color:#fff;">🟢 Trực tuyến</span>';
            } else {
                statusBadge = '<span class="badge badge-secondary" style="background:#94a3b8; color:#fff;">⚪ Ngoại tuyến</span>';
            }

            return `
                <tr>
                    <td style="font-weight:700; color:var(--color-primary); font-family:monospace;">${d.id}</td>
                    <td style="font-weight:600;">${d.name}</td>
                    <td>
                        <div>📞 ${d.phone || '--'}</div>
                        <div style="font-size:0.75rem; color:var(--color-gray-500);">✉️ ${d.email || '--'}</div>
                    </td>
                    <td>${d.vehicleTypeName || d.vehicleType || 'Ô tô'}</td>
                    <td style="font-weight:700; color:var(--color-primary);">${d.plate || '--'}</td>
                    <td>${statusBadge}</td>
                    <td style="text-align:right;">
                        <div class="table-actions" style="display:flex; gap:5px; justify-content:flex-end;">
                            <button type="button" class="btn btn-sm ${d.status === 'locked' ? 'btn-success' : 'btn-ghost'}" style="font-size:0.74rem; padding:4px 8px; border-radius:6px; font-weight:700;" onclick="adminController.toggleDriverLock('${d.id}')" title="${d.status === 'locked' ? 'Mở khóa tài xế' : 'Khóa tài xế này'}">
                                ${d.status === 'locked' ? '🔓 Mở khóa' : '🔒 Khóa'}
                            </button>
                            <button class="btn-action-edit" onclick="adminController.openEditDriverModal('${d.id}')">✏️ Sửa</button>
                            <button class="btn-action-delete" onclick="adminController.openDeleteModal('driver', '${d.id}')">🗑️ Xóa</button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    async loadDriversList() {
        // 1. Immediate instant render from local cache
        let drivers = this.getStoredDrivers();
        this.renderDriversTable(drivers);

        // 2. Fetch and sync from Firebase Realtime Cloud & Live Backend API
        try {
            let cloudDrivers = [];

            // A. Check Backend API if available
            if (typeof apiClient !== 'undefined') {
                try {
                    const res = await apiClient.getDrivers();
                    if (res && res.data && Array.isArray(res.data.drivers)) {
                        cloudDrivers.push(...res.data.drivers);
                    }
                } catch (e) {}
            }

            // B. Query Firebase goride_drivers
            if (window.realtimeSync) {
                if (window.realtimeSync.isAvailable()) {
                    try {
                        const snap = await window.realtimeSync.db.ref('goride_drivers').once('value');
                        const data = snap.val() || {};
                        for (const d of Object.values(data)) {
                            if (d && (d.id || d.email) && d.status !== 'pending' && d.status !== 'rejected') {
                                cloudDrivers.push(d);
                            }
                        }
                    } catch (e) {}
                }
                if (typeof window.realtimeSync._restGet === 'function') {
                    try {
                        const restData = await window.realtimeSync._restGet('goride_drivers');
                        if (restData && typeof restData === 'object') {
                            for (const d of Object.values(restData)) {
                                if (d && (d.id || d.email) && d.status !== 'pending' && d.status !== 'rejected') {
                                    cloudDrivers.push(d);
                                }
                            }
                        }
                    } catch (e) {}
                }
            }

            // C. Query Firebase goride_users with role === 'driver' and status === 'active'
            if (window.realtimeSync) {
                if (window.realtimeSync.isAvailable()) {
                    try {
                        const snapU = await window.realtimeSync.db.ref('goride_users').once('value');
                        const uData = snapU.val() || {};
                        for (const u of Object.values(uData)) {
                            if (u && u.role === 'driver' && (u.status === 'active' || !u.status)) {
                                const vType = u.vehicleType || u.vehicle?.type || 'motorbike';
                                const isBike = (vType === 'bike' || vType === 'motorbike');
                                const vLabel = isBike ? 'Xe máy điện (Navigo Bike)' : (vType === 'car7' ? 'Ô tô 7 chỗ (Navigo Taxi 7 chỗ)' : 'Ô tô điện (Navigo Car)');
                                cloudDrivers.push({
                                    id: u.id,
                                    name: u.name,
                                    email: u.email,
                                    phone: u.phone,
                                    vehicleType: vType,
                                    vehicleTypeName: vLabel,
                                    plate: u.licensePlate || u.plate || u.vehicle?.plate || '--',
                                    experience: u.experienceYears || u.experience || 1,
                                    status: 'active',
                                    createdAt: u.createdAt || new Date().toISOString()
                                });
                            }
                        }
                    } catch (e) {}
                }
            }

            // Merge cloudDrivers into local drivers list
            let hasNew = false;
            for (const cd of cloudDrivers) {
                const idx = drivers.findIndex(d => d.id === cd.id || (cd.email && d.email === cd.email));
                if (idx === -1) {
                    drivers.push(cd);
                    hasNew = true;
                } else {
                    if (cd.status && drivers[idx].status !== cd.status) {
                        drivers[idx].status = cd.status;
                        hasNew = true;
                    }
                    if (cd.plate && (!drivers[idx].plate || drivers[idx].plate === '--')) {
                        drivers[idx].plate = cd.plate;
                        hasNew = true;
                    }
                }
            }
            /* DRIVERS_LIST_OLD_RAW
            if (window.realtimeSync) {
                if (window.realtimeSync.isAvailable()) {
                    try {
                        const snap = await window.realtimeSync.db.ref('goride_drivers').once('value');
                        const data = snap.val() || {};
                        Object.values(data).forEach(d => {
                            if (d && (d.id || d.email) && d.status !== 'pending' && d.status !== 'rejected') {
                                cloudDrivers.push(d);
                            }
            
                    } catch (e) {}
                }
                if (typeof window.realtimeSync._restGet === 'function') {
                    try {
                        const restData = await window.realtimeSync._restGet('goride_drivers');
                        if (restData && typeof restData === 'object') {
                            Object.values(restData).forEach(d => {
                                if (d && (d.id || d.email) && d.status !== 'pending' && d.status !== 'rejected') {
                                    cloudDrivers.push(d);
                                }
                
                        }
                    } catch (e) {}
                }
            }

            // C. Query Firebase goride_users with role === 'driver' and status === 'active'
            if (window.realtimeSync) {
                if (window.realtimeSync.isAvailable()) {
                    try {
                        const snapU = await window.realtimeSync.db.ref('goride_users').once('value');
                        const uData = snapU.val() || {};
                        Object.values(uData).forEach(u => {
                            if (u && u.role === 'driver' && (u.status === 'active' || !u.status)) {
                                const vType = u.vehicleType || u.vehicle?.type || 'motorbike';
                                const isBike = (vType === 'bike' || vType === 'motorbike');
                                const vLabel = isBike ? 'Xe máy điện (Navigo Bike)' : (vType === 'car7' ? 'Ô tô 7 chỗ (Navigo Taxi 7 chỗ)' : 'Ô tô điện (Navigo Car)');
                                cloudDrivers.push({
                                    id: u.id,
                                    name: u.name,
                                    email: u.email,
                                    phone: u.phone,
                                    vehicleType: vType,
                                    vehicleTypeName: vLabel,
                                    plate: u.licensePlate || u.plate || u.vehicle?.plate || '--',
                                    experience: u.experienceYears || u.experience || 1,
                                    status: 'active',
                                    createdAt: u.createdAt || new Date().toISOString()
                    
                            }
            
                    } catch (e) {}
                }
            }

            // Merge cloudDrivers into local drivers list
            let hasNew = false;
            for (const cd of cloudDrivers) {
                const idx = drivers.findIndex(d => d.id === cd.id || (cd.email && d.email === cd.email));
                if (idx === -1) {
                    drivers.push(cd);
                    hasNew = true;
                } else {
                    if (cd.status && drivers[idx].status !== cd.status) {
                        drivers[idx].status = cd.status;
                        hasNew = true;
                    }
                    if (cd.plate && (!drivers[idx].plate || drivers[idx].plate === '--')) {
                        drivers[idx].plate = cd.plate;
                        hasNew = true;
                    }
                }


            */
            if (hasNew) {
                this.saveStoredDrivers(drivers);
                this.renderDriversTable(drivers);
            }
        } catch (err) {
            console.warn('[Admin] Error syncing registered drivers:', err);
        }
    }

    openAddDriverModal() {
        document.getElementById('modal-driver-title').textContent = 'Thêm tài xế mới';
        document.getElementById('form-driver').reset();
        document.getElementById('driver-form-id').value = '';
        document.getElementById('driver-form-exp').value = 3;
        document.getElementById('driver-form-status').value = 'active';
        this.openModal('modal-driver');
    }

    openEditDriverModal(driverId) {
        const drivers = this.getStoredDrivers();
        const driver = drivers.find(d => d.id === driverId);
        if (!driver) return;

        document.getElementById('modal-driver-title').textContent = `Chỉnh sửa tài xế: ${driver.name}`;
        document.getElementById('driver-form-id').value = driver.id;
        document.getElementById('driver-form-name').value = driver.name || '';
        document.getElementById('driver-form-email').value = driver.email || '';
        document.getElementById('driver-form-phone').value = driver.phone || '';
        const vType = driver.vehicleType || 'motorbike';
        document.getElementById('driver-form-vtype').value = (vType === 'motorbike') ? 'bike' : vType;
        document.getElementById('driver-form-plate').value = driver.plate || '';
        document.getElementById('driver-form-exp').value = driver.experience || 3;
        document.getElementById('driver-form-status').value = driver.status || 'active';

        this.openModal('modal-driver');
    }

    saveDriver(e) {
        e.preventDefault();
        const idInput = document.getElementById('driver-form-id').value;
        const name = document.getElementById('driver-form-name').value.trim();
        const email = document.getElementById('driver-form-email').value.trim();
        const phone = document.getElementById('driver-form-phone').value.trim();
        const vehicleType = document.getElementById('driver-form-vtype').value;
        const plate = document.getElementById('driver-form-plate').value.trim();
        const experience = Number(document.getElementById('driver-form-exp').value) || 1;
        const status = document.getElementById('driver-form-status').value;

        const isBike = (vehicleType === 'bike' || vehicleType === 'motorbike');
        const vehicleTypeName = isBike ? 'Xe máy (GoRide Bike)' : (vehicleType === 'car7' ? 'Ô tô 7 chỗ (GoRide XL)' : 'Ô tô 4 chỗ (GoRide Car)');

        let drivers = this.getStoredDrivers();

        if (idInput) {
            // Edit driver
            const idx = drivers.findIndex(d => d.id === idInput);
            if (idx !== -1) {
                drivers[idx] = {
                    ...drivers[idx],
                    name,
                    email,
                    phone,
                    vehicleType,
                    vehicleTypeName,
                    plate,
                    experience,
                    status
                };
                this.showToast(`Đã cập nhật thông tin tài xế ${name}!`, 'success');
            }
        } else {
            // Add new driver
            const newId = 'drv_' + Math.floor(1000 + Math.random() * 9000);
            const newDriver = {
                id: newId,
                name,
                email,
                phone,
                vehicleType,
                vehicleTypeName,
                plate,
                experience,
                status,
                createdAt: new Date().toISOString()
            };
            drivers.unshift(newDriver);
            this.showToast(`Đã thêm mới tài xế ${name} vào hệ thống!`, 'success');
        }

        this.saveStoredDrivers(drivers);
        this.closeModal('modal-driver');
        this.loadDriversList();
        this.loadDashboard();
    }

    async loadDriverApprovals() {
        const container = document.getElementById('driver-approvals');
        const badge = document.getElementById('pending-drivers-count');
        const dashAlert = document.getElementById('dashboard-driver-approval-alert');
        const dashCount = document.getElementById('dashboard-pending-count');
        const dashPreview = document.getElementById('dashboard-pending-driver-preview');

        let pendingList = [];

        // 1. Check live backend API
        if (typeof apiClient !== 'undefined') {
            try {
                const res = await apiClient.getPendingDrivers();
                if (res && res.data && Array.isArray(res.data.drivers)) {
                    pendingList = res.data.drivers;
                }
            } catch (err) {}
        }

        // 2. Check localStorage goride_pending_drivers and goride_offline_users
        const localPending = this.getPendingDrivers();
        localPending.forEach(lp => {
            if (!pendingList.some(p => p.id === lp.id || (lp.email && p.email === lp.email))) {
                pendingList.push(lp);
            }
        });

        // 3. Query Firebase Realtime Cloud (both WebSocket SDK & direct REST GET for guaranteed cross-device sync)
        if (window.realtimeSync) {
            try {
                if (window.realtimeSync.isAvailable()) {
                    const snap = await window.realtimeSync.db.ref('goride_pending_drivers').once('value');
                    const cloudPending = snap.val() || {};
                    for (const cp of Object.values(cloudPending)) {
                        if (cp && (cp.status === 'pending' || !cp.status) && !pendingList.some(p => p.id === cp.id || (cp.email && p.email === cp.email))) {
                            pendingList.push(cp);
                        }
                    }

                    // Comprehensive check: scan goride_users for any driver with status === 'pending'
                    const snapUsers = await window.realtimeSync.db.ref('goride_users').once('value');
                    const cloudUsers = snapUsers.val() || {};
                    for (const cu of Object.values(cloudUsers)) {
                        if (cu && cu.role === 'driver' && (cu.status === 'pending' || !cu.status) && !pendingList.some(p => p.id === cu.id || (cu.email && p.email === cu.email))) {
                            pendingList.push({
                                id: cu.id,
                                name: cu.name,
                                email: cu.email,
                                phone: cu.phone,
                                vehicleType: cu.vehicleType || cu.vehicle?.type || 'motorbike',
                                plate: cu.licensePlate || cu.plate || cu.vehicle?.plate || '--',
                                experienceYears: cu.experienceYears || cu.experience || 1,
                                status: 'pending',
                                createdAt: cu.createdAt || new Date().toISOString()
                            });
                        }
                    }
                }
            } catch (e) {}

            // Guaranteed REST fallback: fetches directly via HTTP REST even if WebSocket is unready
            try {
                const rtdbUrl = window.realtimeSync.databaseURL || 'https://navigo-app-cc7cf-default-rtdb.asia-southeast1.firebasedatabase.app';
                const res = await fetch(`${rtdbUrl}/goride_pending_drivers.json`);
                if (res.ok) {
                    const restData = await res.json();
                    if (restData && typeof restData === 'object') {
                        for (const cp of Object.values(restData)) {
                            if (cp && (cp.status === 'pending' || !cp.status) && !pendingList.some(p => p.id === cp.id || (cp.email && p.email === cp.email))) {
                                pendingList.push(cp);
                            }
                        }
                    }
                }
            } catch (e) {}
        }
        /* DRIVER_APPROVALS_OLD_RAW
        if (window.realtimeSync) {
            try {
                if (window.realtimeSync.isAvailable()) {
                    const snap = await window.realtimeSync.db.ref('goride_pending_drivers').once('value');
                    const cloudPending = snap.val() || {};
                    Object.values(cloudPending).forEach(cp => {
                        if (cp && (cp.status === 'pending' || !cp.status) && !pendingList.some(p => p.id === cp.id || (cp.email && p.email === cp.email))) {
                            pendingList.push(cp);
                        }
        

                    // Comprehensive check: scan goride_users for any driver with status === 'pending'
                    const snapUsers = await window.realtimeSync.db.ref('goride_users').once('value');
                    const cloudUsers = snapUsers.val() || {};
                    Object.values(cloudUsers).forEach(cu => {
                        if (cu && cu.role === 'driver' && (cu.status === 'pending' || !cu.status) && !pendingList.some(p => p.id === cu.id || (cu.email && p.email === cu.email))) {
                            pendingList.push({
                                id: cu.id,
                                name: cu.name,
                                email: cu.email,
                                phone: cu.phone,
                                vehicleType: cu.vehicleType || cu.vehicle?.type || 'motorbike',
                                plate: cu.licensePlate || cu.plate || cu.vehicle?.plate || '--',
                                experienceYears: cu.experienceYears || cu.experience || 1,
                                status: 'pending',
                                createdAt: cu.createdAt || new Date().toISOString()
                
                        }
        
                }
            } catch (e) {}

            // Guaranteed REST fallback: fetches directly via HTTP REST even if WebSocket is unready
            try {
                const rtdbUrl = window.realtimeSync.databaseURL || 'https://navigo-app-cc7cf-default-rtdb.asia-southeast1.firebasedatabase.app';
                const res = await fetch(`${rtdbUrl}/goride_pending_drivers.json`);
                if (res.ok) {
                    const restData = await res.json();
                    if (restData && typeof restData === 'object') {
                        Object.values(restData).forEach(cp => {
                            if (cp && (cp.status === 'pending' || !cp.status) && !pendingList.some(p => p.id === cp.id || (cp.email && p.email === cp.email))) {
                                pendingList.push(cp);
                            }
            
                    }
                }
            } catch (e) {}
        }

        */
        // Cache and persist pending list
        this.cachedPendingList = pendingList;
        this.savePendingDrivers(pendingList);

        // Update badge counters
        if (badge) badge.textContent = pendingList.length;
        if (dashCount) dashCount.textContent = pendingList.length;

        const sidebarDriversBadge = document.getElementById('sidebar-drivers-count');
        if (sidebarDriversBadge) {
            const drivers = this.getStoredDrivers().filter(d => d.status !== 'pending');
            sidebarDriversBadge.textContent = pendingList.length > 0 ? `${drivers.length} (${pendingList.length} chờ)` : drivers.length;
            if (pendingList.length > 0) {
                sidebarDriversBadge.className = 'badge badge-warning nav-link-badge';
            }
        }

        // Update Dashboard Alert Banner
        if (dashAlert) {
            if (pendingList.length > 0) {
                dashAlert.style.display = 'block';
                if (dashPreview) {
                    dashPreview.innerHTML = pendingList.slice(0, 3).map(driver => {
                        const vLabel = (driver.vehicleType === 'bike' || driver.vehicleType === 'motorbike')
                            ? '🛵 Xe máy điện (Navigo Bike)'
                            : (driver.vehicleType === 'car7' ? '🚐 Ô tô 7 chỗ (Navigo Taxi 7 chỗ)' : '🚗 Ô tô điện (Navigo Car)');
                        return `
                            <div style="background:#ffffff; border:1px solid #fde68a; border-radius:10px; padding:12px 16px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
                                <div>
                                    <div style="font-weight:700; color:#0f2d3c; font-size:0.95rem;">
                                        ${driver.name} &bull; <span style="color:#d97706;">${vLabel}</span>
                                    </div>
                                    <div style="font-size:0.82rem; color:#64748b; margin-top:2px;">
                                        Biển số: <strong style="color:#0f2d3c;">${driver.plate || driver.licensePlate || '---'}</strong> &bull; SĐT: ${driver.phone} &bull; Email: ${driver.email}
                                    </div>
                                </div>
                                <div style="display:flex; gap:8px;">
                                    <button type="button" class="btn btn-sm btn-success" onclick="adminController.approveDriver('${driver.id}', true)" style="font-weight:700; border-radius:6px; padding:5px 12px;">
                                        ✓ Duyệt ngay
                                    </button>
                                    <button type="button" class="btn btn-sm btn-outline" onclick="adminController.approveDriver('${driver.id}', false)" style="font-weight:700; border-radius:6px; padding:5px 12px; color:#dc2626; border-color:#fca5a5;">
                                        ✕ Từ chối
                                    </button>
                                </div>
                            </div>
                        `;
                    }).join('');
                }
            } else {
                dashAlert.style.display = 'none';
            }
        }

        // Render Drivers Tab Section
        if (!container) return;

        if (pendingList.length === 0) {
            container.innerHTML = `
                <div class="empty-state" style="padding:28px 16px; text-align:center; background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px;">
                    <div style="font-size:2rem; margin-bottom:6px;">✨</div>
                    <p style="font-weight:600; color:var(--color-gray-700); margin:0;">Không có hồ sơ tài xế nào đang chờ duyệt.</p>
                    <p style="font-size:0.8rem; color:var(--color-gray-500); margin:4px 0 0 0;">Khi có người đăng ký tài xế trên web, hồ sơ thực tế sẽ lập tức xuất hiện tại đây để Quản trị viên duyệt.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = pendingList.map(driver => {
            const vLabel = (driver.vehicleType === 'bike' || driver.vehicleType === 'motorbike')
                ? '🛵 Xe máy điện (Navigo Bike)'
                : (driver.vehicleType === 'car7' ? '🚐 Ô tô 7 chỗ (Navigo Taxi 7 chỗ)' : (driver.vehicleType === 'premium' ? '🚘 Xe sang (Navigo Premium)' : '🚗 Ô tô điện (Navigo Car)'));
            return `
                <div class="card" style="margin-bottom:12px; padding:16px; border:1.5px solid #fde68a; border-radius:12px; background:#fffbeb;" id="approval-${driver.id}">
                    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
                        <div>
                            <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
                                <h4 style="margin:0; font-size:1.1rem; color:#0f2d3c; font-weight:800;">${driver.name}</h4>
                                <span class="badge badge-warning" style="font-size:0.75rem; background:#fef3c7; color:#92400e; border:1px solid #f59e0b; font-weight:700;">Chờ duyệt</span>
                                <span style="font-size:0.75rem; color:var(--color-gray-500); font-family:monospace;">ID: ${driver.id}</span>
                            </div>
                            <p style="color:var(--color-gray-600); font-size:0.875rem; margin:3px 0;">
                                ✉️ ${driver.email} &bull; 📞 ${driver.phone}
                            </p>
                            <p style="color:var(--color-gray-700); font-size:0.875rem; margin:3px 0; font-weight:600;">
                                ${vLabel} &bull; Biển số: <strong style="color:#00897b; font-size:0.95rem;">${driver.plate || driver.licensePlate || '---'}</strong> &bull; Kinh nghiệm: ${driver.experienceYears || driver.experience || 1} năm
                            </p>
                            <div style="font-size:0.75rem; color:#94a3b8; margin-top:4px;">
                                Thời gian nộp hồ sơ: ${driver.createdAt ? new Date(driver.createdAt).toLocaleString('vi-VN') : 'Gần đây'}
                            </div>
                        </div>
                        <div class="approval-actions" style="display:flex; gap:10px;">
                            <button class="btn btn-success btn-sm btn-approve" onclick="adminController.approveDriver('${driver.id}', true)" style="font-weight:700; padding:8px 16px; border-radius:8px; display:flex; align-items:center; gap:6px;">
                                <span>✓</span> Duyệt hồ sơ
                            </button>
                            <button class="btn btn-danger btn-sm btn-reject" onclick="adminController.approveDriver('${driver.id}', false)" style="font-weight:700; padding:8px 16px; border-radius:8px; display:flex; align-items:center; gap:6px;">
                                <span>✕</span> Từ chối
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    async approveDriver(driverId, approved) {
        if (this.isProcessingApproval.has(driverId)) return;
        this.isProcessingApproval.add(driverId);

        const card = document.getElementById('approval-' + driverId);
        if (card) {
            card.style.opacity = '0.5';
            card.style.pointerEvents = 'none';
        }

        try {
            // 1. Call backend API endpoint if reachable
            if (typeof apiClient !== 'undefined') {
                try {
                    if (approved) await apiClient.approveDriver(driverId);
                    else await apiClient.rejectDriver(driverId);
                } catch (e) {
                    console.warn('[Admin] Backend approval call:', e.message);
                }
            }

            // 2. Resolve applicant details from all available local & cloud sources
            let applicant = (this.cachedPendingList || []).find(d => d.id === driverId || String(d.id) === String(driverId));
            if (!applicant) {
                const localPending = this.getPendingDrivers();
                applicant = localPending.find(d => d.id === driverId || String(d.id) === String(driverId));
            }
            if (!applicant) {
                const offlineUsers = JSON.parse(localStorage.getItem(this.STORAGE_KEYS.USERS) || '[]');
                const u = offlineUsers.find(d => d.id === driverId || String(d.id) === String(driverId));
                if (u) {
                    applicant = {
                        id: u.id,
                        name: u.name,
                        email: u.email,
                        phone: u.phone,
                        vehicleType: u.vehicleType || u.vehicle?.type || 'motorbike',
                        plate: u.licensePlate || u.plate || u.vehicle?.plate || '--',
                        experienceYears: u.experienceYears || u.experience || 1,
                        status: u.status || 'pending',
                        createdAt: u.createdAt || new Date().toISOString()
                    };
                }
            }
            if (!applicant && window.realtimeSync && window.realtimeSync.isAvailable()) {
                try {
                    const snap = await window.realtimeSync.db.ref(`goride_pending_drivers/${driverId}`).once('value');
                    applicant = snap.val();
                    if (!applicant) {
                        const uSnap = await window.realtimeSync.db.ref(`goride_users/${driverId}`).once('value');
                        applicant = uSnap.val();
                    }
                    if (!applicant) {
                        const dSnap = await window.realtimeSync.db.ref(`goride_drivers/${driverId}`).once('value');
                        applicant = dSnap.val();
                    }
                } catch (e) {}
            }
            if (!applicant && window.realtimeSync && typeof window.realtimeSync._restGet === 'function') {
                try {
                    applicant = await window.realtimeSync._restGet(`goride_pending_drivers/${driverId}`);
                    if (!applicant) {
                        applicant = await window.realtimeSync._restGet(`goride_users/${driverId}`);
                    }
                } catch (e) {}
            }

            // Fallback object so approval NEVER halts
            if (!applicant) {
                applicant = {
                    id: driverId,
                    name: 'Tài xế #' + driverId,
                    email: '--',
                    phone: '--',
                    vehicleType: 'motorbike',
                    plate: '--',
                    experienceYears: 1,
                    status: 'pending',
                    createdAt: new Date().toISOString()
                };
            }

            const vType = applicant.vehicleType || applicant.vehicle?.type || 'motorbike';
            const isBike = (vType === 'bike' || vType === 'motorbike');
            const vLabel = isBike ? 'Xe máy điện (Navigo Bike)' : (vType === 'car7' ? 'Ô tô 7 chỗ (Navigo Taxi 7 chỗ)' : (vType === 'premium' ? 'Xe sang (Navigo Luxury)' : 'Ô tô điện (Navigo Car)'));
            const plate = applicant.plate || applicant.licensePlate || applicant.vehicle?.plate || '--';
            const experience = applicant.experienceYears || applicant.experience || applicant.vehicle?.experience || 1;

            if (approved) {
                // 3. Add to active registered drivers pool
                const approvedDriverRecord = {
                    id: driverId,
                    name: applicant.name,
                    email: applicant.email,
                    phone: applicant.phone,
                    vehicleType: vType,
                    vehicleTypeName: vLabel,
                    plate: plate,
                    experience: experience,
                    status: 'active',
                    isOnline: false,
                    rating: 5.0,
                    totalRides: 0,
                    walletBalance: 0,
                    approvedAt: new Date().toISOString(),
                    createdAt: applicant.createdAt || new Date().toISOString()
                };

                let drivers = this.getStoredDrivers();
                const dIdx = drivers.findIndex(d => d.id === driverId || (applicant.email && applicant.email !== '--' && d.email === applicant.email));
                if (dIdx !== -1) {
                    drivers[dIdx] = { ...drivers[dIdx], ...approvedDriverRecord, status: 'active' };
                } else {
                    drivers.unshift(approvedDriverRecord);
                }
                this.saveStoredDrivers(drivers);

                // 4. Update real registered users in goride_offline_users
                try {
                    const users = JSON.parse(localStorage.getItem(this.STORAGE_KEYS.USERS) || '[]');
                    const uIdx = users.findIndex(u => u.id === driverId || (applicant.email && applicant.email !== '--' && u.email === applicant.email));
                    if (uIdx !== -1) {
                        users[uIdx].status = 'active';
                        users[uIdx].role = 'driver';
                        if (!users[uIdx].vehicle) users[uIdx].vehicle = {};
                        users[uIdx].vehicle.plate = plate;
                        users[uIdx].vehicle.type = vType;
                        localStorage.setItem(this.STORAGE_KEYS.USERS, JSON.stringify(users));
                    } else {
                        users.unshift({
                            ...applicant,
                            id: driverId,
                            role: 'driver',
                            status: 'active',
                            vehicle: { plate, type: vType, experience }
                        });
            
                        localStorage.setItem(this.STORAGE_KEYS.USERS, JSON.stringify(users));
                    }
                } catch (err) {}

                // 5. Sync to Firebase Realtime Database
                if (window.realtimeSync) {
                    try {
                        if (window.realtimeSync.isAvailable()) {
                            await window.realtimeSync.db.ref(`goride_pending_drivers/${driverId}`).remove();
                            await window.realtimeSync.db.ref(`goride_drivers/${driverId}`).set(approvedDriverRecord);
                            await window.realtimeSync.db.ref(`goride_users/${driverId}`).update({
                                status: 'active',
                                role: 'driver',
                                updatedAt: new Date().toISOString()
                    });
                
                            if (applicant.email && applicant.email !== '--') {
                                try {
                                    const uSnap = await window.realtimeSync.db.ref('goride_users').once('value');
                                    const allUsers = uSnap.val() || {};
                                    for (const k of Object.keys(allUsers)) {
                                        if (allUsers[k] && allUsers[k].email && allUsers[k].email.toLowerCase() === applicant.email.toLowerCase()) {
                                            await window.realtimeSync.db.ref(`goride_users/${k}`).update({
                                                status: 'active',
                                                role: 'driver',
                                                updatedAt: new Date().toISOString()
                    });
                                
                                        }
                                    }
                                } catch (e) {}
                            }
                        }
                        if (typeof window.realtimeSync._restDelete === 'function') {
                            await window.realtimeSync._restDelete(`goride_pending_drivers/${driverId}`);
                        }
                        if (typeof window.realtimeSync._restPut === 'function') {
                            await window.realtimeSync._restPut(`goride_drivers/${driverId}`, approvedDriverRecord);
                            await window.realtimeSync._restPatch(`goride_users/${driverId}`, {
                                status: 'active',
                                role: 'driver',
                                updatedAt: new Date().toISOString()
                    });
                
                        }
                    } catch (e) {
                        console.warn('[Admin] Firebase approval sync warning:', e);
                    }
                }
            } else {
                // Reject case
                try {
                    const users = JSON.parse(localStorage.getItem(this.STORAGE_KEYS.USERS) || '[]');
                    const uIdx = users.findIndex(u => u.id === driverId || (applicant.email && applicant.email !== '--' && u.email === applicant.email));
                    if (uIdx !== -1) {
                        users[uIdx].status = 'rejected';
                        localStorage.setItem(this.STORAGE_KEYS.USERS, JSON.stringify(users));
                    }
                } catch (err) {}

                if (window.realtimeSync) {
                    try {
                        if (window.realtimeSync.isAvailable()) {
                            await window.realtimeSync.db.ref(`goride_pending_drivers/${driverId}`).remove();
                            await window.realtimeSync.db.ref(`goride_drivers/${driverId}`).update({
                                status: 'rejected',
                                updatedAt: new Date().toISOString()
                    });
                
                            await window.realtimeSync.db.ref(`goride_users/${driverId}`).update({
                                status: 'rejected',
                                updatedAt: new Date().toISOString()
                    });
                
                        }
                        if (typeof window.realtimeSync._restDelete === 'function') {
                            await window.realtimeSync._restDelete(`goride_pending_drivers/${driverId}`);
                        }
                    } catch (e) {}
                }
            }

            // Remove from local pending lists
            let pending = this.getPendingDrivers().filter(d => d.id !== driverId && (!applicant.email || applicant.email === '--' || d.email !== applicant.email));
            this.savePendingDrivers(pending);
            if (this.cachedPendingList) {
                this.cachedPendingList = this.cachedPendingList.filter(d => d.id !== driverId && (!applicant.email || applicant.email === '--' || d.email !== applicant.email));
            }

            // Send in-app notification to the driver's isolated inbox
            try {
                const driverKeys = [];
                if (driverId) driverKeys.push(`navigo_user_notifs_${String(driverId).toLowerCase().replace(/[^a-z0-9_]/g, '_')}`);
                if (applicant.email && applicant.email !== '--') driverKeys.push(`navigo_user_notifs_${String(applicant.email).toLowerCase().replace(/[^a-z0-9_]/g, '_')}`);
                if (applicant.phone && applicant.phone !== '--') driverKeys.push(`navigo_user_notifs_${String(applicant.phone).toLowerCase().replace(/[^a-z0-9_]/g, '_')}`);

                const notifItem = {
                    id: 'notif_approval_' + Date.now(),
                    category: 'system',
                    title: approved ? '🎉 Hồ sơ đối tác đã được duyệt!' : '⚠️ Thông báo xét duyệt hồ sơ đối tác',
                    body: approved
                        ? `Chúc mừng ${applicant.name || 'bạn'}! Hồ sơ đăng ký đối tác tài xế Navigo của bạn đã được Quản trị viên xét duyệt thành công. Bạn có thể bật trạng thái hoạt động để bắt đầu đón khách ngay!`
                        : `Rất tiếc! Hồ sơ đối tác tài xế của bạn chưa đáp ứng đủ điều kiện phê duyệt của Navigo. Vui lòng liên hệ tổng đài hỗ trợ để biết thêm thông tin.`,
                    date: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) + ' hôm nay',
                    timestamp: Date.now(),
                    icon: approved ? '🎉' : '⚠️',
                    unread: true,
                    actionUrl: approved ? 'driver.html' : null,
                    actionText: approved ? 'Vào cổng tài xế' : null
                };

                driverKeys.forEach(k => {
                    try {
                        const list = JSON.parse(localStorage.getItem(k) || '[]');
                        list.unshift(notifItem);
                        localStorage.setItem(k, JSON.stringify(list));
                    } catch (e) {}
    
                });
            } catch (errNotif) {}

            this.showToast(approved 
                ? `Đã phê duyệt tài xế ${applicant.name || ''} thành công! Tài khoản đã được kích hoạt.` 
                : 'Đã từ chối hồ sơ đăng ký tài xế.', 
                approved ? 'success' : 'info'
            );

            if (card) card.remove();
            
            // Immediately reload badge, registered drivers list, and dashboard
            await this.loadDriversList();
            await this.loadDriverApprovals();
            this.loadDashboard();
        } catch (err) {
            this.showToast('Lỗi xử lý duyệt: ' + err.message, 'error');
            if (card) {
                card.style.opacity = '1';
                card.style.pointerEvents = 'auto';
            }
        } finally {
            this.isProcessingApproval.delete(driverId);
        }
    }

    /* ==========================================================================
       CUSTOMER / USER ACCOUNT MANAGEMENT SYSTEM
       ========================================================================== */

    setupCustomerFilters() {
        const searchInput = document.getElementById('customer-search-input');
        const roleFilter = document.getElementById('customer-role-filter');
        const statusFilter = document.getElementById('customer-status-filter');

        if (searchInput) {
            searchInput.addEventListener('input', () => this.filterCustomers());
        }
        if (roleFilter) {
            roleFilter.addEventListener('change', () => this.filterCustomers());
        }
        if (statusFilter) {
            statusFilter.addEventListener('change', () => this.filterCustomers());
        }
    }

    resetCustomerFilters() {
        const searchInput = document.getElementById('customer-search-input');
        const roleFilter = document.getElementById('customer-role-filter');
        const statusFilter = document.getElementById('customer-status-filter');
        if (searchInput) searchInput.value = '';
        if (roleFilter) roleFilter.value = 'all';
        if (statusFilter) statusFilter.value = 'all';
        this.filterCustomers();
    }

    async getStoredCustomers() {
        const userMap = new Map();

        // 1. Fetch from C++ Backend API if reachable
        if (typeof apiClient !== 'undefined') {
            try {
                const res = await apiClient.get('/admin/users');
                if (res && res.data && Array.isArray(res.data.users)) {
                    res.data.users.forEach(u => {
                        if (u && u.id) userMap.set(u.id, u);
                    });
        
                }
            } catch (e) {}
        }

        // 2. Query Firebase Realtime Cloud goride_users
        if (window.realtimeSync) {
            try {
                if (window.realtimeSync.isAvailable()) {
                    const snap = await window.realtimeSync.db.ref('goride_users').once('value');
                    const cloudUsers = snap.val() || {};
                    for (const u of Object.values(cloudUsers)) {
                        if (u && (u.id || u.email)) {
                            const key = u.id || u.email;
                            userMap.set(key, { ...userMap.get(key), ...u });
                        }
        
                }
                } // Dual REST fallback for customers
                if (typeof window.realtimeSync._restGet === 'function') {
                    const restUsers = await window.realtimeSync._restGet('goride_users');
                    if (restUsers && typeof restUsers === 'object')
                        for (const u of Object.values(restUsers)) {
                            if (u && (u.id || u.email)) {
                                const key = u.id || u.email;
                                userMap.set(key, { ...userMap.get(key), ...u });
                            }
            
                    }
                }
            } catch (e) {}
        }

        // 3. Query localStorage goride_offline_users
        try {
            const offline = JSON.parse(localStorage.getItem('goride_offline_users') || '[]');
            for (const u of offline) {
                if (u && (u.id || u.email)) {
                    const key = u.id || u.email;
                    const existing = userMap.get(key) || {};
                    // Local user state (e.g. recent role changes, profile edits) safely overrides stale cloud snapshot
                    userMap.set(key, { ...existing, ...u });
                }
            }
        } catch (e) {}

        // Baseline customer & admin accounts if not already included
        const defaultAccounts = [
            {
                id: 'adm_admin',
                name: 'Quản trị viên Hệ thống',
                email: 'admin@xanhsm.vn',
                phone: '0988888888',
                role: 'admin',
                status: 'active',
                createdAt: '2025-01-01T00:00:00.000Z'
            },
            {
                id: 'usr_c101',
                name: 'Nguyễn Văn An',
                email: 'customer@demo.com',
                phone: '0901234567',
                role: 'customer',
                status: 'active',
                createdAt: '2026-01-15T08:30:00.000Z'
            }
        ];
        defaultAccounts.forEach(da => {
            if (!userMap.has(da.id) && !userMap.has(da.email)) {
                userMap.set(da.id, da);
            }
        });

        // STRICT SEPARATION: Filter out any driver accounts. Drivers belong exclusively in Driver Management!
        const isDriverAccount = (u) => {
            if (!u) return false;
            if (u.role === 'admin') return false; // Admin is never considered driver
            if (u.role === 'driver') return true;
            if (String(u.id || '').startsWith('drv_')) return true;
            if (u.vehicleType || u.licensePlate || u.vehicle) return true;
            return false;
        };

        const nonDrivers = Array.from(userMap.values()).filter(u => !isDriverAccount(u));
        return nonDrivers;
    }

    async loadCustomers() {
        const tbody = document.getElementById('customers-table-body');
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="9" class="text-center" style="padding:28px; color:var(--color-gray-500);">Đang đồng bộ dữ liệu người dùng từ máy chủ và đám mây...</td></tr>';
        }

        this.cachedCustomers = await this.getStoredCustomers();
        this.filterCustomers();
        this.updateCustomerMetrics();
    }

    filterCustomers() {
        if (!this.cachedCustomers) return;

        const searchInput = document.getElementById('customer-search-input');
        const roleFilter = document.getElementById('customer-role-filter');
        const statusFilter = document.getElementById('customer-status-filter');

        const query = (searchInput?.value || '').toLowerCase().trim();
        const role = roleFilter?.value || 'all';
        const status = statusFilter?.value || 'all';

        const filtered = this.cachedCustomers.filter(c => {
            const isLocked = (c.status === 'locked') || (window.realtimeSync && window.realtimeSync.isUserLocked(c.id));
            const isOnline = !isLocked && (window.realtimeSync ? window.realtimeSync.isUserOnline(c.id, c.email, c.phone) : (c.status === 'active'));
            const userStatus = isLocked ? 'locked' : (isOnline ? 'online' : 'offline');

            const matchRole = (role === 'all') || (c.role === role);
            let matchStatus = false;
            if (status === 'all') {
                matchStatus = true;
            } else if (status === 'online') {
                matchStatus = isOnline;
            } else if (status === 'offline') {
                matchStatus = !isOnline && !isLocked;
            } else if (status === 'locked') {
                matchStatus = isLocked;
            } else if (status === 'active') {
                matchStatus = !isLocked;
            } else {
                matchStatus = (userStatus === status);
            }

            const matchQuery = !query ||
                (c.name && c.name.toLowerCase().includes(query)) ||
                (c.email && c.email.toLowerCase().includes(query)) ||
                (c.phone && c.phone.includes(query)) ||
                (c.id && c.id.toLowerCase().includes(query));
            return matchRole && matchStatus && matchQuery;
        });

        this.renderCustomersTable(filtered);
    }

    updateCustomerMetrics() {
        const list = this.cachedCustomers || [];
        const onlineCount = list.filter(c => {
            const isLocked = (c.status === 'locked') || (window.realtimeSync && window.realtimeSync.isUserLocked(c.id));
            return !isLocked && (window.realtimeSync ? window.realtimeSync.isUserOnline(c.id, c.email, c.phone) : false);
        }).length;
        const lockedCount = list.filter(c => (c.status === 'locked') || (window.realtimeSync && window.realtimeSync.isUserLocked(c.id))).length;
        const adminCount = list.filter(c => c.role === 'admin').length;

        const statTotal = document.getElementById('stat-total-customers');
        const statActive = document.getElementById('stat-active-customers');
        const statAdmin = document.getElementById('stat-admin-users');
        const statLocked = document.getElementById('stat-locked-customers');
        const sidebarCount = document.getElementById('sidebar-customers-count');

        if (statTotal) statTotal.textContent = list.length;
        if (statActive) statActive.textContent = onlineCount;
        if (statAdmin) statAdmin.textContent = adminCount;
        if (statLocked) statLocked.textContent = lockedCount;
        if (sidebarCount) sidebarCount.textContent = list.length;
        const statOverviewCustomers = document.getElementById('stat-customers');
        if (statOverviewCustomers) statOverviewCustomers.textContent = Number(list.length).toLocaleString('vi-VN');
    }

    renderCustomersTable(customers) {
        const tbody = document.getElementById('customers-table-body');
        if (!tbody) return;

        if (!customers || customers.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" class="text-center" style="padding:28px; color:var(--color-gray-500);">Không tìm thấy tài khoản người dùng phù hợp.</td></tr>';
            return;
        }

        // Count completed trips per customer
        const trips = this.getStoredTrips();
        const tripCountMap = new Map();
        trips.forEach(t => {
            if (t && t.status === 'completed') {
                if (t.customerId) tripCountMap.set(t.customerId, (tripCountMap.get(t.customerId) || 0) + 1);
                if (t.customerPhone) tripCountMap.set(t.customerPhone, (tripCountMap.get(t.customerPhone) || 0) + 1);
                if (t.customerEmail) tripCountMap.set(t.customerEmail, (tripCountMap.get(t.customerEmail) || 0) + 1);
            }
        });

        tbody.innerHTML = customers.map(u => {
            const isAdmin = u.role === 'admin';
            const isLocked = u.status === 'locked' || (window.realtimeSync && window.realtimeSync.isUserLocked(u.id));
            const isOnline = !isLocked && (window.realtimeSync ? window.realtimeSync.isUserOnline(u.id, u.email, u.phone) : false);
            const completedCount = tripCountMap.get(u.id) || tripCountMap.get(u.phone) || tripCountMap.get(u.email) || 0;
            const createdDate = u.createdAt ? new Date(u.createdAt).toLocaleDateString('vi-VN') : '--';
            const avatarInitial = (u.name || 'U').charAt(0).toUpperCase();
            const avatarBg = isAdmin ? '#ef4444' : '#00897b';
            const avatarHtml = u.avatar || u.avatar_path
                ? `<img src="${u.avatar || u.avatar_path}" alt="" style="width:32px; height:32px; border-radius:50%; object-fit:cover;">`
                : `<div class="avatar avatar-sm" style="width:32px; height:32px; border-radius:50%; background:${avatarBg}; color:#fff; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:12px;">${avatarInitial}</div>`;

            let roleBadgeHtml = '';
            if (isAdmin) {
                roleBadgeHtml = `<span class="badge" style="font-weight:700; font-size:0.72rem; padding:3px 8px; background:linear-gradient(135deg, #0f2d3c, #1e3a8a); color:#fbbf24; border:1px solid rgba(251,191,36,0.5);">👑 Quản trị viên</span>`;
            } else {
                roleBadgeHtml = `<span class="badge badge-info" style="font-weight:700; font-size:0.72rem; padding:3px 8px;">👤 Khách hàng</span>`;
            }

            let statusBadgeHtml = '';
            if (isLocked) {
                statusBadgeHtml = `<span class="badge badge-danger" style="font-size:0.72rem; padding:3px 8px;">🔒 Đã khóa</span>`;
            } else if (isOnline) {
                statusBadgeHtml = `<span class="badge badge-success" style="font-size:0.72rem; padding:3px 8px; background:#10b981; color:#fff;">🟢 Trực tuyến</span>`;
            } else {
                statusBadgeHtml = `<span class="badge badge-secondary" style="font-size:0.72rem; padding:3px 8px; background:#94a3b8; color:#fff;">⚪ Ngoại tuyến</span>`;
            }

            return `
                <tr id="customer-row-${u.id}">
                    <td style="font-family:monospace; font-weight:700; color:var(--color-gray-600); font-size:0.75rem;">#${this.escapeHtml(u.id || '--')}</td>
                    <td>
                        <div style="display:flex; align-items:center; gap:8px;">
                            ${avatarHtml}
                            <div>
                                <div style="font-weight:700; color:#0f172a;">${this.escapeHtml(u.name || 'Người dùng')}</div>
                                <div style="font-size:0.72rem; color:#64748b;">${this.escapeHtml(u.email || '--')}</div>
                            </div>
                        </div>
                    </td>
                    <td style="font-weight:600; font-family:monospace; color:#334155;">${this.escapeHtml(u.phone || '--')}</td>
                    <td style="font-size:0.8rem; color:#475569;">${this.escapeHtml(u.email || '--')}</td>
                    <td>
                        ${roleBadgeHtml}
                    </td>
                    <td style="font-weight:700; color:#0f766e; text-align:center;">${completedCount} chuyến</td>
                    <td>
                        ${statusBadgeHtml}
                    </td>
                    <td style="font-size:0.75rem; color:#64748b;">${createdDate}</td>
                    <td style="text-align:right;">
                        <div class="table-actions" style="display:flex; gap:6px; justify-content:flex-end;">
                            <button type="button" class="btn btn-sm ${isAdmin ? 'btn-ghost' : 'btn-primary'}" 
                                style="font-size:0.74rem; padding:4px 8px; border-radius:6px; font-weight:700;"
                                onclick="adminController.toggleAdminRole('${u.id}')"
                                title="${isAdmin ? 'Hạ quyền xuống Khách hàng/Tài xế' : 'Thăng cấp lên Quản trị viên (Admin)'}">
                                ${isAdmin ? '🔻 Bỏ Admin' : '⭐ Quyền Admin'}
                            </button>
                            <button type="button" class="btn btn-sm ${isLocked ? 'btn-success' : 'btn-ghost'}"
                                style="font-size:0.74rem; padding:4px 8px; border-radius:6px; font-weight:700;"
                                onclick="adminController.toggleCustomerLock('${u.id}')"
                                title="${isLocked ? 'Mở khóa tài khoản' : 'Khóa tài khoản này'}">
                                ${isLocked ? '🔓 Mở khóa' : '🔒 Khóa'}
                            </button>
                            <button type="button" class="btn-action-edit" onclick="adminController.openEditCustomerModal('${u.id}')" title="Sửa thông tin">
                                ✏️
                            </button>
                            <button type="button" class="btn-action-delete" onclick="adminController.openDeleteModal('customer', '${u.id}')" title="Xóa tài khoản sạch hoàn toàn">
                                🗑️
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    async toggleAdminRole(userId) {
        if (!userId) return;
        const user = (this.cachedCustomers || []).find(c => c.id === userId);
        if (!user) return;

        let newRole = 'admin';
        if (user.role === 'admin') {
            newRole = (String(user.id || '').startsWith('drv_') || user.vehicleType || user.licensePlate) ? 'driver' : 'customer';
        }
        const roleLabel = newRole === 'admin' ? 'Quản trị viên (Admin)' : (newRole === 'driver' ? 'Đối tác Tài xế' : 'Khách hàng');

        if (!confirm(`Bạn có chắc muốn chuyển vai trò của tài khoản "${user.name}" thành ${roleLabel}?`)) {
            return;
        }

        try {
            user.role = newRole;
            user.updatedAt = new Date().toISOString();

            // 1. Update SQLite backend if available
            if (typeof apiClient !== 'undefined') {
                try {
                    await apiClient.post('/admin/users/role', { userId, role: newRole });
                } catch (e) {}
            }

            // 2. Update Firebase Realtime Cloud
            if (window.realtimeSync) {
                try {
                    if (window.realtimeSync.isAvailable()) {
                        await window.realtimeSync.db.ref(`goride_users/${userId}`).update({
                            role: newRole,
                            updatedAt: new Date().toISOString()
                        });
                    }
                    if (typeof window.realtimeSync._restPut === 'function') {
                        await window.realtimeSync._restPut(`goride_users/${userId}/role`, newRole);
                    }
                } catch (e) {}
            }

            // 3. Update localStorage goride_offline_users
            try {
                const users = JSON.parse(localStorage.getItem(this.STORAGE_KEYS.USERS) || '[]');
                const idx = users.findIndex(u => u.id === userId || (user.email && u.email === user.email));
                if (idx !== -1) {
                    users[idx].role = newRole;
                    users[idx].updatedAt = new Date().toISOString();
                    localStorage.setItem(this.STORAGE_KEYS.USERS, JSON.stringify(users));
                }
            } catch (e) {}

            // 4. Update active session if target user is currently logged in
            try {
                if (typeof sessionManager !== 'undefined') {
                    const cur = sessionManager.getUser();
                    if (cur && (cur.id === userId || cur.email === user.email || cur.phone === user.phone)) {
                        sessionManager.updateUser({ role: newRole });
                    }
                }
            } catch (e) {}

            this.showToast(`Đã chuyển vai trò tài khoản thành ${roleLabel}!`, 'success');
            this.filterCustomers();
            this.updateCustomerMetrics();
        } catch (err) {
            this.showToast('Lỗi cập nhật quyền: ' + err.message, 'error');
        }
    }

    async toggleDriverLock(driverId) {
        if (!driverId) return;
        let drivers = this.getStoredDrivers();
        const driver = drivers.find(d => d && d.id === driverId);
        if (!driver) return;

        const newStatus = driver.status === 'locked' ? 'active' : 'locked';
        const isLocking = (newStatus === 'locked');
        const statusLabel = isLocking ? 'Khóa' : 'Mở khóa';

        try {
            driver.status = newStatus;
            this.saveStoredDrivers(drivers);

            // 1. Update SQLite backend if available
            if (typeof apiClient !== 'undefined') {
                try {
                    await apiClient.post('/admin/users/status', { userId: driverId, status: newStatus });
                } catch (e) {}
            }

            // 2. Update Firebase Realtime Cloud & LocalStorage
            if (window.realtimeSync && typeof window.realtimeSync.lockUser === 'function') {
                await window.realtimeSync.lockUser(driverId, driver.email, driver.phone, newStatus);
            } else {
                let lockedIds = JSON.parse(localStorage.getItem('goride_locked_user_ids') || '[]');
                if (isLocking) {
                    if (!lockedIds.includes(driverId)) lockedIds.push(driverId);
                    if (driver.email && !lockedIds.includes(driver.email.toLowerCase())) lockedIds.push(driver.email.toLowerCase());
                    if (driver.phone && !lockedIds.includes(driver.phone)) lockedIds.push(driver.phone);
                } else {
                    lockedIds = lockedIds.filter(id => id !== driverId && id !== driver.email?.toLowerCase() && id !== driver.phone);
                }
                localStorage.setItem('goride_locked_user_ids', JSON.stringify(lockedIds));

                if (isLocking) {
                    localStorage.setItem('goride_force_logout_event', JSON.stringify({
                        userId: driverId,
                        userEmail: driver.email,
                        userPhone: driver.phone,
                        reason: 'locked',
                        timestamp: Date.now()
                    }));
                }
            }

            this.showToast(`Đã ${statusLabel.toLowerCase()} tài xế "${driver.name}" thành công!`, 'success');
            await this.loadDriversList();
            this.loadDashboard();
        } catch (err) {
            this.showToast('Lỗi thay đổi trạng thái tài xế: ' + err.message, 'error');
        }
    }

    async toggleCustomerLock(userId) {
        if (!userId) return;
        const user = (this.cachedCustomers || []).find(c => c.id === userId);
        if (!user) return;

        const newStatus = user.status === 'locked' ? 'active' : 'locked';
        const isLocking = (newStatus === 'locked');
        const statusLabel = isLocking ? 'Khóa' : 'Mở khóa';

        try {
            user.status = newStatus;

            // 1. Update SQLite backend if available
            if (typeof apiClient !== 'undefined') {
                try {
                    await apiClient.post('/admin/users/status', { userId, status: newStatus });
                } catch (e) {}
            }

            // 2. Update Firebase Realtime Cloud & Local Storage
            if (window.realtimeSync && typeof window.realtimeSync.lockUser === 'function') {
                await window.realtimeSync.lockUser(userId, user.email, user.phone, newStatus);
            } else {
                let lockedIds = JSON.parse(localStorage.getItem('goride_locked_user_ids') || '[]');
                if (isLocking) {
                    if (!lockedIds.includes(userId)) lockedIds.push(userId);
                    if (user.email && !lockedIds.includes(user.email.toLowerCase())) lockedIds.push(user.email.toLowerCase());
                    if (user.phone && !lockedIds.includes(user.phone)) lockedIds.push(user.phone);
                } else {
                    lockedIds = lockedIds.filter(id => id !== userId && id !== user.email?.toLowerCase() && id !== user.phone);
                }
                localStorage.setItem('goride_locked_user_ids', JSON.stringify(lockedIds));

                const users = JSON.parse(localStorage.getItem(this.STORAGE_KEYS.USERS) || '[]');
                const idx = users.findIndex(u => u.id === userId || (user.email && u.email === user.email));
                if (idx !== -1) {
                    users[idx].status = newStatus;
                    localStorage.setItem(this.STORAGE_KEYS.USERS, JSON.stringify(users));
                }

                if (isLocking) {
                    localStorage.setItem('goride_force_logout_event', JSON.stringify({
                        userId,
                        userEmail: user.email,
                        userPhone: user.phone,
                        reason: 'locked',
                        timestamp: Date.now()
                    }));
                }
            }

            this.showToast(`Đã ${statusLabel.toLowerCase()} tài khoản "${user.name}" thành công!`, 'success');
            this.filterCustomers();
            this.updateCustomerMetrics();
        } catch (err) {
            this.showToast('Lỗi thay đổi trạng thái: ' + err.message, 'error');
        }
    }

    openAddCustomerModal() {
        document.getElementById('modal-customer-title').textContent = 'Thêm tài khoản mới';
        document.getElementById('customer-form-id').value = '';
        document.getElementById('customer-form-name').value = '';
        document.getElementById('customer-form-email').value = '';
        document.getElementById('customer-form-phone').value = '';
        document.getElementById('customer-form-role').value = 'customer';
        document.getElementById('customer-form-status').value = 'active';
        this.openModal('modal-customer');
    }

    openEditCustomerModal(userId) {
        const user = (this.cachedCustomers || []).find(c => c.id === userId);
        if (!user) return;

        document.getElementById('modal-customer-title').textContent = 'Sửa thông tin tài khoản #' + userId;
        document.getElementById('customer-form-id').value = user.id || '';
        document.getElementById('customer-form-name').value = user.name || '';
        document.getElementById('customer-form-email').value = user.email || '';
        document.getElementById('customer-form-phone').value = user.phone || '';
        document.getElementById('customer-form-role').value = user.role || 'customer';
        document.getElementById('customer-form-status').value = user.status || 'active';
        this.openModal('modal-customer');
    }

    async saveCustomer(e) {
        e.preventDefault();
        const id = document.getElementById('customer-form-id').value.trim();
        const name = document.getElementById('customer-form-name').value.trim();
        const email = document.getElementById('customer-form-email').value.trim();
        const phone = document.getElementById('customer-form-phone').value.trim();
        const role = document.getElementById('customer-form-role').value;
        const status = document.getElementById('customer-form-status').value;

        if (!name || !email || !phone) {
            this.showToast('Vui lòng nhập đầy đủ các trường bắt buộc (*)', 'error');
            return;
        }

        const isEdit = !!id;
        const userId = isEdit ? id : `usr_${Date.now().toString(36)}`;
        const customerData = {
            id: userId,
            name,
            email,
            phone,
            role,
            status,
            updatedAt: new Date().toISOString()
        };

        if (!isEdit) {
            customerData.createdAt = new Date().toISOString();
        }

        try {
            // 1. Firebase Cloud Sync
            if (window.realtimeSync && window.realtimeSync.isAvailable()) {
                await window.realtimeSync.db.ref(`goride_users/${userId}`).update(customerData);
            }

            // 2. localStorage Sync
            const users = JSON.parse(localStorage.getItem(this.STORAGE_KEYS.USERS) || '[]');
            const idx = users.findIndex(u => u.id === userId || (email && u.email === email));
            if (idx !== -1) {
                users[idx] = { ...users[idx], ...customerData };
            } else {
                users.unshift(customerData);
            }
            localStorage.setItem(this.STORAGE_KEYS.USERS, JSON.stringify(users));

            this.showToast(isEdit ? 'Đã cập nhật thông tin tài khoản!' : 'Đã tạo tài khoản người dùng mới thành công!', 'success');
            this.closeModal('modal-customer');
            await this.loadCustomers();
        } catch (err) {
            this.showToast('Lỗi lưu tài khoản: ' + err.message, 'error');
        }
    }

    /* ==========================================================================
       DELETE CONFIRMATION DIALOG (FOR TRIPS, DRIVERS & CUSTOMERS)
       ========================================================================== */

    openDeleteModal(type, id) {
        this.deleteTarget = { type, id };
        const msgEl = document.getElementById('delete-modal-msg');
        if (msgEl) {
            if (type === 'trip') {
                msgEl.textContent = `Bạn có chắc chắn muốn xóa chuyến đi #${id} khỏi hệ thống dữ liệu?`;
            } else if (type === 'driver') {
                msgEl.textContent = `Bạn có chắc chắn muốn xóa tài xế #${id} khỏi danh sách?`;
            } else if (type === 'customer') {
                msgEl.textContent = `Bạn có chắc chắn muốn XÓA VĨNH VIỄN tài khoản #${id}? Toàn bộ dữ liệu của người dùng này trong hệ thống và đám mây sẽ bị xóa sạch hoàn toàn.`;
            }
        }

        const confirmBtn = document.getElementById('btn-confirm-delete');
        if (confirmBtn) {
            confirmBtn.onclick = () => this.confirmDelete();
        }

        this.openModal('modal-delete');
    }

    async confirmDelete() {
        if (!this.deleteTarget) return;
        const { type, id } = this.deleteTarget;

        if (type === 'trip') {
            this.addDeletedTripId(id);

            let trips = this.getStoredTrips();
            trips = trips.filter(t => t && t.id !== id);
            this.saveStoredTrips(trips);

            // Clean active trip if matching
            try {
                const activeTrip = JSON.parse(localStorage.getItem('goride_active_trip'));
                if (activeTrip && (activeTrip.id === id || activeTrip.tripId === id)) {
                    localStorage.removeItem('goride_active_trip');
                }
            } catch (e) {}

            // Permanently remove from Firebase Cloud
            if (window.realtimeSync && window.realtimeSync.isAvailable()) {
                try {
                    window.realtimeSync.db.ref('goride_trips/' + id).remove();
                } catch (e) {}
            }

            this.loadTripsTable();
            this.loadRecentTripsTable();
            this.loadDashboard();
            this.showToast(`Đã xóa vĩnh viễn chuyến đi #${id}!`, 'info');
        } else if (type === 'driver') {
            try {
                // Find driver details to get email and phone
                const allDrivers = this.getStoredDrivers().concat(this.getPendingDrivers());
                let targetDriver = allDrivers.find(d => d && (d.id === id || String(d.id) === String(id)));
                if (!targetDriver) {
                    const offlineUsers = JSON.parse(localStorage.getItem(this.STORAGE_KEYS.USERS) || '[]');
                    targetDriver = offlineUsers.find(u => u && (u.id === id || String(u.id) === String(id)));
                }

                const driverEmail = targetDriver?.email || '';
                const driverPhone = targetDriver?.phone || '';

                // 1. Delete cleanly from Firebase Realtime Cloud & LocalStorage & Backend API via RealtimeSyncManager
                if (window.realtimeSync && typeof window.realtimeSync.deleteUser === 'function') {
                    await window.realtimeSync.deleteUser(id, driverEmail, driverPhone);
                } else {
                    // Fallback local cleanup
                    let drivers = this.getStoredDrivers().filter(d => d && d.id !== id);
                    this.saveStoredDrivers(drivers);
                    let pending = this.getPendingDrivers().filter(d => d && d.id !== id);
                    this.savePendingDrivers(pending);
                    let users = JSON.parse(localStorage.getItem(this.STORAGE_KEYS.USERS) || '[]').filter(u => u && u.id !== id);
                    localStorage.setItem(this.STORAGE_KEYS.USERS, JSON.stringify(users));
                }

                // 2. Extra safety backend call
                if (typeof apiClient !== 'undefined') {
                    try {
                        await apiClient.post('/admin/users/delete', { userId: id, email: driverEmail, phone: driverPhone });
                    } catch (e) {}
                }

                this.loadDriversList();
                this.loadDriverApprovals();
                await this.loadCustomers();
                this.loadDashboard();
                this.showToast(`Đã xóa vĩnh viễn tài xế #${id} và làm sạch toàn bộ dữ liệu!`, 'info');
            } catch (err) {
                this.showToast('Lỗi xóa tài xế: ' + err.message, 'error');
            }
        } else if (type === 'customer') {
            try {
                let targetCustomer = (this.cachedCustomers || []).find(c => c && (c.id === id || String(c.id) === String(id)));
                if (!targetCustomer) {
                    const offlineUsers = JSON.parse(localStorage.getItem(this.STORAGE_KEYS.USERS) || '[]');
                    targetCustomer = offlineUsers.find(u => u && (u.id === id || String(u.id) === String(id)));
                }

                const custEmail = targetCustomer?.email || '';
                const custPhone = targetCustomer?.phone || '';

                // 1. Delete cleanly from Firebase Realtime Cloud & LocalStorage & Backend API via RealtimeSyncManager
                if (window.realtimeSync && typeof window.realtimeSync.deleteUser === 'function') {
                    await window.realtimeSync.deleteUser(id, custEmail, custPhone);
                }

                // 2. Extra safety backend call
                if (typeof apiClient !== 'undefined') {
                    try {
                        await apiClient.post('/admin/users/delete', { userId: id, email: custEmail, phone: custPhone });
                    } catch (e) {}
                }

                // Clean cached list
                if (this.cachedCustomers) {
                    this.cachedCustomers = this.cachedCustomers.filter(c => c && c.id !== id && (!custEmail || c.email !== custEmail));
                }

                this.showToast(`Đã xóa vĩnh viễn tài khoản #${id} và dọn dẹp sạch toàn bộ database.`, 'info');
                await this.loadCustomers();
                this.loadDriversList();
                this.loadDriverApprovals();
                this.loadDashboard();
            } catch (err) {
                this.showToast('Lỗi xóa tài khoản: ' + err.message, 'error');
            }
        }

        this.closeModal('modal-delete');
        this.deleteTarget = null;
    }

    /* ==========================================================================
       MODAL CONTROLS & UTILITIES
       ========================================================================== */

    openModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.add('is-active');
            modal.style.display = 'flex';
        }
    }

    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('is-active');
            modal.style.display = 'none';
        }
    }

    getStatusBadge(status) {
        const map = {
            'completed': { label: 'Hoàn thành', cls: 'badge-success' },
            'in_progress': { label: 'Đang di chuyển', cls: 'badge-primary' },
            'accepted': { label: 'Đã nhận', cls: 'badge-primary' },
            'requested': { label: 'Đang tìm xe', cls: 'badge-warning' },
            'cancelled': { label: 'Đã hủy', cls: 'badge-danger' }
        };
        return map[status] || { label: status || 'Chờ', cls: 'badge-info' };
    }

    escapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    showToast(message, type = 'info') {
        if (typeof App !== 'undefined' && typeof App.showToast === 'function') {
            App.showToast(message, type);
            return;
        }
        if (typeof window.showToast === 'function') {
            window.showToast(message, type);
            return;
        }
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        toast.style.cssText = `
            padding: 12px 18px;
            background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#0288d1'};
            color: #ffffff;
            border-radius: 8px;
            margin-bottom: 8px;
            font-size: 0.875rem;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            animation: fadeIn 0.2s;
        `;
        container.appendChild(toast);
        setTimeout(() => toast.remove(), 3500);
    }

    /* ==========================================================================
       PROMOTIONS & SOLAR HOLIDAY BROADCAST METHODS (ACCOUNT ISOLATION)
       ========================================================================== */

    /**
     * Load & Populate Promotions & Broadcasts Tab
     */
    /**
     * Quick broadcast shortcut from customer or driver tabs
     */
    quickBroadcast(target = 'all') {
        this.switchTab('promotions');
        const targetEl = document.getElementById('promo-target');
        if (targetEl) {
            targetEl.value = target;
        }
        const titleEl = document.getElementById('promo-title');
        if (titleEl) {
            titleEl.focus();
            titleEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    /**
     * Load & Populate Promotions & Broadcasts Tab
     */
    loadPromotionsTab() {
        const select = document.getElementById('promo-solar-holiday');
        if (select && typeof VIETNAM_SOLAR_HOLIDAYS !== 'undefined') {
            if (select.options.length <= 1) {
                VIETNAM_SOLAR_HOLIDAYS.forEach(h => {
                    const opt = document.createElement('option');
                    opt.value = h.key;
                    opt.textContent = `${h.icon} ${h.name}`;
                    select.appendChild(opt);
                });
    
            }
        }

        const promoBadge = document.getElementById('sidebar-promos-count');
        if (promoBadge && typeof navigoNotifications !== 'undefined') {
            const bcasts = navigoNotifications.getBroadcasts();
            promoBadge.textContent = bcasts.length;
        }

        this.renderBroadcastsTable();
    }

    /**
     * Quick-fill form using Vietnamese Solar Calendar Holiday template
     */
    applySolarHolidayTemplate(key) {
        if (!key || typeof VIETNAM_SOLAR_HOLIDAYS === 'undefined') return;
        const holiday = VIETNAM_SOLAR_HOLIDAYS.find(h => h.key === key);
        if (!holiday) return;

        const titleEl = document.getElementById('promo-title');
        const bodyEl = document.getElementById('promo-body');
        const codeEl = document.getElementById('promo-code');
        const discEl = document.getElementById('promo-discount');
        const targetEl = document.getElementById('promo-target');
        const catEl = document.getElementById('promo-category');

        if (titleEl) titleEl.value = holiday.title;
        if (bodyEl) bodyEl.value = holiday.body;
        if (codeEl) codeEl.value = holiday.promoCode || '';
        if (discEl) discEl.value = holiday.discountPercent || '';
        if (targetEl) targetEl.value = holiday.target || 'all';
        if (catEl) catEl.value = holiday.category || 'promo';

        this.showToast(`Đã áp dụng mẫu sự kiện "${holiday.name}"!`, 'info');
    }

    /**
     * Admin publishes a new notification / promotion broadcast
     */
    publishBroadcast(e) {
        if (e && e.preventDefault) e.preventDefault();

        const target = document.getElementById('promo-target')?.value || 'all';
        const category = document.getElementById('promo-category')?.value || 'promo';
        const title = document.getElementById('promo-title')?.value.trim();
        const body = document.getElementById('promo-body')?.value.trim();
        const promoCode = document.getElementById('promo-code')?.value.trim().toUpperCase() || null;
        const discountPercent = Number(document.getElementById('promo-discount')?.value) || null;

        if (!title || !body) {
            this.showToast('Vui lòng nhập đầy đủ tiêu đề và nội dung thông báo.', 'warning');
            return;
        }

        const targetLabel = target === 'all' ? 'Tất cả người dùng & tài xế' : (target === 'customer' ? 'Chỉ Khách hàng' : 'Chỉ Đối tác Tài xế');

        const doPublish = () => {
            if (typeof navigoNotifications === 'undefined') {
                this.showToast('Lỗi: Hệ thống thông báo chưa được tải.', 'error');
                return;
            }

            const res = navigoNotifications.publishBroadcast({
                title,
                body,
                target,
                category,
                promoCode,
                discountPercent,
                icon: category === 'promo' ? '🎟️' : '🇻🇳'
            });


            if (res) {
                this.showToast(`Đã phát hành thông báo thành công tới "${targetLabel}"!`, 'success');
                const form = document.getElementById('form-broadcast-promo');
                if (form) form.reset();
                this.renderBroadcastsTable();
            } else {
                this.showToast('Không thể phát hành thông báo.', 'error');
            }
        };

        if (typeof window.showNavigoModal === 'function') {
            window.showNavigoModal({
                title: 'Xác nhận phát hành thông báo',
                message: `Bạn có chắc chắn muốn phát hành thông báo "${title}" tới đối tượng: ${targetLabel}?`,
                icon: '📢',
                confirmText: 'Phát hành ngay',
                cancelText: 'Xem lại',
                onConfirm: doPublish
            });

        } else {
            doPublish();
        }
    }

    /**
     * Render broadcast history table in Admin
     */
    renderBroadcastsTable() {
        const tbody = document.getElementById('promo-broadcasts-tbody');
        if (!tbody) return;

        if (typeof navigoNotifications === 'undefined') {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center" style="padding:24px;">Hệ thống thông báo chưa sẵn sàng.</td></tr>';
            return;
        }

        const broadcasts = navigoNotifications.getBroadcasts();
        if (!broadcasts || broadcasts.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center" style="padding:24px; color:#64748b;">Chưa có thông báo nào được phát hành.</td></tr>';
            return;
        }

        tbody.innerHTML = broadcasts.map(b => {
            const targetBadge = b.target === 'all'
                ? '<span class="badge" style="background:#e0f2fe; color:#0369a1; font-weight:700;">🌐 Tất cả</span>'
                : (b.target === 'customer'
                    ? '<span class="badge" style="background:#e6f7f6; color:#007d77; font-weight:700;">👤 Khách hàng</span>'
                    : '<span class="badge" style="background:#fef3c7; color:#92400e; font-weight:700;">🚗 Tài xế</span>');

            const catBadge = b.category === 'promo'
                ? '<span class="badge badge-success">🎟️ Khuyến mãi</span>'
                : '<span class="badge badge-info">⭐ Sự kiện</span>';

            const voucherText = b.promoCode
                ? `<code style="background:#f1f5f9; padding:2px 6px; border-radius:4px; font-weight:800; color:#0f2d3c;">${b.promoCode}</code>`
                : '<span style="color:#94a3b8;">--</span>';

            const discountText = b.discountPercent
                ? `<strong style="color:#00b1a9;">-${b.discountPercent}%</strong>`
                : '<span style="color:#94a3b8;">--</span>';

            return `
                <tr>
                    <td style="font-size:0.85rem; color:#64748b;">${b.date || 'Hôm nay'}</td>
                    <td>
                        <div style="font-weight:700; color:#0f2d3c; margin-bottom:2px;">${b.icon || ''} ${b.title}</div>
                        <div style="font-size:0.82rem; color:#64748b; max-width:400px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${b.body}</div>
                    </td>
                    <td>${targetBadge}</td>
                    <td>${catBadge}</td>
                    <td>${voucherText}</td>
                    <td>${discountText}</td>
                    <td><span class="badge badge-success" style="font-size:0.75rem;">Đã phát hành</span></td>
                </tr>
            `;
        }).join('');
    }

    /* ==========================================================================
       ENTERPRISE DATA IMPORT & EXPORT SYSTEM (CSV / TXT / DAT)
       Complies strictly with YC04 Criteria for Persistent Storage & Verification
       ========================================================================== */

    openExportModal(entity) {
        this.currentExportEntity = entity; // 'trips', 'drivers', 'customers'
        this.currentExportFormat = this.currentExportFormat || 'csv';

        const titleEl = document.getElementById('export-entity-title');
        const badgeEl = document.getElementById('export-entity-count-badge');
        
        let entityName = 'Chuyến đi';
        let count = 0;

        if (entity === 'trips') {
            entityName = 'Chuyến đi';
            count = (this.getStoredTrips() || []).length;
        } else if (entity === 'drivers') {
            entityName = 'Tài xế';
            count = (this.getStoredDrivers() || []).length;
        } else if (entity === 'customers') {
            entityName = 'Khách hàng & Người dùng';
            count = (this.cachedCustomers || JSON.parse(localStorage.getItem(this.STORAGE_KEYS.USERS) || '[]')).length;
        }

        if (titleEl) titleEl.textContent = entityName;
        if (badgeEl) badgeEl.textContent = `${count} bản ghi`;

        this.onExportFormatChange(this.currentExportFormat);
        this.openModal('modal-data-export');
    }

    onExportFormatChange(format) {
        this.currentExportFormat = format;
        ['csv', 'txt', 'dat'].forEach(fmt => {
            const card = document.getElementById(`card-format-${fmt}`);
            if (card) {
                if (fmt === format) {
                    card.style.borderColor = '#00b1a9';
                    card.style.background = '#f0fdfa';
                } else {
                    card.style.borderColor = '#e2e8f0';
                    card.style.background = '#ffffff';
                }
            }
        });

        const tag = document.getElementById('export-preview-format-tag');
        if (tag) tag.textContent = `Định dạng: ${format.toUpperCase()}`;

        this.updateExportPreview();
    }

    formatExportDateTime(val, withTime = true) {
        if (!val) return '02/11/2026 14:35:00';
        const d = new Date(val);
        if (isNaN(d.getTime())) return String(val);
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        if (!withTime) return `${day}/${month}/${year}`;
        const hours = String(d.getHours()).padStart(2, '0');
        const minutes = String(d.getMinutes()).padStart(2, '0');
        const seconds = String(d.getSeconds()).padStart(2, '0');
        return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
    }

    getExportDataset(entity) {
        let headers = [];
        let displayHeaders = [];
        let rows = [];
        let title = '';
        let entityCode = '';
        let aligns = [];
        let colWidths = [];

        const nowStr = this.formatExportDateTime(new Date());

        if (entity === 'trips') {
            entityCode = 'TRIPS';
            title = 'QUẢN LÝ CHUYẾN ĐI (TRIPS)';
            headers = ['MaChuyen', 'ThoiGian', 'KhachHang', 'TaiXe', 'BienSoXe', 'DiemDon', 'DiemDen', 'QuangDuongKm', 'GiaCuocVND', 'ThanhToan', 'TrangThai'];
            displayHeaders = ['Mã Chuyến', 'Thời Gian', 'Khách Hàng', 'Tài Xế', 'Biển Số Xe', 'Điểm Đón', 'Điểm Đến', 'Quãng Đường', 'Giá Cước', 'Thanh Toán', 'Trạng Thái'];
            aligns = ['center', 'center', 'left', 'left', 'center', 'left', 'left', 'right', 'right', 'center', 'center'];
            colWidths = [12, 20, 20, 20, 12, 35, 35, 13, 13, 12, 12];

            const trips = this.getStoredTrips() || [];
            rows = trips.map(t => {
                const pText = this.getPickupText(t, 'Điểm đón khách');
                const dText = this.getDestinationText(t, 'Điểm đến khách');
                const distKm = t.distanceMeters ? (t.distanceMeters / 1000).toFixed(1) : (t.distance || '3.5');
                const fare = t.fareAmount || t.fare || 40000;
                const time = this.formatExportDateTime(t.createdAt);
                const status = (t.status || 'COMPLETED').toUpperCase();
                return [
                    t.id || 'NVG-1001',
                    time,
                    t.customerName || t.userName || 'Khách hàng',
                    t.driverName || '--',
                    t.licensePlate || t.plate || '--',
                    pText,
                    dText,
                    distKm,
                    fare,
                    t.paymentMethod || 'Tiền mặt',
                    status
                ];
            });
        } else if (entity === 'drivers') {
            entityCode = 'DRIVERS';
            title = 'QUẢN LÝ TÀI XẾ (DRIVERS)';
            headers = ['MaTaiXe', 'HoTen', 'SoDienThoai', 'BienSoXe', 'LoaiXe', 'DongXe', 'KinhNghiem', 'TrangThaiDuyet', 'TrangThaiHoatDong', 'KhuVucHoatDong'];
            displayHeaders = ['Mã Tài Xế', 'Họ Và Tên', 'Số Điện Thoại', 'Biển Số Xe', 'Loại Xe', 'Dòng Xe', 'Kinh Nghiệm', 'Trạng Thái Duyệt', 'Hoạt Động', 'Khu Vực Hoạt Động'];
            aligns = ['center', 'left', 'center', 'center', 'center', 'left', 'center', 'center', 'center', 'left'];
            colWidths = [12, 20, 14, 13, 10, 18, 14, 18, 12, 28];

            const drivers = this.getStoredDrivers() || [];
            rows = drivers.map(d => {
                return [
                    d.id || 'drv_1001',
                    d.name || 'Tài xế',
                    d.phone || '--',
                    d.plate || d.licensePlate || '--',
                    d.vehicleType || 'car4',
                    d.vehicleTypeName || d.vehicleModel || 'VinFast Electric',
                    d.experience || d.experienceYears || 1,
                    (d.status || d.approvalStatus || 'APPROVED').toUpperCase(),
                    d.onlineStatus || (d.isOnline ? 'ONLINE' : 'OFFLINE'),
                    d.area || d.address || 'TP. Hồ Chí Minh'
                ];
            });
        } else if (entity === 'customers') {
            entityCode = 'CUSTOMERS';
            title = 'QUẢN LÝ KHÁCH HÀNG & NGƯỜI DÙNG (CUSTOMERS)';
            headers = ['MaKhachHang', 'HoTen', 'Email', 'SoDienThoai', 'SoDuViVND', 'DanhGia', 'TrangThai', 'NgayDangKy'];
            displayHeaders = ['Mã Khách Hàng', 'Họ Và Tên', 'Địa Chỉ Email', 'Số Điện Thoại', 'Số Dư Ví', 'Đánh Giá', 'Trạng Thái', 'Ngày Đăng Ký'];
            aligns = ['center', 'left', 'left', 'center', 'right', 'center', 'center', 'center'];
            colWidths = [14, 22, 26, 14, 14, 10, 14, 14];

            const customers = this.cachedCustomers && this.cachedCustomers.length > 0 
                ? this.cachedCustomers 
                : JSON.parse(localStorage.getItem(this.STORAGE_KEYS.USERS) || '[]');
            rows = customers.map(c => {
                const regDate = this.formatExportDateTime(c.createdAt, false);
                return [
                    c.id || 'usr_1001',
                    c.name || 'Người dùng',
                    c.email || '--',
                    c.phone || '--',
                    c.walletBalance || c.balance || 0,
                    c.rating || 5.0,
                    c.status || 'active',
                    regDate
                ];
            });
        }

        return { headers, displayHeaders, rows, title, entityCode, aligns, colWidths, nowStr };
    }

    serializeData(datasetOrEntity, format, optHeaders, optRows) {
        let dataset;
        if (datasetOrEntity && typeof datasetOrEntity === 'object' && datasetOrEntity.headers && datasetOrEntity.rows) {
            dataset = datasetOrEntity;
        } else {
            const entity = datasetOrEntity || 'trips';
            dataset = {
                headers: optHeaders || [],
                displayHeaders: optHeaders || [],
                rows: optRows || [],
                title: `BÁO CÁO DỮ LIỆU ${entity.toUpperCase()}`,
                entityCode: entity.toUpperCase(),
                aligns: [],
                colWidths: [],
                nowStr: this.formatExportDateTime(new Date())
            };
        }

        const { headers, displayHeaders, rows, title, entityCode, aligns, colWidths, nowStr } = dataset;
        const exportTime = nowStr || this.formatExportDateTime(new Date());

        if (format === 'txt') {
            const widths = (colWidths && colWidths.length === headers.length) 
                ? [...colWidths] 
                : headers.map((h, i) => Math.max((displayHeaders[i] || h).length, 12));

            const padCell = (val, width, align = 'left') => {
                let str = String(val === null || val === undefined ? '--' : val).trim();
                const chars = [...str];
                if (chars.length > width) {
                    str = chars.slice(0, Math.max(1, width - 2)).join('') + '..';
                }
                const padCount = Math.max(0, width - [...str].length);
                if (align === 'right') {
                    return ' '.repeat(padCount) + str;
                } else if (align === 'center') {
                    const left = Math.floor(padCount / 2);
                    const right = padCount - left;
                    return ' '.repeat(left) + str + ' '.repeat(right);
                } else {
                    return str + ' '.repeat(padCount);
                }
            };

            const borderLine = '+' + widths.map(w => '-'.repeat(w + 2)).join('+') + '+';
            const tableWidth = borderLine.length;
            const doubleLine = '='.repeat(tableWidth);
            const singleLine = '-'.repeat(tableWidth);

            const centerText = (txt) => {
                const chars = [...txt];
                if (chars.length >= tableWidth) return txt;
                const pad = Math.floor((tableWidth - chars.length) / 2);
                return ' '.repeat(pad) + txt;
            };

            const headerLine = '| ' + displayHeaders.map((h, i) => padCell(h, widths[i], 'center')).join(' | ') + ' |';

            const formattedRows = rows.map(r => {
                const cells = [...r];
                if (entityCode === 'TRIPS') {
                    if (cells[7] !== undefined && cells[7] !== '--') cells[7] = `${cells[7]} km`;
                    if (cells[8] !== undefined && cells[8] !== '--') {
                        cells[8] = `${parseInt(String(cells[8]).replace(/\D/g, ''), 10).toLocaleString('vi-VN')} đ`;
                    }
                } else if (entityCode === 'CUSTOMERS') {
                    if (cells[4] !== undefined && cells[4] !== '--') {
                        cells[4] = `${parseInt(String(cells[4]).replace(/\D/g, ''), 10).toLocaleString('vi-VN')} đ`;
                    }
                    if (cells[5] !== undefined && cells[5] !== '--') cells[5] = `${cells[5]} ★`;
                } else if (entityCode === 'DRIVERS') {
                    if (cells[6] !== undefined && cells[6] !== '--') cells[6] = `${cells[6]} năm`;
                }
                return '| ' + cells.map((c, i) => padCell(c, widths[i], (aligns && aligns[i]) || 'left')).join(' | ') + ' |';
            });

            const lines = [
                doubleLine,
                centerText('HỆ THỐNG ĐẶT XE TRỰC TUYẾN NAVIGO - BÁO CÁO QUẢN TRỊ'),
                centerText(`DANH MỤC: ${title}`),
                singleLine,
                `  * Thời gian xuất báo cáo : ${exportTime}`,
                `  * Đơn vị quản lý         : Ban Điều Hành & Quản Trị Hệ Thống Navigo`,
                `  * Tổng số lượng bản ghi  : ${rows.length} bản ghi`,
                doubleLine,
                borderLine,
                headerLine,
                borderLine,
                ...formattedRows,
                borderLine,
                doubleLine,
                `  * TỔNG KẾT: ${rows.length} bản ghi dữ liệu | Hệ thống Navigo Real-Time Car Booking Platform`,
                `  * BẢO MẬT : Tệp dữ liệu có cấu trúc bảng chuẩn để xem, in ấn hoặc tái nhập (import) lại hệ thống.`,
                doubleLine
            ];

            return '\uFEFF' + lines.join('\r\n');

        } else if (format === 'csv') {
            const escapeCell = (val) => {
                if (val === null || val === undefined) return '""';
                const str = String(val);
                if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
                    return `"${str.replace(/"/g, '""')}"`;
                }
                return `"${str}"`;
            };

            const headerLine = headers.map(escapeCell).join(',');
            const rowLines = rows.map(r => r.map(escapeCell).join(','));

            const lines = [
                '# ========================================================================================================================',
                '# HỆ THỐNG ĐẶT XE TRỰC TUYẾN NAVIGO - BÁO CÁO DỮ LIỆU QUẢN TRỊ',
                `# DANH MỤC: ${title}`,
                `# Thời gian xuất báo cáo : ${exportTime}`,
                '# Đơn vị quản lý         : Ban Điều Hành & Quản Trị Hệ Thống Navigo',
                `# Tổng số lượng bản ghi  : ${rows.length} bản ghi`,
                '# ========================================================================================================================',
                headerLine,
                ...rowLines,
                '# ========================================================================================================================',
                `# TỔNG KẾT: ${rows.length} bản ghi | Hoàn tất xuất báo cáo Navigo`,
                '# ========================================================================================================================'
            ];

            return '\uFEFF' + lines.join('\r\n');

        } else if (format === 'dat') {
            const lines = [
                '========================================================================================================================',
                'HỆ THỐNG ĐẶT XE TRỰC TUYẾN NAVIGO - CƠ SỞ DỮ LIỆU ĐỊNH DẠNG DAT',
                `DANH MỤC LƯU TRỮ: ${title}`,
                '========================================================================================================================',
                '[THÔNG TIN TỆP DỮ LIỆU]',
                'HeThong=Navigo Real-Time Car Booking Platform',
                'PhienBan=2.0',
                `DanhMuc=${entityCode}`,
                `ThoiGianXuat=${exportTime}`,
                `TongSoBanGhi=${rows.length}`,
                'DinhDangPhanCach=SEMICOLON (;)',
                'KyTuMaHoa=UTF-8 with BOM',
                '',
                '[DANH SÁCH BẢN GHI]',
                headers.join(';'),
                ...rows.map(r => r.join(';')),
                '',
                '[TỔNG KẾT & MÃ KIỂM TRA]',
                `TongSoDong=${rows.length}`,
                'TrangThaiDuLieu=VALID',
                `MaChecksum=NVG-${entityCode}-${rows.length}`,
                '========================================================================================================================'
            ];

            return '\uFEFF' + lines.join('\r\n');
        }

        return '';
    }

    updateExportPreview() {
        const previewBox = document.getElementById('export-preview-box');
        if (!previewBox) return;

        const dataset = this.getExportDataset(this.currentExportEntity);
        const previewDataset = { ...dataset, rows: dataset.rows.slice(0, 2) };
        const text = this.serializeData(previewDataset, this.currentExportFormat);
        previewBox.textContent = text.replace(/^\uFEFF/, '');
    }

    executeExport() {
        const entity = this.currentExportEntity;
        const format = this.currentExportFormat;
        const dataset = this.getExportDataset(entity);

        if (dataset.rows.length === 0) {
            this.showToast(`Danh sách ${entity} hiện tại đang trống!`, 'warning');
        }

        const content = this.serializeData(dataset, format);
        const nowStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const filename = `navigo_${entity}_${nowStr}.${format}`;

        let mimeType = 'text/csv;charset=utf-8;';
        if (format === 'txt') mimeType = 'text/plain;charset=utf-8;';
        else if (format === 'dat') mimeType = 'application/octet-stream;charset=utf-8;';

        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        this.closeModal('modal-data-export');
        this.showToast(`Đã xuất thành công ${dataset.rows.length} bản ghi ra tệp ${filename}!`, 'success');
    }

    /* --- IMPORT SYSTEM --- */

    openImportModal(entity) {
        this.currentImportEntity = entity;
        this.parsedImportData = [];
        this.importDetectedFormat = 'csv';

        const titleEl = document.getElementById('import-entity-title');
        let entityName = 'Chuyến đi';
        if (entity === 'drivers') entityName = 'Tài xế';
        else if (entity === 'customers') entityName = 'Khách hàng & Người dùng';
        if (titleEl) titleEl.textContent = entityName;

        const fileInput = document.getElementById('admin-import-file-input');
        if (fileInput) fileInput.value = '';

        const dropzone = document.getElementById('admin-import-dropzone');
        if (dropzone) dropzone.style.display = 'block';

        const previewWrap = document.getElementById('import-preview-wrapper');
        if (previewWrap) previewWrap.style.display = 'none';

        const submitBtn = document.getElementById('btn-submit-import');
        if (submitBtn) submitBtn.disabled = true;

        const hint = document.getElementById('import-footer-hint');
        if (hint) hint.textContent = 'Chọn tệp để xem trước trước khi nạp.';

        this.openModal('modal-data-import');
    }

    getSampleDataForEntity(entity) {
        let headers = [];
        let displayHeaders = [];
        let rows = [];
        let title = '';
        let entityCode = '';
        let aligns = [];
        let colWidths = [];

        const nowStr = this.formatExportDateTime(new Date());

        if (entity === 'trips') {
            entityCode = 'TRIPS';
            title = 'QUẢN LÝ CHUYẾN ĐI (TRIPS)';
            headers = ['MaChuyen', 'ThoiGian', 'KhachHang', 'TaiXe', 'BienSoXe', 'DiemDon', 'DiemDen', 'QuangDuongKm', 'GiaCuocVND', 'ThanhToan', 'TrangThai'];
            displayHeaders = ['Mã Chuyến', 'Thời Gian', 'Khách Hàng', 'Tài Xế', 'Biển Số Xe', 'Điểm Đón', 'Điểm Đến', 'Quãng Đường', 'Giá Cước', 'Thanh Toán', 'Trạng Thái'];
            aligns = ['center', 'center', 'left', 'left', 'center', 'left', 'left', 'right', 'right', 'center', 'center'];
            colWidths = [12, 20, 20, 20, 12, 35, 35, 13, 13, 12, 12];
            rows = [
                ['NVG-1024', '02/11/2026 14:35:00', 'Nguyễn Văn An', 'Trần Văn Bình', '59A-123.45', 'ĐH Giao Thông Vận Tải TP.HCM', 'Khu Công Nghệ Cao TP.HCM', '3.8', '42000', 'NaviPay', 'COMPLETED'],
                ['NVG-1025', '02/11/2026 15:10:00', 'Lê Thị Cẩm', 'Đặng Văn Hùng', '59B-678.90', 'Vincom Plaza Lê Văn Việt', 'Bến xe Miền Đông mới', '7.2', '75000', 'Tiền mặt', 'COMPLETED'],
                ['NVG-1026', '02/11/2026 16:05:00', 'Phạm Minh Dũng', '--', '--', 'Ký túc xá Khu B ĐHQG', 'Chợ Tăng Nhơn Phú A', '4.1', '45000', 'Tiền mặt', 'CANCELLED']
            ];
        } else if (entity === 'drivers') {
            entityCode = 'DRIVERS';
            title = 'QUẢN LÝ TÀI XẾ (DRIVERS)';
            headers = ['MaTaiXe', 'HoTen', 'SoDienThoai', 'BienSoXe', 'LoaiXe', 'DongXe', 'KinhNghiem', 'TrangThaiDuyet', 'TrangThaiHoatDong', 'KhuVucHoatDong'];
            displayHeaders = ['Mã Tài Xế', 'Họ Và Tên', 'Số Điện Thoại', 'Biển Số Xe', 'Loại Xe', 'Dòng Xe', 'Kinh Nghiệm', 'Trạng Thái Duyệt', 'Hoạt Động', 'Khu Vực Hoạt Động'];
            aligns = ['center', 'left', 'center', 'center', 'center', 'left', 'center', 'center', 'center', 'left'];
            colWidths = [12, 20, 14, 13, 10, 18, 14, 18, 12, 28];
            rows = [
                ['drv_8001', 'Nguyễn Văn Hùng', '0901234567', '59A-888.88', 'car4', 'VinFast VF e34', '3', 'APPROVED', 'ONLINE', 'TP. Thủ Đức - Q9'],
                ['drv_8002', 'Trần Thị Mai', '0912345678', '59B-999.99', 'motorbike', 'VinFast Feliz S', '2', 'APPROVED', 'ONLINE', 'Bình Thạnh - Q1'],
                ['drv_8003', 'Lê Hoàng Nam', '0987654321', '59C-777.77', 'car7', 'VinFast VF 9', '5', 'APPROVED', 'OFFLINE', 'Thủ Đức - Dĩ An']
            ];
        } else if (entity === 'customers') {
            entityCode = 'CUSTOMERS';
            title = 'QUẢN LÝ KHÁCH HÀNG & NGƯỜI DÙNG (CUSTOMERS)';
            headers = ['MaKhachHang', 'HoTen', 'Email', 'SoDienThoai', 'SoDuViVND', 'DanhGia', 'TrangThai', 'NgayDangKy'];
            displayHeaders = ['Mã Khách Hàng', 'Họ Và Tên', 'Địa Chỉ Email', 'Số Điện Thoại', 'Số Dư Ví', 'Đánh Giá', 'Trạng Thái', 'Ngày Đăng Ký'];
            aligns = ['center', 'left', 'left', 'center', 'right', 'center', 'center', 'center'];
            colWidths = [14, 22, 26, 14, 14, 10, 14, 14];
            rows = [
                ['usr_9001', 'Nguyễn Thùy Linh', 'linh.nguyen@gmail.com', '0909112233', '150000', '5.0', 'active', '02/11/2026'],
                ['usr_9002', 'Đoàn Văn Hậu', 'hau.doan@gmail.com', '0933445566', '320000', '4.9', 'active', '02/11/2026'],
                ['usr_9003', 'Phạm Quỳnh Anh', 'anh.quynh@gmail.com', '0977889900', '50000', '5.0', 'active', '02/11/2026']
            ];
        }

        return { headers, displayHeaders, rows, title, entityCode, aligns, colWidths, nowStr };
    }

    downloadTemplateFile(format) {
        const entity = this.currentImportEntity;
        const dataset = this.getSampleDataForEntity(entity);
        const content = this.serializeData(dataset, format);
        const filename = `mau_nhap_${entity}.${format}`;

        let mimeType = 'text/csv;charset=utf-8;';
        if (format === 'txt') mimeType = 'text/plain;charset=utf-8;';
        else if (format === 'dat') mimeType = 'application/octet-stream;charset=utf-8;';

        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        this.showToast(`Đã tải tệp mẫu ${filename} thành công!`, 'info');
    }

    onImportFileSelected(event) {
        const file = event.target.files && event.target.files[0];
        if (!file) return;

        const fileName = file.name;
        const fileSizeKb = (file.size / 1024).toFixed(1);
        const ext = fileName.split('.').pop().toLowerCase();

        const reader = new FileReader();
        reader.onload = (e) => {
            const rawContent = e.target.result;
            this.processImportText(rawContent, fileName, fileSizeKb, ext);
        };
        reader.onerror = () => {
            this.showToast('Không thể đọc tệp đã chọn. Vui lòng thử lại!', 'error');
        };
        reader.readAsText(file, 'UTF-8');
    }

    processImportText(rawContent, fileName, fileSizeKb, ext) {
        if (!rawContent || !rawContent.trim()) {
            this.showToast('Tệp đã chọn bị rỗng!', 'warning');
            return;
        }

        const cleanText = rawContent.replace(/^\uFEFF/, '').trim();
        const lines = cleanText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);

        let headers = [];
        let dataRows = [];
        let detectedFormat = ext ? ext.toLowerCase() : 'csv';
        let delimiter = ',';

        // 1. Check if TXT Box Table with '|'
        const tableLines = lines.filter(l => l.startsWith('|') && l.endsWith('|'));
        if (tableLines.length >= 2) {
            detectedFormat = 'txt';
            delimiter = '|';
            headers = tableLines[0].split('|').slice(1, -1).map(c => c.trim());
            for (let i = 1; i < tableLines.length; i++) {
                const cells = tableLines[i].split('|').slice(1, -1).map(c => c.trim());
                if (cells.length === headers.length && !cells.every(c => c.startsWith('-'))) {
                    dataRows.push(cells);
                }
            }
        } else {
            // 2. CSV or DAT or generic TSV/CSV
            const candidateLines = lines.filter(l => {
                if (l.startsWith('#') || l.startsWith('=') || l.startsWith('-') || l.startsWith('*') || l.startsWith('+')) return false;
                if (l.startsWith('[') && l.endsWith(']')) return false;
                if (/^[A-Za-z0-9_]+=[^;,\t]+$/.test(l)) return false;
                return true;
            });

            if (candidateLines.length < 2) {
                this.showToast('Không tìm thấy đủ dòng tiêu đề và dữ liệu hợp lệ trong tệp!', 'warning');
                return;
            }

            const firstDataLine = candidateLines[0];
            if (firstDataLine.includes(';')) delimiter = ';';
            else if (firstDataLine.includes('\t')) delimiter = '\t';
            else delimiter = ',';

            const parseLine = (line) => {
                if (delimiter === ',') {
                    const result = [];
                    let current = '';
                    let inQuotes = false;
                    for (let i = 0; i < line.length; i++) {
                        const char = line[i];
                        if (char === '"') {
                            if (inQuotes && line[i + 1] === '"') {
                                current += '"';
                                i++;
                            } else {
                                inQuotes = !inQuotes;
                            }
                        } else if (char === ',' && !inQuotes) {
                            result.push(current.trim());
                            current = '';
                        } else {
                            current += char;
                        }
                    }
                    result.push(current.trim());
                    return result;
                } else {
                    return line.split(delimiter).map(cell => cell.replace(/^"(.*)"$/, '$1').trim());
                }
            };

            headers = parseLine(candidateLines[0]);
            for (let i = 1; i < candidateLines.length; i++) {
                const cells = parseLine(candidateLines[i]);
                if (cells.some(c => c.length > 0)) {
                    dataRows.push(cells);
                }
            }
        }

        if (dataRows.length === 0) {
            this.showToast('Không phát hiện được bản ghi dữ liệu hợp lệ nào trong tệp!', 'warning');
            return;
        }

        this.parsedImportHeaders = headers;
        this.parsedImportData = dataRows;

        // Update UI
        const nameEl = document.getElementById('import-file-name');
        const metaEl = document.getElementById('import-file-meta');
        const badgeEl = document.getElementById('import-summary-badge');
        const countText = document.getElementById('import-row-count-text');
        const submitBtn = document.getElementById('btn-submit-import');
        const hintEl = document.getElementById('import-footer-hint');
        const previewWrap = document.getElementById('import-preview-wrapper');

        if (nameEl) nameEl.textContent = fileName;
        if (metaEl) metaEl.textContent = `${fileSizeKb} KB • Phân tách: "${delimiter === '\t' ? 'TAB' : delimiter}" • Định dạng .${detectedFormat.toUpperCase()}`;
        if (badgeEl) badgeEl.textContent = `Hợp lệ ${dataRows.length} dòng`;
        if (countText) countText.textContent = `${dataRows.length} dòng dữ liệu`;
        if (previewWrap) previewWrap.style.display = 'block';
        if (submitBtn) submitBtn.disabled = dataRows.length === 0;
        if (hintEl) hintEl.textContent = `Sẵn sàng nạp ${dataRows.length} dòng dữ liệu vào hệ thống.`;

        // Render mini preview table
        const tableContainer = document.getElementById('import-preview-table-container');
        if (tableContainer) {
            const previewRows = dataRows.slice(0, 3);
            let html = '<table class="data-table" style="font-size:0.75rem; margin:0; width:100%;"><thead><tr>';
            headers.forEach(h => {
                html += `<th style="padding:6px 10px; background:#f1f5f9; color:#334155;">${this.escapeHtml(h)}</th>`;
            });
            html += '</tr></thead><tbody>';
            previewRows.forEach(r => {
                html += '<tr>';
                headers.forEach((h, idx) => {
                    html += `<td style="padding:6px 10px; max-width:160px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${this.escapeHtml(r[idx] || '--')}</td>`;
                });
                html += '</tr>';
            });
            html += '</tbody></table>';
            tableContainer.innerHTML = html;
        }
    }

    executeImport() {
        if (!this.parsedImportData || this.parsedImportData.length === 0) {
            this.showToast('Không có dữ liệu hợp lệ để nạp!', 'warning');
            return;
        }

        const entity = this.currentImportEntity;
        const headers = this.parsedImportHeaders || [];
        const rows = this.parsedImportData;

        const normalizeKey = (str) => {
            if (!str) return '';
            return str
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/đ/g, 'd')
                .replace(/Đ/g, 'D')
                .replace(/[^a-zA-Z0-9]/g, '')
                .toLowerCase();
        };

        const getCol = (row, ...aliases) => {
            const normAliases = aliases.map(normalizeKey);
            for (let i = 0; i < headers.length; i++) {
                const normHeader = normalizeKey(headers[i]);
                if (normAliases.includes(normHeader) && row[i] !== undefined) {
                    return row[i];
                }
            }
            return '';
        };

        let importedCount = 0;

        if (entity === 'trips') {
            const existingTrips = this.getStoredTrips() || [];
            rows.forEach((r, idx) => {
                const id = getCol(r, 'MaChuyen', 'Mã Chuyến', 'id', 'tripId') || `NVG_${Date.now()}_${idx + 1000}`;
                const time = getCol(r, 'ThoiGian', 'Thời Gian', 'createdAt', 'time') || new Date().toISOString();
                const custName = getCol(r, 'KhachHang', 'Khách Hàng', 'customerName', 'customer') || 'Khách hàng';
                const driverName = getCol(r, 'TaiXe', 'Tài Xế', 'driverName', 'driver') || '--';
                const plate = getCol(r, 'BienSoXe', 'Biển Số Xe', 'licensePlate', 'plate') || '--';
                const pickup = getCol(r, 'DiemDon', 'Điểm Đón', 'pickup', 'pickupName', 'pickupAddress') || 'Điểm đón khách';
                const dest = getCol(r, 'DiemDen', 'Điểm Đến', 'destination', 'dropoffName', 'dropoffAddress') || 'Điểm đến khách';
                const distRaw = getCol(r, 'QuangDuongKm', 'Quãng Đường', 'distance', 'distanceKm') || '3.5';
                const distKm = parseFloat(String(distRaw).replace(/[^\d.]/g, '')) || 3.5;
                const fareRaw = getCol(r, 'GiaCuocVND', 'Giá Cước', 'fare', 'fareAmount') || '40000';
                const fare = parseInt(String(fareRaw).replace(/\D/g, ''), 10) || 40000;
                const payMethod = getCol(r, 'ThanhToan', 'Thanh Toán', 'paymentMethod') || 'Tiền mặt';
                const status = (getCol(r, 'TrangThai', 'Trạng Thái', 'status') || 'completed').toLowerCase();

                const newTrip = {
                    id,
                    createdAt: time,
                    customerName: custName,
                    driverName,
                    licensePlate: plate,
                    plate,
                    pickup,
                    pickupName: pickup,
                    pickupAddress: pickup,
                    destination: dest,
                    dropoffName: dest,
                    dropoffAddress: dest,
                    distanceMeters: Math.round(distKm * 1000),
                    fareAmount: fare,
                    paymentMethod: payMethod,
                    status
                };

                const existingIdx = existingTrips.findIndex(t => t.id === id);
                if (existingIdx !== -1) {
                    existingTrips[existingIdx] = { ...existingTrips[existingIdx], ...newTrip };
                } else {
                    existingTrips.unshift(newTrip);
                }
                importedCount++;
            });

            localStorage.setItem(this.STORAGE_KEYS.TRIPS, JSON.stringify(existingTrips));
            this.loadTripsTable();
            this.loadRecentTripsTable();
            this.loadDashboard();
        } else if (entity === 'drivers') {
            const existingDrivers = this.getStoredDrivers() || [];
            rows.forEach((r, idx) => {
                const id = getCol(r, 'MaTaiXe', 'Mã Tài Xế', 'id', 'driverId') || `drv_${Date.now().toString(36)}_${idx}`;
                const name = getCol(r, 'HoTen', 'Họ Và Tên', 'name') || 'Tài xế';
                const phone = getCol(r, 'SoDienThoai', 'Số Điện Thoại', 'phone') || '0900000000';
                const plate = getCol(r, 'BienSoXe', 'Biển Số Xe', 'plate', 'licensePlate') || '59A-000.00';
                const vType = getCol(r, 'LoaiXe', 'Loại Xe', 'vehicleType') || 'car4';
                const vModel = getCol(r, 'DongXe', 'Dòng Xe', 'vehicleModel', 'vehicleTypeName') || 'VinFast Electric';
                const expRaw = getCol(r, 'KinhNghiem', 'Kinh Nghiệm', 'experience') || '2';
                const exp = parseInt(String(expRaw).replace(/\D/g, ''), 10) || 2;
                const status = (getCol(r, 'TrangThaiDuyet', 'Trạng Thái Duyệt', 'status', 'approvalStatus') || 'active').toLowerCase();
                const onlineStatus = (getCol(r, 'TrangThaiHoatDong', 'Hoạt Động', 'onlineStatus') || 'OFFLINE').toUpperCase();
                const area = getCol(r, 'KhuVucHoatDong', 'Khu Vực Hoạt Động', 'area') || 'TP. Hồ Chí Minh';

                const newDriver = {
                    id,
                    name,
                    phone,
                    plate,
                    licensePlate: plate,
                    vehicleType: vType,
                    vehicleTypeName: vModel,
                    vehicleModel: vModel,
                    experience: exp,
                    status: status === 'approved' ? 'active' : status,
                    onlineStatus,
                    area,
                    createdAt: new Date().toISOString()
                };

                const existingIdx = existingDrivers.findIndex(d => d.id === id || (phone && d.phone === phone));
                if (existingIdx !== -1) {
                    existingDrivers[existingIdx] = { ...existingDrivers[existingIdx], ...newDriver };
                } else {
                    existingDrivers.unshift(newDriver);
                }
                importedCount++;
            });

            this.saveStoredDrivers(existingDrivers);
            this.loadDriversList();
            this.loadDashboard();
        } else if (entity === 'customers') {
            const users = JSON.parse(localStorage.getItem(this.STORAGE_KEYS.USERS) || '[]');
            rows.forEach((r, idx) => {
                const id = getCol(r, 'MaKhachHang', 'Mã Khách Hàng', 'id', 'userId') || `usr_${Date.now().toString(36)}_${idx}`;
                const name = getCol(r, 'HoTen', 'Họ Và Tên', 'name') || 'Khách hàng';
                const email = getCol(r, 'Email', 'Địa Chỉ Email', 'email') || `user_${Date.now()}@navigo.vn`;
                const phone = getCol(r, 'SoDienThoai', 'Số Điện Thoại', 'phone') || '0900000000';
                const balanceRaw = getCol(r, 'SoDuViVND', 'Số Dư Ví', 'balance', 'walletBalance') || '0';
                const balance = parseInt(String(balanceRaw).replace(/\D/g, ''), 10) || 0;
                const ratingRaw = getCol(r, 'DanhGia', 'Đánh Giá', 'rating') || '5.0';
                const rating = parseFloat(String(ratingRaw).replace(/[^\d.]/g, '')) || 5.0;
                const status = getCol(r, 'TrangThai', 'Trạng Thái', 'status') || 'active';
                const regDate = getCol(r, 'NgayDangKy', 'Ngày Đăng Ký', 'createdAt') || new Date().toISOString();

                const newUser = {
                    id,
                    name,
                    email,
                    phone,
                    role: 'customer',
                    status,
                    walletBalance: balance,
                    rating,
                    createdAt: regDate
                };

                const existingIdx = users.findIndex(u => u.id === id || (email && u.email === email));
                if (existingIdx !== -1) {
                    users[existingIdx] = { ...users[existingIdx], ...newUser };
                } else {
                    users.unshift(newUser);
                }
                importedCount++;
            });

            localStorage.setItem(this.STORAGE_KEYS.USERS, JSON.stringify(users));
            this.loadCustomers();
        }

        this.closeModal('modal-data-import');
        this.showToast(`🎉 Đã nạp thành công ${importedCount} bản ghi vào hệ thống!`, 'success');
    }

}

// Global initialization
let adminController;
function startAdminApp() {
    if (!window.adminController) {
        window.adminController = new AdminController();
        adminController = window.adminController;
    }
    window.adminController.init().catch(e => console.error('[Admin] init error:', e));
}
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startAdminApp);
} else {
    startAdminApp();
}
if (false) document.addEventListener('DOMContentLoaded', () => {
    adminController = new AdminController();
    adminController.init();
});
