/* eslint-disable no-await-in-loop */
const fs = require('fs');
const path = require('path');
const { isArray, get } = require('lodash');
const { format } = require('date-fns');
const ora = require('ora');
const levelup = require('levelup');
const leveldown = require('leveldown');

// 初始化数据库
const pageCacheDB = levelup(
  leveldown(path.join(__dirname, '../pageCacheDB/stats.gov.cn'))
);

(async () => {
  const readSpinner = ora().start(`正在读取 pageCacheDB`);
  let runHistory = null;
  try {
    const runHistoryCache = await pageCacheDB.get('runHistory');
    runHistory = JSON.parse(runHistoryCache);
    readSpinner.succeed(`读取成功！共 ${runHistory.length} 条数据`);
  } catch (error) {
    console.log(error);
    readSpinner.fail('读取失败！');
  }

  if (isArray(runHistory) && runHistory.length) {
    for (
      let recordIndex = 0;
      recordIndex < runHistory.length;
      recordIndex += 1
    ) {
      const record = runHistory[recordIndex];
      const recordRunDate = get(record, ['runDate']);
      const recordQueues = get(record, ['queues']);

      if (isArray(recordQueues) && recordQueues.length) {
        const recordRunDateFormat = format(
          new Date(recordRunDate * 1000),
          'YYYY-MM-DD HH:mm:ss'
        );
        const makeLogFileSpinner = ora().start(
          `正在写入 ${recordRunDateFormat} 的数据至日志文件`
        );
        try {
          const logFilePath = path.join(
            __dirname,
            `../logs/stats.gov.cn/run-records`,
            recordRunDate
          );
          if (!fs.existsSync(logFilePath)) {
            fs.mkdirSync(logFilePath);
          }
          for (
            let queueIndex = 0;
            queueIndex < recordQueues.length;
            queueIndex += 1
          ) {
            const queueData = recordQueues[queueIndex];

            // console.log(get(queueData, ['year']));

            // console.log(`${recordRunDate}-${get(queueData, ['year'])}.json`);
            fs.writeFileSync(
              path.join(
                __dirname,
                `../logs/stats.gov.cn/run-records`,
                recordRunDate,
                `${get(queueData, ['year'])}.json`
              ),
              JSON.stringify(queueData, null, 2),
              {
                encoding: 'utf8',
              }
            );
          }
          makeLogFileSpinner.succeed(`${recordRunDateFormat} 的数据写入成功！`);
        } catch (error) {
          console.error(error);
          makeLogFileSpinner.fail(`${recordRunDateFormat} 的数据写入失败！`);
        }
      }
    }
  }
})();
