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

const fallbackTopik = {
  "ANDROID": [
    "Review HP Android terbaru bulan ini beserta kelebihannya",
    "Tips ampuh menghemat baterai HP Android agar awet seharian",
    "Game Android dengan grafis memukau terbaik tahun ini",
    "Cara jitu mengatasi memori penyimpanan HP Android yang penuh",
    "Bocoran rumor HP Android flagship yang akan segera rilis"
  ],
  "INSTALASI OS": [
    "Panduan lengkap instalasi Windows 11 tanpa kehilangan data",
    "Kelebihan dan kekurangan menggunakan OS Linux untuk sehari-hari",
    "Cara mudah mengatasi laptop Windows yang sering Blue Screen",
    "Alasan mengapa kamu harus upgrade ke SSD sekarang juga",
    "Tips merawat sistem operasi agar tetap ringan dan ngebut"
  ],
  "JARINGAN": [
    "Cara setting router Mikrotik dasar untuk pemula",
    "Trik memperkuat sinyal WiFi di rumah yang sering ngadat",
    "Mengenal bahaya public WiFi dan cara melindunginya",
    "Perbedaan jaringan 4G dan 5G yang wajib kamu tahu",
    "Cara mengamankan jaringan internet rumah dari hacker"
  ],
  "SOFTWARE": [
    "Review 5 software produktivitas terbaik untuk WFH",
    "Daftar AI Tools desktop yang bisa mempermudah pekerjaanmu",
    "Browser alternatif selain Chrome yang lebih ringan dan aman",
    "Software edit video gratisan PC yang sekelas Adobe Premiere",
    "Aplikasi wajib install setelah beli laptop baru"
  ],
  "WEB DESAIN": [
    "Tren UI/UX Design terbaru yang sedang hits di industri kreatif",
    "Tutorial dasar memahami framework Tailwind CSS dengan mudah",
    "Kesalahan fatal yang sering dilakukan web designer pemula",
    "Pentingnya website responsif di era dominasi smartphone",
    "Daftar font keren dan gratis untuk project web design kamu"
  ],
  "GAME": [
    "Review jujur game PC atau konsol AAA yang baru saja rilis",
    "Tips dan trik push rank e-sports (Valorant/MLBB/PUBG)",
    "Daftar game indie PC terbaik dengan cerita yang bikin nangis",
    "Perkembangan teknologi Unreal Engine 5 di industri game",
    "Rekomendasi perangkat gaming murah meriah namun berkualitas"
  ],
  "LAINNYA": [
    "Berkembangan teknologi AI dan dampaknya bagi masa depan pekerjaan",
    "Tren dunia Cryptocurrency dan Web3 minggu ini",
    "Review gadget unik dan aneh yang ada di pasaran",
    "Inovasi mobil listrik terbaru dan masa depannya",
    "Tips menjaga kesehatan mata bagi pekerja yang sering menatap layar"
  ]
};

async function fetchLatestTrend(targetKategoriSitus) {
  const targetFeeds = {
    "ANDROID": ["https://www.androidauthority.com/feed/", "https://www.androidpolice.com/feed/"],
    "INSTALASI OS": ["https://www.windowscentral.com/rss", "https://betanews.com/feed/"],
    "JARINGAN": ["https://www.networkworld.com/feed/"],
    "SOFTWARE": ["https://techcrunch.com/category/software/feed/", "https://www.theverge.com/software/rss/index.xml"],
    "WEB DESAIN": ["https://css-tricks.com/feed/", "https://tympanus.net/codrops/feed/"],
    "GAME": ["https://feeds.feedburner.com/ign/news", "https://kotaku.com/rss"],
    "LAINNYA": ["https://www.engadget.com/rss.xml", "https://cointelegraph.com/rss"]
  };

  try {
    const listFeeds = targetFeeds[targetKategoriSitus];
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
    console.log(`⚠️ Semua berita RSS di ${targetKategoriSitus} sudah pernah dipost. Beralih ke topik cadangan.`);
    return null; 
  } catch (error) {
    console.error(`Gagal nge-scrape sumber ${targetKategoriSitus}, beralih ke bank topik:`, error.message);
    return null;
  }
}

async function buatDanPostArtikelOtomatis() {
  const kategoriSumberHariIni = daftarMenuUntukScrape[botState.indeksJadwal];
  
  try {
    botState.logTerakhir = `🤖 Mencari bahan artikel FRESH dari situs: [${kategoriSumberHariIni}]`;
    
    const trendBerita = await fetchLatestTrend(kategoriSumberHariIni);
    
    let deskripsiArtikel = "";
    let judulBeritaAsli = "";
    let linkBeritaAsli = "";
    
    if (trendBerita) {
      botState.logTerakhir = `📰 Bahan berita BARU ditemukan dari [${trendBerita.source}]: ${trendBerita.title}`;
      deskripsiArtikel = `Intisari berita: ${trendBerita.summary}`;
      judulBeritaAsli = trendBerita.title;
      linkBeritaAsli = trendBerita.link;
    } else {
      const arrayTopik = fallbackTopik[kategoriSumberHariIni];
      const topikAcak = arrayTopik[Math.floor(Math.random() * arrayTopik.length)];
      judulBeritaAsli = "Topik Menarik: " + topikAcak;
      deskripsiArtikel = "Buat artikel lengkap, segar, dan mendalam berdasarkan topik ini: " + topikAcak;
      linkBeritaAsli = "fallback-" + Date.now();
    }

    let urlGambarFinal = "";

    if (trendBerita && trendBerita.scrapedImage) {
      urlGambarFinal = "https://wsrv.nl/?url=" + encodeURIComponent(trendBerita.scrapedImage);
    }

    if (!urlGambarFinal) {
      // GUDANG GAMBAR UNLIMITED: Memakai AI Image Generator Gratis
      const kataKunciGambar = {
        "ANDROID": "modern android smartphone laying on desk, close up tech gadget, high resolution",
        "INSTALASI OS": "computer screen showing installation progress, modern laptop windows linux os, cinematic light",
        "JARINGAN": "glowing fiber optic network cables, futuristic server room, cyberpunk technology",
        "SOFTWARE": "software development code on computer monitor, dark mode hacker terminal workspace",
        "WEB DESAIN": "ui ux web design layout on monitor, colorful digital workspace, graphic design concept",
        "GAME": "rgb gaming setup room, mechanical keyboard and mouse, futuristic esports arena",
        "LAINNYA": "futuristic artificial intelligence glowing brain, blockchain nodes concept, high tech"
      };

      const promptGambar = kataKunciGambar[kategoriSumberHariIni] || "modern technology internet concept";
      const angkaAcak = Math.floor(Math.random() * 9999999);
      
      // Link ini akan secara otomatis menggambar gambar baru sesuai prompt dan angka acak setiap kali dipanggil
      urlGambarFinal = `https://image.pollinations.ai/prompt/${encodeURIComponent(promptGambar)}?width=800&height=450&nologo=true&seed=${angkaAcak}`;
    }

    const promptSEO = [
      "Kamu adalah penulis artikel blog teknologi/umum dengan gaya penulisan cerdas, tajam, dan natural sekelas jurnalis senior.",
      `Topik Utama: "${judulBeritaAsli}"`,
      `Bahan Artikel: ${deskripsiArtikel}`,
      "",
      "TUGAS UTAMA:",
      "1. Tulis artikel SEO-friendly yang 100% FRESH dan informatif.",
      "2. JANGAN mengulang-ulang narasi atau frasa yang sama secara berlebihan.",
      "3. Tentukan 1 hingga 3 LABEL yang Paling Cocok: [ANDROID, INSTALASI OS, JARINGAN, SOFTWARE, WEB DESAIN, GAME, LAINNYA].",
      "",
      "🔴 ATURAN JUDUL SANGAT KETAT:",
      "- Buat 1 judul yang UTUH, padat, dan tuntas.",
      "- DILARANG KERAS memotong judul di tengah jalan.",
      "- DILARANG KERAS menggunakan tanda titik-titik (elipsis) atau (...) di akhir judul.",
      "",
      "🔴 GAYA PENULISAN & SUDUT PANDANG:",
      "- Bawa sudut pandang/opini yang unik agar pembaca merasa artikel ini baru.",
      "- Buat paragraf pendek! Maksimal 3-4 kalimat per paragraf agar pembaca tidak lelah.",
      "- Gunakan tag <h2>...</h2> atau <h3>...</h3> untuk sub-judul.",
      "- WAJIB bungkus teks dengan tag <p>...</p>.",
      "",
      "🔴 FORMAT OUTPUT WAJIB (Ikuti 4 baris ini persis):",
      "JUDUL: [Tulis Judul Utuh Disini - Tanpa HTML dan Tanpa titik-titik di akhir]",
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

    const bannerHTML = `
      <div style="margin-bottom: 25px; text-align: center; overflow: hidden; border-radius: 12px;">
        <img src="${urlGambarFinal}" alt="${judulFinal.replace(/"/g, '&quot;')}" style="max-width: 100%; height: auto; display: block; margin: 0 auto;" />
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
    botState.logTerakhir = `🎉 [SUKSES KONTEN FRESH] Judul: ${judulFinal}`;

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

  botState.indeksJadwal = (botState.indeksJadwal + 1) % daftarMenuUntukScrape.length;
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