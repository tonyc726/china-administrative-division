/* eslint-disable no-await-in-loop */
const fs = require('fs');
const { URL } = require('url');
const path = require('path');
const {
  isNil,
  isArray,
  isEmpty,
  trim,
  assign,
  concat,
  compact,
  last,
  sortBy,
  get,
  find,
  cloneDeep,
  includes,
} = require('lodash');
const { format, distanceInWordsToNow } = require('date-fns');
const zhLocale = require('date-fns/locale/zh_cn');
const request = require('request-promise');
const iconv = require('iconv-lite');
const cheerio = require('cheerio');
const delay = require('delay');
const md5 = require('md5');
const winston = require('winston');
const ora = require('ora');
const levelup = require('levelup');
const leveldown = require('leveldown');

const userAgents = require('./utils/user-agents');

// 以当前时间(秒)作为分析文件路径的分隔，用于`logger`
const RUN_DATE = format(new Date(), 'X');
// const RUN_DATE = '1560934192';

// 初始化数据库
const pageCacheDB = levelup(
  leveldown(path.join(__dirname, '../pageCacheDB/stats.gov.cn'))
);

// const LEVELS = ['province', 'city', 'county', 'town', 'village'];
let spinner = null;
let spinnerProvince = '';
let spinnerCity = '';
let spinnerCounty = '';
let spinnerTown = '';

// @doc https://github.com/winstonjs/winston#usage
const loggerDate = format(new Date(), 'YYYY.MM.DD.HH.mm.ss');
let logger = null;

/**
 * 生成数据文件
 *
 * @param {String} filename - 文件名字
 * @param {Object} content - 文件内容
 */
const makeCodeFile = (filename, content) => {
  fs.writeFileSync(
    path.join(__dirname, `../data/stats.gov.cn/${filename}`),
    JSON.stringify(content, null, 2),
    'utf8'
  );
};

/**
 * 生成一个介于 min ~ max 的随机整数
 */
const getRandomInt = (min = 0, max = 200) => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

// 页面请求清单
let requestPageList = [];
// 页面请求失败的清单
let requestPageFailedList = [];

/**
 * 请求`GB2312`编码的页面，并用`Cheerio`解析
 * @param {string} url - 页面地址
 * @returns {object} cheerio object
 */
const getPageWithCheerio = async url => {
  let page = null;

  // 延时 10 ~ 200 ms
  await delay(getRandomInt(10, 200));

  try {
    const html = await request(url, {
      headers: {
        // 设置随机`User-Agent`
        'User-Agent': userAgents[getRandomInt(0, userAgents.length - 1)],
      },
      gzip: true,
      // 解决gb2312编码问题，在获取页面内容时不同编码，默认输出buffer
      encoding: null,
      timeout: 5000,
    });

    // 使用gb2312编码
    page = cheerio.load(iconv.decode(html, 'gb2312'), {
      decodeEntities: false,
    });
  } catch (error) {
    logger.error(error);
    throw error;
  }
  return page;
};

/**
 * 获取页面的缓存数据
 * @param {string} url - 页面地址
 * @returns {object|null}
 */
const getPageCache = async url => {
  // 页面缓存以`url`的`md5`值为`key`
  const urlCacheKey = md5(url);
  let pageCache = null;
  try {
    const pageCacheData = await pageCacheDB.get(urlCacheKey);
    pageCache = JSON.parse(pageCacheData);
  } catch (error) {
    logger.warn(error);
  }

  if (isArray(pageCache)) {
    logger.info(`Read (${url}) from cache.`);
  }

  return isArray(pageCache) ? pageCache : null;
};

/**
 * 保存页面的缓存数据
 * @param {string} url - 页面地址
 * @param {string} data - 页面数据
 */
const setPageCache = async (url, data) => {
  // 页面缓存以`url`的`md5`值为`key`
  const urlCacheKey = md5(url);
  try {
    await pageCacheDB.put(urlCacheKey, JSON.stringify(data));
  } catch (error) {
    logger.error(error);
  }
};

/**
 * 获取居民委员会级数据
 * @param {string} url - 居民委员会数据的页面地址
 * @param {object} countyItem - 居民委员会所属街道一级数据的对象
 * @param {boolean} [enableCache = true] - 是否使用缓存数据，默认开启
 * @returns {object} 聚合居民委员会数据的所属街道一级数据对象
 */
const getVillage = async (url, townItem = {}, enableCache = true) => {
  logger.info(`>>>>> 正在获取 【${townItem.name}】 附属居民委员会的数据 <<<<<`);

  // 获取页面缓存
  let villages = enableCache === true ? await getPageCache(url) : null;

  if (villages === null) {
    let $ = null;
    try {
      $ = await getPageWithCheerio(url);
    } catch (error) {
      // 记录请求失败页面的数据
      requestPageFailedList = compact(
        concat(
          requestPageFailedList,
          assign(
            {
              url,
              cacheID: md5(url),
              level: 'village',
            },
            townItem
          )
        )
      );
    }

    if ($ !== null) {
      // 记录请求页面的数据
      requestPageList = compact(
        concat(
          requestPageList,
          assign(
            {
              url,
              cacheID: md5(url),
              level: 'village',
            },
            townItem
          )
        )
      );

      const $villageTable = $(`table.villagetable`);
      $villageTable.find(`tr.villagetr`).each((trIndex, tr) => {
        const $tds = $(tr).find('td');
        const code = trim($tds.eq(0).text());
        const categoryCode = trim($tds.eq(1).text());
        const name = trim($tds.eq(2).text());
        if (code.length !== 0 && name.length !== 0) {
          villages = compact(
            concat(villages, {
              name,
              code,
              categoryCode,
            })
          );
        }
      });

      if (isArray(villages) && !isEmpty(villages)) {
        // update cache
        await setPageCache(url, villages);
      }
    }
  }

  logger.info(
    `>>>>> ${townItem.name} 附属居民委员会共 ${
      isArray(villages) ? villages.length : 0
    } 条数据：`
  );

  return assign(townItem, {
    villages: isArray(villages) ? villages : [],
  });
};

/**
 * 获取街道级数据
 * @param {string} url - 街道数据的页面地址
 * @param {object} countyItem - 街道所属区一级数据的对象
 * @param {boolean} [enableCache = true] - 是否使用缓存数据，默认开启
 * @returns {object} 聚合街道数据的所属区一级数据对象
 */
const getTown = async (url, countyItem = {}, enableCache = true) => {
  logger.info(`>>>> 正在获取 【${countyItem.name}】 附属街道的数据 <<<<`);

  // 获取页面缓存
  let towns = enableCache === true ? await getPageCache(url) : null;

  // 没有该街道数据地址的缓存
  if (towns === null) {
    let $ = null;
    try {
      $ = await getPageWithCheerio(url);
    } catch (error) {
      // 记录请求失败页面的数据
      requestPageFailedList = compact(
        concat(
          requestPageFailedList,
          assign(
            {
              url,
              cacheID: md5(url),
              level: 'town',
            },
            countyItem
          )
        )
      );
    }

    if ($ !== null) {
      // 记录请求页面的数据
      requestPageList = compact(
        concat(
          requestPageList,
          assign(
            {
              url,
              cacheID: md5(url),
              level: 'town',
            },
            countyItem
          )
        )
      );

      const $townTable = $(`table.towntable`);
      $townTable.find(`tr.towntr`).each((trIndex, tr) => {
        const $tds = $(tr).find('td');
        const code = trim($tds.eq(0).text());
        const name = trim($tds.eq(1).text());
        const href = $tds
          .eq(0)
          .children('a')
          .attr('href');
        if (code.length !== 0 && name.length !== 0) {
          towns = compact(
            concat(
              towns,
              assign(
                {
                  name,
                  code,
                },
                isNil(href) || href.length === 0
                  ? null
                  : {
                      link: new URL(href, url).toString(),
                    }
              )
            )
          );
        }
      });

      if (isArray(towns) && towns.length) {
        // update cache
        await setPageCache(url, towns);
        logger.info(
          `>>>> ${countyItem.name} 附属街道共 ${towns.length} 条数据：`
        );
      }
    }
  }

  const result = [];
  if (isArray(towns)) {
    for (let townIndex = 0; townIndex < towns.length; townIndex += 1) {
      const { name, code, link } = towns[townIndex];

      logger.info(
        `>>>> --- 正在获取 [${townIndex + 1} / ${
          towns.length
        }] - 【${name}】 --- `
      );

      spinnerTown = `${name}(${townIndex + 1} / ${
        isArray(towns) ? towns.length : 0
      })`;
      spinner.text = `正在获取 ${spinnerProvince} - ${spinnerCity} - ${spinnerCounty} - ${spinnerTown}`;

      if (isNil(link)) {
        result.push({ name, code });
      } else {
        const nextTownItem = await getVillage(
          link,
          { name, code },
          enableCache
        );
        if (nextTownItem !== null) {
          result.push(nextTownItem);
        }
      }
    }
  } else {
    logger.error(`
      ${countyItem.name} 附属街道数据获取异常
      ${url}
    `);
  }

  return assign(countyItem, {
    towns: isArray(result) ? result : [],
  });
};

/**
 * 获取街道数据
 * @param {string} url - 区数据的页面地址
 * @param {object} cityItem - 区所属城市一级数据的对象
 * @param {boolean} [enableCache = true] - 是否使用缓存数据，默认开启
 * @returns {object} 聚合区数据的所属城市一级数据对象
 */
const getCounty = async (url, cityItem = {}, enableCache = true) => {
  logger.info(`>>> 正在获取 【${cityItem.name}】 附属区的数据 <<<`);

  // 获取页面缓存
  let counties = enableCache === true ? await getPageCache(url) : null;

  // 没有该区数据地址的缓存
  if (counties === null) {
    let $ = null;
    try {
      $ = await getPageWithCheerio(url);
    } catch (error) {
      // 记录请求失败页面的数据
      requestPageFailedList = compact(
        concat(
          requestPageFailedList,
          assign(
            {
              url,
              cacheID: md5(url),
              level: 'county',
            },
            cityItem
          )
        )
      );
    }

    if ($ !== null) {
      // 记录请求页面的数据
      requestPageList = compact(
        concat(
          requestPageList,
          assign(
            {
              url,
              cacheID: md5(url),
              level: 'county',
            },
            cityItem
          )
        )
      );

      const $countyTable = $(`table.countytable`);
      $countyTable.find(`tr.countytr`).each((trIndex, tr) => {
        const $tds = $(tr).find('td');
        const code = trim($tds.eq(0).text());
        const name = trim($tds.eq(1).text());
        const href = $tds
          .eq(0)
          .children('a')
          .attr('href');
        if (code.length !== 0 && name.length !== 0) {
          counties = compact(
            concat(
              counties,
              assign(
                {
                  name,
                  code,
                },
                isNil(href) || href.length === 0
                  ? null
                  : {
                      link: new URL(href, url).toString(),
                    }
              )
            )
          );
        }
      });

      if (isArray(counties) && counties.length) {
        // update cache
        await setPageCache(url, counties);

        logger.info(
          `>>> ${cityItem.name} 附属区共 ${counties.length} 条数据：`
        );
      }
    }
  }

  const result = [];
  if (isArray(counties)) {
    for (let countyIndex = 0; countyIndex < counties.length; countyIndex += 1) {
      const { name, code, link } = counties[countyIndex];

      logger.info(
        `>>> --- 正在获取 [${countyIndex + 1} / ${
          counties.length
        }] - 【${name}】 --- `
      );

      spinnerCounty = `${name}(${countyIndex + 1} / ${
        isArray(counties) ? counties.length : 0
      })`;
      spinner.text = `正在获取 ${spinnerProvince} - ${spinnerCity} - ${spinnerCounty}`;

      if (isNil(link)) {
        result.push({ name, code });
      } else {
        const nextCountyItem = await getTown(link, { name, code }, enableCache);
        if (nextCountyItem !== null) {
          result.push(nextCountyItem);
        }
      }
    }
  } else {
    logger.error(`
      ${cityItem.name} 附属区数据获取异常
      ${url}
    `);
  }

  return assign(cityItem, {
    counties: isArray(result) ? result : [],
  });
};

/**
 * 获取城市级数据
 * @param {string} url - 城市数据的页面地址
 * @param {object} proviceItem - 城市所属省一级数据的对象
 * @param {boolean} [enableCache = true] - 是否使用缓存数据，默认开启
 * @returns {object} 聚合城市数据的所属省一级数据对象
 */
const getCity = async (url, proviceItem = {}, enableCache = true) => {
  logger.info(`>> 正在获取 【${proviceItem.name}】 附属城市的数据 <<`);

  // 获取页面缓存
  let cities = enableCache === true ? await getPageCache(url) : null;

  // 没有该市区数据地址的缓存
  if (cities === null) {
    let $ = null;
    try {
      $ = await getPageWithCheerio(url);
    } catch (error) {
      // 记录请求失败页面的数据
      requestPageFailedList = compact(
        concat(
          requestPageFailedList,
          assign(
            {
              url,
              cacheID: md5(url),
              level: 'city',
            },
            proviceItem
          )
        )
      );
    }

    if ($ !== null) {
      // 记录请求页面的数据
      requestPageList = compact(
        concat(
          requestPageList,
          assign(
            {
              url,
              cacheID: md5(url),
              level: 'city',
            },
            proviceItem
          )
        )
      );

      const $cityTable = $(`table.citytable`);
      $cityTable.find(`tr.citytr`).each((trIndex, tr) => {
        const $tds = $(tr).find('td');
        const code = trim($tds.eq(0).text());
        const name = trim($tds.eq(1).text());
        const href = $tds
          .eq(0)
          .children('a')
          .attr('href');
        if (code.length !== 0 && name.length !== 0) {
          cities = compact(
            concat(
              cities,
              assign(
                {
                  name,
                  code,
                },
                isNil(href) || href.length === 0
                  ? null
                  : {
                      link: new URL(href, url).toString(),
                    }
              )
            )
          );
        }
      });

      if (isArray(cities) && cities.length) {
        // update cache
        await setPageCache(url, cities);

        logger.info(`>> ${proviceItem.name} 附属城市共 ${cities} 条数据：`);
      }
    }
  }

  const result = [];
  if (isArray(cities)) {
    for (let cityIndex = 0; cityIndex < cities.length; cityIndex += 1) {
      const { name, code, link } = cities[cityIndex];
      logger.info(
        `>> --- 正在获取 [${cityIndex + 1} / ${
          isArray(cities) ? cities.length : 0
        }] - 【${name}】 --- `
      );

      spinnerCity = `${name}(${cityIndex + 1} / ${
        isArray(cities) ? cities.length : 0
      })`;
      spinner.text = `正在获取 ${spinnerProvince} - ${spinnerCity}`;

      if (isNil(link)) {
        result.push({ name, code });
      } else {
        const nextCityItem =
          // 特殊处理2018、2017、2016以下3个市的数据
          // 因为其数据中没有`County`一级，直接输出`Town`
          includes(
            [
              // 东莞市
              '441900000000',
              // 中山市
              '442000000000',
              // 儋州市
              '460400000000',
            ],
            code
          ) &&
          (link.indexOf('2018') !== -1 ||
            link.indexOf('2017') !== -1 ||
            link.indexOf('2016') !== -1)
            ? await getTown(link, { name, code }, enableCache)
            : await getCounty(link, { name, code }, enableCache);
        if (nextCityItem !== null) {
          result.push(nextCityItem);
        }
      }
    }
  } else {
    logger.error(`
      ${proviceItem.name} 附属城市数据获取异常
      ${url}
    `);
  }

  return assign(proviceItem, {
    cities: isArray(result) ? result : [],
  });
};

/**
 * 获取省/直辖市/自治区的数据
 * @param {string} url - 请求地址
 * @param {boolean} [enableCache = true] - 是否使用缓存数据，默认开启
 * @returns {array}
 */
const getProvince = async (url, enableCache = true) => {
  // 获取页面缓存
  let provices = enableCache === true ? await getPageCache(url) : null;
  // 没有省份数据地址的缓存
  if (provices === null) {
    let $ = null;
    try {
      $ = await getPageWithCheerio(url);
    } catch (error) {
      // 记录请求失败页面的数据
      requestPageFailedList = compact(
        concat(requestPageFailedList, {
          url,
          cacheID: md5(url),
          level: 'province',
        })
      );
    }
    const $proviceTable = $(`table.provincetable`);

    $proviceTable.find(`tr.provincetr`).each((trIndex, tr) => {
      $(tr)
        .find('td')
        .each((tdIndex, td) => {
          const proviceName = trim($(td).text());
          const $proviceLink = $(td).children('a');
          const href = $proviceLink.attr('href');
          if (!isNil(proviceName) && proviceName.length !== 0) {
            provices = compact(
              concat(
                provices,
                assign(
                  {
                    name: proviceName,
                  },
                  isNil(href) || href.length === 0
                    ? null
                    : {
                        link: new URL(href, url).toString(),
                        code: `${href.substring(0, 2)}0000000000`,
                      }
                )
              )
            );
          }
        });
    });

    if (isArray(provices) && provices.length) {
      // update cache
      await setPageCache(url, provices);

      logger.info(`> 本数据共 ${provices.length} 省/直辖市/自治区 <`);
    }
  }

  const result = [];
  for (
    let proviceIndex = 0;
    proviceIndex < provices.length;
    proviceIndex += 1
  ) {
    const { name, code, link } = provices[proviceIndex];

    logger.info(
      `> --- 正在获取 [${proviceIndex + 1} / ${
        provices.length
      }] - 【${name}】 --- `
    );

    // reset spinner
    spinner = null;
    spinnerProvince = '';
    spinnerCity = '';
    spinnerCounty = '';
    spinnerTown = '';

    spinnerProvince = `[${proviceIndex + 1} / ${provices.length}] - ${name}`;
    spinner = ora().start(`正在获取 ${spinnerProvince}`);

    result.push(
      isNil(link)
        ? { name, code }
        : await getCity(link, { name, code }, enableCache)
    );

    spinner.succeed(`获取 ${spinnerProvince} 全部完成！`);
  }

  return result;
};

/**
 * 解析入口地址，区分最近一年及往年的信息
 *
 * @param {String} entryUrl - 民政部中《中华人民共和国行政区划代码》的入口地址
 */
(async entryUrl => {
  let entryPageContent = null;
  try {
    // 读取页面
    entryPageContent = await request(entryUrl);
  } catch (error) {
    throw error;
  }

  const $ = cheerio.load(entryPageContent);
  const queues = [];

  $('ul.center_list_contlist')
    .find('li>a')
    .each((i, m) => {
      const dateMatch = $(m)
        .find('.cont_tit02')
        .text()
        .match(/(\d{2,4})-(\d{1,2})-(\d{1,2})/);
      const fileMatch = $(m)
        .find('.cont_tit03')
        .text()
        .match(/(\d{2,4})/);
      const detailUrl = new URL($(m).attr('href'), entryUrl).toString();
      if (dateMatch !== null && fileMatch !== null && detailUrl.length) {
        const date = `${dateMatch[1]}/${dateMatch[2]}/${dateMatch[3]}`;
        queues.push({
          url: detailUrl,
          lastModified: date,
          fileName: `${fileMatch[1]}.json`,
          year: `${fileMatch[1]}`,
        });
      }
    });

  if (isArray(queues)) {
    // 初始化历史运行记录
    let runHistory = [];
    try {
      // 读取历史运行记录
      const runHistoryCache = await pageCacheDB.get('runHistory');
      runHistory = JSON.parse(runHistoryCache);
    } catch (error) {
      logger.error('历史运行记录读取失败');
      logger.error(error);
    }

    // 最后一次运行记录
    const latestRunHistory = last(sortBy(runHistory, 'runDate'));
    const latestRunQueues = get(latestRunHistory, ['queues']);

    // 当前运行记录
    const currentRunRecord = {
      runDate: RUN_DATE,
      queues: cloneDeep(queues),
    };

    // 将运行记录写入数据库
    await pageCacheDB.put(
      'runHistory',
      JSON.stringify(concat(runHistory, currentRunRecord))
    );

    for (let queueIndex = 0; queueIndex < queues.length; queueIndex += 1) {
      const { url, fileName, year, lastModified } = queues[queueIndex];
      // 根据`url`,`fileName`,`year`定位最后一次运行记录对应的数据信息对象
      const runHistoryQueue = find(
        latestRunQueues,
        queue =>
          queue.url === url &&
          queue.fileName === fileName &&
          queue.year === year
      );
      // 最后一次运行记录对应的数据信息对象中的`lastModified`
      // 用以与本次数据中的`lastModified`对比，从而判断是否优先从缓存中读取页面的数据
      const runHistoryQueueLastModified = get(runHistoryQueue, [
        'lastModified',
      ]);

      // 重置looger对象
      logger = winston.createLogger({
        level: 'info',
        format: winston.format.json(),
        transports: [
          new winston.transports.File({
            dirname: path.join(
              __dirname,
              `../logs/stats.gov.cn/${RUN_DATE}/${year}`
            ),
            filename: `error.${loggerDate}.log`,
            level: 'error',
          }),
          new winston.transports.File({
            dirname: path.join(
              __dirname,
              `../logs/stats.gov.cn/${RUN_DATE}/${year}`
            ),
            filename: `warn.${loggerDate}.log`,
            level: 'warn',
          }),
          new winston.transports.File({
            dirname: path.join(
              __dirname,
              `../logs/stats.gov.cn/${RUN_DATE}/${year}`
            ),
            filename: `info.${loggerDate}.log`,
          }),
        ],
      });

      // 重置页面爬取记录的对象
      // 页面请求清单
      requestPageList = [];
      // 页面请求失败的清单
      requestPageFailedList = [];

      const startTime = new Date();
      console.log(`
================================================================
> 开始爬取 ${year} 年统计用区划代码数据
> 开始时间：${format(startTime, 'YYYY-MM-DD HH:mm:ss')}
----------------------------------------------------------------
      `);

      try {
        // 从省开始爬取数据
        const data = await getProvince(
          url,
          lastModified === runHistoryQueueLastModified
        );

        // 更新运行记录的数据
        currentRunRecord.queues[queueIndex] = assign({}, queues[queueIndex], {
          // 开始时间
          startTime: format(startTime, 'x'),
          // 结束时间
          endTime: format(new Date(), 'x'),
          // 页面请求清单
          requestPageList,
          // 页面请求失败的清单
          requestPageFailedList,
        });

        // 将最新的运行记录写入数据库
        await pageCacheDB.put(
          'runHistory',
          JSON.stringify(concat(runHistory, currentRunRecord))
        );

        // 生产数据文件
        makeCodeFile(fileName, data);
      } catch (error) {
        logger.error(error);
      }

      console.log(`
----------------------------------------------------------------
> 爬取结束：${format(new Date(), 'YYYY-MM-DD HH:mm:ss')}
> 共耗时：${distanceInWordsToNow(startTime, { locale: zhLocale })}
> 累计请求 ${requestPageList.length} 次，失败 ${requestPageFailedList.length} 次
================================================================
      `);

      console.log(`\n\n\n
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    `);

      const delayOneMoment = ora('休息一会儿吧！').start();
      // 延时 2s ~ 3s
      await delay(getRandomInt(2000, 3000));
      delayOneMoment.succeed('休息结束了，起来干活吧！');

      console.log(`
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    \n\n\n`);
    }
  } else {
    logger.error(`入口地址解析失败！`);
  }
})('http://www.stats.gov.cn/tjsj/tjbz/tjyqhdmhcxhfdm/');
