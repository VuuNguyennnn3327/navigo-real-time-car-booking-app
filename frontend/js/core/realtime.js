/**
 * GoRide - Realtime Cloud Synchronization Engine (Firebase Realtime Database)
 * 
 * Kiến trúc Hybrid 2 tầng:
 * - Tầng 1: Đám mây Firebase Realtime Database (đồng bộ tức thì giữa 2 điện thoại khác nhau ở bất cứ đâu).
 * - Tầng 2: LocalStorage & Storage Event Fallback (tự động kích hoạt khi offline hoặc khi chưa nhập Firebase config).
 */

class RealtimeSyncManager {
    constructor() {
        this.initialized = false;
        this.firebaseApp = null;
        this.db = null;
        this.databaseURL = '';
        this.permissionDenied = false;
        this.activeListeners = new Map();
        this.connectionStatus = 'offline'; // 'connected' | 'offline' | 'unconfigured' | 'permission_denied'

        this._initFirebase();
    }

    /**
     * Khởi tạo kết nối Firebase
     * @private
     */
    _initFirebase() {
        if (typeof window === 'undefined') return;

        let config = window.NAVIGO_FIREBASE_CONFIG || window.GORIDE_FIREBASE_CONFIG;
        try {
            const saved = localStorage.getItem('navigo_firebase_config') || localStorage.getItem('goride_firebase_config');
            if (saved) {
                const parsed = JSON.parse(saved);
                if (parsed && (parsed.databaseURL || parsed.projectId || parsed.apiKey)) {
                    config = parsed;
                }
            }
        } catch (e) {}

        const hasValidConfig = config && (
            (config.databaseURL && config.databaseURL.startsWith('http')) ||
            (config.projectId && config.projectId.trim().length > 0 && config.apiKey && config.apiKey.trim().length > 0)
        );

        if (!hasValidConfig) {
            this.connectionStatus = 'unconfigured';
            console.log('[RealtimeSync] Firebase chưa được cấu hình. Hệ thống đang chạy chế độ mô phỏng trình duyệt (LocalStorage).');
            return;
        }

        this.databaseURL = (config && config.databaseURL) ? config.databaseURL.replace(/\/+$/, '') : '';

        if (typeof firebase === 'undefined') {
            console.warn('[RealtimeSync] Firebase SDK chưa được nạp vào trang. Đang dùng REST fallback.');
            this.connectionStatus = 'offline';
            return;
        }

        try {
            // Tránh khởi tạo duplicate apps
            if (!firebase.apps || firebase.apps.length === 0) {
                this.firebaseApp = firebase.initializeApp(config);
            } else {
                this.firebaseApp = firebase.apps[0];
            }

            this.db = firebase.database();
            this.initialized = true;
            this.connectionStatus = 'connected';
            console.log('[RealtimeSync] ✅ Đã kết nối thành công Firebase Realtime Cloud!');

            // Lắng nghe trạng thái kết nối mạng thực tế của Firebase
            const connectedRef = this.db.ref('.info/connected');
            connectedRef.on('value', (snap) => {
                const isOnline = !!snap.val();
                this.connectionStatus = isOnline ? 'connected' : 'offline';
                window.dispatchEvent(new CustomEvent('realtime:connection', { detail: { online: isOnline } }));
            });
        } catch (err) {
            console.warn('[RealtimeSync] Lỗi khởi tạo Firebase SDK:', err.message);
            this.connectionStatus = 'offline';
        }
    }

    /**
     * Xử lý khi Firebase phản hồi lỗi phân quyền 401 (Permission Denied)
     * @private
     */
    _handlePermissionDenied(context = '') {
        this.permissionDenied = true;
        this.connectionStatus = 'permission_denied';
        console.warn(`[RealtimeSync] ⚠️ Firebase Realtime Cloud bị khóa quyền truy cập (401 Permission Denied)! ${context}`);
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('realtime:permission_denied', {
                detail: {
                    databaseURL: this.databaseURL,
                    context: context,
                    message: 'Firebase Realtime Database đang khóa quyền (401 Permission Denied).'
                }
            }));
        }
    }

    /**
     * REST API Helper: GET
     */
    async _restGet(path) {
        if (!this.databaseURL) return null;
        try {
            const res = await fetch(`${this.databaseURL}/${path}.json`);
            if (res.status === 401) {
                this._handlePermissionDenied(`GET ${path}`);
                return null;
            }
            if (!res.ok) return null;
            return await res.json();
        } catch (e) {
            return null;
        }
    }

    /**
     * REST API Helper: PUT
     */
    async _restPut(path, data) {
        if (!this.databaseURL) return false;
        try {
            const res = await fetch(`${this.databaseURL}/${path}.json`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            if (res.status === 401) {
                this._handlePermissionDenied(`PUT ${path}`);
                return false;
            }
            return res.ok;
        } catch (e) {
            return false;
        }
    }

    /**
     * REST API Helper: PATCH
     */
    async _restPatch(path, data) {
        if (!this.databaseURL) return false;
        try {
            const res = await fetch(`${this.databaseURL}/${path}.json`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            if (res.status === 401) {
                this._handlePermissionDenied(`PATCH ${path}`);
                return false;
            }
            return res.ok;
        } catch (e) {
            return false;
        }
    }

    /**
     * REST API Helper: DELETE
     */
    async _restDelete(path) {
        if (!this.databaseURL) return false;
        try {
            const res = await fetch(`${this.databaseURL}/${path}.json`, {
                method: 'DELETE'
            });
            if (res.status === 401) {
                this._handlePermissionDenied(`DELETE ${path}`);
                return false;
            }
            return res.ok;
        } catch (e) {
            return false;
        }
    }

    /**
     * Kiểm tra trạng thái kết nối đám mây thực tế và quyền truy cập
     */
    async testCloudConnection() {
        if (!this.databaseURL) {
            return {
                success: false,
                status: 'unconfigured',
                message: 'Chưa cấu hình Firebase databaseURL.'
            };
        }
        try {
            const readRes = await fetch(`${this.databaseURL}/goride_health_ping.json`);
            if (readRes.status === 401) {
                this._handlePermissionDenied('Test Read Ping');
                return {
                    success: false,
                    status: 401,
                    code: 'PERMISSION_DENIED',
                    message: 'Firebase Realtime Database đang bị KHÓA QUYỀN (401 Permission Denied). Vui lòng mở Rules trên Firebase Console.'
                };
            }

            const writeRes = await fetch(`${this.databaseURL}/goride_health_ping.json`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pingAt: new Date().toISOString(), ts: Date.now() })
            });

            if (writeRes.status === 401) {
                this._handlePermissionDenied('Test Write Ping');
                return {
                    success: false,
                    status: 401,
                    code: 'PERMISSION_DENIED',
                    message: 'Firebase Realtime Database từ chối quyền GHI (401 Permission Denied). Vui lòng cập nhật Rules trên Firebase Console.'
                };
            }

            this.permissionDenied = false;
            this.connectionStatus = 'connected';
            window.dispatchEvent(new CustomEvent('realtime:connection', { detail: { online: true, verified: true } }));
            return {
                success: true,
                status: 200,
                message: 'Kết nối Firebase Realtime Cloud thành công! Đọc và ghi hoạt động hoàn hảo đa thiết bị.'
            };
        } catch (err) {
            return {
                success: false,
                status: 'network_error',
                message: 'Không thể kết nối đến máy chủ Firebase: ' + err.message
            };
        }
    }

    /**
     * Kiểm tra xem Firebase Realtime đã sẵn sàng hoạt động hay chưa
     * @returns {boolean}
     */
    isAvailable() {
        return this.initialized && this.db !== null && this.connectionStatus !== 'unconfigured';
    }

    /**
     * Chờ cho tới khi Firebase sẵn sàng và thực thi callback
     * @param {Function} callback 
     */
    onReady(callback) {
        if (typeof callback !== 'function') return;
        if (this.isAvailable()) {
            try { callback(); } catch (e) { console.warn('[RealtimeSync] onReady error:', e); }
            return;
        }
        const onConnect = (e) => {
            if (this.isAvailable() || (e && e.detail && e.detail.online)) {
                window.removeEventListener('realtime:connection', onConnect);
                try { callback(); } catch (err) { console.warn('[RealtimeSync] onReady error:', err); }
            }
        };
        window.addEventListener('realtime:connection', onConnect);
        let tries = 0;
        const interval = setInterval(() => {
            tries++;
            if (this.isAvailable()) {
                clearInterval(interval);
                window.removeEventListener('realtime:connection', onConnect);
                try { callback(); } catch (err) {}
            } else if (tries > 30) {
                clearInterval(interval);
            }
        }, 100);
    }

    /**
     * Lưu cấu hình Firebase người dùng nhập từ giao diện
     * @param {Object} configObj 
     */
    saveConfig(configObj) {
        try {
            localStorage.setItem('navigo_firebase_config', JSON.stringify(configObj));
            localStorage.setItem('goride_firebase_config', JSON.stringify(configObj));
            if (window.NAVIGO_FIREBASE_CONFIG) {
                Object.assign(window.NAVIGO_FIREBASE_CONFIG, configObj);
            }
            if (window.GORIDE_FIREBASE_CONFIG) {
                Object.assign(window.GORIDE_FIREBASE_CONFIG, configObj);
            }
            this._initFirebase();
            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    /**
     * Lấy cấu hình Firebase hiện tại
     */
    getConfig() {
        try {
            const saved = localStorage.getItem('navigo_firebase_config') || localStorage.getItem('goride_firebase_config');
            if (saved) return JSON.parse(saved);
        } catch (e) {}
        return window.NAVIGO_FIREBASE_CONFIG || window.GORIDE_FIREBASE_CONFIG || {};
    }

    /* ==========================================================================
       TRIP LIFECYCLE (KHÁCH ĐẶT XE -> TÀI XẾ NHẬN -> ĐÓN -> TRẢ -> HOÀN THÀNH)
       ========================================================================== */

    /**
     * 1. Khách hàng tạo yêu cầu đặt chuyến
     * @param {Object} trip 
     */
    async createTrip(trip) {
        if (!trip.id) {
            trip.id = `TRP-${Date.now().toString(36).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`;
        }
        trip.createdAt = trip.createdAt || new Date().toISOString();
        trip.status = trip.status || 'REQUESTED';

        // Đồng bộ lên Firebase Đám mây nếu có kết nối
        if (this.isAvailable()) {
            try {
                // Lưu vào danh sách chuyến đi chung
                await this.db.ref(`goride_trips/${trip.id}`).set(trip);
                // Đưa vào danh sách cuốc xe đang chờ phát sóng cho tài xế
                await this.db.ref(`goride_active_offers/${trip.id}`).set(trip);
                console.log('[RealtimeSync] 🚀 Đã gửi cuốc xe lên Firebase Cloud:', trip.id);
            } catch (err) {
                console.warn('[RealtimeSync] Lỗi ghi Firebase createTrip:', err.message);
            }
        }

        // REST fallback write to guarantee cross-device cloud sync
        if (this.databaseURL) {
            try {
                await this._restPut(`goride_trips/${trip.id}`, trip);
                await this._restPut(`goride_active_offers/${trip.id}`, trip);
            } catch (e) {}
        }

        // Luôn đồng bộ vào LocalStorage để đảm bảo mượt mà cả khi offline
        this._syncTripToLocalStorage(trip);

        return trip;
    }

    /**
     * 2. Tài xế lắng nghe các cuốc xe mới được phát sóng trong bán kính
     * Hỗ trợ đa thiết bị: Tự động gắn listener Firebase khi SDK sẵn sàng,
     * kết hợp REST initial fetch và fallback storage event.
     * @param {Function} onNewOfferCallback 
     * @returns {Function} Hàm hủy đăng ký lắng nghe (unsubscribe)
     */
    listenTripOffers(onNewOfferCallback) {
        if (typeof onNewOfferCallback !== 'function') return () => {};

        // REST initial fetch fallback (cho thiết bị khác mạng/máy chủ)
        if (this.databaseURL) {
            this._restGet('goride_active_offers').then(data => {
                if (data && typeof data === 'object') {
                    Object.values(data).forEach(offer => {
                        if (offer && (offer.status === 'REQUESTED' || offer.status === 'OFFERED')) {
                            onNewOfferCallback(offer);
                        }
                    });
                }
            }).catch(() => {});
        }

        let firebaseUnsub = null;
        const attachFirebase = () => {
            if (this.isAvailable()) {
                const offersRef = this.db.ref('goride_active_offers');
                const handleOffer = (snapshot) => {
                    const offer = snapshot.val();
                    if (offer && (offer.status === 'REQUESTED' || offer.status === 'OFFERED')) {
                        onNewOfferCallback(offer);
                    }
                };

                offersRef.on('child_added', handleOffer);
                offersRef.on('child_changed', handleOffer);
                const handleRemove = (snapshot) => {
                    onNewOfferCallback({ id: snapshot.key, status: 'REMOVED' });
                };
                offersRef.on('child_removed', handleRemove);

                return () => {
                    offersRef.off('child_added', handleOffer);
                    offersRef.off('child_changed', handleOffer);
                    offersRef.off('child_removed', handleRemove);
                };
            }
            return null;
        };

        firebaseUnsub = attachFirebase();
        this.onReady(() => {
            if (!firebaseUnsub) {
                firebaseUnsub = attachFirebase();
            }
        });

        // Fallback: Lắng nghe qua storage event (khi mở 2 tab local)
        const storageHandler = (e) => {
            if (e.key === 'goride_pending_trip_offers' || e.key === 'goride_active_trip' || e.key === 'goride_admin_trips') {
                try {
                    const list = JSON.parse(e.newValue || '[]');
                    if (Array.isArray(list) && list.length > 0) {
                        onNewOfferCallback(list[0]);
                    } else {
                        onNewOfferCallback({ type: 'storage_change' });
                    }
                } catch (err) {}
            }
        };

        window.addEventListener('storage', storageHandler);
        return () => {
            if (firebaseUnsub) firebaseUnsub();
            window.removeEventListener('storage', storageHandler);
        };
    }

    /**
     * 3. Tài xế bấm nhận cuốc xe (Đồng bộ đa thiết bị tức thì)
     * @param {string} tripId 
     * @param {Object} driverInfo - { id, name, phone, licensePlate, vehicleModel, rating, lat, lng }
     */
    async acceptTrip(tripId, driverInfo) {
        const dLat = Number(driverInfo.lat) || 10.7769;
        const dLng = Number(driverInfo.lng) || 106.7009;
        const updateData = {
            status: 'ACCEPTED',
            acceptedAt: new Date().toISOString(),
            driverId: driverInfo.id || 'drv_' + (driverInfo.phone || Date.now()),
            driverName: driverInfo.name || 'Tài xế GoRide',
            driverPhone: driverInfo.phone || '',
            licensePlate: driverInfo.licensePlate || driverInfo.plate || '59-S3 889.24',
            vehicleModel: driverInfo.vehicleModel || driverInfo.model || 'Honda Wave',
            driverRating: driverInfo.rating || '5.0',
            driverLat: dLat,
            driverLng: dLng,
            driverLon: dLng,
            driverLocation: {
                lat: dLat,
                lng: dLng,
                heading: 0,
                updatedAt: Date.now()
            }
        };

        // 1. Firebase SDK update
        if (this.isAvailable()) {
            try {
                await this.db.ref(`goride_trips/${tripId}`).update(updateData);
                await this.db.ref(`goride_active_offers/${tripId}`).remove();
                console.log('[RealtimeSync] 🚕 Tài xế đã nhận cuốc trên Firebase SDK:', tripId);
            } catch (err) {
                console.warn('[RealtimeSync] Lỗi acceptTrip Firebase SDK:', err.message);
            }
        }

        // 2. Dual REST fallback write to guarantee cross-device delivery
        if (this.databaseURL) {
            try {
                await this._restPatch(`goride_trips/${tripId}`, updateData);
                await this._restDelete(`goride_active_offers/${tripId}`);
            } catch (e) {}
        }

        // 3. LocalStorage sync
        this._updateLocalStorageTrip(tripId, updateData);
        return updateData;
    }

    /**
     * 4. Lắng nghe trạng thái của một chuyến xe cụ thể (Dùng cho cả Khách & Tài xế qua Đám mây)
     * @param {string} tripId 
     * @param {Function} callback 
     * @returns {Function} Hàm hủy đăng ký
     */
    listenTrip(tripId, callback) {
        if (!tripId || typeof callback !== 'function') return () => {};

        // REST initial fetch fallback
        if (this.databaseURL) {
            this._restGet(`goride_trips/${tripId}`).then(val => {
                if (val) callback(val);
            }).catch(() => {});
        }

        let firebaseUnsub = null;
        const attachFirebase = () => {
            if (this.isAvailable()) {
                const tripRef = this.db.ref(`goride_trips/${tripId}`);
                const handler = (snapshot) => {
                    const val = snapshot.val();
                    if (val) callback(val);
                };
                tripRef.on('value', handler);
                return () => tripRef.off('value', handler);
            }
            return null;
        };

        firebaseUnsub = attachFirebase();
        this.onReady(() => {
            if (!firebaseUnsub) {
                firebaseUnsub = attachFirebase();
            }
        });

        // Fallback: Lắng nghe qua storage event
        const storageHandler = (e) => {
            if (e.key === 'goride_active_trip' || e.key === 'goride_admin_trips') {
                try {
                    const active = JSON.parse(localStorage.getItem('goride_active_trip') || 'null');
                    if (active && active.id === tripId) {
                        callback(active);
                    }
                } catch (err) {}
            }
        };

        window.addEventListener('storage', storageHandler);
        return () => {
            if (firebaseUnsub) firebaseUnsub();
            window.removeEventListener('storage', storageHandler);
        };
    }

    /**
     * 5. Cập nhật vị trí GPS động của tài xế (Xe di chuyển trên bản đồ)
     * @param {string} tripId 
     * @param {string} driverId 
     * @param {number} lat 
     * @param {number} lng 
     * @param {number} heading - Góc xoay xe (0 - 360 độ)
     */
    async updateDriverLocation(tripId, driverId, lat, lng, heading = 0) {
        const numLat = Number(lat);
        const numLng = Number(lng);
        const loc = { lat: numLat, lng: numLng, heading: Number(heading), updatedAt: Date.now() };

        const numHeading = Number(heading || 0);
        if (this.isAvailable()) {
            try {
                if (tripId) {
                    this.db.ref(`goride_trips/${tripId}`).update({
                        driverLocation: loc,
                        driverLat: numLat,
                        driverLng: numLng,
                        driverLon: numLng,
                        driverHeading: numHeading
                    });
                }
                if (driverId) {
                    this.db.ref(`goride_drivers/${driverId}`).update({
                        lat: numLat,
                        lng: numLng,
                        location: loc,
                        updatedAt: new Date().toISOString()
                    });
                    this.db.ref(`goride_online_drivers/${driverId}`).update({
                        lat: numLat,
                        lng: numLng,
                        location: loc,
                        updatedAt: new Date().toISOString()
                    }).catch(() => {});
                }
            } catch (err) {}
        }

        // LocalStorage broadcast
        if (driverId) {
            try {
                const onlineDrivers = JSON.parse(localStorage.getItem('goride_online_drivers') || '{}');
                if (onlineDrivers[driverId]) {
                    onlineDrivers[driverId].lat = numLat;
                    onlineDrivers[driverId].lng = numLng;
                    onlineDrivers[driverId].location = loc;
                    onlineDrivers[driverId].updatedAt = new Date().toISOString();
                    localStorage.setItem('goride_online_drivers', JSON.stringify(onlineDrivers));
                }
            } catch (e) {}
        }

        if (tripId) {
            try {
                const active = JSON.parse(localStorage.getItem('goride_active_trip') || '{}');
                if (active && (active.id === tripId || !active.id)) {
                    active.driverLocation = loc;
                    active.driverLat = numLat;
                    active.driverLng = numLng;
                    active.driverLon = numLng;
                    active.driverHeading = numHeading;
                    localStorage.setItem('goride_active_trip', JSON.stringify(active));
                }
            } catch (e) {}

            try {
                const adminTrips = JSON.parse(localStorage.getItem('goride_admin_trips') || '[]');
                const aIdx = adminTrips.findIndex(t => t.id === tripId);
                if (aIdx !== -1) {
                    adminTrips[aIdx].driverLat = numLat;
                    adminTrips[aIdx].driverLon = numLng;
                    adminTrips[aIdx].driverHeading = numHeading;
                    localStorage.setItem('goride_admin_trips', JSON.stringify(adminTrips));
                }
            } catch (e) {}
        }
    }

    /**
     * 6. Cập nhật tiến trình chuyến xe (ARRIVED -> IN_PROGRESS -> COMPLETED -> CANCELLED)
     * @param {string} tripId 
     * @param {'ARRIVED'|'IN_PROGRESS'|'COMPLETED'|'CANCELLED'} status 
     * @param {Object} [extraData] 
     */
    async updateTripStatus(tripId, status, extraData = {}) {
        const payload = {
            status: status.toUpperCase(),
            updatedAt: new Date().toISOString(),
            ...extraData
        };

        if (this.isAvailable()) {
            try {
                await this.db.ref(`goride_trips/${tripId}`).update(payload);
                if (status === 'COMPLETED' || status === 'CANCELLED') {
                    await this.db.ref(`goride_active_offers/${tripId}`).remove();
                }
                console.log(`[RealtimeSync] 🔄 Chuyến đi ${tripId} chuyển sang trạng thái: ${status}`);
            } catch (err) {}
        }

        // Dual REST fallback write
        if (this.databaseURL) {
            try {
                await this._restPatch(`goride_trips/${tripId}`, payload);
                if (status === 'COMPLETED' || status === 'CANCELLED') {
                    await this._restDelete(`goride_active_offers/${tripId}`);
                }
            } catch (e) {}
        }

        this._updateLocalStorageTrip(tripId, payload);
    }

    /**
     * 7. Cập nhật trạng thái trực tuyến / ngoại tuyến của tài xế
     * @param {string} driverId 
     * @param {boolean} isOnline 
     * @param {Object} driverData 
     */
    async setDriverOnline(driverId, isOnline, driverData = {}) {
        const payload = {
            id: driverId,
            isOnline: !!isOnline,
            status: isOnline ? 'available' : 'offline',
            updatedAt: new Date().toISOString(),
            ...driverData
        };

        if (this.isAvailable()) {
            try {
                const driverRef = this.db.ref(`goride_drivers/${driverId}`);
                const onlineRef = this.db.ref(`goride_online_drivers/${driverId}`);
                if (isOnline) {
                    await driverRef.set(payload);
                    await onlineRef.set(payload);
                    // Hook tự động ngắt kết nối khi tài xế tắt trình duyệt/tab:
                    driverRef.onDisconnect().update({
                        isOnline: false,
                        status: 'offline',
                        updatedAt: new Date().toISOString()
                    });
                    onlineRef.onDisconnect().remove();
                } else {
                    driverRef.onDisconnect().cancel();
                    onlineRef.onDisconnect().cancel();
                    await driverRef.update({
                        isOnline: false,
                        status: 'offline',
                        updatedAt: new Date().toISOString()
                    });
                    await onlineRef.remove();
                }
            } catch (err) {}
        }

        // Dual REST fallback write
        if (this.databaseURL) {
            try {
                if (isOnline) {
                    await this._restPut(`goride_drivers/${driverId}`, payload);
                    await this._restPut(`goride_online_drivers/${driverId}`, payload);
                } else {
                    await this._restPatch(`goride_drivers/${driverId}`, {
                        isOnline: false,
                        status: 'offline',
                        updatedAt: new Date().toISOString()
                    });
                    await this._restDelete(`goride_online_drivers/${driverId}`);
                }
            } catch (e) {}
        }

        // Sync local online drivers map
        try {
            const drivers = JSON.parse(localStorage.getItem('goride_online_drivers') || '{}');
            if (isOnline) {
                drivers[driverId] = payload;
            } else {
                delete drivers[driverId];
            }
            localStorage.setItem('goride_online_drivers', JSON.stringify(drivers));
        } catch (e) {}
    }

    /**
     * 7b. Cập nhật trạng thái trực tuyến / ngoại tuyến thời gian thực của khách hàng
     * @param {string} customerId 
     * @param {boolean} isOnline 
     * @param {Object} customerData 
     */
    async setCustomerOnline(customerId, isOnline, customerData = {}) {
        if (!customerId) return;
        const payload = {
            id: customerId,
            isOnline: !!isOnline,
            updatedAt: Date.now(),
            ...customerData
        };

        if (this.isAvailable()) {
            try {
                const onlineRef = this.db.ref(`goride_online_customers/${customerId}`);
                if (isOnline) {
                    await onlineRef.set(payload);
                    onlineRef.onDisconnect().remove();
                } else {
                    onlineRef.onDisconnect().cancel();
                    await onlineRef.remove();
                }
            } catch (err) {}
        }

        if (this.databaseURL) {
            try {
                if (isOnline) {
                    await this._restPut(`goride_online_customers/${customerId}`, payload);
                } else {
                    await this._restDelete(`goride_online_customers/${customerId}`);
                }
            } catch (e) {}
        }

        try {
            const customers = JSON.parse(localStorage.getItem('goride_online_customers') || '{}');
            if (isOnline) {
                customers[customerId] = payload;
            } else {
                delete customers[customerId];
            }
            localStorage.setItem('goride_online_customers', JSON.stringify(customers));
        } catch (e) {}
    }

    /**
     * 7c. Lắng nghe danh sách khách hàng trực tuyến thời gian thực
     * @param {Function} callback 
     */
    listenOnlineCustomers(callback) {
        if (typeof callback !== 'function') return () => {};

        const isLiveCustomer = (c) => {
            if (!c || c.isOnline === false) return false;
            const lastTime = c.updatedAt ? (typeof c.updatedAt === 'number' ? c.updatedAt : new Date(c.updatedAt).getTime()) : 0;
            if (lastTime && (Date.now() - lastTime > 120000)) return false;
            return true;
        };

        if (this.databaseURL) {
            this._restGet('goride_online_customers').then(data => {
                if (data && typeof data === 'object') {
                    const onlineList = Object.values(data).filter(isLiveCustomer);
                    callback(onlineList);
                }
            }).catch(() => {});
        }

        let firebaseUnsub = null;
        const attachFirebase = () => {
            if (this.isAvailable()) {
                const custRef = this.db.ref('goride_online_customers');
                const handler = (snapshot) => {
                    const data = snapshot.val() || {};
                    const onlineList = Object.values(data).filter(isLiveCustomer);
                    callback(onlineList);
                };
                custRef.on('value', handler);
                return () => custRef.off('value', handler);
            }
            return null;
        };

        firebaseUnsub = attachFirebase();
        this.onReady(() => {
            if (!firebaseUnsub) firebaseUnsub = attachFirebase();
        });

        const storageHandler = (e) => {
            if (e.key === 'goride_online_customers') {
                try {
                    const raw = JSON.parse(e.newValue || '{}');
                    const list = (Array.isArray(raw) ? raw : Object.values(raw)).filter(isLiveCustomer);
                    callback(list);
                } catch (err) {}
            }
        };

        window.addEventListener('storage', storageHandler);
        return () => {
            if (firebaseUnsub) firebaseUnsub();
            window.removeEventListener('storage', storageHandler);
        };
    }

    /**
     * 8. Lắng nghe danh sách tất cả tài xế đang trực tuyến (cho Customer & Admin)
     * Có bộ lọc TTL (2 phút): Chỉ trả về tài xế thực sự đang hoạt động, loại bỏ ghost driver.
     * @param {Function} callback 
     */
    /**
     * 7.1 Đồng bộ điểm sự kiện & chỉ số xanh Navigo Race qua Đám mây Firebase
     * @param {string} userKey 
     * @param {Object} stats 
     */
    async syncEcoStats(userKey, stats) {
        if (!userKey || !stats) return;
        const payload = {
            ...stats,
            updatedAt: new Date().toISOString()
        };
        if (this.isAvailable()) {
            try {
                await this.db.ref(`goride_eco_stats/${userKey}`).set(payload);
            } catch (err) {}
        }
        if (this.databaseURL) {
            try {
                await this._restPut(`goride_eco_stats/${userKey}`, payload);
            } catch (e) {}
        }
    }

    /**
     * 7.2 Lắng nghe điểm sự kiện đa thiết bị
     * @param {string} userKey 
     * @param {Function} callback 
     */
    listenEcoStats(userKey, callback) {
        if (!userKey || typeof callback !== 'function') return () => {};
        if (this.databaseURL) {
            this._restGet(`goride_eco_stats/${userKey}`).then(val => {
                if (val) callback(val);
            }).catch(() => {});
        }
        let firebaseUnsub = null;
        const attachFirebase = () => {
            if (this.isAvailable()) {
                const ecoRef = this.db.ref(`goride_eco_stats/${userKey}`);
                const handler = (snapshot) => {
                    const val = snapshot.val();
                    if (val) callback(val);
                };
                ecoRef.on('value', handler);
                return () => ecoRef.off('value', handler);
            }
            return null;
        };
        firebaseUnsub = attachFirebase();
        this.onReady(() => {
            if (!firebaseUnsub) firebaseUnsub = attachFirebase();
        });
        const storageHandler = (e) => {
            if (e.key === `navigo_eco_stats_${userKey}` || e.key === 'goride_eco_stats') {
                try {
                    const parsed = JSON.parse(e.newValue || '{}');
                    callback(parsed);
                } catch (err) {}
            }
        };
        window.addEventListener('storage', storageHandler);
        return () => {
            if (firebaseUnsub) firebaseUnsub();
            window.removeEventListener('storage', storageHandler);
        };
    }

    listenOnlineDrivers(callback) {
        if (typeof callback !== 'function') return () => {};

        const isLiveDriver = (d) => {
            if (!d || d.isOnline !== true) return false;
            const lastTime = d.location?.updatedAt || (d.updatedAt ? new Date(d.updatedAt).getTime() : 0);
            // Nếu quá 2 phút không gửi tín hiệu thì coi như đã ngoại tuyến
            if (lastTime && (Date.now() - lastTime > 120000)) return false;
            return true;
        };

        const formatDriver = (d) => {
            const lat = Number(d.location?.lat !== undefined ? d.location.lat : d.lat);
            const lng = Number(d.location?.lng !== undefined ? d.location.lng : d.lng);
            return { ...d, lat, lng };
        };

        // REST initial fetch fallback
        if (this.databaseURL) {
            this._restGet('goride_drivers').then(data => {
                if (data && typeof data === 'object') {
                    const onlineList = Object.values(data).filter(isLiveDriver).map(formatDriver);
                    if (onlineList.length > 0) callback(onlineList);
                }
            }).catch(() => {});
        }

        let firebaseUnsub = null;
        const attachFirebase = () => {
            if (this.isAvailable()) {
                const driversRef = this.db.ref('goride_drivers');
                const handler = (snapshot) => {
                    const data = snapshot.val() || {};
                    const onlineList = Object.values(data).filter(isLiveDriver).map(formatDriver);
                    callback(onlineList);
                };
                driversRef.on('value', handler);
                return () => driversRef.off('value', handler);
            }
            return null;
        };

        firebaseUnsub = attachFirebase();
        this.onReady(() => {
            if (!firebaseUnsub) {
                firebaseUnsub = attachFirebase();
            }
        });

        // Fallback local storage
        const storageHandler = (e) => {
            if (e.key === 'goride_online_drivers') {
                try {
                    const data = JSON.parse(e.newValue || '{}');
                    const list = Object.values(data).filter(isLiveDriver).map(formatDriver);
                    callback(list);
                } catch (e) {}
            }
        };
        window.addEventListener('storage', storageHandler);
        return () => {
            if (firebaseUnsub) firebaseUnsub();
            window.removeEventListener('storage', storageHandler);
        };
    }

    /**
     * 9. Dọn dẹp các tài xế ma (stale ghost drivers) & bản ghi rác trên Firebase Realtime Database
     */
    async cleanStaleDrivers() {
        if (!this.isAvailable()) return;
        try {
            const snap = await this.db.ref('goride_drivers').once('value');
            const data = snap.val() || {};
            const now = Date.now();
            Object.entries(data).forEach(([key, driver]) => {
                if (!driver || key === 'undefined' || key === 'null' || driver.id === 'undefined' || (!driver.name && !driver.email && !driver.phone)) {
                    this.db.ref(`goride_drivers/${key}`).remove().catch(() => {});
                    return;
                }
                const lastTime = driver.location?.updatedAt || (driver.updatedAt ? new Date(driver.updatedAt).getTime() : 0);
                if (driver.isOnline && (!lastTime || (now - lastTime > 120000))) {
                    this.db.ref(`goride_drivers/${key}`).update({
                        isOnline: false,
                        status: 'offline',
                        updatedAt: new Date().toISOString()
                    });
                    console.log(`[RealtimeSync] Đã chuyển tài xế ma sang ngoại tuyến: ${driver.name || key}`);
                }
            });

            // Also clean corrupt or undefined entries in goride_users & goride_pending_drivers
            const snapUsers = await this.db.ref('goride_users').once('value');
            const dataUsers = snapUsers.val() || {};
            Object.entries(dataUsers).forEach(([key, user]) => {
                if (!user || key === 'undefined' || key === 'null' || user.id === 'undefined' || (!user.name && !user.email && !user.phone)) {
                    this.db.ref(`goride_users/${key}`).remove().catch(() => {});
                }
            });
            const snapPending = await this.db.ref('goride_pending_drivers').once('value');
            const dataPending = snapPending.val() || {};
            Object.entries(dataPending).forEach(([key, p]) => {
                if (!p || key === 'undefined' || key === 'null' || p.id === 'undefined' || (!p.name && !p.email && !p.phone)) {
                    this.db.ref(`goride_pending_drivers/${key}`).remove().catch(() => {});
                }
            });
        } catch (e) {}
    }

    /* ==========================================================================
       USER & DRIVER CLOUD SYNCHRONIZATION (CROSS-DEVICE SYNC)
       ========================================================================== */

    /**
     * 10. Đăng ký tài khoản người dùng hoặc tài xế lên Firebase Realtime Database
     * Đảm bảo đồng bộ tức thì sang thiết bị khác (Admin PC nhận hồ sơ tài xế ngay)
     * @param {Object} user 
     */
    async registerUser(user) {
        if (!user || !user.id) return user;

        let syncedToCloud = false;

        // 1. Firebase SDK Write
        if (this.isAvailable()) {
            try {
                // Lưu vào danh bạ người dùng hệ thống
                await this.db.ref(`goride_users/${user.id}`).set(user);

                // Nếu là tài xế, đưa vào hàng đợi chờ duyệt của Quản trị viên
                if (user.role === 'driver') {
                    const pendingData = {
                        id: user.id,
                        name: user.name,
                        email: user.email,
                        phone: user.phone,
                        vehicleType: user.vehicleType || user.vehicle?.type || 'motorbike',
                        plate: user.licensePlate || user.plate || user.vehicle?.plate || '--',
                        experienceYears: user.experienceYears || user.experience || 1,
                        status: 'pending',
                        createdAt: user.createdAt || new Date().toISOString()
                    };
                    await this.db.ref(`goride_pending_drivers/${user.id}`).set(pendingData);
                }
                syncedToCloud = true;
                console.log('[RealtimeSync] 🚀 Đã đồng bộ tài khoản người dùng lên Firebase SDK:', user.id);
            } catch (err) {
                if (err.message && err.message.includes('PERMISSION_DENIED')) {
                    this._handlePermissionDenied('registerUser SDK');
                }
                console.warn('[RealtimeSync] Lỗi lưu Firebase SDK registerUser:', err.message);
            }
        }

        // 2. Dual REST fallback write to ensure cloud persistence even if SDK had issues
        if (!syncedToCloud && this.databaseURL) {
            try {
                const putUser = await this._restPut(`goride_users/${user.id}`, user);
                if (putUser && user.role === 'driver') {
                    const pendingData = {
                        id: user.id,
                        name: user.name,
                        email: user.email,
                        phone: user.phone,
                        vehicleType: user.vehicleType || user.vehicle?.type || 'motorbike',
                        plate: user.licensePlate || user.plate || user.vehicle?.plate || '--',
                        experienceYears: user.experienceYears || user.experience || 1,
                        status: 'pending',
                        createdAt: user.createdAt || new Date().toISOString()
                    };
                    await this._restPut(`goride_pending_drivers/${user.id}`, pendingData);
                }
                if (putUser) syncedToCloud = true;
            } catch (restErr) {}
        }

        user._syncedToCloud = syncedToCloud;
        return user;
    }

    /**
     * 11. Lắng nghe danh sách hồ sơ tài xế đang chờ duyệt từ Firebase (Real-time Cloud)
     * @param {Function} callback 
     */
    listenPendingDrivers(callback) {
        if (typeof callback !== 'function') return () => {};

        // REST initial fetch fallback
        if (this.databaseURL) {
            this._restGet('goride_pending_drivers').then(data => {
                if (data && typeof data === 'object') {
                    const list = Object.values(data).filter(d => d && (d.status === 'pending' || !d.status));
                    if (list.length > 0) callback(list);
                }
            }).catch(() => {});
        }

        const attachListener = () => {
            if (this.isAvailable()) {
                const pendingRef = this.db.ref('goride_pending_drivers');
                const handler = (snapshot) => {
                    const data = snapshot.val() || {};
                    const list = Object.values(data).filter(d => d && (d.status === 'pending' || !d.status));
                    callback(list);
                };
                pendingRef.on('value', handler);
                return () => pendingRef.off('value', handler);
            }
            return null;
        };

        let unsub = attachListener();

        // Nếu Firebase kết nối sau, tự động gắn listener
        this.onReady(() => {
            if (!unsub) {
                unsub = attachListener();
            }
        });

        // Fallback local storage
        const storageHandler = (e) => {
            if (e.key === 'goride_pending_drivers') {
                try {
                    const list = JSON.parse(e.newValue || '[]');
                    callback(list);
                } catch (err) {}
            }
        };
        window.addEventListener('storage', storageHandler);

        return () => {
            if (unsub) unsub();
            window.removeEventListener('storage', storageHandler);
        };
    }

    /**
     * 12. Lắng nghe danh sách tất cả tài khoản người dùng từ Firebase (Khách hàng & Admin)
     * @param {Function} callback 
     */
    listenUsers(callback) {
        if (typeof callback !== 'function') return () => {};

        // REST initial fetch fallback
        if (this.databaseURL) {
            this._restGet('goride_users').then(data => {
                if (data && typeof data === 'object') {
                    const list = Object.values(data).filter(u => u && u.id);
                    if (list.length > 0) callback(list);
                }
            }).catch(() => {});
        }

        const attachListener = () => {
            if (this.isAvailable()) {
                const usersRef = this.db.ref('goride_users');
                const handler = (snapshot) => {
                    const data = snapshot.val() || {};
                    const list = Object.values(data).filter(u => u && u.id);
                    callback(list);
                };
                usersRef.on('value', handler);
                return () => usersRef.off('value', handler);
            }
            return null;
        };

        let unsub = attachListener();
        this.onReady(() => {
            if (!unsub) {
                unsub = attachListener();
            }
        });

        const storageHandler = (e) => {
            if (e.key === 'goride_offline_users') {
                try {
                    const list = JSON.parse(e.newValue || '[]');
                    callback(list);
                } catch (err) {}
            }
        };
        window.addEventListener('storage', storageHandler);

        return () => {
            if (unsub) unsub();
            window.removeEventListener('storage', storageHandler);
        };
    }

    /**
     * 13. Cập nhật vai trò người dùng (Ví dụ: Thêm quyền Admin hoặc chuyển về Khách hàng)
     * @param {string} userId 
     * @param {'customer'|'driver'|'admin'} newRole 
     */
    async updateUserRole(userId, newRole) {
        if (!userId) return false;
        const patch = {
            role: newRole,
            updatedAt: new Date().toISOString()
        };

        if (this.isAvailable()) {
            try {
                await this.db.ref(`goride_users/${userId}`).update(patch);
                console.log(`[RealtimeSync] Đã cập nhật quyền người dùng ${userId} -> ${newRole}`);
            } catch (e) {
                if (e.message && e.message.includes('PERMISSION_DENIED')) this._handlePermissionDenied('updateUserRole');
                console.warn('[RealtimeSync] Lỗi updateUserRole:', e.message);
            }
        }
        await this._restPatch(`goride_users/${userId}`, patch);

        // Local storage sync
        try {
            const users = JSON.parse(localStorage.getItem('goride_offline_users') || '[]');
            const idx = users.findIndex(u => u.id === userId);
            if (idx !== -1) {
                users[idx].role = newRole;
                localStorage.setItem('goride_offline_users', JSON.stringify(users));
            }
        } catch (e) {}

        return true;
    }

    /**
     * 14. Cập nhật trạng thái người dùng (active | locked)
     * @param {string} userId 
     * @param {'active'|'locked'} newStatus 
     */
    async updateUserStatus(userId, newStatus) {
        if (!userId) return false;
        const patch = {
            status: newStatus,
            updatedAt: new Date().toISOString()
        };

        if (this.isAvailable()) {
            try {
                await this.db.ref(`goride_users/${userId}`).update(patch);
                console.log(`[RealtimeSync] Đã cập nhật trạng thái người dùng ${userId} -> ${newStatus}`);
            } catch (e) {
                if (e.message && e.message.includes('PERMISSION_DENIED')) this._handlePermissionDenied('updateUserStatus');
                console.warn('[RealtimeSync] Lỗi updateUserStatus:', e.message);
            }
        }
        await this._restPatch(`goride_users/${userId}`, patch);

        // Local storage sync
        try {
            const users = JSON.parse(localStorage.getItem('goride_offline_users') || '[]');
            const idx = users.findIndex(u => u.id === userId);
            if (idx !== -1) {
                users[idx].status = newStatus;
                localStorage.setItem('goride_offline_users', JSON.stringify(users));
            }
        } catch (e) {}

        return true;
    }

    /**
     * 15. Xóa vĩnh viễn và triệt để người dùng khỏi Database đám mây & LocalStorage
     * Không còn lưu bất cứ dữ liệu rác nào trong hệ thống (Hỗ trợ quét sạch theo ID, Email và SĐT)
     * @param {string} userId 
     * @param {string} [userEmail] 
     * @param {string} [userPhone]
     */
    async deleteUser(userId, userEmail, userPhone) {
        if (!userId && !userEmail && !userPhone) return false;

        const normEmail = (userEmail || '').toLowerCase().trim();
        const rawPhone = (userPhone || '').trim();
        const cleanPhone = rawPhone.replace(/\D/g, '');
        const strUserId = (userId !== undefined && userId !== null) ? String(userId).trim() : '';

        const isMatch = (item) => {
            if (!item || typeof item !== 'object') return false;
            const itemId = item.id ? String(item.id).trim() : (item.userId ? String(item.userId).trim() : '');
            if (strUserId && strUserId !== 'undefined' && (itemId === strUserId || itemId.toLowerCase() === strUserId.toLowerCase())) return true;
            if (normEmail && item.email && item.email.toLowerCase().trim() === normEmail) return true;
            if (cleanPhone) {
                const itemPhone = (item.phone || '').toString().replace(/\D/g, '');
                if (itemPhone && (itemPhone === cleanPhone || itemPhone.endsWith(cleanPhone) || cleanPhone.endsWith(itemPhone))) return true;
            }
            if ((!strUserId || strUserId === 'undefined') && (!itemId || itemId === 'undefined' || itemId === 'null')) return true;
            return false;
        };

        // 0. Lưu ID người dùng đã xóa vào danh sách blacklist/tombstone
        try {
            const deleted = JSON.parse(localStorage.getItem('goride_deleted_user_ids') || '[]');
            if (strUserId && strUserId !== 'undefined' && !deleted.includes(strUserId)) deleted.push(strUserId);
            if (normEmail && !deleted.includes(normEmail)) deleted.push(normEmail);
            if (cleanPhone && !deleted.includes(cleanPhone)) deleted.push(cleanPhone);
            localStorage.setItem('goride_deleted_user_ids', JSON.stringify(deleted));
        } catch (e) {}

        // 1. Xóa khỏi Firebase Realtime Database qua SDK
        if (this.isAvailable()) {
            try {
                if (userId && userId !== 'undefined') {
                    await this.db.ref(`goride_users/${userId}`).remove();
                    await this.db.ref(`goride_pending_drivers/${userId}`).remove();
                    await this.db.ref(`goride_drivers/${userId}`).remove();
                    await this.db.ref(`goride_online_drivers/${userId}`).remove();
                    await this.db.ref(`goride_customers/${userId}`).remove();
                }
                // Luôn dọn dẹp node rác 'undefined' nếu có
                await this.db.ref('goride_users/undefined').remove().catch(() => {});
                await this.db.ref('goride_drivers/undefined').remove().catch(() => {});
                await this.db.ref('goride_pending_drivers/undefined').remove().catch(() => {});
                await this.db.ref('goride_online_drivers/undefined').remove().catch(() => {});

                // Quét triệt để tất cả các bảng người dùng để xóa sạch theo email/sđt nếu có
                const targetCollections = ['goride_users', 'goride_pending_drivers', 'goride_drivers', 'goride_online_drivers', 'goride_customers'];
                for (const col of targetCollections) {
                    try {
                        const snap = await this.db.ref(col).once('value');
                        const val = snap.val() || {};
                        for (const [k, obj] of Object.entries(val)) {
                            if (k === userId || k === 'undefined' || k === 'null' || isMatch(obj)) {
                                await this.db.ref(`${col}/${k}`).remove();
                            }
                        }
                    } catch (colErr) {}
                }
                console.log(`[RealtimeSync] 🗑️ Đã xóa sạch dữ liệu người dùng ${userId || userEmail || userPhone} trên Firebase Realtime Cloud!`);
            } catch (err) {
                if (err.message && err.message.includes('PERMISSION_DENIED')) this._handlePermissionDenied('deleteUser');
                console.warn('[RealtimeSync] Lỗi xóa Firebase deleteUser:', err.message);
            }
        }

        // 2. Dual REST fallback delete
        if (this.databaseURL) {
            try {
                if (userId && userId !== 'undefined') {
                    await this._restDelete(`goride_users/${userId}`);
                    await this._restDelete(`goride_pending_drivers/${userId}`);
                    await this._restDelete(`goride_drivers/${userId}`);
                    await this._restDelete(`goride_online_drivers/${userId}`);
                    await this._restDelete(`goride_customers/${userId}`);
                }
                await this._restDelete('goride_users/undefined').catch(() => {});
                await this._restDelete('goride_drivers/undefined').catch(() => {});
                await this._restDelete('goride_pending_drivers/undefined').catch(() => {});
                await this._restDelete('goride_online_drivers/undefined').catch(() => {});

                const targetCols = ['goride_users', 'goride_pending_drivers', 'goride_drivers', 'goride_online_drivers'];
                for (const col of targetCols) {
                    try {
                        const restData = await this._restGet(col);
                        if (restData && typeof restData === 'object') {
                            for (const [k, obj] of Object.entries(restData)) {
                                if (k === userId || k === 'undefined' || k === 'null' || isMatch(obj)) {
                                    await this._restDelete(`${col}/${k}`);
                                }
                            }
                        }
                    } catch (e) {}
                }
            } catch (restErr) {}
        }

        // 3. Đồng bộ xóa trong SQLite Backend API
        if (typeof apiClient !== 'undefined') {
            try {
                await apiClient.post('/admin/users/delete', {
                    userId: userId || '',
                    email: normEmail || '',
                    phone: rawPhone || ''
                });
            } catch (apiErr) {}
        }

        // 4. Xóa sạch sẽ trong LocalStorage
        try {
            const users = JSON.parse(localStorage.getItem('goride_offline_users') || '[]');
            const filteredUsers = users.filter(u => !isMatch(u) && u && u.id && u.id !== 'undefined');
            localStorage.setItem('goride_offline_users', JSON.stringify(filteredUsers));

            // Xóa khỏi danh sách tài xế
            const drivers = JSON.parse(localStorage.getItem('goride_admin_drivers') || '[]');
            const filteredDrivers = drivers.filter(d => !isMatch(d) && d && d.id && d.id !== 'undefined');
            localStorage.setItem('goride_admin_drivers', JSON.stringify(filteredDrivers));

            // Xóa khỏi danh sách chờ duyệt
            const pending = JSON.parse(localStorage.getItem('goride_pending_drivers') || '[]');
            const filteredPending = pending.filter(p => !isMatch(p) && p && p.id && p.id !== 'undefined');
            localStorage.setItem('goride_pending_drivers', JSON.stringify(filteredPending));

            // Xóa khỏi online drivers
            const online = JSON.parse(localStorage.getItem('goride_online_drivers') || '{}');
            if (userId && online[userId]) delete online[userId];
            for (const [k, o] of Object.entries(online)) {
                if (k === userId || k === 'undefined' || isMatch(o)) delete online[k];
            }
            localStorage.setItem('goride_online_drivers', JSON.stringify(online));

            // Xóa toàn bộ key cuốc xe cách ly của tài khoản này
            const targetKeys = [
                userId ? `goride_trips_${String(userId).trim().toLowerCase().replace(/[^a-z0-9_@.-]/gi, '_')}` : null,
                normEmail ? `goride_trips_${normEmail.replace(/[^a-z0-9_@.-]/gi, '_')}` : null,
                cleanPhone ? `goride_trips_${cleanPhone}` : null
            ].filter(Boolean);

            targetKeys.forEach(k => {
                try { localStorage.removeItem(k); } catch (e) {}
            });
        } catch (e) {}

        return true;
    }

    /* ==========================================================================
       USER PROFILE, TRIP HISTORY, NOTIFICATIONS & RATINGS PERSISTENCE (DATABASE)
       ========================================================================== */

    /**
     * 16. Cập nhật hồ sơ người dùng trực tiếp vào Database (Firebase + API + LocalStorage)
     * @param {string} userId
     * @param {Object} profileData - { name, phone, email, avatar, ... }
     */
    async updateUserProfile(userId, profileData) {
        if (!userId || !profileData) return false;
        const patch = {
            ...profileData,
            updatedAt: new Date().toISOString()
        };

        // 1. Firebase SDK
        if (this.isAvailable()) {
            try {
                await this.db.ref(`goride_users/${userId}`).update(patch);
                // Nếu là tài xế, cập nhật luôn thông tin trong goride_drivers
                const snap = await this.db.ref(`goride_drivers/${userId}`).once("value");
                if (snap.exists()) {
                    await this.db.ref(`goride_drivers/${userId}`).update(patch);
                }
                console.log(`[RealtimeSync] 💾 Đã lưu cập nhật hồ sơ người dùng ${userId} vào Database`);
            } catch (e) {
                console.warn("[RealtimeSync] updateUserProfile SDK error:", e.message);
            }
        }

        // 2. Dual REST fallback write
        if (this.databaseURL) {
            try {
                await this._restPatch(`goride_users/${userId}`, patch);
                await this._restPatch(`goride_drivers/${userId}`, patch);
            } catch (e) {}
        }

        // 3. LocalStorage update
        try {
            const users = JSON.parse(localStorage.getItem("goride_offline_users") || "[]");
            const idx = users.findIndex(u => u.id === userId || (patch.email && u.email === patch.email));
            if (idx !== -1) {
                users[idx] = { ...users[idx], ...patch };
                localStorage.setItem("goride_offline_users", JSON.stringify(users));
            }
        } catch (e) {}

        return true;
    }

    /**
     * 17. Lưu chuyến đi của tài khoản người dùng vào Database
     * @param {string} userKey
     * @param {Object} tripRecord
     */
    async saveUserTrip(userKey, tripRecord) {
        if (!userKey || !tripRecord || !tripRecord.id) return false;
        const record = {
            ...tripRecord,
            savedAt: new Date().toISOString()
        };

        // 1. Firebase SDK
        if (this.isAvailable()) {
            try {
                await this.db.ref(`goride_user_trips/${userKey}/${tripRecord.id}`).set(record);
                // Đồng thời cập nhật vào bảng goride_trips
                await this.db.ref(`goride_trips/${tripRecord.id}`).update(record);
            } catch (e) {
                console.warn("[RealtimeSync] saveUserTrip SDK error:", e.message);
            }
        }

        // 2. Dual REST fallback write
        if (this.databaseURL) {
            try {
                await this._restPut(`goride_user_trips/${userKey}/${tripRecord.id}`, record);
                await this._restPatch(`goride_trips/${tripRecord.id}`, record);
            } catch (e) {}
        }

        return true;
    }

    /**
     * 18. Lấy lịch sử chuyến đi của tài khoản từ Database
     * @param {string} userKey
     */
    async getUserTrips(userKey) {
        if (!userKey) return [];
        let trips = [];

        // 1. Firebase SDK
        if (this.isAvailable()) {
            try {
                const snap = await this.db.ref(`goride_user_trips/${userKey}`).once("value");
                const data = snap.val();
                if (data && typeof data === "object") {
                    trips = Object.values(data);
                }
            } catch (e) {}
        }

        // 2. REST fallback
        if (trips.length === 0 && this.databaseURL) {
            try {
                const data = await this._restGet(`goride_user_trips/${userKey}`);
                if (data && typeof data === "object") {
                    trips = Object.values(data);
                }
            } catch (e) {}
        }

        return trips.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    }

    /**
     * 19. Lưu thông báo riêng của tài khoản vào Database
     * @param {string} userKey
     * @param {Object} notification
     */
    async saveUserNotification(userKey, notification) {
        if (!userKey || !notification || !notification.id) return false;

        if (this.isAvailable()) {
            try {
                await this.db.ref(`goride_user_notifications/${userKey}/${notification.id}`).set(notification);
            } catch (e) {}
        }

        if (this.databaseURL) {
            try {
                await this._restPut(`goride_user_notifications/${userKey}/${notification.id}`, notification);
            } catch (e) {}
        }

        return true;
    }

    /**
     * 20. Lấy danh sách thông báo riêng của tài khoản từ Database
     * @param {string} userKey
     */
    async getUserNotifications(userKey) {
        if (!userKey) return [];
        let notifs = [];

        if (this.isAvailable()) {
            try {
                const snap = await this.db.ref(`goride_user_notifications/${userKey}`).once("value");
                const data = snap.val();
                if (data && typeof data === "object") {
                    notifs = Object.values(data);
                }
            } catch (e) {}
        }

        if (notifs.length === 0 && this.databaseURL) {
            try {
                const data = await this._restGet(`goride_user_notifications/${userKey}`);
                if (data && typeof data === "object") {
                    notifs = Object.values(data);
                }
            } catch (e) {}
        }

        return notifs.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    }

    /**
     * 21. Cập nhật trạng thái đã đọc của thông báo trong Database
     * @param {string} userKey
     * @param {string} notifId
     */
    async markNotificationRead(userKey, notifId) {
        if (!userKey || !notifId) return false;
        const patch = { unread: false, readAt: new Date().toISOString() };

        if (this.isAvailable()) {
            try {
                await this.db.ref(`goride_user_notifications/${userKey}/${notifId}`).update(patch);
            } catch (e) {}
        }

        if (this.databaseURL) {
            try {
                await this._restPatch(`goride_user_notifications/${userKey}/${notifId}`, patch);
            } catch (e) {}
        }

        return true;
    }

    /**
     * 22. Đánh dấu tất cả thông báo của tài khoản là đã đọc trong Database
     * @param {string} userKey
     */
    async markAllNotificationsRead(userKey) {
        if (!userKey) return false;
        const notifs = await this.getUserNotifications(userKey);
        for (const n of notifs) {
            if (n && n.id && n.unread) {
                await this.markNotificationRead(userKey, n.id);
            }
        }
        return true;
    }

        /**
     * 23. Lưu đánh giá cuốc xe (Khách hàng đánh giá Tài xế)
     * Cập nhật cuốc xe, lịch sử đánh giá và điểm trung bình của tài xế
     * @param {string} tripId
     * @param {Object} ratingData - { rating, feedback, driverId, userKey, customerName, driverName }
     */
    async saveTripRating(tripId, ratingData = {}) {
        if (!tripId) return false;
        const rating = Number(ratingData.rating || 5);
        const feedback = ratingData.feedback || '';
        const driverId = ratingData.driverId;
        const userKey = ratingData.userKey;
        const customerName = ratingData.customerName || 'Khách hàng';
        const driverName = ratingData.driverName || 'Tài xế';

        const tripPatch = {
            rating: rating,
            customerRating: rating,
            userRating: rating,
            customerFeedback: feedback,
            feedback: feedback,
            customerRatedAt: new Date().toISOString(),
            ratedAt: new Date().toISOString()
        };

        // 1. Cập nhật chuyến đi trên Database
        await this.updateTripStatus(tripId, 'COMPLETED', tripPatch);

        // 2. Cập nhật vào lịch sử cuốc xe của người dùng nếu có userKey
        if (userKey) {
            try {
                if (this.isAvailable()) {
                    await this.db.ref('goride_user_trips/' + userKey + '/' + tripId).update(tripPatch);
                }
                if (this.databaseURL) {
                    await this._restPatch('goride_user_trips/' + userKey + '/' + tripId, tripPatch);
                }
            } catch (e) {}
        }

        // 3. Lưu vào lịch sử đánh giá hệ thống (navigo_ratings_history)
        try {
            const ratingsHistory = JSON.parse(localStorage.getItem('navigo_ratings_history') || '[]');
            ratingsHistory.unshift({
                id: 'rate_c2d_' + Date.now(),
                tripId: tripId,
                fromRole: 'customer',
                toRole: 'driver',
                fromUserId: userKey || '',
                fromUserName: customerName,
                toUserId: driverId || '',
                toUserName: driverName,
                rating: rating,
                feedback: feedback,
                createdAt: new Date().toISOString()
            });
            localStorage.setItem('navigo_ratings_history', JSON.stringify(ratingsHistory));
        } catch (e) {}

        // 4. Cập nhật vào goride_admin_trips & goride_active_trip
        try {
            const adminTrips = JSON.parse(localStorage.getItem('goride_admin_trips') || '[]');
            const aIdx = adminTrips.findIndex(t => t.id === tripId);
            if (aIdx !== -1) {
                adminTrips[aIdx].rating = rating;
                adminTrips[aIdx].customerRating = rating;
                adminTrips[aIdx].feedback = feedback;
                adminTrips[aIdx].customerFeedback = feedback;
                localStorage.setItem('goride_admin_trips', JSON.stringify(adminTrips));
            }
            const activeTrip = JSON.parse(localStorage.getItem('goride_active_trip') || '{}');
            if (activeTrip && activeTrip.id === tripId) {
                activeTrip.customerRating = rating;
                activeTrip.rating = rating;
                localStorage.setItem('goride_active_trip', JSON.stringify(activeTrip));
            }
        } catch (e) {}

        // 5. Cập nhật điểm đánh giá trung bình của tài xế
        try {
            const ratingsHistory = JSON.parse(localStorage.getItem('navigo_ratings_history') || '[]');
            const driverRatings = ratingsHistory.filter(r => 
                r && r.toRole === 'driver' && 
                ((driverId && r.toUserId === driverId) || (driverName && r.toUserName === driverName))
            );
            
            let totalScore = 0;
            let count = 0;
            if (driverRatings.length > 0) {
                driverRatings.forEach(r => {
                    totalScore += Number(r.rating || 5);
                    count += 1;
                });
            }
            const avgRating = count > 0 ? Number((totalScore / count).toFixed(1)) : rating;

            // Cập nhật goride_admin_drivers
            const adminDrivers = JSON.parse(localStorage.getItem('goride_admin_drivers') || '[]');
            adminDrivers.forEach(d => {
                if (driverId ? d.id === driverId : (driverName && d.name === driverName)) {
                    d.rating = avgRating;
                    d.ratingCount = count;
                }
            });
            localStorage.setItem('goride_admin_drivers', JSON.stringify(adminDrivers));

            // Cập nhật goride_offline_users nếu là driver
            const offlineUsers = JSON.parse(localStorage.getItem('goride_offline_users') || '[]');
            offlineUsers.forEach(u => {
                if (u.role === 'driver' && (driverId ? u.id === driverId : (driverName && u.name === driverName))) {
                    u.rating = avgRating;
                    u.ratingCount = count;
                }
            });
            localStorage.setItem('goride_offline_users', JSON.stringify(offlineUsers));

            // Cập nhật current user nếu là driver
            const curUser = JSON.parse(localStorage.getItem('goride_user') || '{}');
            if (curUser && curUser.role === 'driver' && (driverId ? curUser.id === driverId : (driverName && curUser.name === driverName))) {
                curUser.rating = avgRating;
                curUser.ratingCount = count;
                localStorage.setItem('goride_user', JSON.stringify(curUser));
                if (typeof sessionManager !== 'undefined') {
                    sessionManager.updateUser({ rating: avgRating, ratingCount: count });
                }
            }

            // Sync driver patch to Firebase
            if (driverId) {
                const driverPatch = {
                    rating: avgRating,
                    ratingCount: count,
                    updatedAt: new Date().toISOString()
                };
                if (this.isAvailable()) {
                    await this.db.ref('goride_drivers/' + driverId).update(driverPatch);
                } else if (this.databaseURL) {
                    await this._restPatch('goride_drivers/' + driverId, driverPatch);
                }
            }

            window.dispatchEvent(new CustomEvent('navigo:rating-updated', { detail: { type: 'driver', rating: avgRating, count: count } }));
        } catch (e) {
            console.warn('[RealtimeSync] Lỗi cập nhật điểm tài xế:', e);
        }

        return true;
    }

    /**
     * 24. Lưu đánh giá hành khách (Tài xế đánh giá Khách hàng)
     * Cập nhật cuốc xe, lịch sử đánh giá và điểm trung bình của khách hàng
     * @param {string} tripId
     * @param {Object} ratingData - { rating, feedback, tags, customerId, customerName, customerPhone, driverId, driverName }
     */
    async saveCustomerRating(tripId, ratingData = {}) {
        if (!tripId) return false;
        const rating = Number(ratingData.rating || 5);
        const feedback = ratingData.feedback || '';
        const tags = ratingData.tags || [];
        const customerId = ratingData.customerId || '';
        const customerName = ratingData.customerName || 'Khách hàng';
        const customerPhone = ratingData.customerPhone || '';
        const driverId = ratingData.driverId || '';
        const driverName = ratingData.driverName || 'Tài xế';

        const tripPatch = {
            driverRatingToCustomer: rating,
            driverFeedback: feedback,
            driverRatingTags: tags,
            driverRatedAt: new Date().toISOString()
        };

        // 1. Cập nhật chuyến đi trên Database
        await this.updateTripStatus(tripId, 'COMPLETED', tripPatch);

        // 2. Lưu vào lịch sử đánh giá hệ thống (navigo_ratings_history)
        try {
            const ratingsHistory = JSON.parse(localStorage.getItem('navigo_ratings_history') || '[]');
            ratingsHistory.unshift({
                id: 'rate_d2c_' + Date.now(),
                tripId: tripId,
                fromRole: 'driver',
                toRole: 'customer',
                fromUserId: driverId,
                fromUserName: driverName,
                toUserId: customerId,
                toUserName: customerName,
                toUserPhone: customerPhone,
                rating: rating,
                feedback: feedback,
                tags: tags,
                createdAt: new Date().toISOString()
            });
            localStorage.setItem('navigo_ratings_history', JSON.stringify(ratingsHistory));
        } catch (e) {}

        // 3. Cập nhật vào goride_admin_trips & goride_active_trip & goride_driver_trips
        try {
            const adminTrips = JSON.parse(localStorage.getItem('goride_admin_trips') || '[]');
            const aIdx = adminTrips.findIndex(t => t.id === tripId);
            if (aIdx !== -1) {
                adminTrips[aIdx].driverRatingToCustomer = rating;
                adminTrips[aIdx].driverFeedback = feedback;
                adminTrips[aIdx].driverRatingTags = tags;
                localStorage.setItem('goride_admin_trips', JSON.stringify(adminTrips));
            }

            const driverTrips = JSON.parse(localStorage.getItem('goride_driver_trips') || '[]');
            const dIdx = driverTrips.findIndex(t => t.id === tripId);
            if (dIdx !== -1) {
                driverTrips[dIdx].driverRatingToCustomer = rating;
                driverTrips[dIdx].driverFeedback = feedback;
                driverTrips[dIdx].driverRatingTags = tags;
                localStorage.setItem('goride_driver_trips', JSON.stringify(driverTrips));
            }

            const activeTrip = JSON.parse(localStorage.getItem('goride_active_trip') || '{}');
            if (activeTrip && activeTrip.id === tripId) {
                activeTrip.driverRatingToCustomer = rating;
                activeTrip.driverFeedback = feedback;
                localStorage.setItem('goride_active_trip', JSON.stringify(activeTrip));
            }
        } catch (e) {}

        // 4. Cập nhật điểm đánh giá trung bình của khách hàng
        try {
            const ratingsHistory = JSON.parse(localStorage.getItem('navigo_ratings_history') || '[]');
            const custRatings = ratingsHistory.filter(r => 
                r && r.toRole === 'customer' && 
                ((customerId && r.toUserId === customerId) || (customerPhone && r.toUserPhone === customerPhone) || (customerName && r.toUserName === customerName))
            );
            
            let totalScore = 0;
            let count = 0;
            if (custRatings.length > 0) {
                custRatings.forEach(r => {
                    totalScore += Number(r.rating || 5);
                    count += 1;
                });
            } else {
                totalScore = rating;
                count = 1;
            }
            const avgRating = Number((totalScore / count).toFixed(1));

            // Cập nhật goride_offline_users
            const offlineUsers = JSON.parse(localStorage.getItem('goride_offline_users') || '[]');
            offlineUsers.forEach(u => {
                if (u.role === 'customer' || !u.role) {
                    const matchCust = (customerId && u.id === customerId) || (customerPhone && u.phone === customerPhone) || (customerName && u.name === customerName);
                    if (matchCust) {
                        u.rating = avgRating;
                        u.ratingCount = count;
                    }
                }
            });
            localStorage.setItem('goride_offline_users', JSON.stringify(offlineUsers));

            // Cập nhật current user nếu đúng là khách hàng được đánh giá
            const curUser = JSON.parse(localStorage.getItem('goride_user') || '{}');
            const matchCurCust = curUser && curUser.role !== 'driver' && ((customerId && curUser.id === customerId) || (customerPhone && curUser.phone === customerPhone) || (customerName && curUser.name === customerName));
            if (matchCurCust) {
                curUser.rating = avgRating;
                curUser.ratingCount = count;
                localStorage.setItem('goride_user', JSON.stringify(curUser));
                if (typeof sessionManager !== 'undefined') {
                    sessionManager.updateUser({ rating: avgRating, ratingCount: count });
                }
            }

            // Sync to Firebase customer node if available
            if (customerId) {
                const customerPatch = {
                    rating: avgRating,
                    ratingCount: count,
                    updatedAt: new Date().toISOString()
                };
                if (this.isAvailable()) {
                    await this.db.ref('goride_customers/' + customerId).update(customerPatch);
                } else if (this.databaseURL) {
                    await this._restPatch('goride_customers/' + customerId, customerPatch);
                }
            }

            window.dispatchEvent(new CustomEvent('navigo:rating-updated', { detail: { type: 'customer', rating: avgRating, count: count } }));
        } catch (e) {
            console.warn('[RealtimeSync] Lỗi cập nhật điểm khách hàng:', e);
        }

        return true;
    }

    /**
     * 25. Lấy điểm đánh giá trung bình cộng của đối phương (Counterparty Average Rating)
     * - Nếu role là 'driver': tính điểm trung bình cộng các đánh giá từ khách hàng
     * - Nếu role là 'customer': tính điểm trung bình cộng các đánh giá từ tài xế
     * @param {string} userIdOrPhone
     * @param {string} role - 'driver' | 'customer'
     * @param {string} [userPhone] - SĐT bổ sung để đối soát chính xác
     * @returns {Object} { average, count, reviews, starsBreakdown, badges }
     */
    getCounterpartyRating(userIdOrPhone = '', role = 'customer', userPhone = '') {
        try {
            const isDriver = (role === 'driver');
            const targetRole = isDriver ? 'driver' : 'customer'; // role of the person being rated
            const ratingsHistory = JSON.parse(localStorage.getItem('navigo_ratings_history') || '[]');

            const cleanId = String(userIdOrPhone || '').trim();
            const cleanDigits1 = cleanId.replace(/\D/g, '');
            const rawPhone = String(userPhone || '').trim();
            const cleanDigits2 = rawPhone.replace(/\D/g, '');

            // Nếu không có bất kỳ thông tin định danh nào của người dùng, không gán lung tung đánh giá của người khác
            if (!cleanId && !cleanDigits1 && !cleanDigits2) {
                return {
                    average: 5.0,
                    count: 0,
                    reviews: [],
                    starsBreakdown: { 5: 100, 4: 0, 3: 0, 2: 0, 1: 0 },
                    badges: isDriver ? ['Lái xe an toàn', 'Thân thiện', 'Xe sạch sẽ'] : ['Thân thiện', 'Đúng giờ', 'Lịch sự']
                };
            }

            const isMatchReview = (r) => {
                if (!r || r.toRole !== targetRole) return false;
                if (cleanId && (r.toUserId === cleanId || r.toUserPhone === cleanId)) return true;
                if (r.toUserPhone) {
                    const rDigits = String(r.toUserPhone).replace(/\D/g, '');
                    if (cleanDigits1 && rDigits && (rDigits === cleanDigits1 || rDigits.endsWith(cleanDigits1) || cleanDigits1.endsWith(rDigits))) return true;
                    if (cleanDigits2 && rDigits && (rDigits === cleanDigits2 || rDigits.endsWith(cleanDigits2) || cleanDigits2.endsWith(rDigits))) return true;
                }
                return false;
            };

            let matched = ratingsHistory.filter(isMatchReview);

            // Also check goride_admin_trips completed (chỉ lấy đúng chuyến xe thuộc về tài xế hoặc khách hàng này)
            const adminTrips = JSON.parse(localStorage.getItem('goride_admin_trips') || '[]');
            adminTrips.forEach(t => {
                if (!t) return;
                if (isDriver) {
                    const r = Number(t.customerRating || t.rating || 0);
                    if (r <= 0) return;

                    let isTargetDriver = false;
                    if (cleanId && (t.driverId === cleanId || t.driverPhone === cleanId)) isTargetDriver = true;
                    if (t.driverPhone) {
                        const dDigits = String(t.driverPhone).replace(/\D/g, '');
                        if (cleanDigits1 && dDigits && (dDigits === cleanDigits1 || dDigits.endsWith(cleanDigits1) || cleanDigits1.endsWith(dDigits))) isTargetDriver = true;
                        if (cleanDigits2 && dDigits && (dDigits === cleanDigits2 || dDigits.endsWith(cleanDigits2) || cleanDigits2.endsWith(dDigits))) isTargetDriver = true;
                    }

                    if (isTargetDriver && !matched.some(m => m.tripId === t.id && m.fromRole === 'customer')) {
                        matched.push({
                            id: 'adm_c2d_' + t.id,
                            tripId: t.id,
                            fromRole: 'customer',
                            toRole: 'driver',
                            fromUserName: t.customerName || 'Khách hàng',
                            toUserName: t.driverName || 'Tài xế',
                            toUserId: t.driverId,
                            toUserPhone: t.driverPhone,
                            rating: r,
                            feedback: t.customerFeedback || t.feedback || '',
                            createdAt: t.completedAt || t.createdAt || new Date().toISOString()
                        });
                    }
                } else {
                    const r = Number(t.driverRatingToCustomer || 0);
                    if (r <= 0) return;

                    let isTargetCust = false;
                    if (cleanId && (t.customerId === cleanId || t.customerPhone === cleanId || t.userId === cleanId)) isTargetCust = true;
                    if (t.customerPhone) {
                        const cDigits = String(t.customerPhone).replace(/\D/g, '');
                        if (cleanDigits1 && cDigits && (cDigits === cleanDigits1 || cDigits.endsWith(cleanDigits1) || cleanDigits1.endsWith(cDigits))) isTargetCust = true;
                        if (cleanDigits2 && cDigits && (cDigits === cleanDigits2 || cDigits.endsWith(cleanDigits2) || cleanDigits2.endsWith(cDigits))) isTargetCust = true;
                    }

                    if (isTargetCust && !matched.some(m => m.tripId === t.id && m.fromRole === 'driver')) {
                        matched.push({
                            id: 'adm_d2c_' + t.id,
                            tripId: t.id,
                            fromRole: 'driver',
                            toRole: 'customer',
                            fromUserName: t.driverName || 'Tài xế',
                            toUserName: t.customerName || 'Khách hàng',
                            toUserId: t.customerId || t.userId,
                            toUserPhone: t.customerPhone,
                            rating: r,
                            feedback: t.driverFeedback || '',
                            tags: t.driverRatingTags || [],
                            createdAt: t.completedAt || t.createdAt || new Date().toISOString()
                        });
                    }
                }
            });

            const count = matched.length;
            const starsCount = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
            const tagMap = {};

            if (count === 0) {
                return {
                    average: 5.0,
                    count: 0,
                    reviews: [],
                    starsBreakdown: { 5: 100, 4: 0, 3: 0, 2: 0, 1: 0 },
                    badges: isDriver ? ['Lái xe an toàn', 'Thân thiện', 'Xe sạch sẽ'] : ['Thân thiện', 'Đúng giờ', 'Lịch sự']
                };
            }

            let sum = 0;
            matched.forEach(item => {
                const s = Math.min(5, Math.max(1, Math.round(Number(item.rating || 5))));
                starsCount[s] = (starsCount[s] || 0) + 1;
                sum += Number(item.rating || 5);
                if (Array.isArray(item.tags)) {
                    item.tags.forEach(tg => {
                        tagMap[tg] = (tagMap[tg] || 0) + 1;
                    });
                }
            });

            const average = Number((sum / count).toFixed(1));
            const breakdown = {};
            for (let i = 1; i <= 5; i++) {
                breakdown[i] = Math.round(((starsCount[i] || 0) / count) * 100);
            }

            const badges = Object.keys(tagMap).sort((a, b) => tagMap[b] - tagMap[a]);
            if (badges.length === 0) {
                badges.push(isDriver ? 'Lái xe an toàn' : 'Thân thiện', isDriver ? 'Xe sạch sẽ' : 'Đúng giờ', 'Lịch sự');
            }

            return {
                average: average,
                count: count,
                reviews: matched.slice(0, 10),
                starsBreakdown: breakdown,
                badges: badges
            };
        } catch (e) {
            return {
                average: 5.0,
                count: 0,
                reviews: [],
                starsBreakdown: { 5: 100, 4: 0, 3: 0, 2: 0, 1: 0 },
                badges: role === 'driver' ? ['Lái xe an toàn', 'Thân thiện', 'Xe sạch sẽ'] : ['Thân thiện', 'Đúng giờ', 'Lịch sự']
            };
        }
    }
/* ==========================================================================
       LOCAL STORAGE HELPERS (FALLBACK VÀ CHIA SẺ TRÌNH DUYỆT)
       ========================================================================== */

    _syncTripToLocalStorage(trip) {
        try {
            const activeData = {
                id: trip.id,
                status: (trip.status || 'REQUESTED').toUpperCase(),
                customerName: trip.customerName || 'Khách hàng',
                customerPhone: trip.customerPhone || '',
                driverName: trip.driverName || null,
                pickup: trip.pickup || { name: trip.pickupName || 'Điểm đón', lat: trip.pickupLat, lng: trip.pickupLon },
                destination: trip.destination || { name: trip.dropoffName || 'Điểm đến', lat: trip.dropoffLat, lng: trip.dropoffLon },
                fareAmount: trip.fareAmount || trip.fare || 45000,
                vehicleType: trip.vehicleType || 'car4',
                createdAt: trip.createdAt
            };

            localStorage.setItem('goride_active_trip', JSON.stringify(activeData));
            localStorage.setItem('goride_pending_trip_offers', JSON.stringify([trip]));

            const adminTrips = JSON.parse(localStorage.getItem('goride_admin_trips') || '[]');
            const idx = adminTrips.findIndex(t => t.id === trip.id);
            if (idx === -1) {
                adminTrips.unshift({
                    id: trip.id,
                    customerName: activeData.customerName,
                    customerPhone: activeData.customerPhone,
                    driverName: activeData.driverName || 'Chưa gán',
                    pickup: activeData.pickup.name,
                    destination: activeData.destination.name,
                    fare: activeData.fareAmount,
                    status: (trip.status || 'requested').toLowerCase(),
                    createdAt: trip.createdAt
                });
            }
            localStorage.setItem('goride_admin_trips', JSON.stringify(adminTrips));
        } catch (e) {}
    }

    _updateLocalStorageTrip(tripId, patch) {
        try {
            const active = JSON.parse(localStorage.getItem('goride_active_trip') || 'null');
            if (active && active.id === tripId) {
                Object.assign(active, patch);
                localStorage.setItem('goride_active_trip', JSON.stringify(active));
            }

            const adminTrips = JSON.parse(localStorage.getItem('goride_admin_trips') || '[]');
            const idx = adminTrips.findIndex(t => t.id === tripId);
            if (idx !== -1) {
                if (patch.status) adminTrips[idx].status = patch.status.toLowerCase();
                if (patch.driverName) adminTrips[idx].driverName = patch.driverName;
                if (patch.fareAmount) adminTrips[idx].fare = patch.fareAmount;
                localStorage.setItem('goride_admin_trips', JSON.stringify(adminTrips));
            }
        } catch (e) {}
    }
}

// Global Singleton Instance
const realtimeSync = new RealtimeSyncManager();

if (typeof window !== 'undefined') {
    window.RealtimeSyncManager = RealtimeSyncManager;
    window.realtimeSync = realtimeSync;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { RealtimeSyncManager, realtimeSync };
}
