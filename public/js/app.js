const $ = (id) => document.getElementById(id);

const ICONS = {
    view: `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>`,
    edit: `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>`,
    delete: `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>`,
    link: `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>`
};

// API Helper Functions
function apiPost(url, body) {
    return fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    }).then(res => res.json());
}

function apiGet(url) {
    return fetch(url).then(res => res.json());
}

let ORGANIZATION_DATA = {};
let isLoggedIn = false, userRole = "user", currentUserName = "Guest", currentUserFullName = "";
let currentView = 'home', currentEditOriginalID = null, assetToDeleteID = null;
let isImageDeleted = false, isAuditImageDeleted = false;
const itemsPerPage = 20, auditItemsPerPage = 20;
let sortConfig = { key: null, direction: 'asc' };
let auditSortConfig = { key: null, direction: 'asc' };

// Data Variables
let allData = [];
let currentData = [];
let currentPage = 1;
let auditDataCache = [];
let auditFilteredData = [];
let auditCurrentPage = 1;
let currentAuditFilter = 'all';

const views = {
    home: $('home-view'),
    list: $('list-view'),
    dashboard: $('dashboard-view'),
    audit: $('audit-view')
};

let inactivityTimer;
// Auto Logout 10 นาที (ตามที่ตั้งค่าไว้ก่อนหน้านี้)
const INACTIVITY_LIMIT = 10 * 60 * 1000;

// Theme Handling
function toggleTheme() {
    const html = document.documentElement;
    const isDark = html.classList.contains('dark');
    if (isDark) {
        html.classList.remove('dark');
        localStorage.setItem('theme', 'light');
        $('icon-sun').classList.add('hidden');
        $('icon-moon').classList.remove('hidden');
    } else {
        html.classList.add('dark');
        localStorage.setItem('theme', 'dark');
        $('icon-sun').classList.remove('hidden');
        $('icon-moon').classList.add('hidden');
    }
    updateChartsTheme();
}

function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    const html = document.documentElement;
    if (savedTheme === 'dark') {
        html.classList.add('dark');
        $('icon-sun').classList.remove('hidden');
        $('icon-moon').classList.add('hidden');
    } else {
        html.classList.remove('dark');
        $('icon-sun').classList.add('hidden');
        $('icon-moon').classList.remove('hidden');
    }
}

// ฟังก์ชันเปิด/ปิด Modal ประมวลผล
function showProcessModal(title, msg) {
    $('process-title').textContent = title || "กำลังประมวลผล...";
    $('process-message').textContent = msg || "กรุณารอสักครู่...";
    $('processing-modal').classList.remove('hidden');
}

function hideProcessModal() {
    // หน่วงเวลานิดนึงเพื่อให้คนเห็นว่าเสร็จแล้ว (Optional)
    setTimeout(() => {
        $('processing-modal').classList.add('hidden');
    }, 500);
}

function updateChartsTheme() {
    if (currentView === 'dashboard') renderDashboard();
}

document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    $('themeToggleBtn').addEventListener('click', toggleTheme);

    restoreSession();

    // --- Logic ช่องค้นหาใหญ่ (หน้า Home) ---
    const bigSearch = $('bigSearchBox');
    if (bigSearch) {
        bigSearch.addEventListener('input', (e) => {
            const val = e.target.value;
            if (val.trim().length > 0) {
                // สลับไปหน้า List ทันทีเมื่อพิมพ์
                switchView('list');
                const mainSearch = $('searchBox');
                mainSearch.value = val;
                // เรียกฟังก์ชันกรอง
                applyAllFilters();
                mainSearch.focus();
            }
        });
    }

    fetchOrganizationData().then(() => {
        populateOrgDropdowns();
    });
    const currentYear = new Date().getFullYear() + 543;
    for (let y = currentYear + 1; y >= currentYear - 2; y--) { const opt = document.createElement('option'); opt.value = y; opt.textContent = `ปีงบ ${y}`; $('auditYearSelect').appendChild(opt); }
    $('auditYearSelect').value = currentYear;

    // Setup activity listeners
    ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'].forEach(evt => {
        document.addEventListener(evt, () => {
            if (isLoggedIn) resetInactivityTimer();
        });
    });

    $('location').addEventListener('change', function () { updateDeptList(this.value, 'departmentList', 'department'); });
    $('audit-location').addEventListener('change', function () { updateDeptList(this.value, 'auditDepartmentList', 'audit-department'); });
    $('auditSearchBox').addEventListener('input', filterAuditTable);
    ['card-audit-total', 'card-audit-counted', 'card-audit-missing'].forEach((id, idx) => $(id).addEventListener('click', () => setAuditFilter(['all', 'counted', 'missing'][idx])));
    $('auditPrevPage').addEventListener('click', () => { if (auditCurrentPage > 1) { auditCurrentPage--; renderAuditTable(); } });
    $('auditNextPage').addEventListener('click', () => { if (auditCurrentPage < Math.ceil(auditFilteredData.length / auditItemsPerPage)) { auditCurrentPage++; renderAuditTable(); } });
    $('cancelButton').addEventListener('click', () => $('form-modal').classList.add('hidden'));
    $('closeModalIcon').addEventListener('click', () => $('form-modal').classList.add('hidden'));

    $('exportButton').addEventListener('click', () => {
        if (currentView === 'audit') {
            if (auditDataCache.length === 0) return showAlert("แจ้งเตือน", "ไม่มีข้อมูลการนับ");

            showProcessModal("กำลังส่งออก Excel", "ระบบกำลังสร้างไฟล์รายงานการนับ...");

            // ใช้ setTimeout เพื่อให้ UI render Modal ก่อนเริ่มงานหนัก
            setTimeout(() => {
                try {
                    const ws = XLSX.utils.json_to_sheet(auditDataCache);
                    const wb = XLSX.utils.book_new();
                    XLSX.utils.book_append_sheet(wb, ws, "Audit_Data");
                    XLSX.writeFile(wb, `Audit_Report_${$('auditYearSelect').value}.xlsx`);
                    hideProcessModal();
                } catch (e) {
                    hideProcessModal();
                    showAlert("ผิดพลาด", e.message);
                }
            }, 500);

        } else {
            if (allData.length === 0) return showAlert("แจ้งเตือน", "ไม่มีข้อมูลครุภัณฑ์");

            showProcessModal("กำลังส่งออก Excel", "ระบบกำลังเตรียมข้อมูลครุภัณฑ์ทั้งหมด...");

            setTimeout(() => {
                try {
                    const exportData = allData.map(item => ({
                        AssetID: item.assetID,
                        DeviceName: item.deviceName,
                        Model: item.model,
                        Brand: item.brand,
                        Division: item.division,
                        Department: item.department,
                        User: item.user,
                        Status: item.status,
                        QRCodeURL: item.qrCodeUrl,
                        Remark: item.remark,
                        ImageURL: item.assetImage,
                        Floor: item.floor
                    }));
                    const ws = XLSX.utils.json_to_sheet(exportData);
                    const wb = XLSX.utils.book_new();
                    XLSX.utils.book_append_sheet(wb, ws, "Inventory_Data");
                    XLSX.writeFile(wb, "Inventory_Export.xlsx");
                    hideProcessModal();
                } catch (e) {
                    hideProcessModal();
                    showAlert("ผิดพลาด", e.message);
                }
            }, 500);
        }
    });

    $('exportAuditBtnDirect').addEventListener('click', () => {
        if (auditDataCache.length === 0) return showAlert("แจ้งเตือน", "ไม่มีข้อมูลการนับ");
        const ws = XLSX.utils.json_to_sheet(auditDataCache);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Audit_Data");
        XLSX.writeFile(wb, `Audit_Report_${$('auditYearSelect').value}.xlsx`);
    });

    // --- Import Logic ---
    const btnImport = $('importButton');
    const fileInput = $('excelInput');
    if (btnImport && fileInput) {
        btnImport.addEventListener('click', () => {
            fileInput.click();
        });

        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            showProcessModal("กำลังนำเข้าข้อมูล", "ระบบกำลังอ่านไฟล์และบันทึกข้อมูล...");

            const formData = new FormData();
            formData.append('file', file);
            formData.append('user', currentUserFullName || currentUserName);

            fetch('/api/import', {
                method: 'POST',
                body: formData
            })
                .then(response => response.json())
                .then(res => {
                    hideProcessModal();
                    fileInput.value = ''; // Reset
                    if (res.status === 'success') {
                        showAlert("นำเข้าสำเร็จ", res.message);
                        fetchData(); // Refresh data
                    } else {
                        showAlert("ผิดพลาด", res.message);
                    }
                })
                .catch(err => {
                    hideProcessModal();
                    fileInput.value = '';
                    showAlert("Error", err.message);
                });
        });
    }

    // --- SAFE LOGIC FOR BUTTONS THAT MIGHT NOT EXIST ---

    // 1. Delete All Button logic
    const btnDeleteAll = $('deleteAllButton');
    if (btnDeleteAll) {
        // เปลี่ยนจาก confirm() เป็นเปิด Modal
        btnDeleteAll.addEventListener('click', () => {
            $('delete-all-modal').classList.remove('hidden');
        });
    }

    // เพิ่ม Event ให้ปุ่ม "ยืนยัน" ใน Modal ใหม่
    $('confirm-delete-all-btn').addEventListener('click', () => {
        const btn = $('confirm-delete-all-btn');
        const originalContent = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = `<svg class="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> กำลังลบ...`;

        apiPost('/api/delete-all', { user: currentUserFullName || currentUserName })
            .then(res => {
                btn.disabled = false;
                btn.innerHTML = originalContent;
                $('delete-all-modal').classList.add('hidden'); // ปิด Modal
                if (res.status === 'success') {
                    fetchData();
                    showAlert("สำเร็จ", res.message);
                } else {
                    showAlert("ผิดพลาด", res.message);
                }
            })
            .catch(err => {
                // Handle error if needed, though original didn't have failure handler here
                console.error(err);
                btn.disabled = false;
                btn.innerHTML = originalContent;
                $('delete-all-modal').classList.add('hidden');
                showAlert("Error", err.message);
            });
    });

    // 2. Audit Select All Checkbox (Defensive Check)
    const chkAuditSelectAll = $('auditSelectAll');
    if (chkAuditSelectAll) {
        chkAuditSelectAll.addEventListener('change', (e) => {
            document.querySelectorAll('.audit-row-checkbox').forEach(c => c.checked = e.target.checked);
        });
    }
    // --- Logic สำหรับปุ่ม Clear Cache แบบ Modal สวยงาม ---

    const btnClearCache = $('clearCacheButton');
    const btnConfirmClearCache = $('confirm-clear-cache-btn');

    // 1. เมื่อกดปุ่มไม้กวาด (Clear Cache) -> ให้เปิด Modal
    if (btnClearCache) {
        // ลบ Event Listener เก่าไม่ได้ทาง Code ง่ายๆ ดังนั้นต้องมั่นใจว่าลบโค้ดเก่าในไฟล์ทิ้งแล้ว
        // หรือใช้วิธี Clone Node เพื่อล้าง Event เก่า (ทางเลือกเสริม)
        // const newBtn = btnClearCache.cloneNode(true);
        // btnClearCache.parentNode.replaceChild(newBtn, btnClearCache);

        btnClearCache.addEventListener('click', () => {
            // เปิด Modal ชื่อ 'clear-cache-modal'
            $('clear-cache-modal').classList.remove('hidden');
        });
    }

    // 2. เมื่อกดปุ่ม "ยืนยันลบ" (ใน Modal) -> ค่อยส่งคำสั่งไป Server
    if (btnConfirmClearCache) {
        btnConfirmClearCache.addEventListener('click', () => {
            const btn = btnConfirmClearCache;
            const originalText = btn.innerHTML;

            // เปลี่ยนสถานะปุ่มเป็น Loading
            btn.disabled = true;
            btn.innerHTML = `<svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> กำลังลบ...`;

            apiPost('/api/clear-cache', { user: currentUserFullName || currentUserName })
                .then(res => {
                    // คืนค่าปุ่มและปิด Modal
                    btn.disabled = false;
                    btn.innerHTML = originalText;
                    $('clear-cache-modal').classList.add('hidden');

                    if (res.status === 'success') {
                        showAlert("สำเร็จ", res.message);
                    } else {
                        showAlert("แจ้งเตือน", res.message);
                    }
                })
                .catch(err => {
                    btn.disabled = false;
                    btn.innerHTML = originalText;
                    $('clear-cache-modal').classList.add('hidden');
                    showAlert("ข้อผิดพลาด", err.message);
                });
        });
    }
    // 3. PDF Generate Button (Defensive Check)
    const btnPDF = $('btnGenPDF');
    if (btnPDF) {
        btnPDF.addEventListener('click', () => {
            // Check if selection logic is active (checkboxes exist?)
            const checkboxes = document.querySelectorAll('.audit-row-checkbox:checked');
            const selectedIds = Array.from(checkboxes).map(c => c.value);
            const year = $('auditYearSelect').value;

            const oldText = btnPDF.innerHTML;
            btnPDF.disabled = true;
            btnPDF.innerHTML = 'สร้าง PDF...';

            apiPost('/api/generate-pdf', { year, selectedIds })
                .then(res => {
                    btnPDF.disabled = false;
                    btnPDF.innerHTML = oldText;
                    if (res.status === 'success') window.open(res.url, '_blank');
                    else showAlert("ผิดพลาด", res.message);
                })
                .catch(err => {
                    btnPDF.disabled = false;
                    btnPDF.innerHTML = oldText;
                    showAlert("Error", err.message);
                });
        });
    }

    // --- Print QR Button Logic ---
    const btnPrintQR = $('printQRButton');
    if (btnPrintQR) {
        btnPrintQR.addEventListener('click', () => {
            const checkboxes = document.querySelectorAll('.row-checkbox:checked');
            if (checkboxes.length === 0) {
                return showAlert("แจ้งเตือน", "กรุณาเลือกรายการที่ต้องการพิมพ์ QR Code");
            }
            const selectedIds = Array.from(checkboxes).map(c => c.value);
            localStorage.setItem('asset_print_selection', JSON.stringify(selectedIds));
            window.open('Print.html', '_blank');
        });
    }

    // 4. Backup Button (Defensive Check)
    $('backupButton').addEventListener('click', () => {
        const btn = $('backupButton');
        btn.disabled = true;

        showProcessModal("กำลังสำรองข้อมูล", "ระบบกำลังดึงข้อมูลทั้งหมดจาก Server...");

        apiGet('/api/backup')
            .then(res => {
                btn.disabled = false;
                if (res.status === 'success') {
                    // เปลี่ยนข้อความใน Modal ว่ากำลังสร้างไฟล์
                    $('process-title').textContent = "กำลังสร้างไฟล์...";

                    setTimeout(() => {
                        try {
                            const wb = XLSX.utils.book_new();
                            for (const [k, v] of Object.entries(res.data)) {
                                XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(v), k);
                            }
                            XLSX.writeFile(wb, `Backup_${dayjs().format('YYYYMMDD_HHmm')}.xlsx`);
                            hideProcessModal();
                            showAlert("สำเร็จ", "ดาวน์โหลด Backup เรียบร้อยแล้ว");
                        } catch (e) {
                            hideProcessModal();
                            showAlert("ผิดพลาด", "สร้างไฟล์ไม่สำเร็จ: " + e.message);
                        }
                    }, 100);
                } else {
                    hideProcessModal();
                    showAlert("ผิดพลาด", res.message);
                }
            })
            .catch(err => {
                btn.disabled = false;
                hideProcessModal();
                showAlert("Server Error", err.message);
            });
    });

    // Old Import Logic Removed - Replaced by FormData upload above
    // $('importButton').addEventListener('click', () => $('excelInput').click());
    // $('excelInput').addEventListener('change', (e) => { ... });

    $('printQRButton').addEventListener('click', () => { const selected = Array.from(document.querySelectorAll('.row-checkbox:checked')).map(c => c.value); if (selected.length === 0) return showAlert("แจ้งเตือน", "เลือกรายการก่อน"); localStorage.setItem('asset_print_selection', JSON.stringify(selected)); window.open(WEB_APP_URL + '?page=print', '_blank'); });
    $('selectAll').addEventListener('change', (e) => { document.querySelectorAll('.row-checkbox').forEach(c => c.checked = e.target.checked); updateSelectionState(); });
    $('prevPage').addEventListener('click', () => { if (currentPage > 1) { currentPage--; renderTable(); } });
    $('nextPage').addEventListener('click', () => { if (currentPage < Math.ceil(currentData.length / itemsPerPage)) { currentPage++; renderTable(); } });
    $('searchBox').addEventListener('input', (e) => { currentData = allData.filter(item => Object.values(item).some(val => String(val).toLowerCase().includes(e.target.value.toLowerCase()))); currentPage = 1; renderTable(); });
    $('auditYearSelect').addEventListener('change', fetchAuditReport);
    $('addYearBtn').addEventListener('click', handleAddYear);
    $('delete-image-btn').addEventListener('click', () => { $('asset-image-preview-container').classList.add('hidden'); $('asset-image-input').value = ""; isImageDeleted = true; });
    $('asset-image-input').addEventListener('change', (e) => { if (e.target.files[0]) { isImageDeleted = false; const r = new FileReader(); r.onload = (ev) => { $('asset-image-img').src = ev.target.result; $('asset-image-preview-container').classList.remove('hidden'); }; r.readAsDataURL(e.target.files[0]); } });
    $('audit-delete-image-btn').addEventListener('click', () => { $('audit-image-preview-container').classList.add('hidden'); $('audit-file-input').value = ""; isAuditImageDeleted = true; });
    $('audit-file-input').addEventListener('change', (e) => { if (e.target.files[0]) { isAuditImageDeleted = false; const r = new FileReader(); r.onload = (ev) => { $('audit-image-img').src = ev.target.result; $('audit-image-preview-container').classList.remove('hidden'); }; r.readAsDataURL(e.target.files[0]); } });
    $('audit-cancel-btn').addEventListener('click', () => $('audit-modal').classList.add('hidden'));
    $('audit-confirm-btn').addEventListener('click', submitAuditForm);
    // Event Listener ปุ่มลบการตรวจนับ
    // Event Listener ปุ่มลบการตรวจนับ (ใน Audit Modal ใหญ่)
    $('audit-delete-entry-btn').addEventListener('click', () => {
        // เปลี่ยนจาก confirm() เป็นเปิด Modal ยืนยันอันเล็ก
        $('delete-audit-modal').classList.remove('hidden');
    });

    // เพิ่ม Event ให้ปุ่ม "ยืนยัน" ใน Modal ลบการตรวจนับ
    $('confirm-delete-audit-btn').addEventListener('click', () => {
        const btn = $('confirm-delete-audit-btn');
        const originalText = btn.textContent;
        btn.disabled = true;
        btn.textContent = "กำลังลบ...";

        const id = $('audit-asset-id').textContent;
        const year = $('audit-modal-year').textContent;

        apiPost('/api/delete-audit', { id, year, user: currentUserFullName || currentUserName })
            .then(res => {
                btn.disabled = false;
                btn.textContent = originalText;
                $('delete-audit-modal').classList.add('hidden'); // ปิด Modal ยืนยัน

                if (res.status === 'success') {
                    $('audit-modal').classList.add('hidden'); // ปิด Modal Audit ใหญ่ด้วย
                    showAlert("สำเร็จ", res.message);

                    // รีเฟรชข้อมูล
                    if (currentView === 'audit') fetchAuditReport();
                    fetchData();
                } else {
                    showAlert("ผิดพลาด", res.message);
                }
            })
            .catch(err => {
                btn.disabled = false;
                btn.textContent = originalText;
                $('delete-audit-modal').classList.add('hidden');
                showAlert("Error", err.message);
            });
    });
    // --- [แก้ใหม่] Logic การลบหลายรายการด้วย Modal สวยๆ ---
    $('btnDeleteSelected').addEventListener('click', () => {
        const checkedBoxes = document.querySelectorAll('.row-checkbox:checked');
        const count = checkedBoxes.length;

        if (count === 0) return;

        // อัปเดตตัวเลขใน Modal
        $('batch-delete-count').textContent = count;

        // เปิด Modal
        $('batch-delete-modal').classList.remove('hidden');
    });

    // Event ปุ่มยืนยันใน Modal Batch Delete
    $('confirm-batch-delete-btn').addEventListener('click', () => {
        const ids = Array.from(document.querySelectorAll('.row-checkbox:checked')).map(c => c.value);
        const btn = $('confirm-batch-delete-btn');
        const originalText = btn.innerHTML;

        // เปลี่ยนสถานะปุ่มเป็น Loading
        btn.disabled = true;
        btn.innerHTML = `<svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> กำลังลบ...`;

        apiPost('/api/batch-delete', { ids, user: currentUserFullName || currentUserName })
            .then(res => {
                btn.disabled = false;
                btn.innerHTML = originalText;
                $('batch-delete-modal').classList.add('hidden'); // ปิด Modal

                if (res.status === 'success') {
                    updateSelectionState(); // รีเซ็ต Checkbox
                    fetchData(); // โหลดตารางใหม่
                    showAlert("สำเร็จ", res.message);
                } else {
                    showAlert("ผิดพลาด", res.message);
                }
            })
            .catch(err => {
                btn.disabled = false;
                btn.innerHTML = originalText;
                $('batch-delete-modal').classList.add('hidden');
                showAlert("Error", err.message);
            });
    });

    $('asset-table-body').addEventListener('click', (e) => {
        if (e.target.classList.contains('row-checkbox')) { updateSelectionState(); return; }
        const btn = e.target.closest('button'); if (!btn) return;
        const id = btn.dataset.id;
        if (btn.classList.contains('view-btn')) showForm('view', id);
        else if (btn.classList.contains('edit-btn')) showForm('edit', id);
        else if (btn.classList.contains('delete-btn')) { assetToDeleteID = id; $('confirm-modal').classList.remove('hidden'); }
        else if (btn.classList.contains('audit-btn')) openAuditModalFromTable(allData.find(r => String(r.assetID) === String(id)));
    });
    $('audit-table-body').addEventListener('click', (e) => { const btn = e.target.closest('button'); if (btn && btn.classList.contains('audit-edit-btn')) { e.stopPropagation(); openAuditEditModal(auditFilteredData.find(x => String(x.assetID) === String(btn.dataset.id))); } });

    $('loginButton').addEventListener('click', () => $('login-screen').classList.remove('hidden'));
    $('closeLoginBtn').addEventListener('click', () => $('login-screen').classList.add('hidden'));

    // Logic ปุ่มเปิด/ปิดรหัสผ่าน
    $('togglePasswordBtn').addEventListener('click', () => {
        const passwordInput = $('login-password');
        const eyeIcon = $('eye-icon');
        const isPassword = passwordInput.type === 'password';
        passwordInput.type = isPassword ? 'text' : 'password';
        if (isPassword) {
            eyeIcon.innerHTML = `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />`;
        } else {
            eyeIcon.innerHTML = `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />`;
        }
    });

    $('login-form').addEventListener('submit', (e) => {
        e.preventDefault();

        // 1. เรียกใช้ Modal Loading ที่เราเพิ่งทำ
        showProcessModal("กำลังเข้าสู่ระบบ", "ระบบกำลังยืนยันตัวตนกับ QSHC...");

        // ซ่อน Error เก่า (ถ้ามี)
        $('login-error').classList.add('hidden');

        apiPost('/api/login', { username: $('login-username').value, password: $('login-password').value })
            .then(res => {
                // 2. ปิด Modal เมื่อเสร็จ
                hideProcessModal();

                if (res.success) {
                    isLoggedIn = true;
                    userRole = res.role;
                    currentUserName = $('login-username').value;
                    currentUserFullName = res.name;
                    localStorage.setItem('assetApp_state', JSON.stringify({ isLoggedIn, role: userRole, username: currentUserName, fullName: res.name }));
                    updateUIState();
                    $('login-screen').classList.add('hidden');
                    fetchData();
                    startAutoLogoutTimer();
                    showAlert("ยินดีต้อนรับ", "เข้าสู่ระบบสำเร็จ\nสวัสดีคุณ " + res.name);
                } else {
                    $('login-error').textContent = res.message;
                    $('login-error').classList.remove('hidden');
                }
            })
            .catch(err => {
                // กรณี Error ทางเทคนิค
                hideProcessModal();
                $('login-error').textContent = "Server Error: " + err.message;
                $('login-error').classList.remove('hidden');
            });
    });
    $('logoutButton').addEventListener('click', () => { handleLogout(false); });

    $('btnViewList').addEventListener('click', () => switchView('list'));
    $('btnViewDashboard').addEventListener('click', () => switchView('dashboard'));
    $('auditReportBtn').addEventListener('click', () => { switchView('audit'); fetchAuditReport(); });

    // [Script.html] แก้ไขส่วน submit form

    // [Script.html] โค้ดส่วน Submit Form (ฉบับสมบูรณ์ แก้ไขเรื่องวงเล็บเกิน)

    $('asset-form').addEventListener('submit', (e) => {
        e.preventDefault();

        // 1. ล็อกปุ่ม
        const btn = $('saveButton');
        btn.disabled = true;
        btn.textContent = "Processing...";

        // 2. เตรียมข้อมูล (Object)
        const obj = {
            assetID: $('assetID').value,
            deviceName: $('deviceName').value,
            model: $('model').value,
            brand: $('brand').value,
            location: $('location').value,
            department: $('department').value,
            status: $('status').value,
            remark: $('remark').value,
            floor: $('floor').value,
            deleteImage: isImageDeleted,
            user: "",
            image: null
        };

        // 3. สร้างฟังก์ชัน Submit
        const submit = (d) => {
            const endpoint = currentEditOriginalID ? '/api/update' : '/api/add';
            const payload = currentEditOriginalID
                ? { oid: currentEditOriginalID, obj: d, user: currentUserFullName, fullName: currentUserFullName }
                : { obj: d, user: currentUserFullName };

            apiPost(endpoint, payload)
                .then(res => {
                    btn.disabled = false;
                    btn.textContent = "บันทึก";

                    if (res.status === 'success') {
                        // ปิดฟอร์มหลัก
                        $('form-modal').classList.add('hidden');
                        fetchData();

                        // [Success Modal] เรียก Modal สีเขียว
                        if ($('success-modal')) {
                            $('success-modal-msg').textContent = res.message;
                            $('success-modal').classList.remove('hidden');
                        } else {
                            showAlert("สำเร็จ", res.message); // Fallback
                        }

                    } else if (res.status === 'duplicate') {
                        // [Duplicate Modal] เรียก Modal สีเหลือง
                        if ($('duplicate-modal')) {
                            $('dup-id-display').textContent = d.assetID;
                            $('duplicate-modal').classList.remove('hidden');
                        } else {
                            showAlert("แจ้งเตือน", res.message); // Fallback
                        }

                    } else {
                        showAlert("Error", res.message);
                    }
                })
                .catch(err => {
                    btn.disabled = false;
                    btn.textContent = "บันทึก";
                    showAlert("Server Error", err.message);
                });
        };

        // 4. จัดการรูปภาพก่อนส่ง
        const f = $('asset-image-input').files[0];
        if (f) {
            if (f.size > 5 * 1024 * 1024) {
                btn.disabled = false;
                btn.textContent = "บันทึก";
                return showAlert("Error", "File > 5MB");
            }
            const r = new FileReader();
            r.onload = (ev) => {
                obj.image = { base64: ev.target.result.split(',')[1], mimeType: f.type };
                submit(obj);
            };
            r.readAsDataURL(f);
        } else {
            submit(obj);
        }
    });
    $('addNewButton').addEventListener('click', () => showForm('add'));
    $('confirm-cancel-button').addEventListener('click', () => $('confirm-modal').classList.add('hidden'));
    $('confirm-delete-button').addEventListener('click', () => {
        const btn = $('confirm-delete-button');
        btn.disabled = true;
        btn.textContent = "Deleting...";
        apiPost('/api/delete', { id: assetToDeleteID, user: currentUserFullName || currentUserName })
            .then(res => {
                btn.disabled = false;
                btn.textContent = "ลบ";
                $('confirm-modal').classList.add('hidden');
                if (res.status === 'success') {
                    fetchData();
                    showAlert("Success", res.message);
                } else {
                    showAlert("Error", res.message);
                }
            })
            .catch(err => {
                btn.disabled = false;
                btn.textContent = "ลบ";
                $('confirm-modal').classList.add('hidden');
                showAlert("Error", err.message);
            });
    });

    $('firstPage').addEventListener('click', () => { if (currentPage > 1) { currentPage = 1; renderTable(); } });
    $('lastPage').addEventListener('click', () => { const max = Math.ceil(currentData.length / itemsPerPage) || 1; if (currentPage < max) { currentPage = max; renderTable(); } });
    $('auditFirstPage').addEventListener('click', () => { if (auditCurrentPage > 1) { auditCurrentPage = 1; renderAuditTable(); } });
    $('auditLastPage').addEventListener('click', () => { const max = Math.ceil(auditFilteredData.length / auditItemsPerPage) || 1; if (auditCurrentPage < max) { auditCurrentPage = max; renderAuditTable(); } });

    fetchData();

    // Check PWA Install
    setTimeout(checkPWAInstall, 2000);

    // ตั้งค่าเริ่มต้นหน้าแรกเป็น Home
    switchView('home');
});

// --- PWA LOGIC ---
function checkPWAInstall() {
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    if (isMobile && !isStandalone) showInstallPromotion();
}

function showInstallPromotion() {
    const banner = document.createElement('div');
    banner.className = "fixed bottom-0 left-0 right-0 bg-white p-4 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] z-[100] border-t border-slate-100 flex items-center justify-between fade-in";
    banner.innerHTML = `<div class="flex items-center gap-3"><div class="bg-indigo-100 p-2 rounded-lg"><img src="https://img.icons8.com/fluency/192/barcode-scanner-2.png" class="w-8 h-8"></div><div><h4 class="font-bold text-slate-800 text-sm">ติดตั้ง AssetTrack</h4><p class="text-xs text-slate-500">เพิ่มลงในหน้าจอหลักเพื่อใช้งานได้เร็วขึ้น</p></div></div><div class="flex gap-2"><button onclick="this.parentElement.parentElement.remove()" class="text-slate-400 p-2">?</button></div>`;
    document.body.appendChild(banner);
    setTimeout(() => { if (banner) banner.remove() }, 10000);
}

// --- LOGIC FUNCTIONS ---
function updateSelectionState() {
    const count = document.querySelectorAll('.row-checkbox:checked').length;
    const btn = $('btnDeleteSelected');
    if (count > 0 && isLoggedIn && userRole === 'admin') { btn.classList.remove('hidden'); btn.textContent = `ลบ (${count})`; } else btn.classList.add('hidden');
    const allChecks = document.querySelectorAll('.row-checkbox');
    $('selectAll').checked = allChecks.length > 0 && count === allChecks.length;
    $('selectAll').indeterminate = count > 0 && count < allChecks.length;
}
function handleAddYear() { const y = prompt("ระบุปี (พ.ศ.):"); if (!y || y.length !== 4) return; const sel = $('auditYearSelect'); if ([...sel.options].some(o => o.value == y)) { sel.value = y; fetchAuditReport(); return; } const opt = document.createElement('option'); opt.value = y; opt.textContent = `ปีงบ ${y}`; sel.add(opt, 0); sel.value = y; fetchAuditReport(); }
function updateDeptList(division, listId, inputId) { const list = $(listId), input = $(inputId); list.innerHTML = ''; input.value = ''; const depts = division && ORGANIZATION_DATA[division] ? ORGANIZATION_DATA[division] : Object.values(ORGANIZATION_DATA).flat().sort(); depts.forEach(d => { const opt = document.createElement('option'); opt.value = d; list.appendChild(opt); }); }
function restoreSession() { try { const s = JSON.parse(localStorage.getItem('assetApp_state')); if (s?.isLoggedIn) { isLoggedIn = true; userRole = s.role; currentUserName = s.username; currentUserFullName = s.fullName; updateUIState(); startAutoLogoutTimer(); } } catch (e) { } }
function updateUIState() {
    const isUser = isLoggedIn, isAdmin = userRole === 'admin';
    $('loginButton').classList.toggle('hidden', isUser);
    $('logoutButton').classList.toggle('hidden', !isUser);
    $('user-display-name').textContent = isUser ? (currentUserFullName || currentUserName) : "Guest";

    // --- จัดการรูป Avatar ---
    const avatars = document.querySelectorAll('#user-avatar');

    // URL รูปภาพสำหรับ User ที่ล็อกอินแล้ว
    const userIconUrl = "https://img.icons8.com/fluency/96/user-male-circle.png";
    const adminIconUrl = "https://img.icons8.com/fluency/96/admin-settings-male.png";

    avatars.forEach(av => {
        if (isUser) {
            // 1. ถ้าล็อกอินแล้ว: แสดงรูปภาพ (เต็มวงกลม)
            av.className = "w-8 h-8 xl:w-8 xl:h-8 rounded-full shadow-sm xl:mr-2 overflow-hidden border border-slate-200 dark:border-slate-600";
            let currentImg = isAdmin ? adminIconUrl : userIconUrl;
            av.innerHTML = `<img src="${currentImg}" class="w-full h-full object-cover">`;
        } else {
            // 2. ถ้าเป็น Guest: แสดงอิโมจิ ? (พร้อมพื้นหลังสีเทา)
            av.className = "w-8 h-8 xl:w-8 xl:h-8 rounded-full flex items-center justify-center bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 shadow-sm xl:mr-2 text-lg cursor-default";
            av.innerHTML = "❓"; // หรือใช้ "?" ตัวหนังสือธรรมดาก็ได้
        }
    });
    // -----------------------

    // ควบคุมการแสดงผลปุ่ม Admin
    $('admin-controls').classList.toggle('hidden', !isAdmin);
    $('addNewButton').classList.toggle('hidden', !isAdmin);
    $('auditReportBtn').classList.toggle('hidden', !isAdmin);
    if ($('printQRButton')) $('printQRButton').classList.toggle('hidden', !isAdmin);

    $('status-dot').className = `w-1.5 h-1.5 rounded-full mr-1.5 ${isAdmin ? 'bg-green-500' : isUser ? 'bg-blue-500' : 'bg-gray-400'}`;
    $('status-text').textContent = isAdmin ? "ผู้ดูแลระบบ" : isUser ? "ผู้ใช้งานทั่วไป" : "โหมดผู้เยี่ยมชม";

    updateSelectionState();
    renderTable();
}

function resetInactivityTimer() {
    clearTimeout(inactivityTimer);
    if (isLoggedIn) {
        inactivityTimer = setTimeout(() => {
            handleLogout(true);
        }, INACTIVITY_LIMIT);
    }
}

function startAutoLogoutTimer() {
    resetInactivityTimer();
}

function handleLogout(isAuto = false) {
    localStorage.removeItem('assetApp_state');
    isLoggedIn = false;
    userRole = "user";
    currentUserName = "Guest";
    currentUserFullName = "";
    clearTimeout(inactivityTimer);
    // --- [เพิ่มใหม่] เคลียร์ค่าในช่อง Login และข้อความ Error ---
    $('login-username').value = "";
    $('login-password').value = "";
    $('login-error').classList.add('hidden');
    $('login-error').textContent = "";
    // -------------------------------------------------------
    updateUIState();

    if (isAuto) {
        // แก้ไขข้อความแจ้งเตือนตามที่ขอ
        showAlert("หมดเวลาใช้งาน", "ระบบได้ออกจากระบบอัตโนมัติเนื่องจากไม่มีการใช้งาน");
        $('login-screen').classList.remove('hidden'); // Show login screen
    } else {
        // --- [เพิ่ม] Popup แจ้งเตือน Logout ปกติ ---
        showAlert("สำเร็จ", "คุณได้ออกจากระบบเรียบร้อยแล้ว");
        switchView('home'); // Logout แล้วกลับหน้า Home
        // ----------------------------------------
    }
}

// --- UPDATED: switchView with Green Audit Button & Safety Check ---
function switchView(name) {
    currentView = name;

    // Reset Search on Home
    if (name === 'home') {
        const bigSearch = $('bigSearchBox');
        if (bigSearch) bigSearch.value = '';
        $('searchBox').value = '';
        if (allData.length > 0) {
            currentData = allData;
            currentPage = 1;
            renderTable();
        }
    }

    Object.values(views).forEach(el => el.classList.add('hidden'));
    if (views[name]) {
        views[name].classList.remove('hidden');
    } else {
        // Fallback
        console.error("View not found:", name);
        return;
    }

    const btnList = $('btnViewList');
    const btnDash = $('btnViewDashboard');
    const btnAudit = $('auditReportBtn');

    // Check if audit button is currently hidden (to preserve user state)
    const isAuditHidden = btnAudit.classList.contains('hidden');

    const defaultClass = "px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1 text-slate-500 whitespace-nowrap hover:bg-white";
    const activeListClass = "px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1 bg-indigo-600 text-white shadow-md whitespace-nowrap";
    const activeDashClass = "px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1 bg-purple-600 text-white shadow-md whitespace-nowrap";
    const activeAuditClass = "px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1 bg-emerald-600 text-white shadow-md whitespace-nowrap"; // Green

    btnList.className = defaultClass;
    btnDash.className = defaultClass;
    // Restore hidden state if needed
    btnAudit.className = defaultClass + (isAuditHidden ? " hidden" : "");

    if (name === 'list') {
        btnList.className = activeListClass;
    } else if (name === 'dashboard') {
        btnDash.className = activeDashClass;
        renderDashboard();
    } else if (name === 'audit') {
        btnAudit.className = activeAuditClass;
        if (typeof fetchAuditReport === 'function') {
            fetchAuditReport();
        }
    }
}

function fetchData() {
    $('asset-table-body').innerHTML = `<tr><td colspan="10" class="text-center py-10">Loading...</td></tr>`;
    apiGet('/api/data')
        .then(res => {
            if (res.status === 'success') {
                allData = res.data;
                currentData = allData;

                // --- เรียกฟังก์ชันสร้าง Dropdown (ที่เพิ่มมาใหม่) ---
                populateFilterDropdowns();
                // ---------------------------------------------

                renderTable();
                if (currentView === 'dashboard') renderDashboard();
                if (URL_PARAMS?.id && allData.some(r => String(r.assetID) === String(URL_PARAMS.id))) showForm('view', String(URL_PARAMS.id), true);
            } else showAlert("Error", res.message);
        })
        .catch(err => {
            showAlert("Error", "Failed to load data: " + err.message);
        });
}

function renderTable() {
    const tbody = $('asset-table-body'); tbody.innerHTML = ''; $('selectAll').checked = false; $('selectAll').indeterminate = false; updateSelectionState();
    const pages = Math.ceil(currentData.length / itemsPerPage) || 1; if (currentPage > pages) currentPage = pages; if (currentPage < 1) currentPage = 1;
    const pageData = currentData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
    $('record-count').textContent = `แสดง ${(currentData.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0)}-${Math.min(currentPage * itemsPerPage, currentData.length)} จาก ${currentData.length}`; $('pageIndicator').textContent = `${currentPage}/${pages}`;
    if (currentData.length === 0) { tbody.innerHTML = `<tr><td colspan="10" class="text-center py-10 text-slate-400">ไม่พบข้อมูล</td></tr>`; return; }
    pageData.forEach(row => {
        let statusClass = row.status.includes('ใช้งาน') ? 'badge-active' : row.status.includes('ส่งคืน') ? 'badge-returned' : row.status.includes('ชำรุด') ? 'badge-retired' : 'badge-stock';
        const auditBadge = row.isAudited ? `<span class="badge-audit-done px-1.5 py-0.5 rounded text-[10px] font-bold mt-1 flex items-center justify-center w-fit">✅ นับแล้ว</span>` : '';
        // เพิ่มเงื่อนไข && userRole === 'admin'
        const countBtn = (isLoggedIn && userRole === 'admin') ? (row.isAudited ? `<button class="p-1.5 bg-gray-100 text-gray-400 rounded-lg text-xs font-bold cursor-not-allowed" disabled>นับแล้ว</button>` : `<button class="audit-btn p-1.5 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-lg text-xs font-bold" data-id="${row.assetID}">ตรวจนับ</button>`) : '';
        const showAdmin = (isLoggedIn && userRole === 'admin') ? '' : 'hidden';
        // Add border-b to every td to make divider line visible in border-separate
        tbody.innerHTML += `<tr class="hover:bg-slate-50 dark:hover:bg-slate-700/50 group">
                    <td class="px-2 md:px-4 py-3 text-center border-r border-b border-slate-200 dark:border-slate-700"><input type="checkbox" class="row-checkbox h-4 w-4 rounded text-indigo-600" value="${row.assetID}"></td>
                    <td class="px-2 md:px-4 py-3 border-r border-b border-slate-200 dark:border-slate-700 font-mono text-sm text-slate-600 dark:text-slate-300 whitespace-nowrap">${row.assetID}</td>
                    <td class="px-2 md:px-4 py-3 border-r border-b border-slate-200 dark:border-slate-700 font-medium text-slate-700 dark:text-slate-200 min-w-[150px]">${row.deviceName}</td>
                    <td class="px-2 md:px-4 py-3 border-r border-b border-slate-200 dark:border-slate-700 text-sm text-slate-500 dark:text-slate-400 whitespace-nowrap">${row.model}</td>
                    <td class="px-2 md:px-4 py-3 border-r border-b border-slate-200 dark:border-slate-700 text-sm text-slate-500 dark:text-slate-400 whitespace-nowrap">${row.division}</td>
                    <td class="px-2 md:px-4 py-3 border-r border-b border-slate-200 dark:border-slate-700 text-sm text-slate-500 dark:text-slate-400 whitespace-nowrap">${row.department}</td>
                    <td class="px-2 md:px-4 py-3 text-center border-r border-b border-slate-200 dark:border-slate-700 text-sm text-slate-600 dark:text-slate-300 whitespace-nowrap">${row.floor || "-"}</td>
                    <td class="px-2 md:px-4 py-3 text-center border-r border-b border-slate-200 dark:border-slate-700"><div class="flex flex-col items-center"><span class="px-2.5 py-1 rounded-full text-xs font-bold whitespace-nowrap ${statusClass}">${row.status}</span>${auditBadge}</div></td>
                    <td class="px-2 md:px-4 py-3 text-center border-b border-slate-200 dark:border-slate-700"><div class="flex justify-center gap-2 opacity-80 group-hover:opacity-100">${countBtn}<button class="view-btn p-1.5 bg-teal-50 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400 hover:bg-teal-100 dark:hover:bg-teal-900/50 rounded-lg" data-id="${row.assetID}">${ICONS.view}</button><button class="edit-btn p-1.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 rounded-lg ${showAdmin}" data-id="${row.assetID}">${ICONS.edit}</button><button class="delete-btn p-1.5 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50 rounded-lg ${showAdmin}" data-id="${row.assetID}">${ICONS.delete}</button></div></td>
                </tr>`;
    });
}
// [Script.html] แทนที่ฟังก์ชัน renderDashboard เดิม

function renderDashboard() {
    // 1. เตรียมข้อมูลจากฝั่ง Inventory (ข้อมูลปัจจุบัน)
    if (!allData) return;

    let activeCount = 0;
    const cnt = { brand: {}, device: {} };

    allData.forEach(r => {
        // นับเฉพาะสถานะที่ยังอยู่ในระบบ (Active)
        // ส่วนใหญ่คือ "ใช้งาน" หรือสถานะอื่นๆ ที่ยังไม่ได้ถูก Archive
        if (r.status === 'ใช้งาน') {
            activeCount++;
        }

        // เก็บสถิติยี่ห้อและอุปกรณ์ (จากของที่มีอยู่จริงในคลัง)
        cnt.brand[r.brand || "N/A"] = (cnt.brand[r.brand || "N/A"] || 0) + 1;
        cnt.device[r.deviceName || "N/A"] = (cnt.device[r.deviceName || "N/A"] || 0) + 1;
    });

    // 2. ตั้งค่าสี Dark Mode
    const isDark = document.documentElement.classList.contains('dark');
    const textColor = isDark ? '#e2e8f0' : '#64748b';

    // 3. วาดกราฟยี่ห้อ (Brand) และ อุปกรณ์ (Device) ทันที (เพราะใช้ข้อมูล local)
    if (window.brChart) window.brChart.destroy();
    const sBrand = Object.entries(cnt.brand).sort((a, b) => b[1] - a[1]).slice(0, 5);
    window.brChart = new Chart($('brandChart'), {
        type: 'bar',
        data: { labels: sBrand.map(i => i[0]), datasets: [{ label: 'จำนวน', data: sBrand.map(i => i[1]), backgroundColor: '#6366f1' }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: textColor } }, y: { ticks: { color: textColor } } } }
    });

    if (window.devChart) window.devChart.destroy();
    const sDev = Object.entries(cnt.device).sort((a, b) => b[1] - a[1]).slice(0, 10);
    window.devChart = new Chart($('deviceChart'), {
        type: 'bar',
        data: { labels: sDev.map(i => i[0]), datasets: [{ label: 'จำนวน', data: sDev.map(i => i[1]), backgroundColor: '#8b5cf6' }] },
        options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: textColor } }, y: { ticks: { color: textColor } } } }
    });

    // 4. [สำคัญ] เรียกข้อมูล Archive จาก Server เพื่อมาอัปเดตการ์ดและกราฟวงกลม
    apiGet('/api/archive-counts')
        .then(res => {
            const returnedCount = res.returned || 0;
            const retiredCount = res.retired || 0;
            const totalCount = activeCount + returnedCount + retiredCount;

            // 4.1 อัปเดตตัวเลขในการ์ด
            $('stat-total').textContent = totalCount;
            $('stat-active').textContent = activeCount;
            $('stat-returned').textContent = returnedCount;
            $('stat-retired').textContent = retiredCount;

            // 4.2 วาดกราฟสถานะ (Status Chart) โดยรวมข้อมูลทั้ง 3 ส่วน
            if (window.stChart) window.stChart.destroy();

            window.stChart = new Chart($('statusChart'), {
                type: 'doughnut',
                data: {
                    labels: ['ใช้งาน', 'ส่งคืน', 'แทงชำรุด'],
                    datasets: [{
                        data: [activeCount, returnedCount, retiredCount],
                        backgroundColor: ['#10b981', '#3b82f6', '#ef4444'] // เขียว, ฟ้า, แดง
                    }]
                },
                options: {
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            labels: { color: textColor },
                            position: 'bottom'
                        }
                    }
                }
            });

        })
        .catch(err => {
            console.error("Failed to load archive counts:", err);
        });
}

function switchTab(tabName) {
    const btnDetails = $('tab-btn-details'), btnTimeline = $('tab-btn-timeline');
    const contentDetails = $('tab-content-details'), contentTimeline = $('tab-content-timeline');
    if (tabName === 'details') {
        btnDetails.classList.add('text-indigo-600', 'dark:text-indigo-400', 'border-indigo-600', 'dark:border-indigo-400');
        btnDetails.classList.remove('text-slate-500', 'dark:text-slate-400', 'border-transparent');

        btnTimeline.classList.add('text-slate-500', 'dark:text-slate-400', 'border-transparent');
        btnTimeline.classList.remove('text-indigo-600', 'dark:text-indigo-400', 'border-indigo-600', 'dark:border-indigo-400');

        contentDetails.classList.remove('hidden'); contentTimeline.classList.add('hidden');
    } else {
        btnTimeline.classList.add('text-indigo-600', 'dark:text-indigo-400', 'border-indigo-600', 'dark:border-indigo-400');
        btnTimeline.classList.remove('text-slate-500', 'dark:text-slate-400', 'border-transparent');

        btnDetails.classList.add('text-slate-500', 'dark:text-slate-400', 'border-transparent');
        btnDetails.classList.remove('text-indigo-600', 'dark:text-indigo-400', 'border-indigo-600', 'dark:border-indigo-400');

        contentDetails.classList.add('hidden'); contentTimeline.classList.remove('hidden');
        loadAssetTimeline();
    }
}
function loadAssetTimeline() {
    const id = $('assetID').value; if (!id) return;
    const list = $('timeline-list'), loader = $('timeline-loading'), empty = $('timeline-empty');
    list.innerHTML = ''; loader.classList.remove('hidden'); empty.classList.add('hidden');
    apiGet(`/api/history?id=${id}`)
        .then(res => {
            loader.classList.add('hidden');
            if (res.status === 'success' && res.data.length > 0) renderTimelineItems(res.data); else empty.classList.remove('hidden');
        })
        .catch(err => {
            loader.classList.add('hidden');
            alert("Error loading timeline: " + err.message);
        });
}
function renderTimelineItems(data) {
    let html = '';

    // --- FIX: ดึงข้อมูลหน่วยงาน (Department) จากรายการครุภัณฑ์ปัจจุบันโดยตรง ---
    const currentID = $('assetID').value;
    const currentAsset = allData.find(a => String(a.assetID) === String(currentID));
    const realDept = currentAsset ? currentAsset.department : "-"; // ดึงจากคอลัมน์ Department จริงๆ

    data.forEach((item, index) => {
        const isLast = index === data.length - 1;
        const iconBg = item.type === 'audit' ? 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400' : 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400';
        const icon = item.type === 'audit' ? '📋' : '⚙️';

        // --- Formatted Logic ---
        let detailText = item.details || "";
        if (item.type === 'audit') {
            detailText = detailText.replace('Found', 'ตรวจเจอจริง');
            let floorStr = "";
            const floorMatch = detailText.match(/\((F\d+|FG)\)/i);
            if (floorMatch) {
                floorStr = ` (ชั้น ${floorMatch[1]})`;
            } else if (currentAsset && currentAsset.floor) {
                floorStr = ` (ชั้น ${currentAsset.floor})`;
            }
            const parts = detailText.split('|');
            if (parts.length >= 1) {
                detailText = `${parts[0].trim()} | หน่วยงาน: ${realDept}${floorStr}`;
            }
        } else if (item.action === 'EDIT' || item.action === 'UPDATE') {
            // Format comma-separated changes as a vertical list
            detailText = detailText.split(', ').map(change => `<span class="block">• ${change}</span>`).join('');
        }

        html += `<div class="relative pl-8 pb-6 ${isLast ? '' : 'border-l-2 border-slate-200 dark:border-slate-700'} ml-3"><div class="absolute -left-[9px] top-0 w-5 h-5 rounded-full ${iconBg} flex items-center justify-center ring-4 ring-white dark:ring-slate-800 text-[10px] font-bold">${icon}</div><div class="flex flex-col sm:flex-row sm:justify-between sm:items-start mb-1"><span class="text-sm font-bold text-slate-800 dark:text-white">${item.action || item.title}</span><span class="text-xs font-mono text-slate-400 bg-slate-50 dark:bg-slate-700 px-2 py-0.5 rounded border border-slate-100 dark:border-slate-600 mt-1 sm:mt-0">${item.dateStr}</span></div><p class="text-xs text-slate-600 dark:text-slate-400 mb-1">${detailText}</p><div class="flex items-center gap-1 text-[10px] text-slate-400">👤 ${item.user}</div></div>`;
    });
    $('timeline-list').innerHTML = html;
}

function showForm(mode, id, isScanned = false) {
    const f = $('asset-form'), m = $('form-modal'); f.reset(); m.classList.remove('hidden');
    switchTab('details'); $('timeline-list').innerHTML = '';

    $('scanned-badge').classList.toggle('hidden', !isScanned); $('asset-image-input').value = ""; $('asset-image-preview-container').classList.add('hidden'); isImageDeleted = false;

    if (mode === 'add') {
        $('form-title').textContent = "เพิ่มรายการใหม่"; $('tab-btn-timeline').classList.add('hidden');
        f.querySelectorAll('input, select, textarea').forEach(i => i.disabled = false);
        $('saveButton').classList.remove('hidden'); $('editButton').classList.add('hidden'); $('countAssetBtn').classList.add('hidden');
        $('qr-section').classList.add('hidden'); $('view-audit-note-wrapper').classList.add('hidden');
        currentEditOriginalID = null; updateDeptList("", 'departmentList', 'department'); $('asset-image-input').classList.remove('hidden'); $('status').value = "ใช้งาน";
    } else {
        const a = allData.find(r => String(r.assetID) === String(id)); if (!a) return;
        currentEditOriginalID = id; $('tab-btn-timeline').classList.remove('hidden');
        $('assetID').value = a.assetID; $('deviceName').value = a.deviceName; $('model').value = a.model; $('brand').value = a.brand; $('remark').value = a.remark || ""; $('floor').value = a.floor || "";
        if (a.assetImage) { $('asset-image-preview-container').classList.remove('hidden'); $('asset-image-img').src = a.assetImage; }
        $('qr-code-img').src = a.qrCodeUrl || ""; $('qr-section').classList.toggle('hidden', !a.qrCodeUrl);
        let d = a.division && ORGANIZATION_DATA[a.division] ? a.division : Object.keys(ORGANIZATION_DATA).find(k => ORGANIZATION_DATA[k].includes(a.department)) || "";
        $('location').value = d; updateDeptList(d, 'departmentList', 'department'); $('department').value = a.department; $('status').value = a.status;

        if (mode === 'view') {
            $('form-title').textContent = "รายละเอียด"; f.querySelectorAll('input, select, textarea').forEach(i => i.disabled = true);
            $('saveButton').classList.add('hidden'); $('editButton').classList.add('hidden'); $('asset-image-input').classList.add('hidden'); $('delete-image-btn').classList.add('hidden');
            $('view-audit-note-wrapper').classList.toggle('hidden', !a.isAudited);
            if (a.isAudited) {
                // [ปรับใหม่ข้อ 3] เพิ่มคำอธิบายเหนือรูปภาพ Audit
                const imgDisplay = (a.auditImage && a.auditImage !== "-") ?
                    `<div class="mt-3 border-t border-emerald-100 dark:border-emerald-800 pt-2">
                              <p class="text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1">📷 รูป ณ จุด ติดตั้ง</p>
                              <div class="p-2 bg-white dark:bg-slate-700 border border-slate-100 dark:border-slate-600 rounded text-center">
                                  <img src="${a.auditImage}" class="max-h-32 w-auto mx-auto rounded shadow-sm cursor-pointer hover:opacity-90 transition-opacity" onclick="window.open(this.src, '_blank')" title="คลิกเพื่อดูรูปใหญ่">
                              </div>
                          </div>` : "";

                $('view-audit-detail-content').innerHTML = `
        <div class="border border-emerald-200 dark:border-emerald-800 rounded-lg overflow-hidden bg-white dark:bg-slate-700 p-2">
            <table class="w-full text-xs text-left mb-1">
                <tr class="border-b border-emerald-100 dark:border-emerald-800 bg-emerald-50/30 dark:bg-emerald-900/20">
                    <th class="p-1 font-bold text-emerald-800 dark:text-emerald-300 w-1/3">ผู้ตรวจสอบ</th>
                    <td class="p-1 text-slate-700 dark:text-slate-200">${a.auditor || "-"}</td>
                </tr>
                <tr class="border-b bg-white dark:bg-slate-700 dark:border-emerald-800">
                    <th class="p-1 font-bold text-emerald-800 dark:text-emerald-300">เวลา</th>
                    <td class="p-1 font-mono text-[10px] text-slate-700 dark:text-slate-200">${a.auditDate || "-"}</td>
                </tr>
                <tr class="bg-emerald-50/30 dark:bg-emerald-900/20">
                    <th class="p-1 font-bold text-emerald-800 dark:text-emerald-300 align-top">หมายเหตุ</th>
                    <td class="p-1 text-slate-700 dark:text-slate-200">${a.auditNote || "-"}</td>
                </tr>
            </table>
            ${imgDisplay}
        </div>`;

                const countBtn = $('countAssetBtn');
                if (a.isAudited) {
                    countBtn.classList.remove('hidden', 'bg-emerald-600', 'hover:bg-emerald-700', 'text-white');
                    countBtn.classList.add('bg-gray-100', 'dark:bg-slate-700', 'text-gray-400', 'dark:text-slate-500', 'cursor-not-allowed');
                    countBtn.disabled = true;
                    countBtn.innerHTML = 'นับแล้ว';
                } else if (userRole === 'admin') { // เช็คว่าเป็น Admin หรือไม่
                    countBtn.classList.remove('hidden', 'bg-gray-100', 'text-gray-400', 'cursor-not-allowed');
                    countBtn.classList.add('bg-emerald-600', 'hover:bg-emerald-700', 'text-white');
                    countBtn.disabled = false;
                    countBtn.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg> ตรวจนับ`;
                } else {
                    // ถ้าไม่ใช่ Admin ให้ซ่อนปุ่ม
                    countBtn.classList.add('hidden');
                }
            } else $('countAssetBtn').classList.add('hidden');
        } else {
            // โหมดแก้ไข (Edit Mode)
            $('form-title').textContent = "แก้ไขข้อมูล";
            f.querySelectorAll('input, select, textarea').forEach(i => i.disabled = false);
            $('saveButton').classList.remove('hidden');
            $('editButton').classList.add('hidden');
            $('countAssetBtn').classList.add('hidden');
            $('view-audit-note-wrapper').classList.add('hidden');
            $('asset-image-input').classList.remove('hidden');
            $('delete-image-btn').classList.remove('hidden');
        }
    }
}

function openAuditModalFromTable(asset) {
    $('audit-asset-id').textContent = asset.assetID;
    $('audit-asset-name').textContent = asset.deviceName;
    $('audit-modal-year').textContent = $('auditYearSelect').value;
    let d = asset.division;
    if (!d || !ORGANIZATION_DATA[d]) { d = Object.keys(ORGANIZATION_DATA).find(k => ORGANIZATION_DATA[k].includes(asset.department)) || ""; }
    $('audit-location').innerHTML = '<option value="">-- เลือกสังกัด --</option>';
    $('audit-delete-entry-btn').classList.add('hidden');
    updateDeptList(d, 'auditDepartmentList', 'audit-department');
    for (const div in ORGANIZATION_DATA) { const o = document.createElement('option'); o.value = div; o.textContent = div; if (div === d) o.selected = true; $('audit-location').appendChild(o); }
    $('audit-floor').value = asset.floor || "";
    $('audit-department').value = asset.department;
    $('audit-status').value = asset.status;
    $('audit-note').value = "";
    $('audit-file-input').value = "";
    isAuditImageDeleted = false;
    $('audit-image-preview-container').classList.add('hidden');
    $('audit-confirmed-badge').classList.toggle('hidden', !asset.isAudited);
    $('audit-modal').classList.remove('hidden');
}

function openAuditEditModal(item) {
    $('audit-asset-id').textContent = item.assetID;
    $('audit-asset-name').textContent = item.deviceName;
    $('audit-modal-year').textContent = $('auditYearSelect').value;
    $('audit-location').innerHTML = '<option value="">-- เลือกสังกัด --</option>';
    for (const div in ORGANIZATION_DATA) { const o = document.createElement('option'); o.value = div; o.textContent = div; $('audit-location').appendChild(o); }
    let cleanLoc = item.auditLocation ? item.auditLocation.replace(/\s*\(.*?\)$/, '') : "";
    $('audit-location').value = cleanLoc || item.division;
    if (!$('audit-location').value && item.department) { const inferredDiv = Object.keys(ORGANIZATION_DATA).find(k => ORGANIZATION_DATA[k].includes(item.department)); if (inferredDiv) $('audit-location').value = inferredDiv; }
    $('audit-delete-entry-btn').classList.remove('hidden');
    updateDeptList($('audit-location').value, 'auditDepartmentList', 'audit-department');
    $('audit-floor').value = item.floor || "";
    $('audit-department').value = item.department || "";
    $('audit-status').value = item.currentStatus || "ใช้งาน";
    $('audit-note').value = item.auditNote === '-' ? "" : item.auditNote;
    $('audit-file-input').value = "";
    isAuditImageDeleted = false;
    $('audit-confirmed-badge').classList.remove('hidden');
    if (item.auditImage && item.auditImage !== "-") { $('audit-image-img').src = item.auditImage; $('audit-image-preview-container').classList.remove('hidden'); } else { $('audit-image-preview-container').classList.add('hidden'); }
    $('audit-modal').classList.remove('hidden');
}

function submitAuditForm() {
    const btn = $('audit-confirm-btn');
    btn.disabled = true;
    btn.textContent = "Processing...";
    const obj = { assetID: $('audit-asset-id').textContent, fiscalYear: $('audit-modal-year').textContent, location: $('audit-location').value, department: $('audit-department').value, status: $('audit-status').value, note: $('audit-note').value || "-", deleteImage: isAuditImageDeleted, image: null, floor: $('audit-floor').value };

    const submit = (d) => {
        apiPost('/api/audit', { obj: d, user: currentUserFullName || currentUserName })
            .then(res => {
                btn.disabled = false;
                btn.textContent = "ยืนยันการนับ";
                if (res.status === 'success' || res.status === 'duplicate') {
                    $('audit-modal').classList.add('hidden');
                    showAlert("Success", res.message);
                    fetchData();
                    if (currentView === 'audit') fetchAuditReport();
                } else {
                    showAlert("Error", res.message);
                }
            })
            .catch(err => {
                btn.disabled = false;
                btn.textContent = "ยืนยันการนับ";
                showAlert("Error", err.message);
            });
    };

    const f = $('audit-file-input').files[0];
    if (f) {
        if (f.size > 5 * 1024 * 1024) { btn.disabled = false; btn.textContent = "ยืนยัน"; return showAlert("Error", "File > 5MB"); }
        const r = new FileReader();
        r.onload = (ev) => { obj.image = { base64: ev.target.result.split(',')[1], mimeType: f.type }; submit(obj); };
        r.readAsDataURL(f);
    } else {
        submit(obj);
    }
}
function fetchAuditReport() {
    $('audit-table-body').innerHTML = `<tr><td colspan="9" class="text-center py-10">Loading...</td></tr>`;
    apiGet(`/api/audit-report?year=${$('auditYearSelect').value}`)
        .then(res => {
            if (res.status === 'success') {
                auditDataCache = res.data;
                auditFilteredData = auditDataCache;
                auditCurrentPage = 1;
                renderAuditTable();
                setAuditFilter('all');
            } else {
                $('audit-table-body').innerHTML = `<tr><td colspan="9" class="text-center text-red-500">${res.message}</td></tr>`;
            }
        })
        .catch(err => {
            $('audit-table-body').innerHTML = `<tr><td colspan="9" class="text-center text-red-500">Error: ${err.message}</td></tr>`;
        });
}
function setAuditFilter(type) { currentAuditFilter = type;['card-audit-total', 'card-audit-counted', 'card-audit-missing'].forEach(id => $(id).classList.remove('ring-2', 'ring-indigo-500', 'bg-slate-50', 'dark:bg-slate-700')); $(type === 'all' ? 'card-audit-total' : type === 'counted' ? 'card-audit-counted' : 'card-audit-missing').classList.add('ring-2', 'ring-indigo-500', 'bg-slate-50', 'dark:bg-slate-700'); $('audit-filter-status').textContent = type === 'all' ? "ทั้งหมด" : type === 'counted' ? "นับแล้ว" : "ยังไม่นับ"; filterAuditTable(); }
function filterAuditTable() { const q = $('auditSearchBox').value.toLowerCase(); auditFilteredData = auditDataCache.filter(i => { const m = [i.assetID, i.deviceName, i.auditor, i.auditLocation].some(x => String(x || "").toLowerCase().includes(q)); return m && (currentAuditFilter === 'all' || (currentAuditFilter === 'counted' && i.isAudited) || (currentAuditFilter === 'missing' && !i.isAudited)); }); auditCurrentPage = 1; renderAuditTable(); }
function renderAuditTable() {
    const tbody = $('audit-table-body'); tbody.innerHTML = '';
    const cnt = auditDataCache.filter(r => r.isAudited).length;
    $('audit-stat-total').textContent = auditDataCache.length;
    $('audit-stat-counted').textContent = cnt;
    $('audit-stat-missing').textContent = auditDataCache.length - cnt;

    // Reset Select All (ถ้า element ไม่มีอยู่แล้วก็ไม่เป็นไร)
    if ($('auditSelectAll')) $('auditSelectAll').checked = false;

    if (!auditFilteredData.length) { tbody.innerHTML = `<tr><td colspan="10" class="text-center py-10 text-slate-400">ไม่พบข้อมูล</td></tr>`; $('audit-record-count').textContent = `0 รายการ`; return; }

    const pages = Math.ceil(auditFilteredData.length / auditItemsPerPage); if (auditCurrentPage > pages) auditCurrentPage = pages; if (auditCurrentPage < 1) auditCurrentPage = 1;
    $('audit-record-count').textContent = `แสดง ${(auditCurrentPage - 1) * auditItemsPerPage + 1}-${Math.min(auditCurrentPage * auditItemsPerPage, auditFilteredData.length)} จาก ${auditFilteredData.length}`;
    $('auditPageIndicator').textContent = `${auditCurrentPage}/${pages}`;

    auditFilteredData.slice((auditCurrentPage - 1) * auditItemsPerPage, auditCurrentPage * auditItemsPerPage).forEach(r => {
        const badge = r.isAudited ? '<span class="badge-audit-done px-2 py-1 rounded text-xs font-bold">✅ นับแล้ว</span>' : '<span class="badge-audit-pending px-2 py-1 rounded text-xs">รอนับ</span>';
        const imgLink = (r.auditImage && r.auditImage !== "-") ? `<div class="flex justify-center"><img src="${r.auditImage}" class="h-10 w-10 object-cover rounded-md cursor-pointer hover:scale-150 transition-transform duration-200 border border-slate-200 dark:border-slate-600 shadow-sm" onclick="window.open('${r.auditImage}', '_blank')" title="คลิกเพื่อดูรูปใหญ่"></div>` : `<span class="text-gray-300 dark:text-gray-600">-</span>`;
        const editBtn = (r.isAudited && isLoggedIn) ? `<button class="audit-edit-btn p-1 bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/50 rounded-md shadow-sm" data-id="${r.assetID}">${ICONS.edit}</button>` : '';
        const tr = document.createElement('tr'); tr.className = "hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors";
        const displayLocation = r.auditLocation ? r.auditLocation.replace(/\s*\(.*?\)$/, '') : "";

        tr.innerHTML = `
                <td class="px-2 md:px-6 py-3 border-r border-b border-slate-200 dark:border-slate-700 font-mono text-sm text-slate-600 dark:text-slate-300 whitespace-nowrap">${r.assetID}</td>
                <td class="px-2 md:px-6 py-3 border-r border-b border-slate-200 dark:border-slate-700 whitespace-nowrap">${r.deviceName}</td>
                <td class="px-2 md:px-6 py-3 border-r border-b border-slate-200 dark:border-slate-700 whitespace-nowrap">${displayLocation}</td>
                <td class="px-2 md:px-6 py-3 border-r border-b border-slate-200 dark:border-slate-700 text-sm text-slate-600 dark:text-slate-300 whitespace-nowrap">${r.department || "-"}</td>
                <td class="px-2 md:px-6 py-3 border-r border-b border-slate-200 dark:border-slate-700 text-center text-sm text-slate-600 dark:text-slate-300 whitespace-nowrap">${r.floor || "-"}</td>
                <td class="px-2 md:px-6 py-3 border-r border-b border-slate-200 dark:border-slate-700">${badge}</td>
                <td class="px-2 md:px-6 py-3 border-r border-b border-slate-200 dark:border-slate-700 text-xs text-gray-500 dark:text-slate-400 whitespace-nowrap">${r.auditDate}<br>${r.auditor}</td>
                <td class="px-2 md:px-6 py-3 border-r border-b border-slate-200 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400 max-w-[150px] truncate" title="${r.auditNote}">${r.auditNote}</td>
                <td class="px-2 md:px-6 py-3 border-r border-b border-slate-200 dark:border-slate-700 text-center">${imgLink}</td>
                <td class="px-2 md:px-6 py-3 text-center border-b border-slate-200 dark:border-slate-700">${editBtn}</td>
            `;
        tbody.appendChild(tr);
    });
}

function showAlert(t, m) { $('alert-title').textContent = t; $('alert-message').textContent = m; $('alert-modal').classList.remove('hidden'); }
function handleSort(key) { if (sortConfig.key === key) sortConfig.direction = sortConfig.direction === 'asc' ? 'desc' : 'asc'; else { sortConfig.key = key; sortConfig.direction = 'asc'; } ['assetID', 'deviceName', 'model', 'division', 'department', 'floor', 'status'].forEach(k => { const icon = $(`sort-icon-${k}`); if (icon) icon.textContent = ''; }); const activeIcon = $(`sort-icon-${key}`); if (activeIcon) activeIcon.textContent = sortConfig.direction === 'asc' ? '' : ''; currentData.sort((a, b) => { let valA = a[key] ? String(a[key]).toLowerCase() : ''; let valB = b[key] ? String(b[key]).toLowerCase() : ''; if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1; if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1; return 0; }); currentPage = 1; renderTable(); }
function handleAuditSort(key) {
    if (auditSortConfig.key === key) auditSortConfig.direction = auditSortConfig.direction === 'asc' ? 'desc' : 'asc'; else { auditSortConfig.key = key; auditSortConfig.direction = 'asc'; }
    ['assetID', 'deviceName', 'auditLocation', 'department', 'floor', 'isAudited', 'auditDate'].forEach(k => { const icon = document.getElementById(`audit-sort-icon-${k}`); if (icon) icon.textContent = ''; });
    const activeIcon = document.getElementById(`audit-sort-icon-${key}`); if (activeIcon) activeIcon.textContent = auditSortConfig.direction === 'asc' ? '' : '';
    auditFilteredData.sort((a, b) => {
        let valA = a[key] ? String(a[key]).toLowerCase() : ''; let valB = b[key] ? String(b[key]).toLowerCase() : '';
        if (key === 'isAudited') { valA = a.isAudited ? 1 : 0; valB = b.isAudited ? 1 : 0; }
        if (key === 'auditDate') { const pd = (d) => { if (!d || d === '-' || d === '') return 0; try { const [dp, tp] = d.split(' '); const [D, M, Y] = dp.split('/'); const [h, m] = tp.split(':'); return new Date(Y, M - 1, D, h, m).getTime(); } catch { return 0; } }; valA = pd(a.auditDate); valB = pd(b.auditDate); }
        if (valA < valB) return auditSortConfig.direction === 'asc' ? -1 : 1; if (valA > valB) return auditSortConfig.direction === 'asc' ? 1 : -1; return 0;
    }); auditCurrentPage = 1; renderAuditTable();
}

// --- ส่วน Logic ตัวกรองละเอียด (Column Filter) ---
let columnFilters = {}; // เก็บค่าการกรองแต่ละคอลัมน์

function toggleFilterRow() {
    const row = document.getElementById('filter-row');
    const btn = document.getElementById('toggleFilterBtn');

    // สลับ class hidden
    if (row.classList.contains('hidden')) {
        row.classList.remove('hidden');
        btn.classList.add('bg-indigo-50', 'text-indigo-600', 'border-indigo-300'); // Highlight ปุ่ม
    } else {
        row.classList.add('hidden');
        btn.classList.remove('bg-indigo-50', 'text-indigo-600', 'border-indigo-300');
    }
}

// ฟังก์ชันสำหรับดึงข้อมูลที่มีอยู่จริง มาใส่ใน Dropdown ตัวกรอง
function populateFilterDropdowns() {
    // รายชื่อคอลัมน์ที่จะทำ Dropdown
    const keys = ['model', 'division', 'department', 'floor'];

    keys.forEach(key => {
        const select = document.getElementById(`filter-${key}`);
        if (!select) return;

        // 1. ดึงข้อมูลจาก allData เฉพาะคอลัมน์นั้น
        // 2. ตัดค่าว่างทิ้ง (filter)
        // 3. เอาค่าซ้ำออก (Set)
        // 4. เรียงตามตัวอักษร (sort)
        const uniqueValues = [...new Set(allData.map(item => String(item[key] || "").trim()).filter(val => val !== ""))].sort();

        // เก็บ Option แรกไว้ (ที่เขียนว่า "ทุก...") แล้วล้างที่เหลือ
        const firstOption = select.firstElementChild;
        select.innerHTML = '';
        select.appendChild(firstOption);

        // วนลูปสร้าง Option ใหม่
        uniqueValues.forEach(val => {
            const opt = document.createElement('option');
            opt.value = val; // ค่าสำหรับกรอง
            opt.textContent = val; // ข้อความที่แสดง
            select.appendChild(opt);
        });
    });
}

function handleColumnFilter(key, value) {
    // 1. อัปเดตค่าในตัวแปร
    if (value && value.trim() !== "") {
        columnFilters[key] = value.toLowerCase().trim();
    } else {
        delete columnFilters[key]; // ลบ key ออกถ้าเป็นค่าว่าง
    }

    // 2. เรียกใช้ฟังก์ชันกรองรวม
    applyAllFilters();
}
function clearColumnFilters() {
    // 1. รีเซ็ตตัวแปรเก็บค่า Filter
    columnFilters = {};

    // 2. ล้างค่าใน Input Text ทั้งหมดในแถว Filter
    document.querySelectorAll('#filter-row input').forEach(input => input.value = '');

    // 3. ล้างค่าใน Select Dropdown ทั้งหมดในแถว Filter
    document.querySelectorAll('#filter-row select').forEach(select => select.value = '');

    // 4. เรียกฟังก์ชันกรองข้อมูลใหม่ (ตารางจะกลับมาแสดงข้อมูลตั้งต้น)
    applyAllFilters();
}
function applyAllFilters() {
    // เริ่มจากข้อมูลทั้งหมด
    let filtered = allData;

    // A. กรองจาก Search Box หลัก (ถ้ามี)
    const globalSearch = document.getElementById('searchBox').value.toLowerCase();
    if (globalSearch) {
        filtered = filtered.filter(item =>
            Object.values(item).some(val => String(val).toLowerCase().includes(globalSearch))
        );
    }

    // B. กรองตามคอลัมน์ (Column Filters)
    // ใช้ Logic AND (ต้องตรงทุกเงื่อนไขที่กรอก)
    if (Object.keys(columnFilters).length > 0) {
        filtered = filtered.filter(item => {
            return Object.keys(columnFilters).every(key => {
                const itemVal = String(item[key] || "").toLowerCase();
                const filterVal = columnFilters[key];
                return itemVal.includes(filterVal);
            });
        });
    }

    // 3. อัปเดตข้อมูลและ Render ตารางใหม่
    currentData = filtered;
    currentPage = 1;
    renderTable();
}

// แก้ไข Event Listener ของ SearchBox เดิมให้มาใช้ฟังก์ชันรวมนี้
document.getElementById('searchBox').addEventListener('input', applyAllFilters);
// ... (โค้ดเดิม) ...


// --- [เพิ่มใหม่] ปุ่มค้นหารูป Google ---
const btnGoogleSearch = document.getElementById('btn-google-search');
if (btnGoogleSearch) {
    btnGoogleSearch.addEventListener('click', () => {
        const modelVal = document.getElementById('model').value.trim();
        const nameVal = document.getElementById('deviceName').value.trim();

        // เอารุ่น หรือ ชื่ออุปกรณ์ ไปค้น (ถ้ามีรุ่น เอารุ่นก่อน)
        const keyword = modelVal || nameVal;

        if (keyword) {
            // เปิดหน้า Google Images ในแท็บใหม่
            window.open(`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(keyword)}`, '_blank');
        } else {
            alert("กรุณาพิมพ์ชื่อรุ่น หรือชื่ออุปกรณ์ก่อนค้นหา");
        }
    });
}
// --- [เพิ่มใหม่] ฟังก์ชันจัดการการ Paste รูปภาพ ---

// 1. ฟังก์ชันหลักสำหรับประมวลผลการวาง
function handlePasteImage(items) {
    for (let i = 0; i < items.length; i++) {
        // เช็คว่าเป็นรูปภาพหรือไม่
        if (items[i].type.indexOf("image") !== -1) {
            const blob = items[i].getAsFile();

            // สร้าง File Object จำลองขึ้นมา
            const file = new File([blob], "pasted_image.png", { type: blob.type });

            // ยัดใส่ Input File (asset-image-input)
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(file);
            const fileInput = document.getElementById('asset-image-input');
            fileInput.files = dataTransfer.files;

            // แสดง Preview
            const reader = new FileReader();
            reader.onload = (e) => {
                document.getElementById('asset-image-img').src = e.target.result;
                document.getElementById('asset-image-preview-container').classList.remove('hidden');
                isImageDeleted = false; // สำคัญ: บอกระบบว่ามีรูปนะ อย่าลบ
            };
            reader.readAsDataURL(file);

            showAlert("วางรูปสำเร็จ", "รูปภาพถูกนำมาใส่เรียบร้อยแล้ว");
            return; // เจอรูปแล้วจบเลย
        }
    }
}

// 2. Event: กดปุ่ม "วาง" (Paste Button)
const btnPaste = document.getElementById('btn-paste-image');
if (btnPaste) {
    btnPaste.addEventListener('click', async () => {
        // [แก้ไขใหม่] เช็คก่อนว่า Browser อนุญาตให้เข้าถึง Clipboard หรือไม่
        if (!navigator.clipboard || !navigator.clipboard.read) {
            return showAlert("ข้อจำกัด Browser", "ฟังก์ชันปุ่มวางรูปใช้งานได้เฉพาะบน HTTPS หรือ Localhost เท่านั้น\n\n👉 กรุณากดปุ่ม Ctrl+V (ที่คีย์บอร์ด) เพื่อวางรูปแทนครับ");
        }
        try {
            // ขออ่าน Clipboard (ต้องกดอนุญาตในบาง Browser)
            const clipboardItems = await navigator.clipboard.read();
            for (const item of clipboardItems) {
                // ดึงเฉพาะ Type ที่เป็นรูปภาพ
                const imageTypes = item.types.filter(type => type.startsWith('image/'));
                for (const type of imageTypes) {
                    const blob = await item.getType(type);
                    // แปลง Blob เป็น File แล้วส่งไปฟังก์ชันเดิม
                    const file = new File([blob], "pasted_clipboard.png", { type });
                    const dt = new DataTransfer();
                    dt.items.add(file);

                    // จำลองเหตุการณ์เหมือน handlePasteImage ข้างบน
                    const fileInput = document.getElementById('asset-image-input');
                    fileInput.files = dt.files;

                    const reader = new FileReader();
                    reader.onload = (e) => {
                        document.getElementById('asset-image-img').src = e.target.result;
                        document.getElementById('asset-image-preview-container').classList.remove('hidden');
                        isImageDeleted = false;
                    };
                    reader.readAsDataURL(file);
                    showAlert("วางรูปสำเร็จ", "วางรูปจาก Clipboard แล้ว");
                    return;
                }
            }
            showAlert("ไม่พบรูปภาพ", "ใน Clipboard ของคุณไม่มีรูปภาพ");
        } catch (err) {
            console.error(err);
            showAlert("แจ้งเตือน", "กรุณากด Ctrl+V เพื่อวางรูป (Browser อาจไม่อนุญาตให้ปุ่มเข้าถึง Clipboard)");
        }
    });
}

// 3. Event: กด Ctrl+V (Global Paste) เมื่อเปิด Modal อยู่
document.addEventListener('paste', (e) => {
    // ทำงานเฉพาะตอน Modal เปิดอยู่
    if (!$('form-modal').classList.contains('hidden')) {
        const items = (e.clipboardData || e.originalEvent.clipboardData).items;
        handlePasteImage(items);
    }
});
// [Script.html] เพิ่มโค้ดนี้ลงไป

// Event Listener สำหรับปุ่ม Download Template
const btnDownloadTemplate = document.getElementById('downloadTemplateBtn');
if (btnDownloadTemplate) {
    btnDownloadTemplate.addEventListener('click', () => {
        // 1. [แก้] เพิ่ม QRCodeURL และ ImageURL ในหัวตาราง
        const headers = [
            ["AssetID", "DeviceName", "Model", "Brand", "Division", "Department", "User", "Status", "QRCodeURL", "Remark", "ImageURL", "Floor"]
        ];

        // 2. สร้าง Workbook
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(headers);

        // 3. [แก้] กำหนดความกว้างคอลัมน์ใหม่ (ให้ตรงกับ I และ K ที่เพิ่มมา)
        ws['!cols'] = [
            { wch: 15 }, // A: AssetID
            { wch: 25 }, // B: DeviceName
            { wch: 15 }, // C: Model
            { wch: 15 }, // D: Brand
            { wch: 20 }, // E: Division
            { wch: 20 }, // F: Department
            { wch: 15 }, // G: User
            { wch: 10 }, // H: Status
            { wch: 25 }, // I: QRCodeURL (เพิ่มใหม่)
            { wch: 25 }, // J: Remark (ขยับมา)
            { wch: 25 }, // K: ImageURL (เพิ่มใหม่)
            { wch: 8 }   // L: Floor (ขยับมา)
        ];

        // 4. เพิ่ม Sheet และสั่งดาวน์โหลด
        XLSX.utils.book_append_sheet(wb, ws, "Template");
        XLSX.writeFile(wb, "Asset_Template.xlsx");
    });
}
// [Script.html]

function downloadArchive(type) {
    // ป้องกันการกดรัวๆ
    const cardId = type === 'returned' ? 'card-returned' : 'card-retired';
    const card = document.getElementById(cardId);

    // แสดงสถานะว่ากำลังโหลด (เปลี่ยน Cursor เป็นรอ)
    document.body.style.cursor = 'wait';
    card.classList.add('opacity-50');

    apiGet(`/api/archive-data?type=${type}`)
        .then(res => {
            document.body.style.cursor = 'default';
            card.classList.remove('opacity-50');

            if (res.status === 'success') {
                if (res.data.length <= 1) { // มีแค่หัวตาราง
                    showAlert("แจ้งเตือน", "ยังไม่มีข้อมูลในระบบ Archive นี้");
                    return;
                }

                // สร้างไฟล์ Excel
                const ws = XLSX.utils.aoa_to_sheet(res.data);
                const wb = XLSX.utils.book_new();
                const sheetName = type === 'returned' ? "Returned_Items" : "Retired_Items";
                XLSX.utils.book_append_sheet(wb, ws, sheetName);

                // ตั้งชื่อไฟล์ตามประเภทและวันที่
                const fileName = `Archive_${sheetName}_${new Date().toISOString().slice(0, 10)}.xlsx`;
                XLSX.writeFile(wb, fileName);

                showAlert("สำเร็จ", `ดาวน์โหลดข้อมูล ${sheetName} เรียบร้อยแล้ว`);
            } else {
                showAlert("ผิดพลาด", res.message);
            }
        })
        .catch(err => {
            document.body.style.cursor = 'default';
            card.classList.remove('opacity-50');
            showAlert("Error", err.message);
        });
}

function fetchOrganizationData() {
    return apiGet('/api/org-data')
        .then(data => {
            ORGANIZATION_DATA = data || {};
        })
        .catch(err => {
            console.error("Failed to load org data", err);
            ORGANIZATION_DATA = {};
        });
}

function populateOrgDropdowns() {
    ['location', 'audit-location'].forEach(id => {
        const sel = $(id);
        if (!sel) return;
        sel.innerHTML = '<option value="">-- เลือกสังกัด --</option>';
        for (const div in ORGANIZATION_DATA) {
            const opt = document.createElement('option');
            opt.value = div;
            opt.textContent = div;
            sel.appendChild(opt);
        }
    });
}

// [เพิ่มใหม่] ส่วนจัดการ Scanner
let html5QrCode;

function startScanner() {
    // Check for HTTPS or Localhost
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert("เบราว์เซอร์นี้ไม่รองรับการเข้าถึงกล้อง หรือไม่ได้เชื่อมต่อผ่าน HTTPS");
        return;
    }

    const modal = document.getElementById('scanner-modal');
    if (modal) modal.classList.remove('hidden');

    // ถ้าเคยสร้าง instance แล้ว ให้ใช้ตัวเดิม
    if (!html5QrCode) {
        // ตรวจสอบว่ามี element reader หรือไม่
        if (!document.getElementById("reader")) {
            console.error("Scanner element 'reader' not found");
            return;
        }
        html5QrCode = new Html5Qrcode("reader");
    }

    const config = { fps: 10, qrbox: { width: 250, height: 250 } };

    // เริ่มกล้อง (ใช้กล้องหลังเป็นค่าเริ่มต้น)
    html5QrCode.start({ facingMode: "environment" }, config, onScanSuccess, (error) => {
        // scanning error, ignore
    }).catch(err => {
        console.error(err);
        let msg = "เกิดข้อผิดพลาดในการเปิดกล้อง";

        if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
            msg = "🚫 คุณไม่อนุญาตให้เข้าถึงกล้อง\n\nวิธีแก้:\n1. กดที่ไอคอนแม่กุญแจ 🔒 (บน) หรือ 'Aa' (ล่าง)\n2. เลือก 'การตั้งค่าเว็บไซต์' (Website Settings)\n3. อนุญาตให้ใช้ 'กล้อง' (Camera)";
        } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
            msg = "📷 ไม่พบกล้องในอุปกรณ์นี้";
        } else if (err.name === "NotReadableError" || err.name === "TrackStartError") {
            msg = "⚠️ กล้องกำลังถูกใช้งานโดยแอปอื่น หรือระบบล็อกอยู่";
        } else if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
            msg = "⚠️ การใช้งานกล้องต้องทำผ่าน HTTPS เท่านั้น";
        }

        alert(msg);
        if (modal) modal.classList.add('hidden');
    });
}

function stopScanner() {
    const modal = document.getElementById('scanner-modal');
    if (html5QrCode) {
        html5QrCode.stop().then(() => {
            if (modal) modal.classList.add('hidden');
        }).catch(err => {
            console.log("Stop failed: ", err);
            // Even if stop fails, hide modal and try to clear
            if (modal) modal.classList.add('hidden');
        });
    } else {
        if (modal) modal.classList.add('hidden');
    }
}

function onScanSuccess(decodedText, decodedResult) {
    // 1. หยุดสแกนและปิด Modal
    stopScanner();

    console.log(`Scan result: ${decodedText}`);

    // 2. ตรวจสอบว่าผลลัพธ์เป็น URL ที่มีค่า id หรือไม่
    let assetId = decodedText;
    try {
        if (decodedText.includes("id=") || decodedText.includes("?")) {
            // รองรับทั้ง ?id=... และ URL เต็ม
            const urlStr = decodedText.startsWith("http") ? decodedText : `http://dummy.com/${decodedText}`;
            const url = new URL(urlStr);
            const idParam = url.searchParams.get("id");
            if (idParam) assetId = idParam;
        }
    } catch (e) {
        console.log("Parse URL failed, using raw text", e);
    }

    // 3. ค้นหาในฐานข้อมูล local (allData) โดยตรง เพื่อความแม่นยำ
    const exactMatch = allData.find(d => String(d.assetID) === String(assetId));

    if (exactMatch) {
        // เจอ! เปิดหน้ารายละเอียดเลย
        showForm('view', exactMatch.assetID, true);

        // (Optional) สลับไปหน้า List และกรองให้ด้วย เพื่อให้ Background เป็นรายการนั้น
        switchView('list');
        const searchBox = document.getElementById('searchBox');
        if (searchBox) {
            searchBox.value = assetId;
            applyAllFilters();
        }
    } else {
        // ไม่เจอ
        showAlert("ไม่พบข้อมูล", `ไม่พบครุภัณฑ์หมายเลข: ${assetId} ในระบบ`);
    }
}

