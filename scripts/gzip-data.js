const path = require('path');
const { createGzip } = require('node:zlib');
const { pipeline } = require('node:stream');
const {
  createReadStream,
  createWriteStream,
} = require('node:fs');
const {
  readdir,
  unlink
} = require('node:fs/promises');
const { promisify } = require('node:util');
const { formatDistanceToNow } = require('date-fns');
const zhLocale = require('date-fns/locale/zh-CN');

const pipe = promisify(pipeline);
async function gzip_file(input, output) {
  const gzip = createGzip();
  const source = createReadStream(input);
  const destination = createWriteStream(output);
  await pipe(source, gzip, destination);
}


async function get_data_file(direntPath) {
  const files = [];
  const dirents = await readdir(direntPath, {
    withFileTypes: true
  });
  for (const dirent of dirents) {
    if (dirent.isDirectory()) {
      const nextDirFiles = await get_data_file(path.join(direntPath, dirent.name));
      if (nextDirFiles.length) {
        files.push(...nextDirFiles);
      }
    } else if (dirent.isFile()) {
      files.push(path.join(direntPath, dirent.name))
    }
  }
  return files;
}

(async () => {
  const startTime = new Date();
  const files = await get_data_file(path.join(__dirname, '../data'));
  if (files) {
    const needGzipFiles = files.filter((file) => (/json$/.test(file)));
    console.log(
      `================================
开始压缩数据，共找到 ${needGzipFiles.length} 个待压缩文件
--------------------------------`
    );
    for (const [index, needGzipFile] of needGzipFiles.entries()) {
      console.log(`> [${index + 1}/${needGzipFiles.length}] gzip to ${needGzipFile}.gz`)
      await gzip_file(needGzipFile, `${needGzipFile}.gz`);
      console.log(`> clean ${needGzipFile}`)
      await unlink(needGzipFile)
    }
    console.log(
      `--------------------------------
> 共耗时：${formatDistanceToNow(startTime, { locale: zhLocale })}
================================`
    );
  }
})();
