const fs = require("fs");
const path = require("path");
const https = require("https");

const outDir = path.resolve(__dirname, "../public/companies");
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const images = [
  {
    name: "fpt_cover.jpg",
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/35/FPT_Complex_%C4%90%C3%A0_N%E1%BA%B5ng_%2861072%29.jpg/1280px-FPT_Complex_%C4%90%C3%A0_N%E1%BA%B5ng_%2861072%29.jpg",
  },
  {
    name: "vnpt_cover.jpg",
    url: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=1200&q=80",
  },
  {
    name: "viettel_cover.jpg",
    url: "https://images.unsplash.com/photo-1577495508048-b635879837f1?w=1200&q=80",
  },
  {
    name: "vng_cover.jpg",
    url: "https://images.unsplash.com/photo-1497366216548-37526070297c?w=1200&q=80",
  },
  {
    name: "momo_cover.jpg",
    url: "https://images.unsplash.com/photo-1556761175-5973dc0f32e7?w=1200&q=80",
  },
  {
    name: "shopee_cover.jpg",
    url: "https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=1200&q=80",
  },
  {
    name: "vpbank_cover.jpg",
    url: "https://images.unsplash.com/photo-1554469384-e58fac16e23a?w=1200&q=80",
  },
  {
    name: "techcombank_cover.jpg",
    url: "https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=1200&q=80",
  },
];

async function download(item) {
  return new Promise((resolve, reject) => {
    const filePath = path.join(outDir, item.name);
    console.log(`Downloading ${item.name} from ${item.url}...`);

    function get(currentUrl, redirectCount = 0) {
      if (redirectCount > 5) {
        return reject(new Error(`Too many redirects for ${item.name}`));
      }

      const client = https.get(
        currentUrl,
        {
          headers: {
            "User-Agent":
              "SmartHireBot/1.0 (DATN Thesis Student Research; contact@smart.local)",
          },
        },
        (res) => {
          if (
            res.statusCode >= 300 &&
            res.statusCode < 400 &&
            res.headers.location
          ) {
            return get(res.headers.location, redirectCount + 1);
          }

          if (res.statusCode !== 200) {
            return reject(
              new Error(
                `Failed to download ${item.name}, status: ${res.statusCode}`
              )
            );
          }

          const fileStream = fs.createWriteStream(filePath);
          res.pipe(fileStream);
          fileStream.on("finish", () => {
            fileStream.close();
            console.log(`Saved ${item.name}`);
            resolve();
          });
          fileStream.on("error", reject);
        }
      );
      client.on("error", reject);
    }

    get(item.url);
  });
}

(async () => {
  for (const item of images) {
    try {
      await download(item);
    } catch (err) {
      console.error(`Error downloading ${item.name}:`, err.message);
    }
  }
  console.log("All company photos downloaded successfully!");
})();
