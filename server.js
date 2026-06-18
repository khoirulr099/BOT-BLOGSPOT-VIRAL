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
const BLOGS_FILE = path.join(__dirname, "blogs.json");
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
  // FITUR BARU: Melacak bahasa giliran selanjutnya (ID atau EN)
  giliranBahasaSelanjutnya: "ID", 
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

const activeTimers = {};

function logSystem(message) {
  const timestamp = new Date().toLocaleTimeString("id-ID");
  const logLine = `[${timestamp}] ${message}`;
  console.log(logLine);
  botState.logTerakhir = logLine + "\n" + (botState.logTerakhir || "").split("\n").slice(0, 50).join("\n");
}

if (!fs.existsSync(BLOGS_FILE)) {
  const defaultBlogs = [];
  if (process.env.BLOGGER_BLOG_ID) {
    defaultBlogs.push({
      id: "default-blog",
      blogName: "Blog Utama (.env)",
      blogId: process.env.BLOGGER_BLOG_ID,
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
      refreshToken: process.env.GOOGLE_REFRESH_TOKEN || "",
      intervalHours: 3,
      profileId: "default",
      isRunning: false,
      nextPostTime: "Menunggu dijalankan",
      lastLog: "Sistem siap.",
      detectedLabels: ["ANDROID", "INSTALASI OS", "JARINGAN", "SOFTWARE", "WEB DESAIN", "GAME", "LAINNYA"]
    });
  }
  fs.writeFileSync(BLOGS_FILE, JSON.stringify(defaultBlogs, null, 2));
}

// Probabilitas 60% untuk topik Trending
const daftarMenuUntukScrape = [
  "ANDROID", "INSTALASI OS", "JARINGAN", "SOFTWARE", "WEB DESAIN", "GAME", 
  "LAINNYA", "LAINNYA", "LAINNYA", "LAINNYA", "LAINNYA", "LAINNYA", "LAINNYA", "LAINNYA", "LAINNYA"
];

const daftarLabelValidBlogger = [
  "ANDROID", "INSTALASI OS", "JARINGAN", "SOFTWARE", "WEB DESAIN", "GAME", "LAINNYA"
];

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
    "Perbandingan kemampuan ChatGPT 4o vs Claude 3.5 Sonnet: Mana yang lebih pintar?",
    "Cara membuat bot otomatis responsif dengan integrasi Gemini API",
    "Strategi airdrop farming terbaru dan cara memaksimalkan poin di ekosistem Web3",
    "Perkembangan project DeFi dan integrasi teknologi AI layer di blockchain",
    "Update bursa transfer pemain sepak bola eropa terbaru dan analisis taktik",
    "Perkembangan e-sports dan alasan mengapa pro-player layak disebut atlet",
    "Inovasi baterai solid-state masa depan pengganti lithium",
    "Tren gadget wearable: Apakah smartwatch benar-benar dibutuhkan?"
  ]
};

async function fetchLatestTrend(targetKategoriSitus) {
  const targetFeeds = {
    "ANDROID": ["https://www.androidauthority.com/feed/", "https://www.androidpolice.com/feed/"],
    "INSTALASI OS": ["https://www.windowscentral.com/rss", "https://betanews.com/feed/"],
    "JARINGAN": ["https://www.networkworld.com/feed/"],
    "SOFTWARE": ["https://techcrunch.com/category/software/feed/"],
    "WEB DESAIN": ["https://css-tricks.com/feed/"],
    "GAME": ["https://feeds.feedburner.com/ign/news", "https://kotaku.com/rss"],
    "LAINNYA": [
      "https://www.engadget.com/rss.xml",
      "https://techcrunch.com/category/artificial-intelligence/feed/",
      "https://cointelegraph.com/rss",
      "https://decrypt.co/feed",
      "https://www.espn.com/espn/rss/news",
      "https://sports.yahoo.com/rss/"
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
    return null; 
  } catch (error) {
    return null;
  }
}

async function detectLabelsFromTheme(blogConfig) {
  try {
    const oauth2Client = new google.auth.OAuth2(
      blogConfig.clientId,
      blogConfig.clientSecret,
      "https://developers.google.com/oauthplayground"
    );
    oauth2Client.setCredentials({ refresh_token: blogConfig.refreshToken });
    const blogger = google.blogger({ version: "v3", auth: oauth2Client });
    
    logSystem(`🔍 Mendapatkan URL blog untuk mendeteksi label tema: ${blogConfig.blogId}...`);
    const blogInfo = await blogger.blogs.get({
      blogId: blogConfig.blogId
    });
    
    const blogUrl = blogInfo.data.url;
    if (!blogUrl) {
      throw new Error("URL blog tidak ditemukan");
    }
    
    logSystem(`📡 Mengunduh halaman utama blog untuk menganalisis tema: ${blogUrl}`);
    const res = await fetch(blogUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      }
    });
    
    if (!res.ok) {
      throw new Error(`HTTP Error ${res.status}`);
    }
    
    const html = await res.text();
    
    // Extract labels using regex matching /search/label/LabelName
    const regex = /\/search\/label\/([^"'\?#\s>]+)/gi;
    const uniqueLabels = [];
    const seenLower = new Set();
    
    let match;
    while ((match = regex.exec(html)) !== null) {
      let label = match[1];
      try {
        label = decodeURIComponent(label).trim();
      } catch (e) {
        label = label.trim();
      }
      
      // Bersihkan spasi (Blogger mengubah spasi menjadi + atau %20 di URL)
      label = label.replace(/\+/g, ' ');
      
      if (label) {
        const lowerLabel = label.toLowerCase();
        // Lewati label placeholder menu seperti Shortcut, Dropdown, Submenu, dan Lainya
        if (lowerLabel.includes("shortcut") || 
            lowerLabel.includes("dropdown") || 
            lowerLabel.includes("submenu") || 
            lowerLabel.includes("sub-menu") ||
            lowerLabel.includes("widget") ||
            lowerLabel === "lainya" ||
            label.length < 2 || 
            label.length > 40) {
          continue;
        }
        
        if (!seenLower.has(lowerLabel)) {
          seenLower.add(lowerLabel);
          uniqueLabels.push(label);
        }
      }
    }
    
    if (uniqueLabels.length > 0) {
      logSystem(`✅ Berhasil mendeteksi ${uniqueLabels.length} label dari tema menu: [${uniqueLabels.join(", ")}]`);
      return uniqueLabels;
    } else {
      logSystem(`⚠️ Tidak ada label yang terdeteksi di navigasi tema.`);
      return null;
    }
  } catch (error) {
    logSystem(`❌ Gagal mendeteksi label dari tema: ${error.message}`);
    return null;
  }
}

async function detectBlogLabels(blogConfig) {
  // Tier 1: Deteksi dari Menu Tema Blog
  const labelsFromTheme = await detectLabelsFromTheme(blogConfig);
  if (labelsFromTheme && labelsFromTheme.length > 0) {
    return labelsFromTheme;
  }

  // Tier 2: Deteksi dari Postingan Terakhir (jika tema tidak terdeteksi)
  try {
    const oauth2Client = new google.auth.OAuth2(
      blogConfig.clientId,
      blogConfig.clientSecret,
      "https://developers.google.com/oauthplayground"
    );
    oauth2Client.setCredentials({ refresh_token: blogConfig.refreshToken });
    const blogger = google.blogger({ version: "v3", auth: oauth2Client });
    
    logSystem(`🔍 Mendeteksi label dari postingan lama untuk blog: ${blogConfig.blogName || blogConfig.blogId}...`);
    const response = await blogger.posts.list({
      blogId: blogConfig.blogId,
      maxResults: 50,
      fields: "items(labels)"
    });
    
    const uniqueLabels = [];
    const seenLower = new Set();
    if (response.data.items) {
      for (const post of response.data.items) {
        if (post.labels) {
          for (let l of post.labels) {
            if (l && l.trim()) {
              const label = l.trim();
              const lowerLabel = label.toLowerCase();
              if (lowerLabel.includes("shortcut") || 
                  lowerLabel.includes("dropdown") || 
                  lowerLabel.includes("submenu") || 
                  lowerLabel.includes("sub-menu") ||
                  lowerLabel.includes("widget") ||
                  lowerLabel === "lainya" ||
                  label.length < 2 || 
                  label.length > 40) {
                continue;
              }
              if (!seenLower.has(lowerLabel)) {
                seenLower.add(lowerLabel);
                uniqueLabels.push(label);
              }
            }
          }
        }
      }
    }
    
    if (uniqueLabels.length > 0) {
      logSystem(`✅ Terdeteksi ${uniqueLabels.length} label dari postingan lama: [${uniqueLabels.join(", ")}]`);
      return uniqueLabels;
    } else {
      logSystem(`⚠️ Tidak ada label yang terdeteksi untuk ${blogConfig.blogName}. Menggunakan label bawaan.`);
      return ["ANDROID", "INSTALASI OS", "JARINGAN", "SOFTWARE", "WEB DESAIN", "GAME", "LAINNYA"];
    }
  } catch (error) {
    logSystem(`❌ Gagal mendeteksi label untuk ${blogConfig.blogName}: ${error.message}`);
    return ["ANDROID", "INSTALASI OS", "JARINGAN", "SOFTWARE", "WEB DESAIN", "GAME", "LAINNYA"];
  }
}

async function buatDanPostArtikelOtomatisUntukBlog(blogId) {
  const blogs = JSON.parse(fs.readFileSync(BLOGS_FILE, "utf-8"));
  const blogIndex = blogs.findIndex(b => b.id === blogId);
  if (blogIndex === -1) return;
  const blog = blogs[blogIndex];

  // Resolve Profile config
  const profiles = JSON.parse(fs.readFileSync(PROFILES_FILE, "utf-8"));
  let profile = profiles.find(p => p.id === blog.profileId);
  if (!profile) {
    profile = {
      apiKey: process.env.GEMINI_API_KEY || "",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/",
      textModel: "gemini-2.5-flash",
      imageModel: "dall-e-3"
    };
  }

  const labels = blog.detectedLabels && blog.detectedLabels.length > 0 
    ? blog.detectedLabels 
    : ["ANDROID", "INSTALASI OS", "JARINGAN", "SOFTWARE", "WEB DESAIN", "GAME", "LAINNYA"];

  const kategoriSumberHariIni = labels[Math.floor(Math.random() * labels.length)];
  
  if (!blog.giliranBahasaSelanjutnya) {
    blog.giliranBahasaSelanjutnya = "ID";
  }
  const modeBahasa = blog.giliranBahasaSelanjutnya;
  const targetBahasa = modeBahasa === "EN" ? "INGGRIS (ENGLISH)" : "INDONESIA";
  
  // Update state immediately in blogs.json to advance the language cycle
  blog.giliranBahasaSelanjutnya = modeBahasa === "ID" ? "EN" : "ID";
  blogs[blogIndex] = blog;
  fs.writeFileSync(BLOGS_FILE, JSON.stringify(blogs, null, 2));

  try {
    const startMsg = `🤖 [${blog.blogName}] Meracik artikel [${kategoriSumberHariIni}] dalam bahasa ${targetBahasa}...`;
    logSystem(startMsg);
    
    // Update temporary log in blogs list
    const currentBlogs = JSON.parse(fs.readFileSync(BLOGS_FILE, "utf-8"));
    const currentBlogIdx = currentBlogs.findIndex(b => b.id === blogId);
    if (currentBlogIdx !== -1) {
      currentBlogs[currentBlogIdx].lastLog = startMsg;
      fs.writeFileSync(BLOGS_FILE, JSON.stringify(currentBlogs, null, 2));
    }

    const trendBerita = await fetchLatestTrend(kategoriSumberHariIni);
    
    let deskripsiArtikel = "";
    let judulBeritaAsli = "";
    let linkBeritaAsli = "";
    
    if (trendBerita) {
      deskripsiArtikel = `Intisari berita: ${trendBerita.summary}`;
      judulBeritaAsli = trendBerita.title;
      linkBeritaAsli = trendBerita.link;
    } else {
      const arrayTopik = fallbackTopik[kategoriSumberHariIni];
      if (arrayTopik && arrayTopik.length > 0) {
        const topikAcak = arrayTopik[Math.floor(Math.random() * arrayTopik.length)];
        judulBeritaAsli = "Membahas Tuntas: " + topikAcak;
        deskripsiArtikel = "Buat artikel lengkap, segar, dan mendalam berdasarkan topik ini: " + topikAcak;
      } else {
        judulBeritaAsli = `Membahas Tren Terbaru seputar ${kategoriSumberHariIni}`;
        deskripsiArtikel = `Buat artikel lengkap, informatif, dan mendalam tentang tren terbaru, tips, atau perkembangan menarik seputar kategori: ${kategoriSumberHariIni}.`;
      }
      linkBeritaAsli = "fallback-" + Date.now();
    }

    let urlGambarFinal = `https://placehold.co/720x405/1a1a1a/ffffff.png?text=TECH+UPDATE`;
    let isImageSecured = false;

    const kataKunciSerep = {
      "ANDROID": "modern android smartphone interface, digital glowing screen close up",
      "INSTALASI OS": "computer booting up, operating system loading screen glowing",
      "JARINGAN": "abstract glowing fiber optic internet cables, data center lights",
      "SOFTWARE": "programming code on dark monitor, high tech software development",
      "WEB DESAIN": "ui ux modern web design layout on screen, vibrant colors",
      "GAME": "esports gaming keyboard and mouse glowing rgb, cinematic setup",
      "LAINNYA": "modern breaking news concept, artificial intelligence tech, dynamic fast paced digital world"
    };
    const promptSerep = kataKunciSerep[kategoriSumberHariIni] || `concept of ${kategoriSumberHariIni}, modern graphic`;
    const urlPollinations = `https://image.pollinations.ai/prompt/${encodeURIComponent(promptSerep)}?width=720&height=405&nologo=true&seed=${Math.floor(Math.random() * 9999999)}`;

    if (trendBerita && trendBerita.scrapedImage) {
      const wsrvUrl = `https://wsrv.nl/?url=${encodeURIComponent(trendBerita.scrapedImage)}&w=720&output=webp&q=70&il`;
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4000); 
        const responseCek = await fetch(wsrvUrl, { signal: controller.signal });
        clearTimeout(timeout);
        
        const contentType = responseCek.headers.get("content-type");
        if (responseCek.ok && contentType && contentType.includes("image")) {
          urlGambarFinal = wsrvUrl;
          isImageSecured = true;
        }
      } catch (err) {}
    }

    if (!isImageSecured) {
      try {
        const controllerAI = new AbortController();
        const timeoutAI = setTimeout(() => controllerAI.abort(), 8000); 
        const responseAI = await fetch(urlPollinations, { signal: controllerAI.signal });
        clearTimeout(timeoutAI);
        
        const contentTypeAI = responseAI.headers.get("content-type");
        if (responseAI.ok && contentTypeAI && contentTypeAI.includes("image")) {
          urlGambarFinal = urlPollinations;
        }
      } catch (err) {}
    }

    const labelListStr = labels.join(", ");
    const promptSEO = [
      `Kamu adalah penulis jurnalis senior yang menulis artikel menarik tentang topik seputar "${kategoriSumberHariIni}". DILARANG MERESPON SEBAGAI AI.`,
      `Topik: "${judulBeritaAsli}"`,
      `Bahan: ${deskripsiArtikel}`,
      "",
      "TUGAS UTAMA:",
      "1. Tulislah dari sudut pandang yang 100% BARU, TAJAM, dan mendalam.",
      `2. WAJIB TULIS ISI KESELURUHAN ARTIKEL (JUDUL, DESKRIPSI, KONTEN) DALAM BAHASA **${targetBahasa}** DENGAN GAYA BAHASA NATURAL.`,
      `3. Tentukan 1 hingga 3 LABEL yang paling cocok dari daftar berikut saja: [${labelListStr}].`,
      "",
      "🔴 LARANGAN KERAS & MUTLAK:",
      "- DILARANG menyertakan basa-basi sapaan (contoh: 'Tentu, ini artikelnya', dll).",
      "- DILARANG memotong judul di tengah jalan. Jangan gunakan elipsis (...) di akhir judul.",
      "- DILARANG mengulang Judul dan Deskripsi di dalam bagian KONTEN.", 
      "",
      "🔴 GAYA PENULISAN & FORMAT HTML:",
      "- Paragraf harus pendek! (Maksimal 3-4 kalimat).",
      "- WAJIB 100% MENGGUNAKAN TAG HTML (<p>, <h2>, <h3>, <strong>, <ul>, <li>).",
      "- HARAM HUKUMNYA menulis teks biasa tanpa dibungkus tag HTML.",
      "",
      "🔴 FORMAT OUTPUT WAJIB (Pertahankan tag 'JUDUL:', 'DESKRIPSI:', 'LABEL:', 'KONTEN:' agar bot bisa membaca, HANYA ISINYA SAJA YANG DITERJEMAHKAN):",
      `JUDUL: [Tulis Judul Utuh Disini dalam bahasa ${targetBahasa} - Tanpa titik-titik]`,
      `DESKRIPSI: [Tulis Meta Deskripsi Singkat dalam bahasa ${targetBahasa}]`,
      "LABEL: [Pilih 1-3 label dari daftar di atas, pisahkan koma]",
      `KONTEN: [Tulis Seluruh Artikel FULL HTML Disini dalam bahasa ${targetBahasa}, langsung mulai dengan tag <h2> atau <p>]`
    ].join("\n");

    const resText = await fetch(profile.baseUrl.replace(/\/$/, "") + "/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + profile.apiKey
      },
      body: JSON.stringify({
        model: profile.textModel,
        messages: [{ role: "user", content: promptSEO }]
      })
    });

    const dataText = await resText.json();
    if (!dataText.choices || dataText.choices.length === 0) {
      throw new Error(dataText.error ? dataText.error.message : "Gagal memanggil model AI.");
    }
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
      const labelDariAI = matchLabel[1].split(',').map(lbl => lbl.trim());
      arrayLabelBlogger = labelDariAI.filter(lbl => 
        labels.some(validLbl => validLbl.toLowerCase() === lbl.toLowerCase())
      );
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

    const safeUrlForHtml = urlGambarFinal.replace(/&/g, '&amp;');

    const bannerHTML = `
      <div style="margin-bottom: 25px; text-align: center; overflow: hidden; border-radius: 12px;">
        <img src="${safeUrlForHtml}" alt="${judulFinal.replace(/"/g, '&quot;')}" loading="lazy" style="max-width: 100%; height: auto; display: block; margin: 0 auto; object-fit: cover;" />
      </div>
    `;
    const kontenHTMLFinal = bannerHTML + kontenHTMLRaw;

    const oauth2Client = new google.auth.OAuth2(blog.clientId, blog.clientSecret, "https://developers.google.com/oauthplayground");
    oauth2Client.setCredentials({ refresh_token: blog.refreshToken });
    const blogger = google.blogger({ version: "v3", auth: oauth2Client });

    const response = await blogger.posts.insert({
      blogId: blog.blogId,
      requestBody: {
        title: judulFinal,
        content: kontenHTMLFinal,
        labels: arrayLabelBlogger,
        searchDescription: deskripsiPenelusuran.substring(0, 140)
      }
    });

    const postUrl = response.data.url;
    const successMsg = `🎉 [SUKSES - ${blog.blogName}] Judul: ${judulFinal.substring(0, 40)}...`;
    logSystem(successMsg);

    // Save history
    const riwayatLokal = JSON.parse(fs.readFileSync(HISTORY_FILE, "utf-8"));
    riwayatLokal.push({
      id: response.data.id,
      blogId: blog.blogId,
      blogName: blog.blogName,
      title: judulFinal,
      originalTitle: judulBeritaAsli, 
      originalLink: linkBeritaAsli,
      url: postUrl,
      date: new Date().toLocaleDateString("id-ID"),
      label: arrayLabelBlogger.join(", ")
    });
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(riwayatLokal, null, 2));

    // Reload blogs list to write latest status
    const blogsForUpdate = JSON.parse(fs.readFileSync(BLOGS_FILE, "utf-8"));
    const updateIdx = blogsForUpdate.findIndex(b => b.id === blogId);
    if (updateIdx !== -1) {
      blogsForUpdate[updateIdx].lastLog = successMsg;
      const intervalMs = blogsForUpdate[updateIdx].intervalHours * 60 * 60 * 1000;
      blogsForUpdate[updateIdx].nextPostTime = new Date(Date.now() + intervalMs).toLocaleString("id-ID") + " WIB";
      fs.writeFileSync(BLOGS_FILE, JSON.stringify(blogsForUpdate, null, 2));
    }

  } catch (err) {
    const errorMsg = `❌ Gagal Posting [${blog.blogName}] Siklus [${kategoriSumberHariIni}]: ` + err.message;
    logSystem(errorMsg);
    
    // Reload blogs list to write latest error
    const blogsForError = JSON.parse(fs.readFileSync(BLOGS_FILE, "utf-8"));
    const errorBlogIdx = blogsForError.findIndex(b => b.id === blogId);
    if (errorBlogIdx !== -1) {
      blogsForError[errorBlogIdx].lastLog = errorMsg;
      fs.writeFileSync(BLOGS_FILE, JSON.stringify(blogsForError, null, 2));
    }
  }
}

function startBlogScheduler(blogId) {
  const blogs = JSON.parse(fs.readFileSync(BLOGS_FILE, "utf-8"));
  const blogIndex = blogs.findIndex(b => b.id === blogId);
  if (blogIndex === -1) return;
  const blog = blogs[blogIndex];

  if (activeTimers[blogId]) {
    clearInterval(activeTimers[blogId]);
  }

  const intervalMs = blog.intervalHours * 60 * 60 * 1000;
  blog.isRunning = true;
  blog.nextPostTime = new Date(Date.now() + intervalMs).toLocaleString("id-ID") + " WIB";
  blog.lastLog = "Menjalankan posting pertama...";
  blogs[blogIndex] = blog;
  fs.writeFileSync(BLOGS_FILE, JSON.stringify(blogs, null, 2));

  logSystem(`⚡ Menjalankan scheduler untuk blog [${blog.blogName}] tiap ${blog.intervalHours} jam.`);
  
  // Run immediately for testing/initial post
  buatDanPostArtikelOtomatisUntukBlog(blogId);

  // Set interval
  activeTimers[blogId] = setInterval(() => {
    buatDanPostArtikelOtomatisUntukBlog(blogId);
  }, intervalMs);
}

function stopBlogScheduler(blogId) {
  const blogs = JSON.parse(fs.readFileSync(BLOGS_FILE, "utf-8"));
  const blogIndex = blogs.findIndex(b => b.id === blogId);
  if (blogIndex === -1) return;
  const blog = blogs[blogIndex];

  if (activeTimers[blogId]) {
    clearInterval(activeTimers[blogId]);
    delete activeTimers[blogId];
  }

  blog.isRunning = false;
  blog.nextPostTime = "Mesin Dimatikan";
  blog.lastLog = "Mesin dihentikan oleh pengguna.";
  blogs[blogIndex] = blog;
  fs.writeFileSync(BLOGS_FILE, JSON.stringify(blogs, null, 2));

  logSystem(`⏹️ Menghentikan scheduler untuk blog [${blog.blogName}].`);
}

app.get("/api/status", (req, res) => {
  const diffMs = Date.now() - startTime;
  const hrs = Math.floor(diffMs / 3600000);
  const mins = Math.floor((diffMs % 3600000) / 60000);
  const memoryUsed = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);

  // Dynamically calculate status based on running blogs
  const blogs = JSON.parse(fs.readFileSync(BLOGS_FILE, "utf-8"));
  const runningBlogs = blogs.filter(b => b.isRunning);
  
  let engineStatus = "CORE IDLE (Standby)";
  if (runningBlogs.length > 0) {
    engineStatus = `CORE RUNNING (${runningBlogs.length} Blog Aktif)`;
  }

  let nextPostTime = "Mesin Dimatikan";
  if (runningBlogs.length > 0) {
    const nextTimes = runningBlogs.map(b => `${b.blogName}: ${b.nextPostTime}`);
    nextPostTime = nextTimes.join(" | ");
  }

  res.json({
    isRunning: runningBlogs.length > 0,
    engineStatus,
    nextPostTime,
    indeksJadwal: botState.indeksJadwal,
    logTerakhir: botState.logTerakhir,
    activeProfileName: botState.activeProfileName,
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
  logSystem(`📁 Profil API [${newProfile.profileName}] disimpan ke dalam Brankas.`);
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
    logSystem(`⚡ Sukses Beralih! Profil aktif sekarang: ${target.profileName}`);
    res.json({ success: true, state: botState });
  } else {
    res.status(404).json({ error: "Profil tidak ditemukan" });
  }
});

app.get("/api/blogs", (req, res) => {
  const data = fs.readFileSync(BLOGS_FILE, "utf-8");
  res.json(JSON.parse(data));
});

app.post("/api/blogs", async (req, res) => {
  try {
    const data = JSON.parse(fs.readFileSync(BLOGS_FILE, "utf-8"));
    const newBlog = {
      id: Date.now().toString(),
      blogName: req.body.blogName,
      blogId: req.body.blogId,
      clientId: req.body.clientId,
      clientSecret: req.body.clientSecret,
      refreshToken: req.body.refreshToken,
      intervalHours: parseFloat(req.body.intervalHours) || 3,
      profileId: req.body.profileId || "default",
      isRunning: false,
      nextPostTime: "Menunggu dijalankan",
      lastLog: "Blog terdaftar.",
      detectedLabels: []
    };
    
    // Auto-detect labels from Blogger API
    const labels = await detectBlogLabels(newBlog);
    newBlog.detectedLabels = labels;

    data.push(newBlog);
    fs.writeFileSync(BLOGS_FILE, JSON.stringify(data, null, 2));
    logSystem(`📁 Blog baru [${newBlog.blogName}] berhasil didaftarkan.`);
    res.json({ success: true, blogs: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/blogs/:id", (req, res) => {
  try {
    const data = JSON.parse(fs.readFileSync(BLOGS_FILE, "utf-8"));
    const idx = data.findIndex(b => b.id === req.params.id);
    if (idx !== -1) {
      const wasRunning = data[idx].isRunning;
      if (wasRunning) {
        stopBlogScheduler(req.params.id);
      }
      
      data[idx].blogName = req.body.blogName || data[idx].blogName;
      data[idx].blogId = req.body.blogId || data[idx].blogId;
      data[idx].clientId = req.body.clientId || data[idx].clientId;
      data[idx].clientSecret = req.body.clientSecret || data[idx].clientSecret;
      data[idx].refreshToken = req.body.refreshToken || data[idx].refreshToken;
      data[idx].intervalHours = parseFloat(req.body.intervalHours) || data[idx].intervalHours;
      data[idx].profileId = req.body.profileId || data[idx].profileId;
      
      fs.writeFileSync(BLOGS_FILE, JSON.stringify(data, null, 2));
      
      if (wasRunning) {
        startBlogScheduler(req.params.id);
      }
      
      logSystem(`✏️ Blog [${data[idx].blogName}] berhasil diperbarui.`);
      res.json({ success: true, blogs: data });
    } else {
      res.status(404).json({ error: "Blog tidak ditemukan" });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/blogs/:id", (req, res) => {
  try {
    const data = JSON.parse(fs.readFileSync(BLOGS_FILE, "utf-8"));
    const idx = data.findIndex(b => b.id === req.params.id);
    if (idx !== -1) {
      stopBlogScheduler(req.params.id);
      const name = data[idx].blogName;
      data.splice(idx, 1);
      fs.writeFileSync(BLOGS_FILE, JSON.stringify(data, null, 2));
      logSystem(`🗑️ Blog [${name}] berhasil dihapus.`);
      res.json({ success: true, blogs: data });
    } else {
      res.status(404).json({ error: "Blog tidak ditemukan" });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/blogs/:id/control", (req, res) => {
  const { action } = req.body;
  const blogs = JSON.parse(fs.readFileSync(BLOGS_FILE, "utf-8"));
  const blog = blogs.find(b => b.id === req.params.id);
  
  if (!blog) {
    return res.status(404).json({ error: "Blog tidak ditemukan" });
  }

  if (action === "start") {
    startBlogScheduler(req.params.id);
  } else if (action === "stop") {
    stopBlogScheduler(req.params.id);
  }

  const updatedBlogs = JSON.parse(fs.readFileSync(BLOGS_FILE, "utf-8"));
  res.json({ success: true, blog: updatedBlogs.find(b => b.id === req.params.id) });
});

app.post("/api/blogs/:id/detect-labels", async (req, res) => {
  try {
    const blogs = JSON.parse(fs.readFileSync(BLOGS_FILE, "utf-8"));
    const idx = blogs.findIndex(b => b.id === req.params.id);
    if (idx === -1) {
      return res.status(404).json({ error: "Blog tidak ditemukan" });
    }

    const labels = await detectBlogLabels(blogs[idx]);
    blogs[idx].detectedLabels = labels;
    fs.writeFileSync(BLOGS_FILE, JSON.stringify(blogs, null, 2));
    
    res.json({ success: true, detectedLabels: labels });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/control", (req, res) => {
  const { action } = req.body;
  const blogs = JSON.parse(fs.readFileSync(BLOGS_FILE, "utf-8"));
  const hasDefault = blogs.some(b => b.id === "default-blog");
  
  if (hasDefault) {
    if (action === "start") {
      startBlogScheduler("default-blog");
    } else if (action === "stop") {
      stopBlogScheduler("default-blog");
    }
  }
  
  const diffMs = Date.now() - startTime;
  const hrs = Math.floor(diffMs / 3600000);
  const mins = Math.floor((diffMs % 3600000) / 60000);
  const memoryUsed = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);
  const runningBlogs = blogs.filter(b => b.isRunning);
  
  let engineStatus = "CORE IDLE (Standby)";
  if (runningBlogs.length > 0) {
    engineStatus = `CORE RUNNING (${runningBlogs.length} Blog Aktif)`;
  }

  let nextPostTime = "Mesin Dimatikan";
  if (runningBlogs.length > 0) {
    const nextTimes = runningBlogs.map(b => `${b.blogName}: ${b.nextPostTime}`);
    nextPostTime = nextTimes.join(" | ");
  }

  res.json({
    isRunning: runningBlogs.length > 0,
    engineStatus,
    nextPostTime,
    indeksJadwal: botState.indeksJadwal,
    logTerakhir: botState.logTerakhir,
    activeProfileName: botState.activeProfileName,
    systemUptime: hrs + " Jam " + mins + " Menit",
    systemMemory: memoryUsed + " MB"
  });
});

// Auto-resume running schedulers on server boot
try {
  const blogs = JSON.parse(fs.readFileSync(BLOGS_FILE, "utf-8"));
  blogs.forEach(blog => {
    if (blog.isRunning) {
      const intervalMs = blog.intervalHours * 60 * 60 * 1000;
      activeTimers[blog.id] = setInterval(() => {
        buatDanPostArtikelOtomatisUntukBlog(blog.id);
      }, intervalMs);
      logSystem(`🔄 Melanjutkan scheduler otomatis untuk blog [${blog.blogName}]`);
    }
  });
} catch (e) {
  console.error("Gagal memulai ulang scheduler otomatis:", e.message);
}

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = 3000;
app.listen(PORT, "0.0.0.0", () => console.log("🚀 Dashboard OS mengudara aman di http://localhost:" + PORT));