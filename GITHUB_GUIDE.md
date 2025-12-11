# คู่มือการนำโปรเจกต์ขึ้น GitHub (Upload to GitHub)

คู่มือนี้จะแนะนำขั้นตอนการนำ Source Code ของโปรเจกต์ Asset Tracking System ขึ้นไปเก็บไว้บน GitHub เพื่อสำรองข้อมูลและใช้งานร่วมกับทีม

## 1. สิ่งที่ต้องเตรียม (Pre-requisites)

1.  **บัญชี GitHub**: ต้องมีบัญชีที่ [github.com](https://github.com/)
2.  **Git Installed**: เครื่องต้องลง Git แล้ว (พิมพ์ `git --version` ใน Terminal เพื่อเช็ค)
3.  **ตรวจสอบไฟล์ .gitignore**: โปรเจกต์นี้มีไฟล์ `.gitignore` แล้ว ซึ่งตั้งค่าไว้เพื่อ **ไม่ให้** อัปโหลดไฟล์ขยะหรือไฟล์ข้อมูลส่วนตัว เช่น:
    *   `node_modules/` (ไลบรารีขนาดใหญ่ ไม่ควรอัปโหลด)
    *   `uploads/` (รูปภาพที่ผู้ใช้อัปโหลดมาเก็บไว้ ไม่ควรขึ้น Git)
    *   `cert.pem`, `key.pem` (ไฟล์กุญแจความปลอดภัย ห้ามอัปโหลดเด็ดขาด)

## 2. ขั้นตอนการสร้าง Repository บน GitHub

1.  Login เข้าไปที่ GitHub
2.  กดปุ่ม **+** มุมขวาบน แล้วเลือก **New repository**
3.  ตั้งชื่อ Repository (เช่น `asset-tracking-system`)
4.  เลือก **Private** (แนะนำ หากเป็นโปรเจกต์ภายในองค์กร) หรือ **Public**
5.  **ไม่ต้องติ๊ก** Add a README file, .gitignore, หรือ license (เพราะเรามีโค้ดอยู่แล้ว)
6.  กดปุ่ม **Create repository**

## 3. การเชื่อมต่อและอัปโหลดโค้ด (ดำเนินการใน VS Code)

เปิด Terminal ใน VS Code (กด `Ctrl + J` หรือ `Terminal > New Terminal`) แล้วทำตามคำสั่งนี้:

### กรณีที่ 1: โปรเจกต์นี้ยังไม่เคยขึ้น GitHub มาก่อน (แต่มี .git แล้วในเครื่อง)

1.  **เพิ่มไฟล์ทั้งหมดเข้าสู่การเตรียมอัปโหลด**
    ```powershell
    git add .
    ```

2.  **บันทึกสถานะ (Commit)**
    ```powershell
    git commit -m "Initial commit - Asset Tracking System complete version"
    ```

3.  **เปลี่ยนชื่อ Branch หลักเป็น main (มาตรฐานใหม่)**
    ```powershell
    git branch -M main
    ```

4.  **เชื่อมต่อกับ GitHub** (นำ URL จากหน้าที่สร้างในข้อ 2 มาใส่)
    *   เปลี่ยน `YOUR-USERNAME` และ `YOUR-REPO-NAME` เป็นของคุณ
    ```powershell
    git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO-NAME.git
    ```
    *(ถ้าเคย add origin ไปแล้ว ให้ใช้คำสั่ง `git remote set-url origin <URLใหม่>` แทน)*

5.  **อัปโหลดขึ้น GitHub (Push)**
    ```powershell
    git push -u origin main
    ```

---

## 4. การอัปเดตโค้ดในครั้งถัดไป (Routine Update)

เมื่อมีการแก้ไขโค้ดและต้องการอัปเดตบน GitHub ให้ทำ 3 ขั้นตอนนี้:

1.  **Add**: เลือกไฟล์ที่จะอัปเดต
    ```powershell
    git add .
    ```
2.  **Commit**: บันทึกพร้อมข้อความกันลืม
    ```powershell
    git commit -m "อธิบายสิ่งที่แก้ไข เช่น เพิ่มฟีเจอร์ลบแบบมีเหตุผล"
    ```
3.  **Push**: ส่งขึ้น Server
    ```powershell
    git push
    ```

## 5. ปัญหาที่พบบ่อย (Troubleshooting)

*   **Authentication Failed**: GitHub เลิกใช้รหัสผ่าน (Password) ในการ Login ผ่าน Terminal แล้ว
    *   **วิธีแก้**: ต้องใช้ **Personal Access Token (Classic)** หรือตั้งค่า **SSH Key**
    *   หรือติดตั้ง **GitHub Desktop** / **Git Credential Manager** เพื่อให้ Login ผ่าน Browser ได้ง่ายๆ
*   **Error: remote origin already exists**: แปลว่าเคยตั้งค่าไปแล้ว
    *   เช็คด้วย `git remote -v`
    *   ลบของเก่าด้วย `git remote remove origin` แล้ว add ใหม่

---
**หมายเหตุ:** ไฟล์รูปภาพในโฟลเดอร์ `uploads` และฐานข้อมูล MySQL จะ **ไม่อยู่** บน GitHub (เพราะถูก ignore ไว้) เวลาไปรันเครื่องอื่นต้องสร้าง Database และโฟลเดอร์ uploads ใหม่
