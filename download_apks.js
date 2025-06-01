const fs = require('fs');
const path = require('path');
const https = require('https');

const jsonFilePath = 'output.json';
const downloadDir = 'apks/微信new';

// Create download directory if it doesn't exist
if (!fs.existsSync(downloadDir)) {
  fs.mkdirSync(downloadDir, { recursive: true });
}

fs.readFile(jsonFilePath, 'utf8', (err, data) => {
  if (err) {
    console.error(`Error reading JSON file: ${err}`);
    return;
  }

  let jsonData;
  try {
    jsonData = JSON.parse(data);
  } catch (parseErr) {
    console.error(`Error parsing JSON data: ${parseErr}`);
    return;
  }

  if (!Array.isArray(jsonData)) {
    console.error('JSON data is not an array.');
    return;
  }

  jsonData.forEach(entry => {
    const { versionName, downloadLink, updateTime } = entry;

    // Format update time to YYYY-MM-DD
    const dateMatch = updateTime.match(/(\d{4})年(\d{2})月(\d{2})日/);
    let formattedDate = '';
    if (dateMatch && dateMatch[1] && dateMatch[2] && dateMatch[3]) {
      formattedDate = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
    } else {
        console.warn(`Could not parse date from: ${updateTime}. Skipping download for ${versionName}.`);
        return; // Skip this entry if date format is unexpected
    }

    const fileName = `com.tencent.mm_${versionName}_${formattedDate}.apk`;
    const targetPath = path.join(downloadDir, fileName);

    console.log(`Attempting to download ${versionName} to ${targetPath}...`);

    const fileStream = fs.createWriteStream(targetPath);
    // console.log(downloadLink); // Removed the debug log

    const request = https.get(downloadLink, (response) => {
      if (response.statusCode !== 200) {
        console.error(`Failed to download ${versionName}. Status Code: ${response.statusCode}`);
        fileStream.close();
        fs.unlink(targetPath, () => {}); // Delete the partial file
        return;
      }

      const totalBytes = parseInt(response.headers['content-length'], 10);
      let downloadedBytes = 0;
      let lastReportedProgress = -1; // Initialize with -1 to report 0% immediately

      console.log(`Starting download of ${versionName}. Total size: ${totalBytes ? (totalBytes / 1024 / 1024).toFixed(2) + ' MB' : 'Unknown'}`);

      response.on('data', (chunk) => {
        downloadedBytes += chunk.length;
        if (totalBytes) {
          const progress = Math.floor((downloadedBytes / totalBytes) * 100);
          // Report progress every 5% change or if it's the first report or 100%
          if (progress % 5 === 0 && progress !== lastReportedProgress || lastReportedProgress === -1 || progress === 100) {
             if (progress > lastReportedProgress) {
                console.log(`Downloading ${versionName}: ${progress}%`);
                lastReportedProgress = progress;
             }
          }
        }
      });

      response.pipe(fileStream);

      fileStream.on('finish', () => {
        fileStream.close();
        console.log(`Finished downloading ${versionName}`);
      });
    });

    request.on('error', (e) => {
      console.error(`Error downloading ${versionName}: ${e.message}`);
      fileStream.close();
      fs.unlink(targetPath, () => {}); // Delete the partial file
    });
  });
}); 