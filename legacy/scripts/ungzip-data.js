const path = require('path');
const { createGunzip } = require('node:zlib');
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

async function ungzip_file(input, output) {
  const gunzip = createGunzip();
  const source = createReadStream(input);
  const destination = createWriteStream(output);
  await pipe(source, gunzip, destination);
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
    const needGunzipFiles = files.filter((file) => (/json\.gz$/.test(file)));
    console.log(
      `================================
开始解压数据，共找到 ${needGunzipFiles.length} 个待解压文件
--------------------------------`
    );
    for (const [index, needGunzipFile] of needGunzipFiles.entries()) {
      console.log(`> [${index + 1}/${needGunzipFiles.length}] ungzip ${needGunzipFile.replace(/\.gz$/, '')}`)
      await ungzip_file(needGunzipFile, needGunzipFile.replace(/\.gz$/, ''));
      console.log(`> clean ${needGunzipFile}`)
      await unlink(needGunzipFile)
    }
    console.log(
      `--------------------------------
> 共耗时：${formatDistanceToNow(startTime, { locale: zhLocale })}
================================`
    );
  }
})();
