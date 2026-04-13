# My Diary

Aplikasi jurnal pribadi modern dengan fitur posting gambar/video, like, komentar, dengan tampilan ala Instagram.

## Prasyarat

- [Node.js](https://nodejs.org/) (versi 14 atau lebih baru)
- [MySQL](https://www.mysql.com/) (versi 5.7 atau lebih baru)

## Instalasi & Menjalankan

1. **Clone Repositori:**
   ```bash
   git clone https://github.com/neveerlabs/Diary.git
   ```
3. Masuk ke folder `backend`:
   ```bash
   cd backend
   ```
4. Install Dependensi:
   ```bash
   npm install
   ```
5. Setup file `.env` di dalam folder `backend` dengan isi:
   ```bash
   DB_HOST=localhost
   DB_USER=root
   DB_PASSWORD=
   DB_NAME=diary
   PORT=5000
   ```
   > *Sesuaikan `DB_USER` dan `DB_PASSWORD` dengan kredensial MySQL.*
6. Buat database dan tabel di MySQL (lihat bagian Konfigurasi Database).
7. Jalankan server backend:
   ```bash
   npm run dev
   ```
   atau
   ```bash
   npm start
   ```
8. Buka browser dan masuk ke `http://localhost:5000`

### Konfigurasi Database
Database tidak dibuat otomatis. Anda harus membuat database dan tabel secara manual.

Jalankan perintah SQL berikut di MySQL (misalnya via phpMyAdmin, MySQL Workbench, atau command line):
```sql
CREATE DATABASE diary;
USE diary;

CREATE TABLE posts (
  id VARCHAR(30) PRIMARY KEY,
  content TEXT NOT NULL,
  media_urls JSON,
  tags JSON,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  likes INT DEFAULT 0
);

CREATE TABLE comments (
  id VARCHAR(30) PRIMARY KEY,
  post_id VARCHAR(30) NOT NULL,
  text TEXT NOT NULL,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  likes INT DEFAULT 0,
  parent_id VARCHAR(30) DEFAULT NULL,
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
);
```
> *Setelah tabel dibuat, aplikasi siap digunakan.*

---

### Catatan
* Semua data postingan dan komentar disimpan di database `diary`.
* Like postingan dan komentar dapat diatur langsung melalui frontend (termasuk nilai awal).
* Server backend juga menyajikan file statis (HTML, CSS, JS) sehingga cukup akses `http://localhost:5000`.

---

<div align="center">
   © 2026 Neverlabs. All rights reserved.
   
   [![Instagram](https://img.shields.io/badge/Instagram-E4405F?style=for-the-badge&logo=instagram&logoColor=white)](https://instagram.com/neveerlabs)
   [![GitHub](https://img.shields.io/badge/GitHub-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/neveerlabs)
   [![Telegram](https://img.shields.io/badge/Telegram-26A5E4?style=for-the-badge&logo=telegram&logoColor=white)](https://t.me/Neverlabs)
   [![WhatsApp](https://img.shields.io/badge/WhatsApp-25D366?style=for-the-badge&logo=whatsapp&logoColor=white)](https://wa.me/628561765372)
</div>
