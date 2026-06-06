# BOT-BLOGSPOT-VIRAL

[ English Version Below | Versi Bahasa Indonesia di Bagian Bawah ]

---

## English Version

A Node.js automation bot to scrape, rewrite, and post SEO-friendly articles to Blogger (Blogspot) using the Gemini API. 

This bot runs a 3-hour scheduled cycle to scrape targeted RSS feeds, intelligently rewrites the content using a natural, journalistic AI persona, bypasses image hotlink protections, and dynamically assigns 1 to 3 relevant categories (multi-labels) based on the article's context. It also includes a local web dashboard to manage everything easily.

### Key Features
- AI Dynamic Multi-Labeling: The AI acts as an Editor-in-Chief, analyzing the content and automatically assigning 1 to 3 relevant labels matching your Blogger menus (e.g., assigning both ANDROID and GAME for mobile gaming news).
- Smart Image Anti-Hotlink & Anti-Copyright Bypass: Scrapes the original image from the news source, runs it through a proxy (wsrv.nl) to bypass 403 Forbidden errors, and applies a CSS filter to bypass basic copyright fingerprinting.
- Journalistic AI Persona: The prompt is strictly designed to write natural, engaging, and well-structured HTML articles (Intro -> <h2> Subheadings -> <ul> Lists -> Conclusion) without sounding like a generic robot.
- API Vault (Multi-Profile): Save multiple API keys and hot-swap profiles directly from the web UI without restarting the server.
- Secure by Default: Your private credentials inside .env and profiles.json are strictly ignored by Git and will never be leaked to GitHub.

### How to Customize for Your Own Blog
Before running the bot, you must configure it to match your blog's niche and labels. Open server.js and modify these arrays located at the top of the script:

1. daftarMenuUntukScrape & daftarLabelValidBlogger: Change these to exactly match the exact labels/categories on your Blogger.
2. fallbackTopik: Provide backup prompts/topics for each label just in case the RSS scraper fails.
3. targetFeeds: Inside the fetchLatestTrend function, change the RSS URLs to websites that match your blog's specific categories.

### How to Install & Run

#### 1. Prerequisites
Make sure you have Node.js installed on your machine.

#### 2. Setup Project
Open your terminal and run these commands:

git clone https://github.com/khoirulr099/BOT-BLOGSPOT-VIRAL.git
cd BOT-BLOGSPOT-VIRAL
npm install

#### 3. Environment Configuration
Create a .env file in the root directory and fill it with your credentials:

GEMINI_API_KEY=your_gemini_api_key
BLOGGER_BLOG_ID=your_blogger_id
GOOGLE_CLIENT_ID=your_oauth2_client_id
GOOGLE_CLIENT_SECRET=your_oauth2_client_secret
GOOGLE_REFRESH_TOKEN=your_oauth2_refresh_token

#### 4. Running the Bot
To keep the bot running 24/7 in the background, use PM2:

npm install -g pm2
pm2 start server.js --name "dashboard-blogger"

(To view live logs, use: pm2 logs dashboard-blogger)

#### 5. Open Dashboard
Open your browser and go to: http://localhost:3000

---

## Versi Bahasa Indonesia

Bot otomatisasi berbasis Node.js untuk melakukan scrape berita, menulis ulang (rewrite), dan memposting artikel SEO secara otomatis ke platform Blogger (Blogspot) menggunakan Gemini API.

Bot ini berjalan setiap 3 jam sekali untuk mengambil berita dari RSS feed, menulis ulang konten dengan gaya bahasa jurnalistik yang natural, memanipulasi gambar agar lolos perlindungan hak cipta, dan secara cerdas memberikan 1 hingga 3 label otomatis (multi-label) yang sesuai dengan isi artikel.

### Fitur Utama
- Multi-Label Cerdas (AI Editor): AI akan membaca isi artikel dan menentukan 1 hingga 3 label sekaligus yang paling pas dengan menu Blogger kamu (contoh: artikel HP gaming otomatis masuk ke label ANDROID dan GAME).
- Bypass Gambar Anti-Hotlink & Hak Cipta: Mengambil gambar asli dari sumber berita, memprosesnya melalui server proxy (wsrv.nl) agar tidak rusak/diblokir (Error 403), lalu memberikan filter CSS otomatis untuk mengacak sidik jari gambar.
- Gaya Penulisan Jurnalistik: Prompt AI dirancang khusus agar artikel mengalir natural, dinamis, dan terstruktur rapi dengan HTML murni (menggunakan paragraf pendek, <h2> sub-judul, dan poin-poin).
- Brankas API (Multi-Profile): Bisa simpan banyak API Key sekaligus di web dashboard. Tinggal klik buat ganti profil yang aktif tanpa perlu restart server.
- Aman 100%: File sensitif seperti .env dan profiles.json sudah dikunci di dalam .gitignore biar gak sengaja bocor ke publik.

### Cara Custom Sesuai Niche Blog Kamu
Sebelum menjalankan bot, kamu WAJIB mengubah target topik agar sesuai dengan tema blog kamu. Buka file server.js dan ubah variabel berikut:

1. daftarMenuUntukScrape & daftarLabelValidBlogger: Ganti teksnya sesuai dengan nama Kategori/Label menu yang ada di website Blogger kamu.
2. fallbackTopik: Ganti dengan ide topik cadangan untuk setiap label (ini akan dipakai kalau sumber berita RSS gagal diakses).
3. targetFeeds: Di dalam fungsi fetchLatestTrend, ganti link URL RSS dengan situs berita/portal yang sesuai dengan kategori blog kamu.

### Cara Install & Jalankan

#### 1. Install Dependencies
Buka terminal di folder project kamu, lalu jalankan:

npm install

#### 2. Setup Kredensial (.env)
Buat file baru bernama .env di folder utama, lalu isi seperti ini:

GEMINI_API_KEY=isi_api_key_gemini_kamu
BLOGGER_BLOG_ID=isi_id_blog_kamu
GOOGLE_CLIENT_ID=isi_client_id_oauth2
GOOGLE_CLIENT_SECRET=isi_client_secret_oauth2
GOOGLE_REFRESH_TOKEN=isi_refresh_token_oauth2

#### 3. Jalankan Bot di Background (PM2)
Biar bot tetap jalan terus di latar belakang laptop atau VPS kamu, gunakan PM2:

npm install -g pm2
pm2 start server.js --name "dashboard-blogger"

(Untuk melihat log bot secara live, ketik: pm2 logs dashboard-blogger)

#### 4. Buka Web Kontrol
Buka browser kamu lalu akses alamat: http://localhost:3000
