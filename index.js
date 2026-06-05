import { createRequire } from "module";
import { google } from "googleapis";
import dotenv from "dotenv";

// Muat variabel dari file .env
dotenv.config();

// Membuat fungsi require manual untuk menjebol proteksi modul Node.js v24
const require = createRequire(import.meta.url);
const genAIModule = require("@google/generative-ai");

// ==========================================
// MEKANISME DETEKSI OTOMATIS (ANTI-ERROR CONSTRUCTOR)
// ==========================================
let GoogleGenAIClass = null;

if (genAIModule.GoogleGenAI) {
    GoogleGenAIClass = genAIModule.GoogleGenAI;
} else if (genAIModule.default && genAIModule.default.GoogleGenAI) {
    GoogleGenAIClass = genAIModule.default.GoogleGenAI;
} else if (typeof genAIModule.default === "function") {
    GoogleGenAIClass = genAIModule.default;
} else if (typeof genAIModule === "function") {
    GoogleGenAIClass = genAIModule;
} else {
    // Cari otomatis jika jalurnya tersembunyi
    const keys = Object.keys(genAIModule);
    for (let i = 0; i < keys.length; i++) {
        if (keys[i].toLowerCase().includes("ai") && typeof genAIModule[keys[i]] === "function") {
            GoogleGenAIClass = genAIModule[keys[i]];
            break;
        }
    }
}

if (!GoogleGenAIClass) {
    throw new Error("Gagal mendeteksi class GoogleGenAI. Silakan jalankan perintah: npm install @google/generative-ai@latest");
}

// Inisialisasi SDK Gemini yang sudah aman dari error
const ai = new GoogleGenAIClass(process.env.GEMINI_API_KEY);
const model = ai.getGenerativeModel({ model: "gemini-2.5-flash" });

// Konfigurasi Kredensial Google OAuth2 untuk Blogger
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  "https://developers.google.com/oauthplayground"
);

oauth2Client.setCredentials({
  refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
});

const blogger = google.blogger({
  version: "v3",
  auth: oauth2Client,
});

// ==========================================
// BANK TOPIK DENGAN LABEL ASLI BLOG KAMU
// ==========================================
const daftarTopik = [
  {
    kategori: "Game",
    labelBlogger: "Game",
    deskripsi: "Tren game open-world RPG terbaru yang paling dinanti di PC dan konsol, serta spesifikasi yang dibutuhkan.",
    keywordsID: "game terbaru, open world RPG, rekomendasi game, game PC terbaik, game konsol",
    keywordsEN: "latest games, open world RPG, game recommendations, best PC games, console games"
  },
  {
    kategori: "AI",
    labelBlogger: "Software",
    deskripsi: "Rekomendasi platform AI tools gratis terbaik untuk produktivitas, pembuatan gambar, dan coding otomatis.",
    keywordsID: "AI tools gratis, artificial intelligence, platform AI terbaik, teknologi AI terbaru",
    keywordsEN: "free AI tools, artificial intelligence, best AI platforms, latest tech trends"
  },
  {
    kategori: "Crypto",
    labelBlogger: "Lainnya",
    deskripsi: "Panduan aman memulai ekosistem Web3 dan strategi berburu crypto airdrop farming untuk pemula.",
    keywordsID: "crypto terbaru, web3 crypto, airdrop farming, crypto pemula, blockchain token",
    keywordsEN: "latest crypto, web3 ecosystem, airdrop farming, crypto for beginners, blockchain token"
  },
  {
    kategori: "Teknologi",
    labelBlogger: "Software",
    deskripsi: "Perkembangan sistem operasi terbaru, optimasi jaringan internet, dan tips performa software laptop.",
    keywordsID: "optimasi software, teknologi terbaru, sistem operasi, tips performa laptop",
    keywordsEN: "software optimization, latest technology, operating system, laptop performance tips"
  }
];

// ==========================================
// LOGIKA PEMBUATAN & POSTING KONTEN SEO
// ==========================================

async function buatDanPostArtikel(bahasa) {
  try {
    const topik = daftarTopik[Math.floor(Math.random() * daftarTopik.length)];
    const keywords = bahasa === "Indonesia" ? topik.keywordsID : topik.keywordsEN;

    console.log("\n🤖 [SISTEM] Memulai pembuatan artikel baru...");
    console.log("📌 Bahasa: " + bahasa + " | Kategori: [" + topik.kategori + "] -> Target Label: \"" + topik.labelBlogger + "\"");

    const promptSEO = [
      "Kamu adalah seorang praktisi SEO senior dan blogger teknologi profesional. Buatlah sebuah artikel blog yang sangat menarik, kaya informasi, and dioptimasi penuh untuk mesin pencari (SEO friendly).",
      "",
      "Topik utama: \"" + topik.deskripsi + "\"",
      "Target Keywords wajib dimasukkan secara natural di dalam teks: " + keywords,
      "Wajib ditulis full dalam: Bahasa " + bahasa,
      "",
      "KETENTUAN OUTPUT WAJIB FORMAT SEPERTI INI (PISAHKAN DENGAN ENTER):",
      "[JUDUL] Tulis teks judul artikel yang menarik dan mengandung keyword di sini (tanpa tag HTML).",
      "[DESKRIPSI] Tulis rangkuman artikel satu kalimat saja untuk Deskripsi Penelusuran SEO (maksimal 140 karakter, wajib mengandung keyword).",
      "[KONTEN] Mulai dari baris ini tulis isi artikel berupa HTML murni. Gunakan tag <h2>/<h3> untuk sub-judul, <p> untuk paragraf, <strong> untuk menebalkan kata kunci, dan <ul><li> untuk daftar. Jangan gunakan tag <h1>.",
      "",
      "Jangan memberikan bungkusan format markdown. Langsung ikuti format label di atas."
    ].join("\n");

    const hasilGemini = await model.generateContent(promptSEO);
    const responsTeks = hasilGemini.response.text().trim();

    const bagianJudul = responsTeks.match(/\[JUDUL\]([\s\S]*?)\[DESKRIPSI\]/);
    const bagianDeskripsi = responsTeks.match(/\[DESKRIPSI\]([\s\S]*?)\[KONTEN\]/);
    const bagianKonten = responsTeks.match(/\[KONTEN\]([\s\S]*)/);

    if (!bagianJudul || !bagianDeskripsi || !bagianKonten) {
      throw new Error("Format respons Gemini tidak sesuai ekspektasi, mencoba mengulangi pada jadwal berikutnya.");
    }

    const tigaPetik = String.fromCharCode(96, 96, 96);
    const judulFinal = bagianJudul[1].split(tigaPetik).join("").split("html").join("").trim();
    const deskripsiPenelusuran = bagianDeskripsi[1].trim();
    const kontenHTML = bagianKonten[1].split(tigaPetik).join("").split("html").join("").trim();

    console.log("📝 Judul Terbuat: \"" + judulFinal + "\"");
    console.log("🔍 Meta Deskripsi SEO: \"" + deskripsiPenelusuran + "\"");
    console.log("🚀 Mengirim ke Blogger dengan metadata lengkap...");

    const response = await blogger.posts.insert({
      blogId: process.env.BLOGGER_BLOG_ID,
      requestBody: {
        title: judulFinal,
        content: kontenHTML,
        labels: [topik.labelBlogger],
        searchDescription: deskripsiPenelusuran, 
      },
    });

    console.log("🎉 [SUKSES] Artikel Berbahasa " + bahasa + " berhasil diterbitkan lengkap dengan Meta Deskripsi!");
    console.log("🔗 Link: " + response.data.url);

  } catch (error) {
    console.error("❌ Gagal memposting artikel:", error.message);
  }
}

// ==========================================
// PENJADWALAN OTOMATIS (4 POSTINGAN SEHARI)
// ==========================================

const jadwalHarian = ["Indonesia", "English", "Indonesia", "English"];
let indeksJadwal = 0;

const JEDA_WAKTU = 6 * 60 * 60 * 1000; 

function jalankanMekanismeBot() {
  const bahasaSekarang = jadwalHarian[indeksJadwal];
  
  console.log("\n⏰ [JADWAL] Menjalankan antrean postingan Bahasa: " + bahasaSekarang);
  buatDanPostArtikel(bahasaSekarang);

  indeksJadwal = (indeksJadwal + 1) % jadwalHarian.length;
}

console.log("🚀 Bot Auto-Post Harian dengan Auto-Deskripsi Penelusuran SEO Aktif!");
jalankanMekanismeBot();

setInterval(jalankanMekanismeBot, JEDA_WAKTU);