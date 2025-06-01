// 请求https://www.wandoujia.com/apps/596157/history
// 使用axios请求 cherrio解析 ul.old-version-list>li  
// li下的a.detail-check-btn 的href是详情页连接
// 详情页的 .v2-safe-btn包含了apk的信息 data-app-vname是版本号  data-app-name是app名  data-app-pname是包名  
// 详情页的.update-time是更新时间 示例:更新时间：2024年07月10日 14:23 你要把时间格式转换为2024-07-10
// 详情页的a.normal-dl-btn的href是下载链接 把apk文件下载下来  
// 下载文件命名格式为app名_v包名_版本号_更新时间.apk

const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const https = require('https'); // 引入 https 模块
const url = require('url'); // 引入 url 模块

const historyUrl = 'https://www.wandoujia.com/apps/566489/history';
const DOWNLOAD_TIMEOUT = 300000; // 5 minutes in milliseconds

async function downloadApk(fileUrl, filename) { // 修改参数名为 fileUrl 以区分
  const parsedUrl = url.parse(fileUrl);
  console.log(parsedUrl.hostname)
  const options = {
    hostname: parsedUrl.hostname.replace("android-apps.pp.cn","alissl.ucdl.pp.uc.cn"),
    port: parsedUrl.port || 443,
    path: parsedUrl.path,
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br', // 注意：Node.js http/https 模块默认会处理gzip/deflate，这里保留 Accept-Encoding 告知服务器客户端支持
      'Accept-Language': 'en-US,en;q=0.9',
    },
  };

  return new Promise((resolve, reject) => {
    const request = https.request(options, (response) => {
      // Handle redirects (301, 302, 303, 307, 308)
      if (response.statusCode >= 301 && response.statusCode <= 308 && response.headers.location) {
        console.log(`[DEBUG] Received redirect status code ${response.statusCode} for ${filename}. Redirecting to ${response.headers.location}`);
        // Close the current response stream to prevent resource leaks
        response.resume(); 
        // Recursively call downloadApk with the new URL
        downloadApk(response.headers.location, filename).then(resolve).catch(reject);
        return; // Stop processing the current response
      }

      if (response.statusCode !== 200) {
        // 检查响应状态码
        return reject(new Error(`Download failed, status code: ${response.statusCode}`));
      }

      const writer = fs.createWriteStream(filename);

      writer.on('open', () => console.log(`[DEBUG] File stream opened for ${filename}`));
      writer.on('finish', () => {
        console.log(`[DEBUG] File stream finished for ${filename}`);
        clearTimeout(timeoutId); // 下载完成时清除超时
        resolve();
      });
      writer.on('error', (err) => {
        console.error(`[DEBUG] File stream error for ${filename}:`, err);
        clearTimeout(timeoutId); // 写入错误时清除超时
        reject(err);
      });

      // 下载进度跟踪
      const totalLength = parseInt(response.headers['content-length'], 10);
      let downloadedLength = 0;
      let lastLoggedPercentage = -1;

      if (totalLength) {
        response.on('data', (chunk) => { // 注意：这里 response.data 是 stream
          downloadedLength += chunk.length;
          const percentage = Math.floor((downloadedLength / totalLength) * 100);
          if (percentage > lastLoggedPercentage) {
            console.log(`[DEBUG] Downloading ${filename}: ${percentage}%`);
            lastLoggedPercentage = percentage;
          }
        });
      } else {
        console.log(`[DEBUG] Total file size unknown for ${filename}, cannot show percentage progress.`);
      }

      response.on('end', () => { // 监听响应流结束事件
         console.log(`[DEBUG] Response stream ended for ${filename}`);
      });

      response.on('error', (err) => { // 监听响应流错误事件
        console.error(`[DEBUG] Response stream error for ${filename}:`, err);
        clearTimeout(timeoutId);
        writer.destroy(); // 销毁文件写入流
        reject(err);
      });

      response.pipe(writer); // 将响应流导向文件写入流
    });

    // 设置超时
    const timeoutId = setTimeout(() => {
      request.abort(); // 中止请求
      reject(new Error(`Download timed out after ${DOWNLOAD_TIMEOUT / 1000} seconds`));
    }, DOWNLOAD_TIMEOUT);

    request.on('error', (err) => { // 监听请求错误事件
      console.error(`[DEBUG] Request error for ${filename}:`, err);
      clearTimeout(timeoutId);
      reject(err);
    });

    request.end(); // 结束请求（对于 GET 请求）
  });
}

async function processAppHistory() {
  try {
    const { data } = await axios.get(historyUrl);
    const $ = cheerio.load(data);

    const versionItems = $('ul.old-version-list > li');

    for (const item of versionItems) {
      const detailLink = $(item).find('a.detail-check-btn').attr('href');

      if (detailLink) {
        try {
          const detailUrl = detailLink;
          console.log(detailLink);
          const { data: detailData } = await axios.get(detailUrl);
          const $$ = cheerio.load(detailData);

          const safeBtn = $$('.v2-safe-btn');

          const appName = safeBtn.attr('data-app-name');
          const packageName = safeBtn.attr('data-app-pname');
          const versionName = safeBtn.attr('data-app-vname');

          const updateTimeText = $$('.update-time').text().replace('更新时间：', '').trim();
          // Convert time format from "YYYY年MM月DD日 HH:mm" to "YYYY-MM-DD"
          const updateTimeMatch = updateTimeText.match(/(\d{4})年(\d{2})月(\d{2})日/);
          let formattedUpdateTime = '';
          if (updateTimeMatch) {
            formattedUpdateTime = `${updateTimeMatch[1]}-${updateTimeMatch[2]}-${updateTimeMatch[3]}`;
          }

          const downloadLink = $$('a.normal-dl-btn').attr('data-href');

          if (appName && packageName && versionName && formattedUpdateTime && downloadLink) {
            const filename = `${packageName}_v${versionName}_${formattedUpdateTime}.apk`;
            const downloadPath = path.join(__dirname, 'apks/'+appName, filename);
            
            const appDir = path.join(__dirname, 'apks', appName);
            
            // Create apks directory if it doesn't exist
            if (!fs.existsSync(path.join(__dirname, 'apks'))) {
              fs.mkdirSync(path.join(__dirname, 'apks'));
            }

            // Create app-specific directory if it doesn't exist
            if (!fs.existsSync(appDir)) {
              fs.mkdirSync(appDir);
            }

            console.log(`Downloading ${filename} from ${downloadLink}`);
            await downloadApk(downloadLink, downloadPath);
            console.log(`Downloaded ${filename}`);

          } else {
              console.warn('Missing information for version item:', { appName, packageName, versionName, formattedUpdateTime, downloadLink });
          }

        } catch (detailError) {
          console.error(`Error fetching or processing detail page ${detailLink}:`, detailError);
        }
      }
    }

  } catch (error) {
    console.error('Error fetching app history:', error);
  }
}

processAppHistory();
