/* eslint-disable no-await-in-loop */
const fs = require('fs');
const path = require('path');
const { isNil, isEmpty } = require('lodash');
const { format } = require('date-fns');
const ora = require('ora');
const levelup = require('levelup');
const leveldown = require('leveldown');

// 以当前时间(秒)作为分析文件路径的分隔，用于`logger`
const RUN_DATE = format(new Date(), 'X');

// 初始化数据库
const pageCacheDB = levelup(
  leveldown(path.join(__dirname, '../pageCacheDB/stats.gov.cn'))
);

/**
 * 生成数据文件
 *
 * @param {String} filename - 文件名字
 * @param {Object} content - 文件内容
 */
const makeLogFile = (filename, content) => {
  fs.writeFileSync(
    path.join(
      __dirname,
      `../logs/stats.gov.cn/pageCacheClean/${RUN_DATE}.${filename}`
    ),
    JSON.stringify(content, null, 2),
    'utf8'
  );
};

(async () => {
  const cacheList = [];
  const cacheErrorList = [];

  const readSpinner = ora().start(`正在读取 pageCacheDB`);
  pageCacheDB
    .createReadStream()
    .on('data', data => {
      const key = Buffer.from(data.key).toString();
      cacheList.push(key);
      readSpinner.text = `正在读取 pageCacheDB[${cacheList.length}]: ${key}`;
      try {
        const value = JSON.parse(Buffer.from(data.value).toString());
        if (isNil(value) || isEmpty(value)) {
          cacheErrorList.push(key);
        }
      } catch (error) {
        readSpinner.error(`读取数据失败！`);
        throw error;
      }
    })
    .on('error', err => {
      readSpinner.error(`读取数据失败！`);
      console.error(err);
    })
    .on('end', async () => {
      readSpinner.succeed('读取数据结束，开始写入文件！');
      const logFilePath = path.join(
        __dirname,
        `../logs/stats.gov.cn/pageCacheClean`
      );
      if (!fs.existsSync(logFilePath)) {
        fs.mkdirSync(logFilePath);
      }
      makeLogFile('all.json', cacheList);
      makeLogFile('error.json', cacheErrorList);

      const cleanSpinner = ora().start(`正在清理 pageCacheDB`);
      try {
        await pageCacheDB.batch(
          cacheErrorList.map(key => ({
            type: 'del',
            key,
          }))
        );
        cleanSpinner.succeed(
          `清理数据结束，共清理${cacheErrorList.length}条无效数据！`
        );
      } catch (error) {
        cleanSpinner.error(`清理数据失败！`);
        console.error(error);
      }
    });
})();
