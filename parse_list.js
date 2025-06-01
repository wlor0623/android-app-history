const fs = require('fs');

const filePath = 'list.md';
const outputPath = 'output.json';

fs.readFile(filePath, 'utf8', (err, data) => {
  if (err) {
    console.error(`Error reading file: ${err}`);
    return;
  }

  // Replace Windows line endings with Unix line endings
  const cleanedData = data.replace(/\r\n/g, '\n');

  const entries = cleanedData.split('\n\n').filter(entry => entry.trim() !== '');

  const jsonData = entries.map(entry => {
    const lines = entry.split('\n');
    // console.log(lines); // Removed the debug log
    const versionNameLine = lines[0];
    const downloadLink = lines[1];
    const updateTimeLine = lines[2];

    const versionName = versionNameLine.replace('官方版本号：', '').trim();
    const updateTime = updateTimeLine.replace('更新时间：', '').trim();

    return {
      versionName,
      downloadLink,
      updateTime,
    };
  });

  fs.writeFile(outputPath, JSON.stringify(jsonData, null, 2), 'utf8', (err) => {
    if (err) {
      console.error(`Error writing file: ${err}`);
      return;
    }
    console.log(`Successfully wrote JSON data to ${outputPath}`);
  });
}); 