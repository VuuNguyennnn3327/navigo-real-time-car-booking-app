/**
 * NAVIPAY WALLET & DIGITAL BANK CORE ENGINE
 * Module: frontend/js/core/wallet.js
 * 
 * Provides centralized state, transaction ledger, Vietnamese unaccent normalization,
 * QR code payload formatting/decoding, and cross-tab real-time storage synchronization.
 */

(function(window) {
    'use strict';

    // 1. Storage Keys
    const WALLET_STORAGE_KEYS = {
        WALLETS: 'navigo_wallets',
        ACTIVE_PHONE: 'navigo_active_wallet_phone',
        BANK_ACCOUNT: 'navipay_bank_account',
        SYNC_TRIGGER: 'navigo_wallet_sync_event'
    };

    // 2. String Normalizer: Upper Case Without Accents (IN HOA KHÔNG DẤU)
    function removeVietnameseTones(str) {
        if (!str || typeof str !== 'string') return '';
        let result = str.trim();
        result = result.replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g, 'a');
        result = result.replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g, 'e');
        result = result.replace(/ì|í|ị|ỉ|ĩ/g, 'i');
        result = result.replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g, 'o');
        result = result.replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g, 'u');
        result = result.replace(/ỳ|ý|ỵ|ỷ|ỹ/g, 'y');
        result = result.replace(/đ/g, 'd');
        result = result.replace(/À|Á|Ạ|Ả|Ã|Â|Ầ|Ấ|Ậ|Ẩ|Ẫ|Ă|Ằ|Ắ|Ặ|Ẳ|Ẵ/g, 'A');
        result = result.replace(/È|É|Ẹ|Ẻ|Ẽ|Ê|Ề|Ế|Ệ|Ể|Ễ/g, 'E');
        result = result.replace(/Ì|Í|Ị|Ỉ|Ĩ/g, 'I');
        result = result.replace(/Ò|Ó|Ọ|Ỏ|Õ|Ô|Ồ|Ố|Ộ|Ổ|Ỗ|Ơ|Ờ|Ớ|Ợ|Ở|Ỡ/g, 'O');
        result = result.replace(/Ù|Ú|Ụ|Ủ|Ũ|Ư|Ừ|Ứ|Ự|Ử|Ữ/g, 'U');
        result = result.replace(/Ỳ|Ý|Ỵ|Ỷ|Ỹ/g, 'Y');
        result = result.replace(/Đ/g, 'D');
        // Remove combining diacritical marks
        result = result.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        // Replace special punctuation/spaces with clean spaces
        result = result.replace(/[^a-zA-Z0-9\s]/g, ' ');
        // Consolidate extra whitespace and uppercase
        result = result.replace(/\s+/g, ' ').toUpperCase();
        return result;
    }

    // 3. Currency Formatter (VND)
    function formatVND(amount) {
        const num = Math.round(Number(amount) || 0);
        return num.toLocaleString('vi-VN') + ' ₫';
    }

    // 3b. Phone Number Normalizer (Pure digits only)
    function normalizePhone(phone) {
        if (!phone || typeof phone !== 'string') {
            if (typeof phone === 'number') return String(phone);
            return '';
        }
        return phone.replace(/[^0-9]/g, '');
    }

    // 4. Default Seed Wallets (Customer & Driver) - Khởi tạo ban đầu với số dư 0 ₫ theo thực tế
    function getDefaultWallets() {
        return {
            '0901234567': {
                accountNumber: '0901234567',
                fullName: 'NGUYEN VAN AN',
                balance: 0,
                activated: true,
                role: 'customer',
                createdAt: new Date().toISOString(),
                transactions: []
            },
            '0918765432': {
                accountNumber: '0918765432',
                fullName: 'TRAN VAN BINH',
                balance: 0,
                activated: true,
                role: 'driver',
                createdAt: new Date().toISOString(),
                transactions: []
            }
        };
    }

    // 5. Default Digital Bank Account (100 Triệu VND có sẵn)
    function getDefaultBankAccount() {
        return {
            bankName: 'NaviPay Digital Bank',
            branch: 'Chi nhánh Hội sở Trung tâm TP. Hồ Chí Minh',
            accountNumber: '999988886666',
            accountName: 'NGUYEN VAN A',
            cardNumber: '9704 8888 6666 1234',
            balance: 100000000, // 100,000,000 VND as requested
            status: 'active',
            createdAt: new Date().toISOString(),
            transactions: [
                {
                    id: 'BNK_INIT_100M',
                    type: 'credit',
                    title: 'Số dư khả dụng ban đầu',
                    amount: 100000000,
                    balanceAfter: 100000000,
                    description: 'Hạn mức tài khoản nguồn thẻ ATM NaviPay Digital Bank',
                    timestamp: new Date().toISOString(),
                    status: 'success'
                }
            ]
        };
    }

    // 6. NaviPay Core Engine Object
    const NaviWalletEngine = {
        // --- Persistence helpers ---
        getAllWallets() {
            let wallets = null;
            try {
                const raw = localStorage.getItem(WALLET_STORAGE_KEYS.WALLETS);
                if (raw) {
                    const parsed = JSON.parse(raw);
                    if (parsed && typeof parsed === 'object') wallets = parsed;
                }
            } catch (e) {
                console.error('[NaviWalletEngine] Error parsing wallets:', e);
            }

            if (!wallets) {
                wallets = getDefaultWallets();
                this._saveAllWallets(wallets, false);
                return wallets;
            }

            // Sanitize existing cached wallets that were previously seeded with fake 500k/1.25M
            let modified = false;
            const fakeTxnIds = ['TXN_INIT_CUST', 'TXN_INIT_DRV_1', 'TXN_INIT_DRV_2'];
            for (const phoneKey of Object.keys(wallets)) {
                const w = wallets[phoneKey];
                if (!w || typeof w !== 'object') continue;

                let hadFake = false;
                if (Array.isArray(w.transactions)) {
                    const prevCount = w.transactions.length;
                    w.transactions = w.transactions.filter(t => {
                        if (!t) return false;
                        if (fakeTxnIds.includes(t.id)) return false;
                        if (t.type === 'activation' && (t.amount === 500000 || t.amount === 1250000) && t.id && String(t.id).startsWith('TXN_INIT_')) {
                            return false;
                        }
                        return true;
                    });
                    if (w.transactions.length !== prevCount) {
                        hadFake = true;
                        modified = true;
                    }
                } else {
                    w.transactions = [];
                }

                if (hadFake) {
                    let running = 0;
                    const chron = [...w.transactions].reverse();
                    for (const t of chron) {
                        running += (Number(t.amount) || 0);
                        t.balanceAfter = Math.max(0, running);
                    }
                    w.balance = Math.max(0, running);
                    modified = true;
                } else if ((w.balance === 500000 || w.balance === 1250000) && (!w.transactions || w.transactions.length === 0)) {
                    w.balance = 0;
                    modified = true;
                }
            }

            if (modified) {
                this._saveAllWallets(wallets, false);
            }

            return wallets;
        },

        _saveAllWallets(wallets, broadcast = true) {
            try {
                localStorage.setItem(WALLET_STORAGE_KEYS.WALLETS, JSON.stringify(wallets));
                if (broadcast) {
                    this._triggerSync('wallets_updated', null, 0);
                }
            } catch (e) {
                console.error('[NaviWalletEngine] Error saving wallets:', e);
            }
        },

        _triggerSync(action, phone, amount) {
            const payload = {
                action: action || 'sync',
                phone: phone || null,
                amount: Number(amount) || 0,
                ts: Date.now()
            };
            try {
                localStorage.setItem(WALLET_STORAGE_KEYS.SYNC_TRIGGER, JSON.stringify(payload));
            } catch (e) {}

            try {
                window.dispatchEvent(new CustomEvent('navigo:wallet_sync', { detail: payload }));
            } catch (e) {}
        },

        // --- Current User Resolution ---
        getCurrentUser() {
            if (typeof window.sessionManager !== 'undefined' && typeof window.sessionManager.getUser === 'function') {
                const u = window.sessionManager.getUser();
                if (u) return u;
            }
            // Check fallback keys
            try {
                const rawUser = sessionStorage.getItem('navigo_user') || localStorage.getItem('navigo_user') || localStorage.getItem('goride_user');
                if (rawUser) return JSON.parse(rawUser);
            } catch (e) {}
            return null;
        },

        getActivePhone() {
            if (typeof window !== 'undefined' && window.location && window.location.search) {
                try {
                    const params = new URLSearchParams(window.location.search);
                    const p = params.get('phone') || params.get('stk');
                    if (p) {
                        const cleanP = normalizePhone(p);
                        if (cleanP) return cleanP;
                    }
                    if (params.get('role') === 'driver') {
                        const user = this.getCurrentUser();
                        if (user && user.phone) {
                            const dp = normalizePhone(user.phone);
                            if (dp) return dp;
                        }
                        return '0918765432';
                    }
                } catch(e) {}
            }
            const user = this.getCurrentUser();
            if (!user) return null;
            const uPhone = normalizePhone(user.phone);
            if (uPhone) return uPhone;
            return user.role === 'driver' ? '0918765432' : '0901234567';
        },

        setActivePhone(phone) {
            const clean = normalizePhone(phone);
            if (clean) {
                localStorage.setItem(WALLET_STORAGE_KEYS.ACTIVE_PHONE, clean);
            }
        },

        getWallet(phone) {
            const wallets = this.getAllWallets();
            const cleanPhone = normalizePhone(phone);
            if (!cleanPhone) return null;
            if (wallets[cleanPhone]) return wallets[cleanPhone];
            // Match against any wallet entry whose digits match
            for (const key of Object.keys(wallets)) {
                if (normalizePhone(key) === cleanPhone) {
                    return wallets[key];
                }
            }
            return null;
        },

        getCurrentWallet() {
            const phone = this.getActivePhone();
            if (!phone) return null;
            let wallet = this.getWallet(phone);

            // If user exists but wallet not initialized in storage, create initialized wallet starting with 0 VND
            if (!wallet) {
                const user = this.getCurrentUser();
                const rawName = user ? (user.name || user.fullName || '') : '';
                const role = (phone === '0918765432' || (user && user.role === 'driver')) ? 'driver' : 'customer';
                const defaultName = role === 'driver' ? 'TRAN VAN BINH' : 'NGUYEN VAN AN';
                const cleanName = removeVietnameseTones(rawName) || defaultName;
                
                // Real starting balance: default starts at 0 ₫ (ignore stale mock 500000 or 1250000)
                let seedBal = 0;
                if (user && user.role === role && typeof user.walletBalance === 'number' && user.walletBalance > 0 && 
                    user.walletBalance !== 500000 && user.walletBalance !== 1250000 && 
                    user.walletBalance !== 350000 && user.walletBalance !== 1450000) {
                    seedBal = user.walletBalance;
                }

                wallet = {
                    accountNumber: phone,
                    fullName: cleanName,
                    balance: seedBal,
                    activated: true,
                    role: role,
                    createdAt: new Date().toISOString(),
                    transactions: seedBal > 0 ? [
                        {
                            id: 'TXN_INIT_' + phone,
                            type: 'activation',
                            title: 'Khởi tạo ví NaviPay',
                            amount: seedBal,
                            balanceAfter: seedBal,
                            description: `Ví chính chủ ${cleanName} đã được định danh và kích hoạt thành công`,
                            timestamp: new Date().toISOString(),
                            status: 'success'
                        }
                    ] : []
                };
                const wallets = this.getAllWallets();
                wallets[phone] = wallet;
                this._saveAllWallets(wallets, false);
            }

            // Sync user session walletBalance with current wallet balance if matching role
            const user = this.getCurrentUser();
            if (user && ((wallet.role === 'driver' && user.role === 'driver') || (wallet.role === 'customer' && user.role !== 'driver'))) {
                if (user.walletBalance !== wallet.balance) {
                    user.walletBalance = wallet.balance;
                    try {
                        localStorage.setItem('goride_user', JSON.stringify(user));
                        localStorage.setItem('navigo_user', JSON.stringify(user));
                        if (typeof window.sessionManager !== 'undefined' && window.sessionManager.currentUser) {
                            window.sessionManager.currentUser.walletBalance = wallet.balance;
                        }
                    } catch(e) {}
                }
            }

            return wallet;
        },

        // --- Wallet Activation (Kích hoạt lần đầu) ---
        activateWallet(phone, fullName, initialBalance = 0) {
            const cleanPhone = normalizePhone(phone);
            const cleanName = removeVietnameseTones(fullName);

            if (!cleanPhone) throw new Error('Số tài khoản ví (SĐT) không được để trống.');
            if (!cleanName) throw new Error('Họ và tên chính chủ không được để trống.');

            const wallets = this.getAllWallets();
            let wallet = wallets[cleanPhone];

            if (!wallet) {
                wallet = {
                    accountNumber: cleanPhone,
                    fullName: cleanName,
                    balance: initialBalance,
                    activated: true,
                    role: cleanPhone === '0918765432' ? 'driver' : 'customer',
                    createdAt: new Date().toISOString(),
                    transactions: []
                };
            } else {
                wallet.fullName = cleanName;
                wallet.activated = true;
                if (initialBalance > 0 && wallet.balance === 0) {
                    wallet.balance = initialBalance;
                }
            }

            wallet.transactions.unshift({
                id: 'TXN_ACT_' + Date.now(),
                type: 'activation',
                title: 'Kích hoạt ví NaviPay thành công',
                amount: initialBalance,
                balanceAfter: wallet.balance,
                description: `Ví chính chủ ${cleanName} đã được định danh và bảo vệ 24/7`,
                timestamp: new Date().toISOString(),
                status: 'success'
            });

            wallets[cleanPhone] = wallet;
            this._saveAllWallets(wallets, true);
            this.setActivePhone(cleanPhone);

            // Sync user session
            try {
                const curUser = this.getCurrentUser();
                if (curUser) {
                    curUser.walletBalance = wallet.balance;
                    localStorage.setItem('goride_user', JSON.stringify(curUser));
                    localStorage.setItem('navigo_user', JSON.stringify(curUser));
                    if (typeof window.sessionManager !== 'undefined' && window.sessionManager.currentUser) {
                        window.sessionManager.currentUser.walletBalance = wallet.balance;
                    }
                }
            } catch(e) {}

            return wallet;
        },

        // --- Deposit / Topup (Nạp tiền vào ví) ---
        topup(phone, amount, description = 'Nạp tiền vào ví NaviPay', sourceInfo = 'NaviPay Digital Bank') {
            const cleanPhone = normalizePhone(phone);
            const addAmount = Math.max(0, Math.round(Number(amount) || 0));
            if (addAmount <= 0) throw new Error('Số tiền nạp phải lớn hơn 0 ₫.');

            const wallets = this.getAllWallets();
            let wallet = wallets[cleanPhone] || this.getWallet(cleanPhone);
            if (!wallet) {
                // Auto create and activate if not existed
                const isDrv = cleanPhone === '0918765432';
                wallet = {
                    accountNumber: cleanPhone,
                    fullName: isDrv ? 'TRAN VAN BINH' : 'KHACH HANG NAVIGO',
                    balance: 0,
                    activated: true,
                    role: isDrv ? 'driver' : 'customer',
                    createdAt: new Date().toISOString(),
                    transactions: []
                };
            }

            wallet.balance = (wallet.balance || 0) + addAmount;
            const txnId = 'TXN_TOPUP_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
            const txn = {
                id: txnId,
                type: 'topup',
                title: 'Nạp tiền từ ' + sourceInfo,
                amount: addAmount,
                balanceAfter: wallet.balance,
                description: description || `Nạp ${formatVND(addAmount)} vào ví NaviPay`,
                timestamp: new Date().toISOString(),
                status: 'success',
                sourceInfo: sourceInfo
            };

            wallet.transactions.unshift(txn);
            wallets[cleanPhone] = wallet;
            this._saveAllWallets(wallets, true);

            // Sync user session if active
            try {
                const curUser = this.getCurrentUser();
                if (curUser) {
                    const uPhone = normalizePhone(curUser.phone) || (curUser.role === 'driver' ? '0918765432' : '0901234567');
                    if (uPhone === cleanPhone) {
                        curUser.walletBalance = wallet.balance;
                        localStorage.setItem('goride_user', JSON.stringify(curUser));
                        localStorage.setItem('navigo_user', JSON.stringify(curUser));
                        if (typeof window.sessionManager !== 'undefined' && window.sessionManager.currentUser) {
                            window.sessionManager.currentUser.walletBalance = wallet.balance;
                        }
                    }
                }
            } catch(e) {}

            this._triggerSync('topup', cleanPhone, addAmount);
            return { wallet, transaction: txn };
        },

        // --- Customer Ride Payment (Khách hàng thanh toán chuyến xe) ---
        // "Khách hàng thanh toán cuốc xe sẽ bị trừ tiền trực tiếp vào số dư ví; Tài xế nhận chuyến thì KHÔNG bị trừ tiền."
        payTrip(phone, fareAmount, tripId, tripInfo = {}) {
            const cleanPhone = normalizePhone(phone);
            const fare = Math.max(0, Math.round(Number(fareAmount) || 0));
            if (fare <= 0) return { success: true, message: 'Miễn cước phí chuyến đi.' };

            const wallets = this.getAllWallets();
            const wallet = wallets[cleanPhone] || this.getWallet(cleanPhone);
            if (!wallet) {
                throw new Error('Không tìm thấy thông tin ví NaviPay của khách hàng.');
            }

            if ((wallet.balance || 0) < fare) {
                const missing = fare - (wallet.balance || 0);
                const err = new Error(`Số dư Ví NaviPay không đủ (${formatVND(wallet.balance)}). Cần thêm ${formatVND(missing)} để thanh toán chuyến xe.`);
                err.code = 'INSUFFICIENT_FUNDS';
                err.currentBalance = wallet.balance;
                err.requiredAmount = fare;
                err.missingAmount = missing;
                throw err;
            }

            // Deduct directly from customer wallet
            wallet.balance -= fare;
            const txnId = 'TXN_PAY_' + (tripId || Date.now());
            const pickupName = tripInfo.pickupName || tripInfo.pickup || 'Điểm đón';
            const dropoffName = tripInfo.dropoffName || tripInfo.destination || 'Điểm đến';

            const txn = {
                id: txnId,
                type: 'payment',
                title: `Thanh toán chuyến xe #${tripId || 'TRP'}`,
                amount: -fare,
                balanceAfter: wallet.balance,
                description: `Cước xe di chuyển từ ${pickupName} đến ${dropoffName}`,
                timestamp: new Date().toISOString(),
                status: 'success',
                tripId: tripId,
                extra: tripInfo
            };

            wallet.transactions.unshift(txn);
            wallets[cleanPhone] = wallet;
            this._saveAllWallets(wallets, true);

            // Sync user session
            try {
                const curUser = this.getCurrentUser();
                if (curUser) {
                    const uPhone = normalizePhone(curUser.phone) || (curUser.role === 'driver' ? '0918765432' : '0901234567');
                    if (uPhone === cleanPhone) {
                        curUser.walletBalance = wallet.balance;
                        localStorage.setItem('goride_user', JSON.stringify(curUser));
                        localStorage.setItem('navigo_user', JSON.stringify(curUser));
                        if (typeof window.sessionManager !== 'undefined' && window.sessionManager.currentUser) {
                            window.sessionManager.currentUser.walletBalance = wallet.balance;
                        }
                    }
                }
            } catch(e) {}

            this._triggerSync('trip_paid', cleanPhone, fare);

            // Record customer notification
            if (typeof window.navigoNotifications !== 'undefined' && typeof window.navigoNotifications.addNotification === 'function') {
                window.navigoNotifications.addNotification({
                    id: 'wallet_deduct_' + Date.now(),
                    category: 'trips',
                    title: 'THANH TOÁN THÀNH CÔNG VÍ NAVIPAY',
                    body: `Đã trừ ${formatVND(fare)} cho chuyến xe #${tripId}. Số dư khả dụng hiện tại: ${formatVND(wallet.balance)}.`,
                    icon: '💳',
                    actionUrl: 'wallet.html',
                    actionText: 'Xem ví Navi'
                });
            }

            return { success: true, wallet, transaction: txn };
        },
        // --- Customer Ride Payment Refund (Hoàn tiền khi hủy cuốc xe) ---
        refundTrip(phone, fareAmount, tripId, reason = 'Khách hàng hủy chuyến xe') {
            const cleanPhone = normalizePhone(phone);
            const fare = Math.max(0, Math.round(Number(fareAmount) || 0));
            if (fare <= 0) return { success: true };

            const wallets = this.getAllWallets();
            let wallet = wallets[cleanPhone] || this.getWallet(cleanPhone);
            if (!wallet) return { success: false };

            wallet.balance = (wallet.balance || 0) + fare;
            const txnId = 'TXN_REFUND_' + (tripId || Date.now());
            const txn = {
                id: txnId,
                type: 'refund',
                title: `Hoàn tiền cuốc xe #${tripId || 'TRP'}`,
                amount: fare,
                balanceAfter: wallet.balance,
                description: `Hoàn lại ${formatVND(fare)} do chuyến xe đã hủy (${reason})`,
                timestamp: new Date().toISOString(),
                status: 'success',
                tripId: tripId
            };

            wallet.transactions.unshift(txn);
            wallets[cleanPhone] = wallet;
            this._saveAllWallets(wallets, true);

            try {
                const curUser = this.getCurrentUser();
                if (curUser) {
                    const uPhone = normalizePhone(curUser.phone) || (curUser.role === 'driver' ? '0918765432' : '0901234567');
                    if (uPhone === cleanPhone) {
                        curUser.walletBalance = wallet.balance;
                        localStorage.setItem('goride_user', JSON.stringify(curUser));
                        localStorage.setItem('navigo_user', JSON.stringify(curUser));
                        if (typeof window.sessionManager !== 'undefined' && window.sessionManager.currentUser) {
                            window.sessionManager.currentUser.walletBalance = wallet.balance;
                        }
                    }
                }
            } catch(e) {}

            this._triggerSync('trip_refund', cleanPhone, fare);
            return { success: true, wallet, transaction: txn };
        },


        // --- Driver Trip Income Credit (Tài xế hoàn thành chuyến -> cộng tiền thu nhập, KHÔNG TRỪ TIỀN) ---
        creditDriverTrip(driverPhone, fareAmount, tripId, tripInfo = {}) {
            const cleanPhone = normalizePhone(driverPhone);
            const fare = Math.max(0, Math.round(Number(fareAmount) || 0));
            if (fare <= 0) return null;

            const wallets = this.getAllWallets();
            let wallet = wallets[cleanPhone] || this.getWallet(cleanPhone);
            if (!wallet) {
                wallet = {
                    accountNumber: cleanPhone,
                    fullName: cleanPhone === '0918765432' ? 'TRAN VAN BINH' : 'TAI XE DOI TAC NAVIGO',
                    balance: 0,
                    activated: true,
                    role: 'driver',
                    createdAt: new Date().toISOString(),
                    transactions: []
                };
            }

            // Guarantee idempotency: prevent duplicate crediting for the same trip
            if (tripId && Array.isArray(wallet.transactions)) {
                const already = wallet.transactions.some(t => t && (t.tripId === tripId || (t.id && t.id.includes(tripId))));
                if (already) {
                    return { wallet, alreadyCredited: true };
                }
            }

            wallet.balance = (wallet.balance || 0) + fare;
            const txnId = 'TXN_EARN_' + (tripId || Date.now());
            const txn = {
                id: txnId,
                type: 'income',
                title: `Thu nhập cuốc xe #${tripId || 'TRP'}`,
                amount: fare,
                balanceAfter: wallet.balance,
                description: `Cộng cước xe đối tác từ khách hàng (${tripInfo.customerName || 'Khách hàng'})`,
                timestamp: new Date().toISOString(),
                status: 'success',
                tripId: tripId
            };

            wallet.transactions.unshift(txn);
            wallets[cleanPhone] = wallet;
            this._saveAllWallets(wallets, true);

            // Sync driver user session
            try {
                const curUser = this.getCurrentUser();
                if (curUser) {
                    const uPhone = normalizePhone(curUser.phone) || (curUser.role === 'driver' ? '0918765432' : '0901234567');
                    if (uPhone === cleanPhone || curUser.role === 'driver') {
                        curUser.walletBalance = wallet.balance;
                        localStorage.setItem('goride_user', JSON.stringify(curUser));
                        localStorage.setItem('navigo_user', JSON.stringify(curUser));
                        if (typeof window.sessionManager !== 'undefined' && window.sessionManager.currentUser) {
                            window.sessionManager.currentUser.walletBalance = wallet.balance;
                        }
                    }
                }
            } catch(e) {}

            this._triggerSync('driver_income', cleanPhone, fare);
            return { wallet, transaction: txn };
        },

        // --- Transfer Between Wallets (Chuyển tiền ví - ví) ---
        transfer(fromPhone, toPhone, amount, message = 'Chuyển tiền ví NaviPay') {
            const fPhone = normalizePhone(fromPhone);
            const tPhone = normalizePhone(toPhone);
            const transferAmount = Math.max(0, Math.round(Number(amount) || 0));

            if (!fPhone || !tPhone) throw new Error('Vui lòng nhập đầy đủ SĐT người gửi và người nhận.');
            if (fPhone === tPhone) throw new Error('Không thể tự chuyển tiền cho chính mình.');
            if (transferAmount <= 0) throw new Error('Số tiền chuyển phải lớn hơn 0 ₫.');

            const wallets = this.getAllWallets();
            let senderWallet = wallets[fPhone] || this.getWallet(fPhone);
            if (!senderWallet) throw new Error('Không tìm thấy tài khoản người gửi.');
            if ((senderWallet.balance || 0) < transferAmount) {
                throw new Error(`Số dư không đủ để chuyển (${formatVND(senderWallet.balance)}). Cần: ${formatVND(transferAmount)}.`);
            }

            let receiverWallet = wallets[tPhone] || this.getWallet(tPhone);
            if (!receiverWallet) {
                // Create recipient wallet
                const isDriverSeed = tPhone === '0918765432';
                receiverWallet = {
                    accountNumber: tPhone,
                    fullName: isDriverSeed ? 'TRAN VAN BINH' : ('NGUOI NHAN ' + tPhone),
                    balance: 0,
                    activated: true,
                    role: isDriverSeed ? 'driver' : 'customer',
                    createdAt: new Date().toISOString(),
                    transactions: []
                };
            }

            // Deduct sender
            senderWallet.balance -= transferAmount;
            const senderTxn = {
                id: 'TXN_XFER_OUT_' + Date.now(),
                type: 'transfer_out',
                title: `Chuyển tiền đến ${receiverWallet.fullName}`,
                amount: -transferAmount,
                balanceAfter: senderWallet.balance,
                description: message || `Chuyển tiền đến SĐT ${tPhone}`,
                timestamp: new Date().toISOString(),
                status: 'success',
                recipientPhone: tPhone,
                recipientName: receiverWallet.fullName
            };
            senderWallet.transactions.unshift(senderTxn);

            // Credit receiver
            receiverWallet.balance = (receiverWallet.balance || 0) + transferAmount;
            const receiverTxn = {
                id: 'TXN_XFER_IN_' + Date.now(),
                type: 'transfer_in',
                title: `Nhận tiền từ ${senderWallet.fullName}`,
                amount: transferAmount,
                balanceAfter: receiverWallet.balance,
                description: message || `Nhận tiền từ SĐT ${fPhone}`,
                timestamp: new Date().toISOString(),
                status: 'success',
                senderPhone: fPhone,
                senderName: senderWallet.fullName
            };
            receiverWallet.transactions.unshift(receiverTxn);

            wallets[fPhone] = senderWallet;
            wallets[tPhone] = receiverWallet;
            this._saveAllWallets(wallets, true);

            // Synchronize active session user walletBalance in storage if receiver or sender is active
            try {
                const curUser = this.getCurrentUser();
                if (curUser) {
                    const uPhone = normalizePhone(curUser.phone) || (curUser.role === 'driver' ? '0918765432' : '0901234567');
                    if (uPhone === tPhone) {
                        curUser.walletBalance = receiverWallet.balance;
                        localStorage.setItem('goride_user', JSON.stringify(curUser));
                        localStorage.setItem('navigo_user', JSON.stringify(curUser));
                        if (typeof window.sessionManager !== 'undefined' && window.sessionManager.currentUser) {
                            window.sessionManager.currentUser.walletBalance = receiverWallet.balance;
                        }
                    } else if (uPhone === fPhone) {
                        curUser.walletBalance = senderWallet.balance;
                        localStorage.setItem('goride_user', JSON.stringify(curUser));
                        localStorage.setItem('navigo_user', JSON.stringify(curUser));
                        if (typeof window.sessionManager !== 'undefined' && window.sessionManager.currentUser) {
                            window.sessionManager.currentUser.walletBalance = senderWallet.balance;
                        }
                    }
                }
            } catch(e) {}

            this._triggerSync('transfer', tPhone, transferAmount);

            // In-app notification
            try {
                if (typeof window.navigoNotifications !== 'undefined' && typeof window.navigoNotifications.addNotification === 'function') {
                    window.navigoNotifications.addNotification({
                        id: 'notif_transfer_' + Date.now(),
                        category: 'promotions',
                        title: 'NHẬN TIỀN VÍ NAVIPAY THÀNH CÔNG',
                        body: `Bạn vừa nhận được +${formatVND(transferAmount)} từ ${senderWallet.fullName} (${fPhone}). Số dư mới: ${formatVND(receiverWallet.balance)}.`,
                        icon: '💸',
                        actionUrl: 'wallet.html',
                        actionText: 'Kiểm tra ví'
                    });
                }
            } catch(e) {}

            return { senderWallet, receiverWallet, senderTxn, receiverTxn };
        },

        // --- Withdraw from Wallet to Linked Bank Account (Rút tiền) ---
        withdraw(phone, amount, bankAccountInfo = {}) {
            const cleanPhone = normalizePhone(phone);
            const withdrawAmount = Math.max(0, Math.round(Number(amount) || 0));
            if (withdrawAmount <= 0) throw new Error('Số tiền rút phải lớn hơn 0 ₫.');

            const wallets = this.getAllWallets();
            const wallet = wallets[cleanPhone] || this.getWallet(cleanPhone);
            if (!wallet) throw new Error('Không tìm thấy thông tin ví.');
            if ((wallet.balance || 0) < withdrawAmount) {
                throw new Error(`Số dư không đủ để rút (${formatVND(wallet.balance)}). Cần: ${formatVND(withdrawAmount)}.`);
            }

            wallet.balance -= withdrawAmount;
            const bankName = bankAccountInfo.bankName || 'NaviPay Digital Bank';
            const bankAcc = bankAccountInfo.accountNumber || '999988886666';

            const txn = {
                id: 'TXN_WITHDRAW_' + Date.now(),
                type: 'withdraw',
                title: `Rút tiền về ${bankName}`,
                amount: -withdrawAmount,
                balanceAfter: wallet.balance,
                description: `Rút về STK ${bankAcc} (${wallet.fullName})`,
                timestamp: new Date().toISOString(),
                status: 'success'
            };

            wallet.transactions.unshift(txn);
            wallets[cleanPhone] = wallet;

            // Also credit the bank account
            const bank = this.getBankAccount();
            bank.balance += withdrawAmount;
            bank.transactions.unshift({
                id: 'BNK_DEPOSIT_' + Date.now(),
                type: 'credit',
                title: `Nhận tiền rút từ Ví Navi (${wallet.fullName})`,
                amount: withdrawAmount,
                balanceAfter: bank.balance,
                description: `Chuyển về từ ví SĐT ${cleanPhone}`,
                timestamp: new Date().toISOString(),
                status: 'success'
            });
            this.saveBankAccount(bank);

            this._saveAllWallets(wallets, true);
            this._triggerSync('withdraw', cleanPhone, withdrawAmount);
            return { wallet, transaction: txn };
        },

        // =========================================================================
        // 7. DIGITAL BANK ENGINE (NAVIPAY DIGITAL BANK - 100 TRIỆU SẴN CÓ)
        // =========================================================================
        getBankAccount() {
            try {
                const raw = localStorage.getItem(WALLET_STORAGE_KEYS.BANK_ACCOUNT);
                if (raw) {
                    const parsed = JSON.parse(raw);
                    if (parsed && typeof parsed.balance === 'number') return parsed;
                }
            } catch (e) {
                console.error('[NaviWalletEngine] Error reading bank account:', e);
            }
            const defaultBank = getDefaultBankAccount();
            this.saveBankAccount(defaultBank);
            return defaultBank;
        },

        saveBankAccount(bank) {
            try {
                localStorage.setItem(WALLET_STORAGE_KEYS.BANK_ACCOUNT, JSON.stringify(bank));
            } catch (e) {
                console.error('[NaviWalletEngine] Error saving bank account:', e);
            }
        },

        resetBankAccount() {
            const freshBank = getDefaultBankAccount();
            this.saveBankAccount(freshBank);
            this._triggerSync('bank_reset', null, 100000000);
            return freshBank;
        },

        // --- Bank transfer directly into Navi Wallet ---
        // "Sau khi quét: Tự động trích xuất Tên người nhận, SĐT/STK ví, Số tiền cần nạp.
        // Bấm 'Xác nhận chuyển': Trừ tiền tài khoản ngân hàng ảo và cộng tiền tức thì vào Ví Navi."
        transferFromBankToWallet(targetPhone, targetName, amount, note = '') {
            const cleanPhone = normalizePhone(targetPhone);
            const cleanName = removeVietnameseTones(targetName) || 'NGUYEN VAN AN';
            const transferAmount = Math.max(0, Math.round(Number(amount) || 0));

            if (!cleanPhone) throw new Error('Số điện thoại/STK ví thụ hưởng không hợp lệ.');
            if (transferAmount <= 0) throw new Error('Số tiền nạp phải lớn hơn 0 ₫.');

            const bank = this.getBankAccount();
            if (bank.balance < transferAmount) {
                throw new Error(`Số dư tài khoản ngân hàng nguồn không đủ (${formatVND(bank.balance)}). Cần chuyển: ${formatVND(transferAmount)}.`);
            }

            // 1. Deduct Bank account balance
            bank.balance -= transferAmount;
            const bankTxnId = 'BNK_TXN_' + Date.now();
            const bankTxn = {
                id: bankTxnId,
                type: 'debit',
                title: `Chuyển nạp Ví Navi: ${cleanName}`,
                amount: -transferAmount,
                balanceAfter: bank.balance,
                description: note || `Nạp tiền Ví NaviPay SĐT ${cleanPhone} (${cleanName})`,
                timestamp: new Date().toISOString(),
                status: 'success',
                targetPhone: cleanPhone,
                targetName: cleanName
            };
            bank.transactions.unshift(bankTxn);
            this.saveBankAccount(bank);

            // 2. Credit target Wallet immediately
            const wallets = this.getAllWallets();
            let wallet = wallets[cleanPhone] || this.getWallet(cleanPhone);
            if (!wallet) {
                const isDrv = cleanPhone === '0918765432';
                wallet = {
                    accountNumber: cleanPhone,
                    fullName: cleanName,
                    balance: 0,
                    activated: true,
                    role: isDrv ? 'driver' : 'customer',
                    createdAt: new Date().toISOString(),
                    transactions: []
                };
            }

            wallet.balance = (wallet.balance || 0) + transferAmount;
            const walletTxnId = 'TXN_BANK_TOPUP_' + Date.now();
            const walletTxn = {
                id: walletTxnId,
                type: 'topup',
                title: 'Nạp tiền từ NaviPay Digital Bank',
                amount: transferAmount,
                balanceAfter: wallet.balance,
                description: note || `Nạp tiền từ Thẻ ATM NaviPay (${bank.accountNumber})`,
                timestamp: new Date().toISOString(),
                status: 'success',
                sourceBank: bank.bankName,
                sourceAccount: bank.accountNumber
            };
            wallet.transactions.unshift(walletTxn);
            wallets[cleanPhone] = wallet;
            this._saveAllWallets(wallets, true);

            // Sync user session
            try {
                const curUser = this.getCurrentUser();
                if (curUser) {
                    const uPhone = normalizePhone(curUser.phone) || (curUser.role === 'driver' ? '0918765432' : '0901234567');
                    if (uPhone === cleanPhone) {
                        curUser.walletBalance = wallet.balance;
                        localStorage.setItem('goride_user', JSON.stringify(curUser));
                        localStorage.setItem('navigo_user', JSON.stringify(curUser));
                        if (typeof window.sessionManager !== 'undefined' && window.sessionManager.currentUser) {
                            window.sessionManager.currentUser.walletBalance = wallet.balance;
                        }
                    }
                }
            } catch(e) {}

            // 3. Fire real-time cross-tab sync triggers
            this._triggerSync('bank_topup', cleanPhone, transferAmount);

            return {
                success: true,
                bankBalance: bank.balance,
                walletBalance: wallet.balance,
                bankTransaction: bankTxn,
                walletTransaction: walletTxn
            };
        },

        // =========================================================================
        // 8. QR CODE PROTOCOL SPECIFICATION
        // =========================================================================
        createTopupQRPayload(phone, name, amount, note = 'Nap tien Vi NaviPay') {
            const cleanPhone = normalizePhone(phone);
            const cleanName = removeVietnameseTones(name);
            const numAmount = Math.max(0, Math.round(Number(amount) || 0));

            const data = {
                app: 'NAVIPAY',
                type: 'TOPUP',
                phone: cleanPhone,
                name: cleanName,
                amount: numAmount,
                note: note,
                ts: Date.now()
            };
            return JSON.stringify(data);
        },

        parseQRPayload(rawText) {
            if (!rawText || typeof rawText !== 'string') return null;
            const str = rawText.trim();

            // Format A: JSON object
            try {
                if (str.startsWith('{') && str.endsWith('}')) {
                    const parsed = JSON.parse(str);
                    const p = normalizePhone(parsed.phone || parsed.accountNumber);
                    if (p) {
                        return {
                            type: parsed.type || 'TOPUP',
                            phone: p,
                            name: removeVietnameseTones(parsed.name || parsed.fullName || ''),
                            amount: Number(parsed.amount) || 0,
                            note: parsed.note || parsed.message || 'Nap tien Vi NaviPay'
                        };
                    }
                }
            } catch (e) {}

            // Format B: URI scheme (navipay://topup?phone=...&name=...&amount=...)
            if (str.toLowerCase().startsWith('navipay:') || str.includes('?phone=')) {
                try {
                    const url = new URL(str.replace(/^navipay:\/\//i, 'http://dummy.io/'));
                    const params = url.searchParams;
                    const p = normalizePhone(params.get('phone') || params.get('stk') || '');
                    if (p) {
                        return {
                            type: 'TOPUP',
                            phone: p,
                            name: removeVietnameseTones(params.get('name') || ''),
                            amount: Number(params.get('amount')) || 0,
                            note: params.get('note') || 'Nap tien Vi NaviPay'
                        };
                    }
                } catch (e) {}
            }

            // Format C: Plain phone number or compact delimited text
            // e.g. "NAVIPAY|0901234567|NGUYEN VAN AN|200000"
            if (str.includes('|')) {
                const parts = str.split('|');
                const p = normalizePhone(parts[1] || parts[0]);
                if (p) {
                    return {
                        type: 'TOPUP',
                        phone: p,
                        name: removeVietnameseTones(parts[2] || ''),
                        amount: Number(parts[3]) || 0,
                        note: parts[4] || 'Nap tien Vi NaviPay'
                    };
                }
            }

            // Fallback: If it contains 9-11 digits
            const digits = normalizePhone(str);
            if (digits.length >= 9 && digits.length <= 11) {
                return {
                    type: 'TOPUP',
                    phone: digits,
                    name: '',
                    amount: 0,
                    note: 'Nap tien Vi NaviPay'
                };
            }

            return null;
        }
    };

    // Export globally
    window.NaviWalletEngine = NaviWalletEngine;
    window.removeVietnameseTones = removeVietnameseTones;
    window.formatVND = formatVND;
    window.normalizePhone = normalizePhone;

})(typeof window !== 'undefined' ? window : this);
