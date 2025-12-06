-- Create Database
CREATE DATABASE IF NOT EXISTS asset_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE asset_db;

-- 1. Inventory Table
CREATE TABLE IF NOT EXISTS inventory (
    id INT AUTO_INCREMENT PRIMARY KEY,
    AssetID VARCHAR(50) UNIQUE NOT NULL,
    DeviceName VARCHAR(255),
    Model VARCHAR(255),
    Brand VARCHAR(100),
    Division VARCHAR(100),
    Department VARCHAR(100),
    User VARCHAR(100),
    Status VARCHAR(50),
    QRCodeURL TEXT,
    Remark TEXT,
    ImageURL TEXT,
    Floor VARCHAR(50),
    LastEditBy VARCHAR(100),
    LastEditDate DATETIME,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. History Table
CREATE TABLE IF NOT EXISTS history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    Timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    User VARCHAR(100),
    Action VARCHAR(50),
    AssetID VARCHAR(50),
    Details TEXT
);

-- 3. Audits Table
CREATE TABLE IF NOT EXISTS audits (
    id INT AUTO_INCREMENT PRIMARY KEY,
    AssetID VARCHAR(50),
    FiscalYear VARCHAR(10),
    AuditDate DATETIME,
    Auditor VARCHAR(100),
    Result VARCHAR(50),
    Note TEXT,
    LocationAtAudit VARCHAR(255),
    ImageURL TEXT,
    FOREIGN KEY (AssetID) REFERENCES inventory(AssetID) ON DELETE CASCADE
);

-- 4. Archive Returned Table
CREATE TABLE IF NOT EXISTS archive_returned (
    id INT AUTO_INCREMENT PRIMARY KEY,
    AssetID VARCHAR(50),
    DeviceName VARCHAR(255),
    Model VARCHAR(255),
    Brand VARCHAR(100),
    Division VARCHAR(100),
    Department VARCHAR(100),
    User VARCHAR(100),
    Status VARCHAR(50),
    QRCodeURL TEXT,
    Remark TEXT,
    ImageURL TEXT,
    Floor VARCHAR(50),
    ArchivedDate DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 5. Archive Retired Table
CREATE TABLE IF NOT EXISTS archive_retired (
    id INT AUTO_INCREMENT PRIMARY KEY,
    AssetID VARCHAR(50),
    DeviceName VARCHAR(255),
    Model VARCHAR(255),
    Brand VARCHAR(100),
    Division VARCHAR(100),
    Department VARCHAR(100),
    User VARCHAR(100),
    Status VARCHAR(50),
    QRCodeURL TEXT,
    Remark TEXT,
    ImageURL TEXT,
    Floor VARCHAR(50),
    ArchivedDate DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 6. Settings Table
CREATE TABLE IF NOT EXISTS settings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    Division VARCHAR(100),
    Department VARCHAR(100),
    Status VARCHAR(50)
);

-- Initial Settings Data
INSERT INTO settings (Division, Department, Status) VALUES 
('ฝ่ายการพยาบาล', 'งานการพยาบาลผู้ป่วยฉุกเฉิน', 'ใช้งาน'),
('ฝ่ายการพยาบาล', 'หน่วยห้องตรวจฉุกเฉินโรคหัวใจ', 'ส่งคืน'),
('ฝ่ายบริการและสนันสนุนทั่วไป', 'งานเทคโนโลยีสารสนเทศ', 'แทงชำรุด');
