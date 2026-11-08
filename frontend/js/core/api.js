/**
 * RIDE-RTREE API Client - Phase 2A.3
 * Integrated with C++17 RoadGraph & Dijkstra REST API Server
 */

const getDefaultBaseUrl = () => {
    // 1. Explicit global override or localStorage configuration (for Cloud backend connected with Vercel)
    if (typeof window !== 'undefined') {
        const storedUrl = localStorage.getItem('navigo_backend_url') || localStorage.getItem('goride_backend_url');
        if (storedUrl) return storedUrl;
        if (window.NAVIGO_API_URL) return window.NAVIGO_API_URL;
        if (window.GORIDE_API_URL) return window.GORIDE_API_URL;
    }
    // 2. Local network development fallback (PC, phone on same Wi-Fi, emulator)
    if (typeof window !== 'undefined' && window.location) {
        const host = window.location.hostname;
        const port = window.location.port;
        const isLocalNetwork = host === 'localhost' || host === '127.0.0.1' || window.location.protocol === 'file:' ||
                               /^192\.168\./.test(host) || /^10\./.test(host) || /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host);
        if (isLocalNetwork) {
            if (port === '8080') return '/api';
            return `http://${host || 'localhost'}:8080/api`;
        }
    }
    // 3. Vercel deployment fallback
    return '/api';
};

const API_CONFIG = {
    baseUrl: getDefaultBaseUrl(),
    timeout: 4000,
    headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
    }
};

class ApiError extends Error {
    constructor(message, status, data) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.data = data;
    }
}

class NetworkError extends Error {
    constructor(message) {
        super(message);
        this.name = 'NetworkError';
    }
}

class ApiClient {
    constructor(config = {}) {
        this.baseUrl = config.baseUrl || API_CONFIG.baseUrl;
        this.timeout = config.timeout || API_CONFIG.timeout;
        this.defaultHeaders = { ...API_CONFIG.headers, ...config.headers };
        this.authToken = null;
        this.onAuthError = null; // callback when 401 received
    }

    setAuthToken(token) {
        this.authToken = token;
    }

    clearAuthToken() {
        this.authToken = null;
    }

    setOnAuthError(callback) {
        this.onAuthError = callback;
    }

    _buildHeaders() {
        const headers = { ...this.defaultHeaders };
        if (this.authToken) {
            headers['Authorization'] = `Bearer ${this.authToken}`;
        }
        return headers;
    }

    async _request(method, endpoint, { body, params, headers, timeout } = {}) {
        let url = `${this.baseUrl}${endpoint}`;
        
        if (params) {
            const searchParams = new URLSearchParams();
            Object.entries(params).forEach(([key, value]) => {
                if (value !== undefined && value !== null) {
                    searchParams.append(key, value);
                }
            });
            const qs = searchParams.toString();
            if (qs) url += `?${qs}`;
        }

        const options = {
            method,
            headers: { ...this._buildHeaders(), ...headers },
        };

        if (body && method !== 'GET') {
            options.body = JSON.stringify(body);
        }

        const reqTimeout = timeout || this.timeout;
        const controller = new AbortController();
        options.signal = controller.signal;
        const timeoutId = setTimeout(() => controller.abort(), reqTimeout);

        try {
            const response = await fetch(url, options);
            clearTimeout(timeoutId);

            if (response.status === 401 && this.onAuthError) {
                this.onAuthError();
            }

            const contentType = response.headers.get('content-type');
            let data = null;
            if (contentType && contentType.includes('application/json')) {
                data = await response.json();
            } else {
                data = await response.text();
            }

            if (!response.ok) {
                let errorMsg = `HTTP ${response.status}`;
                if (typeof data === 'string' && data.trim()) {
                    errorMsg = data.trim();
                } else if (data && typeof data === 'object') {
                    if (typeof data.error === 'string') {
                        errorMsg = data.error;
                    } else if (typeof data.error?.message === 'string') {
                        errorMsg = data.error.message;
                    } else if (typeof data.message === 'string') {
                        errorMsg = data.message;
                    }
                }
                throw new ApiError(
                    errorMsg,
                    response.status,
                    data
                );
            }

            return {
                ok: true,
                status: response.status,
                data: data
            };
        } catch (error) {
            clearTimeout(timeoutId);
            if (error instanceof ApiError) throw error;
            if (error.name === 'AbortError') {
                throw new NetworkError('Request timed out');
            }
            throw new NetworkError(error.message || 'Network error');
        }
    }

    get(endpoint, options) { return this._request('GET', endpoint, options); }
    post(endpoint, body, options) { return this._request('POST', endpoint, { ...options, body }); }
    put(endpoint, body, options) { return this._request('PUT', endpoint, { ...options, body }); }
    patch(endpoint, body, options) { return this._request('PATCH', endpoint, { ...options, body }); }
    delete(endpoint, options) { return this._request('DELETE', endpoint, options); }

    /**
     * Compute shortest path between GPS coordinates via C++ Dijkstra backend
     */
    async getRoute(fromLat, fromLon, toLat, toLon) {
        return this.get('/route', {
            params: {
                from_lat: fromLat,
                from_lon: fromLon,
                to_lat: toLat,
                to_lon: toLon
            }
        });
    }

    /**
     * Check backend health and status
     */
    async checkHealth() {
        return this.get('/health', { timeout: 3000 });
    }

    /**
     * Authenticate with backend
     */
    async login(email, password) {
        return this.post('/auth/login', { email, password });
    }

    /**
     * Register new user with backend
     */
    async register(userData) {
        return this.post('/auth/register', userData);
    }

    /**
     * Get current user profile using active token
     */
    async getProfile() {
        return this.get('/auth/me');
    }

    /**
     * Revoke active token on backend
     */
    async logout() {
        return this.post('/auth/logout', {});
    }

    /**
     * Get list of pending driver registrations awaiting approval (Admin only)
     */
    async getPendingDrivers() {
        return this.get('/admin/drivers/pending');
    }

    /**
     * Get list of all registered drivers (Admin only)
     */
    async getDrivers() {
        return this.get('/admin/drivers');
    }

    /**
     * Approve driver (Admin only)
     */
    async approveDriver(driverId) {
        return this.post('/auth/approve-driver', { driverId, action: 'approve', approved: true });
    }

    /**
     * Reject driver registration (Admin only)
     */
    async rejectDriver(driverId) {
        return this.post('/auth/approve-driver', { driverId, action: 'reject', approved: false });
    }

    /**
     * Get list of all users/customers (Admin only)
     */
    async getUsers(params = {}) {
        return this.get('/admin/users', { params });
    }

    /**
     * Update user role (grant admin or customer) (Admin only)
     */
    async updateUserRole(userId, role) {
        return this.post('/admin/users/role', { userId, role });
    }

    /**
     * Cleanly delete user from database (Admin only)
     */
    async deleteUser(userId) {
        return this.post('/admin/users/delete', { userId });
    }

    // -------------------------------------------------------------
    // Trip Lifecycle Endpoints (Phase C.3 / Real Dispatch)
    // -------------------------------------------------------------

    /**
     * Request a new trip (Customer)
     * @param {Object} tripData - { vehicleType, pickupLat, pickupLon, pickupName, dropoffLat, dropoffLon, dropoffName, fareAmount, distanceMeters, paymentMethod }
     */
    async requestTrip(tripData) {
        return this.post('/trips/request', tripData);
    }

    /**
     * Get active trip for current authenticated user (Customer, Driver, or Admin)
     */
    async getActiveTrip() {
        return this.get('/trips/active');
    }

    /**
     * Get full details of a specific trip by ID
     * @param {string} tripId
     */
    async getTripDetail(tripId) {
        return this.get('/trips/detail', { params: { id: tripId } });
    }

    /**
     * Cancel a trip (Only permitted while REQUESTED / OFFERED; forbidden once ACCEPTED/IN_PROGRESS)
     * @param {string} tripId
     * @param {string} [reason]
     */
    async cancelTrip(tripId, reason = 'Cancelled by user') {
        return this.post('/trips/cancel', { trip_id: tripId, reason });
    }

    // -------------------------------------------------------------
    // Driver Portal Endpoints
    // -------------------------------------------------------------

    /**
     * Get pending trip offer for currently authenticated driver
     */
    async getDriverPendingOffers() {
        return this.get('/driver/offers/pending');
    }

    /**
     * Accept a pending trip offer (Driver)
     * @param {string} tripId
     */
    async acceptDriverOffer(tripId) {
        return this.post('/driver/offers/accept', { trip_id: tripId });
    }

    /**
     * Reject a pending trip offer (Driver)
     * @param {string} tripId
     */
    async rejectDriverOffer(tripId) {
        return this.post('/driver/offers/reject', { trip_id: tripId });
    }

    /**
     * Update trip lifecycle status (Driver: 'arrived', 'start', 'complete')
     * @param {string} tripId
     * @param {'arrived'|'start'|'complete'} action
     */
    async updateDriverTripStatus(tripId, action) {
        return this.post('/driver/trips/status', { trip_id: tripId, action });
    }

    /**
     * Update driver online status (Driver)
     * @param {boolean} isOnline
     * @param {number} [lat]
     * @param {number} [lon]
     */
    async updateDriverStatus(isOnline, lat = null, lon = null) {
        return this.post('/driver/status', { is_online: isOnline, lat, lon });
    }

    /**
     * Send driver location beacon (Driver)
     * @param {number} lat
     * @param {number} lon
     * @param {number} [heading]
     */
    async updateDriverLocation(lat, lon, heading = 0) {
        return this.post('/driver/location', { lat, lon, heading });
    }

    // -------------------------------------------------------------
    // Admin & Profile Endpoints
    // -------------------------------------------------------------

    /**
     * List all active trips in system (Admin only)
     */
    async getAdminTrips() {
        return this.get('/admin/trips');
    }

    /**
     * Dispatch an offer to a specific driver (Admin only)
     * @param {string} tripId
     * @param {string} driverId
     * @param {number} [durationSeconds=15]
     */
    async dispatchAdminOffer(tripId, driverId, durationSeconds = 15) {
        return this.post('/admin/trips/offer', {
            trip_id: tripId,
            driver_id: driverId,
            duration_seconds: durationSeconds
        });
    }

    /**
     * Update user profile information (Name, phone)
     * @param {Object} profileData - { name, phone }
     */
    async updateProfile(profileData) {
        return this.put('/auth/profile', profileData);
    }

    /**
     * Upload or update user avatar (Base64 data or image url)
     * @param {string} avatarData
     */
    async uploadAvatar(avatarData) {
        return this.post('/auth/avatar', { avatar: avatarData });
    }

    /**
     * Delete user completely from SQLite database (Admin)
     * @param {string} userId
     * @param {string} [email]
     * @param {string} [phone]
     */
    async deleteUser(userId, email = '', phone = '') {
        return this.post('/admin/users/delete', { userId, email, phone });
    }
}

// Singleton instance
const apiClient = new ApiClient();

// Expose to window for vanilla multi-page scripts
if (typeof window !== 'undefined') {
    window.API_CONFIG = API_CONFIG;
    window.ApiError = ApiError;
    window.NetworkError = NetworkError;
    window.ApiClient = ApiClient;
    window.apiClient = apiClient;
}

// Module export support if loaded in modular context
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { API_CONFIG, ApiError, NetworkError, ApiClient, apiClient };
}
