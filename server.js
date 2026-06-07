import express from "express";
import { google } from "googleapis";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import Parser from "rss-parser"; 

dotenv.config();

const app = express();
app.use(express.json());
app.use(express.static("public"));

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROFILES_FILE = path.join(__dirname, "profiles.json");
const HISTORY_FILE = path.join(__dirname, "history.json"); 
const startTime = Date.now();

const parser = new Parser({
  customFields: {
    item: [
      ['media:content', 'media:content'],
      ['media:thumbnail', 'media:thumbnail'],
      ['enclosure', 'enclosure']
    ]
  },
  headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36' }
});

if (!fs.existsSync(PROFILES_FILE)) {
  fs.writeFileSync(PROFILES_FILE, JSON.stringify([], null, 2));
}
if (!fs.existsSync(HISTORY_FILE)) {
  fs.writeFileSync(HISTORY_FILE, JSON.stringify([], null, 2));
}

let botState = {
  isRunning: false,
  engineStatus: "CORE IDLE (Standby)",
  nextPostTime: "Menunggu Mesin Dinyalakan",
  indeksJadwal: 0,
  logTerakhir: "Sistem Control Center Siap. Menunggu perintah jalankan mesin.",
  activeProfileName: "Belum Ada (Menggunakan Default .env)",
  config: {
    apiKey: process.env.GEMINI_API_KEY || "",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/",
    textModel: "gemini-2.5-flash",
    imageModel: "dall-e-3",
    blogId: process.env.BLOGGER_BLOG_ID || "",
    clientId: process.env.GOOGLE_CLIENT_ID || "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    refreshToken: process.env.GOOGLE_REFRESH_TOKEN || ""
  }
};

let botIntervalObject = null;
const JEDA_WAKTU = 3 * 60 * 60 * 1000;

// KEMBALI KE KATEGORI AWAL
const daftarMenuUntukScrape = [
  "ANDROID", 
  "INSTALASI OS", 
  "JARINGAN", 
  "SOFTWARE", 
  "WEB DESAIN", 
  "GAME", 
  "LAINNYA"
];

const daftarLabelValidBlogger = [
  "ANDROID", "INSTALASI OS", "JARINGAN", "SOFTWARE", "WEB DESAIN", "GAME", "LAINNYA"
];

// TOPIK CADANGAN DIGABUNG KE DALAM "LAINNYA"
const fallbackTopik = {
  "ANDROID": [
    "Fitur tersembunyi Android terbaru yang jarang diketahui orang",
    "Komparasi chipset HP Android paling ngebut tahun ini",
    "Tips ampuh mengembalikan file terhapus di HP Android",
    "Cara menghilangkan iklan mengganggu di aplikasi Android",
    "Review jujur UI kustom (MIUI, OneUI, ColorOS) mana yang terbaik?"
  ],
  "INSTALASI OS": [
    "Cara cloning OS Windows dari HDD ke SSD tanpa ribet",
    "Review performa Windows 11 di laptop spesifikasi kentang",
    "Distro Linux terbaik untuk pemula yang baru pindah dari Windows",
    "Cara aman dual boot Windows 10 dan 11 di satu laptop",
    "Solusi ampuh mengatasi error update Windows yang sering nyangkut"
  ],
  "JARINGAN": [
    "Perbedaan kabel LAN Cat5e, Cat6, dan Cat7 untuk kecepatan internet",
    "Cara mudah melacak siapa saja yang numpang WiFi kita",
    "Mengenal teknologi WiFi 7 dan seberapa cepat performanya",
    "Konfigurasi DNS tercepat untuk bermain game online anti lag",
    "Cara bypass blokir internet menggunakan router Mikrotik"
  ],
  "SOFTWARE": [
    "Aplikasi pembersih sampah PC yang benar-benar efektif bukan abal-abal",
    "Software open source gratis pengganti Microsoft Office",
    "Rekomendasi antivirus paling ringan yang tidak bikin laptop lelet",
    "Tool rahasia para teknisi untuk memperbaiki error sistem",
    "Aplikasi wajib untuk content creator dengan budget minim"
  ],
  "WEB DESAIN": [
    "Panduan membangun website top-up game otomatis dengan Tailwind CSS dan Vercel",
    "Prinsip dasar psikologi warna dalam membuat desain website",
    "Tools AI terbaik yang bisa generate kode HTML/CSS otomatis",
    "Panduan membuat animasi CSS mulus tanpa membebani server",
    "Struktur navigasi web yang paling disukai oleh algoritma Google"
  ],
  "GAME": [
    "Bocoran konsol gaming generasi terbaru yang akan merusak pasar",
    "Game gratis di Steam yang punya kualitas setara game mahal",
    "Fenomena game viral bulan ini: Kenapa semua orang memainkannya?",
    "Cara optimasi settingan grafis game PC agar FPS stabil",
    "Review perlengkapan gaming murah dari brand lokal yang berkualitas"
  ],
  "LAINNYA": [
    // Topik AI
    "Perbandingan kemampuan ChatGPT 4o vs Claude 3.5 Sonnet: Mana yang lebih pintar?",
    "Cara membuat bot otomatis responsif dengan integrasi Gemini API",
    // Topik Crypto & Web3
    "Strategi airdrop farming terbaru dan cara memaksimalkan poin di ekosistem Web3",
    "Perkembangan project DeFi dan integrasi teknologi AI layer di blockchain",
    // Topik Olahraga
    "Update bursa transfer pemain sepak bola eropa terbaru dan analisis taktik",
    "Perkembangan e-sports dan alasan mengapa pro-player layak disebut atlet",
    // Topik Tekno Lainnya
    "Inovasi baterai solid-state masa depan pengganti lithium",
    "Tren gadget wearable: Apakah smartwatch benar-benar dibutuhkan?"
  ]
};

async function fetchLatestTrend(targetKategoriSitus) {
  // SEMUA RSS FEED BARU MASUK KE KATEGORI "LAINNYA"
  const targetFeeds = {
    "ANDROID": ["https://www.androidauthority.com/feed/", "https://www.androidpolice.com/feed/"],
    "INSTALASI OS": ["https://www.windowscentral.com/rss", "https://betanews.com/feed/"],
    "JARINGAN": ["https://www.networkworld.com/feed/"],
    "SOFTWARE": ["https://techcrunch.com/category/software/feed/"],
    "WEB DESAIN": ["https://css-tricks.com/feed/"],
    "GAME": ["https://feeds.feedburner.com/ign/news", "https://kotaku.com/rss"],
    "LAINNYA": [
      "https://www.engadget.com/rss.xml", // Tekno Umum
      "https://techcrunch.com/category/artificial-intelligence/feed/", // AI
      "https://cointelegraph.com/rss", // Crypto
      "https://decrypt.co/feed", // Crypto
      "https://www.espn.com/espn/rss/news", // Olahraga
      "https://sports.yahoo.com/rss/" // Olahraga
    ]
  };

  try {
    const listFeeds = targetFeeds[targetKategoriSitus];
    if (!listFeeds || listFeeds.length === 0) return null;
    
    const shuffledFeeds = listFeeds.sort(() => 0.5 - Math.random());
    const riwayatLokal = JSON.parse(fs.readFileSync(HISTORY_FILE, "utf-8"));

    for (const feedUrl of shuffledFeeds) {
      console.log(`📡 Scrape sumber acak dari kategori [${targetKategoriSitus}]: ${feedUrl}`);
      const feed = await parser.parseURL(feedUrl);
      
      if (feed.items && feed.items.length > 0) {
        for (const item of feed.items) {
          const isAlreadyPosted = riwayatLokal.some(h => 
            (h.originalTitle && h.originalTitle === item.title) || 
            (h.originalLink && h.originalLink === item.link)
          );
          
          if (!isAlreadyPosted) {
            let imageUrl = "";
            if (item.enclosure && item.enclosure.url) {
              imageUrl = item.enclosure.url;
            } else if (item['media:content']) {
              const media = item['media:content'];
              imageUrl = media.$ ? media.$.url : (Array.isArray(media) && media[0].$ ? media[0].$.url : "");
            } else if (item['media:thumbnail']) {
              const thumb = item['media:thumbnail'];
              imageUrl = thumb.$ ? thumb.$.url : "";
            }
            
            if (!imageUrl) {
              const gabungHTML = (item.content || "") + (item.description || "");
              const match = gabungHTML.match(/<img[^>]+src=["']([^"']+)["']/i);
              if (match && match[1]) { imageUrl = match[1]; }
            }

            if (imageUrl && !imageUrl.startsWith("http")) { imageUrl = ""; }

            return {
              title: item.title,
              link: item.link,
              summary: item.contentSnippet || item.content || "Info tren terkini.",
              source: feed.title || feedUrl,
              scrapedImage: imageUrl
            };
          }
        }
      }
    }
    console.log(`⚠️ Semua berita di ${targetKategoriSitus} sudah diposting. Lanjut ke topik cadangan.`);
    return null; 
  } catch (error) {
    console.error(`Gagal nge-scrape sumber ${targetKategoriSitus}, beralih ke bank topik:`, error.message);
    return null;
  }
}

async function buatDanPostArtikelOtomatis() {
  const kategoriSumberHariIni = daftarMenuUntukScrape[Math.floor(Math.random() * daftarMenuUntukScrape.length)];
  
  try {
    botState.logTerakhir = `🤖 Mencari tren VIRAL acak untuk kategori: [${kategoriSumberHariIni}]`;
    
    const trendBerita = await fetchLatestTrend(kategoriSumberHariIni);
    
    let deskripsiArtikel = "";
    let judulBeritaAsli = "";
    let linkBeritaAsli = "";
    
    if (trendBerita) {
      botState.logTerakhir = `📰 Berita VIRAL BARU ditemukan dari [${trendBerita.source}]: ${trendBerita.title}`;
      deskripsiArtikel = `Intisari berita: ${trendBerita.summary}`;
      judulBeritaAsli = trendBerita.title;
      linkBeritaAsli = trendBerita.link;
    } else {
      const arrayTopik = fallbackTopik[kategoriSumberHariIni];
      const topikAcak = arrayTopik[Math.floor(Math.random() * arrayTopik.length)];
      judulBeritaAsli = "Membahas Tuntas: " + topikAcak;
      deskripsiArtikel = "Buat artikel lengkap, segar, dan mendalam berdasarkan topik ini: " + topikAcak;
      linkBeritaAsli = "fallback-" + Date.now();
    }

    let urlGambarFinal = "";

    if (trendBerita && trendBerita.scrapedImage) {
      urlGambarFinal = `https://wsrv.nl/?url=${encodeURIComponent(trendBerita.scrapedImage)}&w=720&output=webp&q=70&il`;
    }

    if (!urlGambarFinal) {
      // KATA KUNCI GAMBAR DIKEMBALIKAN KE FORMAT AWAL, "LAINNYA" DIBUAT FLEKSIBEL
      const kataKunciGambar = {
        "ANDROID": "modern android smartphone interface, digital glowing screen close up",
        "INSTALASI OS": "computer booting up, operating system loading screen glowing",
        "JARINGAN": "abstract glowing fiber optic internet cables, data center lights",
        "SOFTWARE": "programming code on dark monitor, high tech software development",
        "WEB DESAIN": "ui ux modern web design layout on screen, vibrant colors",
        "GAME": "esports gaming keyboard and mouse glowing rgb, cinematic setup",
        "LAINNYA": "modern breaking news concept, artificial intelligence tech, dynamic fast paced digital world"
      };

      const promptGambar = kataKunciGambar[kategoriSumberHariIni] || "modern technology concept";
      const angkaAcak = Math.floor(Math.random() * 9999999);
      urlGambarFinal = `https://image.pollinations.ai/prompt/${encodeURIComponent(promptGambar)}?width=720&height=405&nologo=true&seed=${angkaAcak}`;
    }

    // LABEL PROMPT SEO DIKEMBALIKAN HANYA MEMILIH 7 KATEGORI UTAMA
    const promptSEO = [
      "Kamu adalah jurnalis dan analis teknologi senior yang sedang menulis artikel tentang topik yang sedang VIRAL dan TRENDING hari ini. DILARANG MERESPON SEBAGAI AI.",
      `Topik: "${judulBeritaAsli}"`,
      `Bahan: ${deskripsiArtikel}`,
      "",
      "TUGAS UTAMA:",
      "1. Tulislah dari sudut pandang yang 100% BARU, TAJAM, dan mendalam.",
      "2. Buat pembaca merasa 'Wah, ini informasi baru yang penting!'",
      "3. Tentukan 1 hingga 3 LABEL yang paling cocok: [ANDROID, INSTALASI OS, JARINGAN, SOFTWARE, WEB DESAIN, GAME, LAINNYA].",
      "",
      "🔴 LARANGAN KERAS & MUTLAK (SANGAT PENTING):",
      "- DILARANG KERAS menyertakan basa-basi sapaan (contoh: 'Tentu, ini artikelnya', 'Berikut adalah', dll). LANGSUNG MULAI KE JUDUL.",
      "- DILARANG memotong judul di tengah jalan. Jangan gunakan elipsis (...) di akhir judul.",
      "",
      "🔴 GAYA PENULISAN & FORMAT:",
      "- Paragraf harus pendek! (Maksimal 3-4 kalimat) agar mudah dibaca di layar HP.",
      "- Gunakan tag HTML yang rapi (<h2>, <h3>, <p>, <strong>, <ul>, <li>).",
      "",
      "🔴 FORMAT OUTPUT WAJIB (Ikuti 4 baris ini persis):",
      "JUDUL: [Tulis Judul Utuh Disini - Tanpa titik-titik]",
      "DESKRIPSI: [Tulis Meta Deskripsi Singkat]",
      "LABEL: [Pilih 1-3 label, pisahkan koma]",
      "KONTEN: [Tulis Seluruh Artikel HTML Disini]"
    ].join("\n");
    
    const resText = await fetch(botState.config.baseUrl.replace(/\/$/, "") + "/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + botState.config.apiKey
      },
      body: JSON.stringify({
        model: botState.config.textModel,
        messages: [{ role: "user", content: promptSEO }]
      })
    });

    const dataText = await resText.json();
    let responsTeks = dataText.choices[0].message.content.trim();

    let teksBersih = responsTeks.replace(/\`\`\`html/gi, "").replace(/\`\`\`/g, "").trim();
    teksBersih = teksBersih.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");

    let judulFinal = "";
    let deskripsiPenelusuran = "";
    let kontenHTMLRaw = "";
    let arrayLabelBlogger = [];

    const matchJudul = teksBersih.match(/JUDUL:\s*([^\n]+)/i);
    if (matchJudul) judulFinal = matchJudul[1].trim();

    const matchDeskripsi = teksBersih.match(/DESKRIPSI:\s*([^\n]+)/i);
    if (matchDeskripsi) deskripsiPenelusuran = matchDeskripsi[1].trim();

    const matchKonten = teksBersih.match(/KONTEN:\s*([\s\S]+)/i);
    if (matchKonten) kontenHTMLRaw = matchKonten[1].trim();

    const matchLabel = teksBersih.match(/LABEL:\s*([^\n]+)/i);
    if (matchLabel) {
      const labelDariAI = matchLabel[1].split(',').map(lbl => lbl.trim().toUpperCase());
      arrayLabelBlogger = labelDariAI.filter(lbl => daftarLabelValidBlogger.includes(lbl));
    }

    if (arrayLabelBlogger.length === 0) {
      arrayLabelBlogger = [kategoriSumberHariIni];
    }
    arrayLabelBlogger = arrayLabelBlogger.slice(0, 3);

    if (!judulFinal) {
      const barisTeks = teksBersih.split('\n').filter(b => b.trim() !== "");
      judulFinal = barisTeks[0].replace(/JUDUL:\s*/i, "").trim();
    }
    
    judulFinal = judulFinal.replace(/<[^>]*>?/gm, '').trim();
    judulFinal = judulFinal.replace(/\.\.\.$/, "").replace(/\.\.$/, "").trim();

    if (!kontenHTMLRaw) {
      kontenHTMLRaw = teksBersih.replace(/JUDUL:\s*[^\n]+/gi, "").replace(/DESKRIPSI:\s*[^\n]+/gi, "").replace(/LABEL:\s*[^\n]+/gi, "").trim();
    }

    kontenHTMLRaw = kontenHTMLRaw.replace(/^(<p>)?\s*(Tentu|Berikut|Baik|Baiklah|Tentu saja|Ini dia)[\s\S]*?(minta|artikel|berikut|menulis).*?(:|<\/p>|<br>)/i, "").trim();

    const bannerHTML = `
      <div style="margin-bottom: 25px; text-align: center; overflow: hidden; border-radius: 12px;">
        <img src="${urlGambarFinal}" alt="${judulFinal.replace(/"/g, '&quot;')}" loading="lazy" style="max-width: 100%; height: auto; display: block; margin: 0 auto; object-fit: cover;" />
      </div>
    `;
    const kontenHTMLFinal = bannerHTML + kontenHTMLRaw;

    const oauth2Client = new google.auth.OAuth2(botState.config.clientId, botState.config.clientSecret, "https://developers.google.com/oauthplayground");
    oauth2Client.setCredentials({ refresh_token: botState.config.refreshToken });
    const blogger = google.blogger({ version: "v3", auth: oauth2Client });

    const response = await blogger.posts.insert({
      blogId: botState.config.blogId,
      requestBody: {
        title: judulFinal,
        content: kontenHTMLFinal,
        labels: arrayLabelBlogger,
        searchDescription: deskripsiPenelusuran.substring(0, 140)
      }
    });

    const postUrl = response.data.url;
    botState.logTerakhir = `🎉 [SUKSES VIRAL & RINGAN] Judul: ${judulFinal}`;

    const riwayatLokal = JSON.parse(fs.readFileSync(HISTORY_FILE, "utf-8"));
    riwayatLokal.push({
      id: response.data.id,
      title: judulFinal,
      originalTitle: judulBeritaAsli, 
      originalLink: linkBeritaAsli,
      url: postUrl,
      date: new Date().toLocaleDateString("id-ID"),
      label: arrayLabelBlogger.join(", ")
    });
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(riwayatLokal, null, 2));

  } catch (err) {
    botState.logTerakhir = `❌ Gagal Posting Siklus [${kategoriSumberHariIni}]: ` + err.message;
  }

  botState.nextPostTime = new Date(Date.now() + JEDA_WAKTU).toLocaleString("id-ID") + " WIB";
}

app.get("/api/status", (req, res) => {
  const diffMs = Date.now() - startTime;
  const hrs = Math.floor(diffMs / 3600000);
  const mins = Math.floor((diffMs % 3600000) / 60000);
  const memoryUsed = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);

  res.json({
    ...botState,
    systemUptime: hrs + " Jam " + mins + " Menit",
    systemMemory: memoryUsed + " MB"
  });
});

app.get("/api/analytics", (req, res) => {
  const historyData = JSON.parse(fs.readFileSync(HISTORY_FILE, "utf-8"));
  const statistikTanggal = {};
  historyData.forEach(item => {
    statistikTanggal[item.date] = (statistikTanggal[item.date] || 0) + 1;
  });

  res.json({
    totalPosts: historyData.length,
    chartData: {
      labels: Object.keys(statistikTanggal),
      values: Object.values(statistikTanggal)
    },
    recentPosts: historyData.slice(-5).reverse() 
  });
});

app.get("/api/profiles", (req, res) => {
  const data = fs.readFileSync(PROFILES_FILE, "utf-8");
  res.json(JSON.parse(data));
});

app.post("/api/profiles", (req, res) => {
  const data = JSON.parse(fs.readFileSync(PROFILES_FILE, "utf-8"));
  const newProfile = { id: Date.now().toString(), ...req.body };
  data.push(newProfile);
  fs.writeFileSync(PROFILES_FILE, JSON.stringify(data, null, 2));
  botState.logTerakhir = "📁 Profil API [" + newProfile.profileName + "] disimpan ke dalam Brankas.";
  res.json({ success: true, profiles: data });
});

app.post("/api/profiles/activate", (req, res) => {
  const { id } = req.body;
  const data = JSON.parse(fs.readFileSync(PROFILES_FILE, "utf-8"));
  const target = data.find(p => p.id === id);

  if (target) {
    botState.config.apiKey = target.apiKey;
    botState.config.baseUrl = target.baseUrl;
    botState.config.textModel = target.textModel;
    botState.config.imageModel = target.imageModel;
    botState.activeProfileName = target.profileName;
    botState.logTerakhir = "⚡ Sukses Beralih! Profil aktif sekarang: " + target.profileName;
    res.json({ success: true, state: botState });
  } else {
    res.status(404).json({ error: "Profil tidak ditemukan" });
  }
});

app.post("/api/control", (req, res) => {
  const { action } = req.body;
  if (action === "start") {
    if (!botState.isRunning) {
      botState.isRunning = true;
      botState.engineStatus = "CORE RUNNING (Active Loop)";
      botState.nextPostTime = new Date(Date.now() + JEDA_WAKTU).toLocaleString("id-ID") + " WIB";
      buatDanPostArtikelOtomatis();
      botIntervalObject = setInterval(buatDanPostArtikelOtomatis, JEDA_WAKTU);
    }
  } else if (action === "stop") {
    botState.isRunning = false;
    botState.engineStatus = "CORE STOPPED (Engine Pause)";
    botState.nextPostTime = "Mesin Dimatikan";
    clearInterval(botIntervalObject);
  }
  res.json(botState);
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = 3000;
app.listen(PORT, "0.0.0.0", () => console.log("🚀 Dashboard OS mengudara aman di http://localhost:" + PORT));