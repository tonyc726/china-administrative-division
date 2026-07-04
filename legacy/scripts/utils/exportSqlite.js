const filehandle = require('fs').promises;
const { isEmpty, forEach, get } = require('lodash');
const ora = require('ora');
const { formatDistanceStrict } = require('date-fns');

const connectSqlite = require('./sqlite');

module.exports = async ({ dataFilePath, sqlFileName, dataSource }) => {
  console.log(`
==================================================
:tada: 开始处理流程
--------------------------------------------------
  `);
  let data = null;
  const spinner = ora().start();
  const startTime = new Date();
  let startOfNextStepTime = startTime;
  let endOfNextStepTime = startOfNextStepTime;

  if (!isEmpty(dataSource) && isEmpty(dataFilePath)) {
    data = dataSource;
  } else if (isEmpty(dataSource) && !isEmpty(dataFilePath)) {
    try {
      spinner.text = `开始读取数据文件，${dataFilePath}`;
      const dataBuffer = await filehandle.readFile(dataFilePath);
      endOfNextStepTime = new Date();
      spinner.succeed(
        `数据文件读取完成，总耗时：${formatDistanceStrict(
          startOfNextStepTime,
          endOfNextStepTime
        )}`
      );

      startOfNextStepTime = endOfNextStepTime;
      spinner.text = '开始解析数据文件';

      data = JSON.parse(dataBuffer);

      endOfNextStepTime = new Date();
      spinner.succeed(
        `数据文件解析完成，总耗时：${formatDistanceStrict(
          startOfNextStepTime,
          endOfNextStepTime
        )}`
      );
    } catch (error) {
      console.log(error);
      spinner.fail(`数据文件读取解析失败`);
    }
  }

  if (isEmpty(data)) {
    console.error(`【Error】 数据不存在`);
    return;
  }

  const provinceRows = [];
  const cityRows = [];
  const areaRows = [];
  const streetRows = [];
  const villageRows = [];

  startOfNextStepTime = endOfNextStepTime;
  spinner.info(`开始分离数据，共 ${data.length}个 省/直辖市/自治区的数据`);

  // >>> 遍历【1】 >>> 省/直辖市/自治区的数据
  forEach(data, (province, i) => {
    const cl = cityRows.length;
    const al = areaRows.length;
    const sl = streetRows.length;
    const vl = villageRows.length;
    spinner.text = `正在分离第【${i + 1}】个: ${get(province, ['name'])}`;

    const provinceCode = get(province, ['code']).replace(/(\d{2})0{10}/, '$1');
    // >> 添加 >> 省/直辖市/自治区的数据
    provinceRows.push({
      code: provinceCode,
      name: get(province, ['name']),
    });

    // >>> 遍历【2】 >>> 市级数据
    forEach(get(province, ['cities']), (city) => {
      const cityCode = get(city, ['code']).replace(/(\d{4})0{8}/, '$1');
      // >> 添加 >> 市级数据
      cityRows.push({
        code: cityCode,
        name: get(city, ['name']),
        provinceCode,
      });

      // >>> 遍历【3】 >>> 区级数据
      forEach(get(city, ['counties']), (area) => {
        const areaCode = get(area, ['code']).replace(/(\d{6})0{6}/, '$1');
        // >> 添加 >> 区级数据
        areaRows.push({
          code: areaCode,
          name: get(area, ['name']),
          provinceCode,
          cityCode,
        });

        // >>> 遍历【4】 >>> 街道数据
        forEach(get(area, ['towns']), (street) => {
          const streetCode = get(street, ['code']).replace(/(\d{9})0{3}/, '$1');
          // >> 添加 >> 街道数据
          streetRows.push({
            code: streetCode,
            name: get(street, ['name']),
            provinceCode,
            cityCode,
            areaCode,
          });

          // >>> 遍历【5】 >>> 街道数据
          forEach(get(street, ['villages']), (village) => {
            const villageCode = get(village, ['code']);
            // >> 添加 >> 街道数据
            villageRows.push({
              code: villageCode,
              name: get(village, ['name']),
              categoryCode: get(village, ['categoryCode']),
              provinceCode,
              cityCode,
              areaCode,
              streetCode,
            });
          });
        });
      });
    });

    spinner.succeed(
      `【${i + 1}】 ${get(province, ['name'])} 数据分离成功，共 ${
        cityRows.length - cl
      }个市， ${areaRows.length - al}个区， ${streetRows.length - sl}个街道， ${
        villageRows.length - vl
      }个居委会`
    );
  });

  endOfNextStepTime = new Date();
  spinner.succeed(
    `所有数据分离成功，总耗时：${formatDistanceStrict(
      startOfNextStepTime,
      endOfNextStepTime
    )}`
  );

  spinner.text = `连接sqlite数据库，数据文件名：${sqlFileName}`;
  const { Database, Province, City, Area, Street, Village } =
    await connectSqlite(sqlFileName);
  spinner.succeed(`数据库连接成功`);

  // provinceRows
  // cityRows
  // areaRows
  // streetRows
  // villageRows

  try {
    startOfNextStepTime = endOfNextStepTime;
    spinner.text = `开始写入 省级 数据，共 ${provinceRows.length} 条`;

    await Province.bulkCreate(provinceRows, { ignoreDuplicates: true });

    endOfNextStepTime = new Date();
    spinner.succeed(
      `省级数据写入成功，共 ${
        provinceRows.length
      } 条，总耗时：${formatDistanceStrict(
        startOfNextStepTime,
        endOfNextStepTime
      )}`
    );
  } catch (error) {
    console.log('[Error] Province.bulkCreate！！！');
    spinner.fail(`省级数据写入失败`);
  }

  try {
    startOfNextStepTime = endOfNextStepTime;
    spinner.text = `开始写入 市级 数据，共 ${cityRows.length} 条`;

    await City.bulkCreate(cityRows, { ignoreDuplicates: true });

    endOfNextStepTime = new Date();
    spinner.succeed(
      `市级数据写入成功，共 ${
        cityRows.length
      } 条，总耗时：${formatDistanceStrict(
        startOfNextStepTime,
        endOfNextStepTime
      )}`
    );
  } catch (error) {
    console.log('[Error] City.bulkCreate！！！');
    spinner.fail(`市级数据写入失败`);
  }

  try {
    startOfNextStepTime = endOfNextStepTime;
    spinner.text = `开始写入 区级 数据，共 ${areaRows.length} 条`;

    await Area.bulkCreate(areaRows, { ignoreDuplicates: true });

    endOfNextStepTime = new Date();
    spinner.succeed(
      `区级数据写入成功，共 ${
        areaRows.length
      } 条，总耗时：${formatDistanceStrict(
        startOfNextStepTime,
        endOfNextStepTime
      )}`
    );
  } catch (error) {
    console.log('[Error] Area.bulkCreate！！！');
    spinner.fail(`区级数据写入失败`);
  }

  try {
    startOfNextStepTime = endOfNextStepTime;
    spinner.text = `开始写入 街道级 数据，共 ${streetRows.length} 条`;

    await Street.bulkCreate(streetRows, { ignoreDuplicates: true });

    endOfNextStepTime = new Date();
    spinner.succeed(
      `街道级数据写入成功，共 ${
        streetRows.length
      } 条，总耗时：${formatDistanceStrict(
        startOfNextStepTime,
        endOfNextStepTime
      )}`
    );
  } catch (error) {
    console.log('[Error] Street.bulkCreate！！！');
    spinner.fail(`街道级数据写入失败`);
  }

  try {
    startOfNextStepTime = endOfNextStepTime;
    spinner.text = `开始写入 社区级 数据，共 ${villageRows.length} 条`;

    await Village.bulkCreate(villageRows, { ignoreDuplicates: true });

    endOfNextStepTime = new Date();
    spinner.succeed(
      `社区级数据写入成功，共 ${
        villageRows.length
      } 条，总耗时：${formatDistanceStrict(
        startOfNextStepTime,
        endOfNextStepTime
      )}`
    );
  } catch (error) {
    console.log('[Error] Village.bulkCreate！！！');
    spinner.fail(`社区级数据写入失败`);
  }

  await Database.close();

  console.log(`
--------------------------------------------------
处理流程全部结束，总耗时${formatDistanceStrict(startTime, endOfNextStepTime)}
==================================================
  `);
};
