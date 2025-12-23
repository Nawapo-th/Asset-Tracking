const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const bodyParser = require('body-parser');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const axios = require('axios');

const app = express();
const port = 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));
app.use('/uploads', express.static('uploads'));
app.use(express.static('public')); // Serve frontend files if needed

// Ensure uploads and temp directory exists
const uploadDir = path.join(__dirname, 'uploads');
const tempDir = path.join(uploadDir, 'temp');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

// Database Connection
const pool = mysql.createPool({
    host: process.env.DB_HOST || '10.67.3.111',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'Qshc@68335',
    database: process.env.DB_NAME || 'asset_db',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    timezone: 'Z'
});

// --- Auto-Migration: Ensure 'Floor' column exists in settings ---
(async () => {
    try {
        const connection = await pool.getConnection();
        const [rows] = await connection.query("SHOW COLUMNS FROM settings LIKE 'Floor'");
        if (rows.length === 0) {
            console.log("Adding 'Floor' column to settings table...");
            await connection.query("ALTER TABLE settings ADD COLUMN Floor VARCHAR(100) DEFAULT ''");
        }
        connection.release();
    } catch (err) {
        // Table might not exist yet, or connection error. 
        // We log but don't crash, assuming table will be created or checked transparently.
        console.error("Migration Check Log:", err.message);
    }
})();

// --- Auto-Migration: Ensure 'จ้างเหมา งานเทคโนโลยีสารสนเทศ' exists in settings ---
(async () => {
    try {
        const connection = await pool.getConnection();
        const [rows] = await connection.query("SELECT * FROM settings WHERE Department = 'จ้างเหมา งานเทคโนโลยีสารสนเทศ'");
        if (rows.length === 0) {
            console.log("Seeding 'จ้างเหมา งานเทคโนโลยีสารสนเทศ'...");
            await connection.query("INSERT INTO settings (Division, Department, Status) VALUES (?, ?, ?)",
                ['ฝ่ายบริการและสนันสนุนทั่วไป', 'จ้างเหมา งานเทคโนโลยีสารสนเทศ', 'ใช้งาน']);
        }
        connection.release();
    } catch (err) {
        console.error("Seeding Check Log:", err.message);
    }
})();

// --- Helper Functions ---

async function logAction(user, action, id, details) {
    try {
        await pool.query(
            'INSERT INTO history (User, Action, AssetID, Details) VALUES (?, ?, ?, ?)',
            [user, action, id, details]
        );
    } catch (err) {
        console.error('Log Error:', err);
    }
}

function saveImage(base64Data, filename) {
    try {
        // Check if data is a Data URI scheme (contains comma)
        // Frontend currently sends raw base64 (split(',')[1]), so this handles both cases.
        const base64Content = base64Data.includes(',')
            ? base64Data.split(',')[1]
            : base64Data;

        const buffer = Buffer.from(base64Content, 'base64');
        const filePath = path.join(uploadDir, filename);
        fs.writeFileSync(filePath, buffer);
        return `/uploads/${filename}`;
    } catch (e) {
        console.error('Save Image Error:', e);
        return null;
    }
}

function generateQRCodeUrl(id) {
    // Using a public API for QR codes similar to original script, or could use 'qrcode' lib locally
    // Original: https://quickchart.io/qr?text=...
    // We'll keep the logic but point to our local server URL if needed, or just the ID
    const baseUrl = 'http://10.67.3.111/asset'; // เปลี่ยนเป็น IP Server ของคุณและเส้นทางใหม่
    return `https://quickchart.io/qr?text=${encodeURIComponent(baseUrl + '?id=' + encodeURIComponent(id))}&margin=0&size=500&ecLevel=L`;
}

// --- API Endpoints ---

// 1. Login
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        // Proxy to KKU Auth
        const response = await axios.post("https://webappqshc.kku.ac.th/QSHCAuth/api/Account/ADAuthJson", {
            username,
            password
        });

        if (response.data && response.data.isSuccess) {
            const d = response.data.data || {};
            const adminDivisions = ["งานเทคโนโลยีสารสนเทศ", "จ้างเหมา งานเทคโนโลยีสารสนเทศ"];
            const role = adminDivisions.includes(d.division || "") ? "admin" : "user";
            res.json({ success: true, name: d.fullName || response.data.fullName || username, role });
        } else {
            res.json({ success: false, message: response.data.message || "Login failed" });
        }
    } catch (error) {
        // Fallback for dev/testing if external API is unreachable
        if (username === 'admin' && password === 'admin') {
            res.json({ success: true, name: 'Admin Test', role: 'admin' });
        } else {
            res.json({ success: false, message: "Login Error: " + error.message });
        }
    }
});

// 2. Get Organization Data (Settings)
app.get('/api/org-data', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM settings');
        const map = {};
        rows.forEach(row => {
            if (!map[row.Division]) map[row.Division] = [];
            // Generic Deduplication
            if (!map[row.Division].includes(row.Department)) {
                map[row.Division].push(row.Department);
            }
        });
        // Return both the simplified map (for dropdowns) and the full list (for auto-filling Floor)
        res.json({ map, list: rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3. Get All Data (Inventory + Audit info)
app.get('/api/data', async (req, res) => {
    try {
        const [invRows] = await pool.query('SELECT * FROM inventory ORDER BY AssetID');
        const [auditRows] = await pool.query('SELECT * FROM audits');

        const currentYear = new Date().getFullYear() + 543;
        const auditMap = {};

        auditRows.forEach(r => {
            if (String(r.FiscalYear) === String(currentYear)) {
                auditMap[String(r.AssetID)] = {
                    note: r.Note || "",
                    date: r.AuditDate,
                    auditor: r.Auditor,
                    image: r.ImageURL || ""
                };
            }
        });

        const data = invRows.map(r => {
            const info = auditMap[String(r.AssetID)];
            return {
                assetID: r.AssetID,
                deviceName: r.DeviceName,
                model: r.Model,
                brand: r.Brand,
                division: r.Division,
                department: r.Department,
                user: r.User,
                status: r.Status,
                qrCodeUrl: r.QRCodeURL,
                remark: r.Remark || "",
                assetImage: r.ImageURL || "",
                floor: r.Floor || "",
                isAudited: !!info,
                auditNote: info?.note || "",
                auditDate: info ? new Date(info.date).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' }) : "",
                auditor: info?.auditor || "",
                auditImage: info?.image || ""
            };
        });

        res.json({ status: "success", data, currentYear });
    } catch (err) {
        res.status(500).json({ status: "error", message: err.message });
    }
});

// 4. Add Data
app.post('/api/add', async (req, res) => {
    const { obj, user } = req.body;
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        // Check duplicates
        const [dupInv] = await connection.query('SELECT AssetID FROM inventory WHERE AssetID = ?', [obj.assetID]);
        const [dupRet] = await connection.query('SELECT AssetID FROM archive_returned WHERE AssetID = ?', [obj.assetID]);
        const [dupOld] = await connection.query('SELECT AssetID FROM archive_retired WHERE AssetID = ?', [obj.assetID]);

        if (dupInv.length > 0 || dupRet.length > 0 || dupOld.length > 0) {
            await connection.rollback();
            return res.json({ status: "duplicate", message: "Asset ID already exists." });
        }

        let imgUrl = "";
        if (obj.image && obj.image.base64) {
            const ext = obj.image.mimeType.split('/')[1];
            imgUrl = saveImage(obj.image.base64, `Asset_${obj.assetID}_${Date.now()}.${ext}`);
        }

        const query = `INSERT INTO inventory 
            (AssetID, DeviceName, Model, Brand, Division, Department, User, Status, QRCodeURL, Remark, ImageURL, Floor, LastEditBy, LastEditDate) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`;

        await connection.query(query, [
            obj.assetID, obj.deviceName, obj.model, obj.brand, obj.location, obj.department,
            obj.user, obj.status, generateQRCodeUrl(obj.assetID), obj.remark, imgUrl, obj.floor, user
        ]);

        await logAction(user, "ADD", obj.assetID, `เพิ่มครุภัณฑ์ใหม่: ${obj.deviceName} | หน่วยงาน: ${obj.department} | ชั้น: ${obj.floor || '-'}`);

        await connection.commit();
        res.json({ status: "success", message: "Added successfully." });
    } catch (err) {
        await connection.rollback();
        res.status(500).json({ status: "error", message: err.message });
    } finally {
        connection.release();
    }
});

// 5. Update Data
app.post('/api/update', async (req, res) => {
    const { oid, obj, user, fullName } = req.body;
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const [rows] = await connection.query('SELECT * FROM inventory WHERE AssetID = ?', [oid]);
        if (rows.length === 0) {
            await connection.rollback();
            return res.json({ status: "error", message: "Not found" });
        }
        const oldRow = rows[0];

        // Check if ID changed and new ID exists
        if (String(oid) !== String(obj.assetID)) {
            const [dup] = await connection.query('SELECT AssetID FROM inventory WHERE AssetID = ?', [obj.assetID]);
            if (dup.length > 0) {
                await connection.rollback();
                return res.json({ status: "error", message: "New ID taken" });
            }
        }

        let imgUrl = oldRow.ImageURL;
        let changes = [];

        // บันทึกการเปลี่ยนแปลงทุกฟิลด์ที่สำคัญ
        if (oldRow.DeviceName !== obj.deviceName) changes.push(`ชื่อ: ${oldRow.DeviceName} → ${obj.deviceName}`);
        if (oldRow.Model !== obj.model) changes.push(`รุ่น: ${oldRow.Model || '-'} → ${obj.model || '-'}`);
        if (oldRow.Brand !== obj.brand) changes.push(`ยี่ห้อ: ${oldRow.Brand || '-'} → ${obj.brand || '-'}`);
        if (oldRow.Division !== obj.location) changes.push(`สังกัด: ${oldRow.Division || '-'} → ${obj.location || '-'}`);
        if (oldRow.Department !== obj.department) changes.push(`หน่วยงาน: ${oldRow.Department || '-'} → ${obj.department || '-'}`);
        if (oldRow.Floor !== obj.floor) changes.push(`ชั้น: ${oldRow.Floor || '-'} → ${obj.floor || '-'}`);
        if (oldRow.User !== obj.user) changes.push(`ผู้ใช้งาน: ${oldRow.User || '-'} → ${obj.user || '-'}`);
        if (oldRow.Status !== obj.status) changes.push(`สถานะ: ${oldRow.Status} → ${obj.status}`);
        if (oldRow.Remark !== obj.remark) changes.push(`หมายเหตุ: เปลี่ยนแปลง`);

        if (obj.image && obj.image.base64) {
            const ext = obj.image.mimeType.split('/')[1];
            imgUrl = saveImage(obj.image.base64, `Asset_${obj.assetID}_${Date.now()}.${ext}`);
            changes.push("รูปภาพ: เปลี่ยนใหม่");
        } else if (obj.deleteImage) {
            imgUrl = "";
            changes.push("รูปภาพ: ลบออก");
        }

        // Archive Check
        if (obj.status === "ส่งคืน" || obj.status === "แทงชำรุด") {
            const targetTable = obj.status === "ส่งคืน" ? "archive_returned" : "archive_retired";
            const archiveQuery = `INSERT INTO ${targetTable} 
                (AssetID, DeviceName, Model, Brand, Division, Department, User, Status, QRCodeURL, Remark, ImageURL, Floor, ArchivedDate)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`;

            await connection.query(archiveQuery, [
                obj.assetID, obj.deviceName, obj.model, obj.brand, obj.location, obj.department,
                obj.user, obj.status, generateQRCodeUrl(obj.assetID), obj.remark, imgUrl, obj.floor
            ]);

            await connection.query('DELETE FROM inventory WHERE id = ?', [oldRow.id]);
            await logAction(user, "ARCHIVE", obj.assetID, `ย้ายไป ${obj.status}`);

            await connection.commit();
            return res.json({ status: "success", message: `Moved to ${obj.status}` });
        }

        // Normal Update
        const updateQuery = `UPDATE inventory SET 
            AssetID=?, DeviceName=?, Model=?, Brand=?, Division=?, Department=?, User=?, Status=?, 
            QRCodeURL=?, Remark=?, ImageURL=?, Floor=?, LastEditBy=?, LastEditDate=NOW() 
            WHERE id=?`;

        await connection.query(updateQuery, [
            obj.assetID, obj.deviceName, obj.model, obj.brand, obj.location, obj.department,
            obj.user, obj.status, generateQRCodeUrl(obj.assetID), obj.remark, imgUrl, obj.floor,
            fullName || user, oldRow.id
        ]);

        await logAction(user, "EDIT", obj.assetID, `แก้ไขโดย: ${fullName || user} | ${changes.join(", ")}`);

        await connection.commit();
        res.json({ status: "success", message: "Updated." });

    } catch (err) {
        await connection.rollback();
        res.status(500).json({ status: "error", message: err.message });
    } finally {
        connection.release();
    }
});

// 6. Delete Data
app.post('/api/delete', async (req, res) => {
    const { id, user } = req.body;
    try {
        await pool.query('DELETE FROM inventory WHERE AssetID = ?', [id]);
        await pool.query('DELETE FROM audits WHERE AssetID = ?', [id]);
        await logAction(user, "DELETE", id, "Deleted asset and audits");
        res.json({ status: "success", message: "Deleted." });
    } catch (err) {
        res.status(500).json({ status: "error", message: err.message });
    }
});

// 7. Submit Audit
app.post('/api/audit', async (req, res) => {
    const d = req.body.obj || req.body.d;
    const { user } = req.body;
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const [existing] = await connection.query('SELECT * FROM audits WHERE AssetID = ? AND FiscalYear = ?', [d.assetID, d.fiscalYear]);

        let imgUrl = existing.length > 0 ? existing[0].ImageURL : "";
        if (d.image && d.image.base64) {
            const ext = d.image.mimeType.split('/')[1];
            imgUrl = saveImage(d.image.base64, `Audit_${d.fiscalYear}_${d.assetID}_${Date.now()}.${ext}`);
        } else if (d.deleteImage) {
            imgUrl = "";
        }

        const locationLog = d.floor ? `${d.department} (ชั้น ${d.floor})` : d.department;

        if (existing.length > 0) {
            await connection.query('UPDATE audits SET AuditDate=NOW(), Auditor=?, Result=?, Note=?, LocationAtAudit=?, ImageURL=? WHERE id=?',
                [user, "Found", d.note, locationLog, imgUrl, existing[0].id]);
            await logAction(user, "AUDIT_UPDATE", d.assetID, `Update audit ${d.fiscalYear}`);
        } else {
            await connection.query('INSERT INTO audits (AssetID, FiscalYear, AuditDate, Auditor, Result, Note, LocationAtAudit, ImageURL) VALUES (?, ?, NOW(), ?, ?, ?, ?, ?)',
                [d.assetID, d.fiscalYear, user, "Found", d.note, locationLog, imgUrl]);
            await logAction(user, "AUDIT", d.assetID, `Audit ${d.fiscalYear}`);
        }

        // Update Inventory Status/Location
        if (d.status === "ส่งคืน" || d.status === "แทงชำรุด") {
            // Logic to move to archive (similar to update) - simplified here for brevity
            // For now, just update status in inventory if not moving
        } else {
            await connection.query('UPDATE inventory SET Division=?, Department=?, Status=?, Floor=?, LastEditBy=?, LastEditDate=NOW() WHERE AssetID=?',
                [d.location, d.department, d.status, d.floor, user, d.assetID]);
        }

        await connection.commit();
        res.json({ status: "success", message: "Audit Saved." });
    } catch (err) {
        await connection.rollback();
        res.status(500).json({ status: "error", message: err.message });
    } finally {
        connection.release();
    }
});

// 8. Get Audit Report Data
app.get('/api/audit-report', async (req, res) => {
    const { year } = req.query;
    try {
        const [invRows] = await pool.query('SELECT * FROM inventory ORDER BY AssetID');
        const [auditRows] = await pool.query('SELECT * FROM audits WHERE FiscalYear = ?', [year]);

        const auditMap = {};
        auditRows.forEach(r => {
            auditMap[String(r.AssetID)] = {
                date: r.AuditDate,
                auditor: r.Auditor,
                note: r.Note,
                loc: r.LocationAtAudit,
                img: r.ImageURL
            };
        });

        const data = invRows.map(r => {
            const info = auditMap[String(r.AssetID)];
            return {
                assetID: r.AssetID,
                deviceName: r.DeviceName,
                brand: r.Brand,
                division: r.Division,
                department: r.Department,
                currentStatus: r.Status,
                floor: r.Floor || "",
                isAudited: !!info,
                auditDate: info ? new Date(info.date).toLocaleString('th-TH') : "-",
                auditor: info?.auditor || "-",
                auditLocation: info?.loc || "-",
                auditNote: info?.note || "-",
                auditImage: info?.img || "-"
            };
        });

        res.json({ status: "success", data });
    } catch (err) {
        res.status(500).json({ status: "error", message: err.message });
    }
});

// 9. Get Archive Counts
app.get('/api/archive-counts', async (req, res) => {
    try {
        const [retRows] = await pool.query('SELECT COUNT(*) as count FROM archive_returned');
        const [oldRows] = await pool.query('SELECT COUNT(*) as count FROM archive_retired');
        res.json({ returned: retRows[0].count, retired: oldRows[0].count });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 10. Get Asset History
app.get('/api/history', async (req, res) => {
    const { id } = req.query;
    try {
        const [hRows] = await pool.query('SELECT * FROM history WHERE AssetID = ?', [id]);
        const [aRows] = await pool.query('SELECT * FROM audits WHERE AssetID = ?', [id]);

        const historyList = [];

        hRows.forEach(r => {
            historyList.push({
                timestamp: new Date(r.Timestamp).getTime(),
                dateStr: new Date(r.Timestamp).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' }),
                user: r.User,
                type: 'system',
                action: r.Action,
                details: r.Details
            });
        });

        aRows.forEach(r => {
            historyList.push({
                timestamp: new Date(r.AuditDate).getTime(),
                dateStr: new Date(r.AuditDate).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' }),
                user: r.Auditor,
                type: 'audit',
                action: `ตรวจนับ ปี ${r.FiscalYear}`,
                details: `ผล: ${r.Result} | สถานที่: ${r.LocationAtAudit}`
            });
        });

        historyList.sort((a, b) => b.timestamp - a.timestamp);
        res.json({ status: "success", data: historyList });
    } catch (err) {
        res.status(500).json({ status: "error", message: err.message });
    }
});

// 11. Get Archived Data
app.get('/api/archive-data', async (req, res) => {
    const { type } = req.query;
    const table = type === 'returned' ? 'archive_returned' : 'archive_retired';
    try {
        const [rows] = await pool.query(`SELECT * FROM ${table}`);
        // Format dates if needed, or send as is
        const data = rows.map(r => Object.values(r).map(val => (val instanceof Date) ? val.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' }) : val));
        // Add headers as first row if client expects it (client seems to expect array of arrays)
        // Client code: const ws = XLSX.utils.aoa_to_sheet(res.data);
        // So we should return array of arrays, including headers?
        // Code.gs returned raw values which includes headers if using getDataRange().getValues()
        // But here we are querying DB. We should probably add headers.

        const headers = ["ID", "AssetID", "DeviceName", "Model", "Brand", "Division", "Department", "User", "Status", "QRCodeURL", "Remark", "ImageURL", "Floor", "ArchivedDate"];
        const result = [headers, ...data];

        res.json({ status: "success", data: result });
    } catch (err) {
        res.status(500).json({ status: "error", message: err.message });
    }
});

// 19. Get Available Audit Years
app.get('/api/audit-years', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT DISTINCT FiscalYear FROM audits ORDER BY FiscalYear DESC');
        const years = rows.map(r => r.FiscalYear);
        res.json({ status: "success", data: years });
    } catch (err) {
        res.status(500).json({ status: "error", message: err.message });
    }
});

app.get('/api/data', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM inventory ORDER BY AssetID ASC');
        // Transform data if needed, ensure URLs are relative
        const data = rows.map(r => ({
            ...r,
            qrCodeUrl: r.Image ? (r.Image.startsWith('http') ? r.Image : (r.Image.startsWith('uploads/') ? r.Image : `uploads/${r.Image}`)) : null

        }));
        res.json({ status: "success", data: rows });
    } catch (err) {
        res.json({ status: "error", message: err.message });
    }
});

// 12. Batch Delete
app.post('/api/batch-delete', async (req, res) => {
    const { ids, user } = req.body;
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        // Delete from Inventory
        const [invRes] = await connection.query('DELETE FROM inventory WHERE AssetID IN (?)', [ids]);
        // Delete from Audits
        const [auditRes] = await connection.query('DELETE FROM audits WHERE AssetID IN (?)', [ids]);

        await logAction(user, "DELETE_BATCH", "Multiple", `ลบกลุ่มเกลี้ยง (Inv: ${invRes.affectedRows}, Audit: ${auditRes.affectedRows})`);

        await connection.commit();
        res.json({ status: "success", message: `ลบข้อมูลเรียบร้อย (Inv: ${invRes.affectedRows}, Audit: ${auditRes.affectedRows})` });
    } catch (err) {
        await connection.rollback();
        res.status(500).json({ status: "error", message: err.message });
    } finally {
        connection.release();
    }
});

// 13. Delete Audit Record
app.post('/api/delete-audit', async (req, res) => {
    const { id, year, user } = req.body; // Note: client sends {id, year, user} but app.js sends { assetID, year, user }?
    // app.js: apiPost('/api/delete-audit', { assetID: id, year: year, user: ... })
    const assetID = req.body.assetID || id;

    try {
        const [resDb] = await pool.query('DELETE FROM audits WHERE AssetID = ? AND FiscalYear = ?', [assetID, year]);
        if (resDb.affectedRows > 0) {
            await logAction(user, "AUDIT_DELETE", assetID, `ลบข้อมูลตรวจนับปี ${year}`);
            res.json({ status: "success", message: "Deleted." });
        } else {
            res.json({ status: "error", message: "Not found" });
        }
    } catch (err) {
        res.status(500).json({ status: "error", message: err.message });
    }
});

// 14. Generate PDF (HTML Report)
app.post('/api/generate-pdf', async (req, res) => {
    const { year, selectedIds } = req.body;
    try {
        let query = `
            SELECT a.*, i.Department, i.DeviceName 
            FROM audits a 
            LEFT JOIN inventory i ON a.AssetID = i.AssetID 
            WHERE a.FiscalYear = ?
        `;
        let params = [year];

        if (selectedIds && selectedIds.length > 0) {
            query += ' AND a.AssetID IN (?)';
            params.push(selectedIds);
        }

        query += ' ORDER BY i.Department ASC, a.AssetID ASC';

        const [rows] = await pool.query(query, params);

        // Group by Department
        const grouped = {};
        rows.forEach(r => {
            const dept = r.Department || 'ไม่ระบุหน่วยงาน (Unassigned)';
            if (!grouped[dept]) grouped[dept] = [];
            grouped[dept].push(r);
        });

        // Generate HTML
        let html = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Audit Report ${year}</title>
            <style>
                body { font-family: 'Sarabun', sans-serif; padding: 20px; }
                .dept-section { margin-bottom: 50px; page-break-after: always; }
                .dept-section:last-child { page-break-after: auto; }
                h2, h3 { text-align: center; margin: 10px 0; }
                table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 12px; }
                th, td { border: 1px solid #000; padding: 6px; text-align: left; vertical-align: top; }
                th { background-color: #f0f0f0; font-weight: bold; text-align: center; }
                .header { text-align: center; margin-bottom: 20px; }
                .no-print { margin-bottom: 20px; }
                .signature-block { 
                    margin-top: 40px; 
                    display: flex; 
                    justify-content: flex-end; 
                    page-break-inside: avoid;
                }
                .signature-box {
                    text-align: center; 
                    width: 300px;
                }
                .signature-line {
                    border-bottom: 1px dotted #000;
                    display: inline-block;
                    width: 200px;
                    height: 1px;
                    margin: 0 5px;
                }
                @media print { 
                    .no-print { display: none; } 
                    body { padding: 0; }
                }
            </style>
            <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;700&display=swap" rel="stylesheet">
        </head>
        <body>
            <script>
                window.onload = function() {
                    setTimeout(() => { window.print(); }, 800);
                };
            </script>
            
            <div class="no-print" style="text-align: center;">
                <button onclick="window.print()" style="padding: 10px 20px; background: #4F46E5; color: white; border: none; border-radius: 5px; cursor: pointer; font-family: 'Sarabun';">🖨️ พิมพ์รายงาน / บันทึกเป็น PDF (Print)</button>
            </div>

            <div class="header">
                 <h2>รายงานการตรวจนับครุภัณฑ์ ประจำปีงบประมาณ ${year}</h2>
                 <p style="font-size: 12px;">ข้อมูล ณ วันที่: ${new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}</p>
            </div>
        `;

        if (Object.keys(grouped).length === 0) {
            html += `<div style="text-align:center; color:red;">ไม่พบข้อมูลการตรวจนับสำหรับเงื่อนไขที่เลือก</div>`;
        }

        for (const dept in grouped) {
            html += `
            <div class="dept-section">
                <h3>หน่วยงาน: ${dept}</h3>
                <table>
                    <thead>
                        <tr>
                            <th style="width: 15%;">รหัสครุภัณฑ์ (Asset ID)</th>
                            <th style="width: 25%;">ชื่อรายการ (Device Name)</th>
                            <th style="width: 10%;">ผลการนับ</th>
                            <th style="width: 15%;">สถานที่พบ</th>
                            <th style="width: 15%;">ผู้ตรวจ / วันที่</th>
                            <th style="width: 20%;">หมายเหตุ</th>
                        </tr>
                    </thead>
                    <tbody>
            `;

            grouped[dept].forEach(r => {
                html += `
                        <tr>
                            <td style="text-align:center;">${r.AssetID}</td>
                            <td>${r.DeviceName || '-'}</td>
                            <td style="text-align:center;">${r.Result}</td>
                            <td>${r.LocationAtAudit}</td>
                            <td>
                                ${r.Auditor}<br>
                                <span style="font-size:10px; color:#555;">${new Date(r.AuditDate).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}</span>
                            </td>
                            <td>${r.Note || '-'}</td>
                        </tr>
                `;
            });

            html += `
                    </tbody>
                </table>
                
                <div class="signature-block">
                    <div class="signature-box">
                        <p>ตรวจสอบความถูกต้อง</p>
                        <br><br>
                        <p>ลงชื่อ .......................................................</p>
                        <p>( ....................................................... )</p>
                        <p>ตำแหน่ง หัวหน้าหน่วยงาน/ผู้รับผิดชอบ</p>
                        <p>วันที่ ......... / ......... / ...........</p>
                    </div>
                </div>
            </div>
            `;
        }

        html += `
        </body>
        </html>
        `;

        const reportDir = path.join(__dirname, 'public', 'reports');
        if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });

        const filename = `audit_report_${year}_${Date.now()}.html`;
        fs.writeFileSync(path.join(reportDir, filename), html);

        res.json({ status: "success", url: `reports/${filename}` });

    } catch (err) {
        console.error(err);
        res.status(500).json({ status: "error", message: err.message });
    }
});

// 15. Backup Data
app.get('/api/backup', async (req, res) => {
    try {
        const tables = ['inventory', 'audits', 'history', 'archive_returned', 'archive_retired', 'settings'];
        const backupData = {};

        for (const table of tables) {
            const [rows] = await pool.query(`SELECT * FROM ${table}`);
            // Format dates
            backupData[table] = rows.map(r => Object.values(r).map(val => (val instanceof Date) ? val.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' }) : val));
            // Add headers
            if (rows.length > 0) {
                backupData[table].unshift(Object.keys(rows[0]));
            }
        }

        res.json({ status: "success", data: backupData });
    } catch (err) {
        res.status(500).json({ status: "error", message: err.message });
    }
});

// 17. Import Data
const upload = multer({ dest: 'uploads/temp/' });
app.post('/api/import', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ status: "error", message: "No file uploaded" });
        }

        const { user } = req.body;
        const filePath = req.file.path;
        const connection = await pool.getConnection();

        try {
            const xlsx = require('xlsx');
            const workbook = xlsx.readFile(filePath);

            await connection.beginTransaction();
            let message = "";
            let successCount = 0;
            let failCount = 0;

            // 1. Check for "Setting" sheet
            const settingSheetName = workbook.SheetNames.find(n => n.toLowerCase() === 'setting' || n.toLowerCase() === 'settings');
            if (settingSheetName) {
                const sheet = workbook.Sheets[settingSheetName];
                const data = xlsx.utils.sheet_to_json(sheet);
                let settingCount = 0;

                for (const row of data) {
                    const division = row['Division'] || row['หน่วยงาน'];
                    const department = row['Department'] || row['แผนก'];
                    const floor = row['Floor'] || row['ชั้น'] || '';

                    if (division && department) {
                        // Check if Division + Department exists
                        const [existing] = await connection.query(
                            'SELECT id FROM settings WHERE Division = ? AND Department = ?',
                            [division, department]
                        );

                        if (existing.length > 0) {
                            // Update existing record (Update Floor)
                            await connection.query(
                                'UPDATE settings SET Floor = ? WHERE id = ?',
                                [floor, existing[0].id]
                            );
                        } else {
                            // Insert new record
                            await connection.query(
                                'INSERT INTO settings (Division, Department, Floor) VALUES (?, ?, ?)',
                                [division, department, floor]
                            );
                            settingCount++;
                        }
                    }
                }
                message += `Imported ${settingCount} settings. `;
            }

            // 2. Check for Asset/Inventory sheet
            let assetSheetName = workbook.SheetNames.find(n =>
                n.toLowerCase() === 'asset' ||
                n.toLowerCase() === 'assets' ||
                n.toLowerCase() === 'inventory' ||
                n.toLowerCase() === 'data'
            );

            // Fallback logic
            if (!assetSheetName) {
                if (!settingSheetName && workbook.SheetNames.length > 0) {
                    assetSheetName = workbook.SheetNames[0];
                } else if (settingSheetName && workbook.SheetNames.length > 1) {
                    assetSheetName = workbook.SheetNames.find(n => n !== settingSheetName);
                }
            }

            if (assetSheetName) {
                const sheet = workbook.Sheets[assetSheetName];
                const data = xlsx.utils.sheet_to_json(sheet);

                for (const row of data) {
                    const assetID = row['AssetID'] || row['รหัสครุภัณฑ์'];
                    const deviceName = row['DeviceName'] || row['ชื่อครุภัณฑ์'];

                    if (!assetID || !deviceName) {
                        failCount++;
                        continue;
                    }

                    const [dup] = await connection.query('SELECT AssetID FROM inventory WHERE AssetID = ?', [assetID]);
                    if (dup.length > 0) {
                        failCount++;
                        continue;
                    }

                    const model = row['Model'] || row['รุ่น'] || "";
                    const brand = row['Brand'] || row['ยี่ห้อ'] || "";
                    const division = row['Division'] || row['หน่วยงาน'] || "";
                    const department = row['Department'] || row['แผนก'] || "";
                    const userName = row['User'] || row['ผู้ใช้งาน'] || "";
                    const status = row['Status'] || row['สถานะ'] || "ปกติ";
                    const remark = row['Remark'] || row['หมายเหตุ'] || "";
                    const floor = row['Floor'] || row['ชั้น'] || "";
                    const imgUrl = row['ImageURL'] || "";

                    const query = `INSERT INTO inventory 
                        (AssetID, DeviceName, Model, Brand, Division, Department, User, Status, QRCodeURL, Remark, ImageURL, Floor, LastEditBy, LastEditDate) 
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`;

                    try {
                        await connection.query(query, [
                            assetID, deviceName, model, brand, division, department,
                            userName, status, generateQRCodeUrl(assetID), remark, imgUrl, floor, user
                        ]);
                        successCount++;
                    } catch (insertErr) {
                        console.error(`Import Insert Error (ID: ${assetID}):`, insertErr.message);
                        failCount++;
                    }
                }
                message += `Imported ${successCount} assets. `;
            }

            if (successCount > 0 || message.includes("settings")) {
                await logAction(user, "IMPORT", "Batch", message);
                await connection.commit();
                res.json({ status: "success", message: `${message} (Failed/Dup Assets: ${failCount})` });
            } else {
                await connection.rollback();
                res.json({ status: "error", message: "No valid data found to import." });
            }

            try { fs.unlinkSync(filePath); } catch (e) { }

        } catch (err) {
            console.error("Import Transaction Error:", err);
            await connection.rollback();
            try { fs.unlinkSync(filePath); } catch (e) { }
            res.status(500).json({ status: "error", message: err.message });
        } finally {
            connection.release();
        }
    } catch (err) {
        console.error("Import General Error:", err);
        res.status(500).json({ status: "error", message: err.message });
    }
});

// 18. Delete All Data
app.post('/api/delete-all', async (req, res) => {
    const { user, reason } = req.body;
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        // Delete all data (Audits first due to FK, though Cascade might handle it, explicit is safer)
        const [auditRes] = await connection.query('DELETE FROM audits');
        const [invRes] = await connection.query('DELETE FROM inventory');

        // Log the action with counts and reason
        await logAction(user, "DELETE_ALL", "System", `ลบข้อมูลทั้งหมดในระบบ (ครุภัณฑ์: ${invRes.affectedRows}, ตรวจนับ: ${auditRes.affectedRows} รายการ) | เหตุผล: ${reason || '-'}`);

        await connection.commit();
        res.json({ status: "success", message: "ลบข้อมูลทั้งหมดเรียบร้อยแล้ว" });
    } catch (err) {
        await connection.rollback();
        res.status(500).json({ status: "error", message: err.message });
    } finally {
        connection.release();
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
    console.log(`To access from other devices, use IP: http://10.67.3.111:${port}`);
});
