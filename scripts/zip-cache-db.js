const path = require('path');
const AdmZip = require('adm-zip');
const { formatDistanceToNow } = require('date-fns');
const zhLocale = require('date-fns/locale/zh-CN');


(async () => {
  const startTime = new Date();
  const cacheDataBasePath = path.join(__dirname, '../pageCacheDB');
  const cacheDataBaseZipFilePath = path.join(__dirname, '../pageCacheDB.zip');
  console.log(
    `================================
开始压缩爬取的缓存数据
--------------------------------`
  );
  const dbZip = new AdmZip();
  await dbZip.addLocalFolderPromise(cacheDataBasePath);
  await dbZip.writeZipPromise(cacheDataBaseZipFilePath);
  console.log(
    `--------------------------------
> 共耗时：${formatDistanceToNow(startTime, { locale: zhLocale })}
================================`
  );
})();
