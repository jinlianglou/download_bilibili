const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function main() {
  rl.question('请输入Bilibili视频链接: ', async (url) => {
    if (!url) {
      console.log('无效的URL');
      rl.close();
      return;
    }

    try {
      const videoInfo = await getVideoInfo(url);
      console.log(`视频标题: ${videoInfo.title}`);

      console.log('可用清晰度:');
      console.log('1. 360P');
      console.log('2. 480P');
      console.log('3. 720P');
      console.log('4. 1080P');

      rl.question('请选择清晰度 (1-4): ', async (qualityChoice) => {
        const quality = getQualityCode(qualityChoice);

        const downloadUrl = await getDownloadUrl(videoInfo.bvid, videoInfo.cid, quality);
        await downloadVideo(downloadUrl, videoInfo.title);

        console.log(`视频 "${videoInfo.title}" 下载完成!`);
        rl.close();
      });
    } catch (e) {
      console.log(`发生错误: ${e}`);
      rl.close();
    }
  });
}

async function getVideoInfo(url) {
  const response = await axios.get(url);
  const $ = cheerio.load(response.data);

  let jsonString;
  $('script').each((i, script) => {
    const scriptContent = $(script).html();
    if (scriptContent && scriptContent.includes('window.__INITIAL_STATE__')) {
      const startIndex = scriptContent.indexOf('window.__INITIAL_STATE__=') + 'window.__INITIAL_STATE__='.length;
      const endIndex = scriptContent.indexOf(';(function()');
      if (startIndex !== -1 && endIndex !== -1) {
        jsonString = scriptContent.substring(startIndex, endIndex);
      }
    }
  });

  if (!jsonString) {
    console.error('无法找到视频信息');
    throw new Error('无法找到视频信息');
  }

  let videoData;
  try {
    videoData = JSON.parse(jsonString);
  } catch (e) {
    console.error('解析视频信息时发生错误:', e);
    throw new Error('解析视频信息时发生错误');
  }

  return {
    title: videoData.videoData.title,
    cid: videoData.videoData.cid.toString(),
    bvid: videoData.bvid,
  };
}

function getQualityCode(choice) {
  switch (choice) {
    case '1': return 16;
    case '2': return 32;
    case '3': return 64;
    case '4': return 80;
    default: return 32; // 默认480P
  }
}

async function getDownloadUrl(bvid, cid, quality) {
  const apiUrl = `https://api.bilibili.com/x/player/playurl?bvid=${bvid}&cid=${cid}&qn=${quality}`;
  const response = await axios.get(apiUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3',
      'Referer': `https://www.bilibili.com/video/${bvid}`,
      'Origin': 'https://www.bilibili.com',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.5',
      'Connection': 'keep-alive',
    }
  });
  const data = response.data;

  if (data.code !== 0) throw new Error('获取下载链接失败');
  return data.data.durl[0].url;
}

async function downloadVideo(url, title) {
  const response = await axios({
    url,
    method: 'GET',
    responseType: 'stream',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3',
      'Referer': 'https://www.bilibili.com',
      'Origin': 'https://www.bilibili.com',
      'Accept': 'video/webm,video/ogg,video/*;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Connection': 'keep-alive',
    }
  });

  return new Promise((resolve, reject) => {
    const totalLength = response.headers['content-length'];
    let receivedBytes = 0;

    const writer = fs.createWriteStream(`${title}.mp4`);
    response.data.on('data', (chunk) => {
      writer.write(chunk);
      receivedBytes += chunk.length;
      const progress = ((receivedBytes / totalLength) * 100).toFixed(2);
      process.stdout.write(`\r下载进度: ${progress}%`);
    });

    response.data.on('end', () => {
      writer.end();
      console.log('\n');
      resolve();
    });

    response.data.on('error', (err) => {
      writer.end();
      reject(`下载过程中发生错误: ${err}`)
    });
  })
}

main();