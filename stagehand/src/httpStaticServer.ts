import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Function to clean the tmp directory
function cleanTmpDirectory(directory: string) {
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
    return;
  }

  try {
    const files = fs.readdirSync(directory);
    for (const file of files) {
      if (file.startsWith('.')) continue; // Skip hidden files
      
      const filePath = path.join(directory, file);
      fs.unlinkSync(filePath);
    }
    console.log(`Cleaned tmp directory: ${directory}`);
  } catch (err) {
    console.error(`Error cleaning tmp directory: ${err}`);
  }
}

export function startStaticHttpServer() {
  const TMP_DIR = path.resolve(__dirname, "../tmp");
  const HTTP_PORT = process.env.STAGEHAND_HTTP_PORT ? parseInt(process.env.STAGEHAND_HTTP_PORT, 10) : 8080;

  // Clean the tmp directory on startup
  cleanTmpDirectory(TMP_DIR);

  const server = http.createServer((req, res) => {
    if (!req.url) {
      res.writeHead(400);
      res.end("Bad Request");
      return;
    }
    // Only allow /tmp/ URLs
    if (!req.url.startsWith("/tmp/")) {
      res.writeHead(404);
      res.end("Not Found");
      return;
    }
    // Directory listing for /tmp/ or /tmp
    if (req.url === "/tmp/" || req.url === "/tmp") {
      fs.readdir(TMP_DIR, (err, files) => {
        if (err) {
          res.writeHead(500);
          res.end("Failed to read directory");
          return;
        }
        const links = files
          .filter(f => !f.startsWith("."))
          .map(f => `<li><a href=\"/tmp/${encodeURIComponent(f)}\">${f}</a></li>`) // encode for safety
          .join("\n");
        const html = `<!DOCTYPE html><html><head><title>tmp Directory Listing</title></head><body><h1>Files in /tmp/</h1><ul>${links}</ul></body></html>`;
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(html);
      });
      return;
    }
    // Serve individual files
    const filePath = path.join(TMP_DIR, req.url.replace("/tmp/", ""));
    if (!filePath.startsWith(TMP_DIR)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end("Not Found");
        return;
      }
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(data);
    });
  });
  let actualPort = HTTP_PORT;
  server.listen(HTTP_PORT, () => {
    const address = server.address();
    if (address && typeof address === 'object') {
      actualPort = address.port;
    }
    // eslint-disable-next-line no-console
    console.log(`Static file server running at http://localhost:${actualPort}/tmp/`);
  });
  return { server, port: actualPort };
} 