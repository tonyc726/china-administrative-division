const fs = require('fs');
const path = require('path');
const request = require('request-promise');
const cheerio = require('cheerio');
// const urlencode = require('urlencode');
const iconv = require('iconv-lite');
const winston = require('winston');
const isAbsoluteUrl = require('is-absolute-url');
const _ = require('lodash');
const delay = require('delay');
const ora = require('ora');
const { format, formatDistanceToNow } = require('date-fns');
const zhLocale = require('date-fns/locale/zh-CN');
const userAgents = require('./utils/user-agents');

// @doc https://github.com/winstonjs/winston#usage
const loggerDate = format(new Date(), 'yyyy.MM.dd.HH.mm.ss');
// 重置looger对象
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({
      dirname: path.join(__dirname, `../logs/ip138-post`),
      filename: `error.${loggerDate}.log`,
      level: 'error',
    }),
    new winston.transports.File({
      dirname: path.join(__dirname, `../logs/ip138-post`),
      filename: `warn.${loggerDate}.log`,
      level: 'warn',
    }),
    new winston.transports.File({
      dirname: path.join(__dirname, `../logs/ip138-post`),
      filename: `info.${loggerDate}.log`,
    }),
  ],
});

/**
 * 生成一个介于 min ~ max 的随机整数
 */
const getRandomInt = (min = 0, max = 200) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

/**
 * 生成数据文件
 *
 * @param {String} filename - 文件名字
 * @param {Object} content - 文件内容
 */
const makeCodeFile = (filename, content) => {
  fs.writeFileSync(
    path.join(__dirname, `../data/ip138-post/${filename}.json`),
    JSON.stringify(content, null, 2),
    'utf8'
  );
};

/**
 * 请求`GB2312`编码的页面，并用`Cheerio`解析
 * @param {string} url - 页面地址
 * @returns {object} cheerio object
 */
const getPageWithCheerio = async (url, baseUrl) => {
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
      timeout: 30000,
      baseUrl: isAbsoluteUrl(baseUrl) ? baseUrl : null,
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
 * 解析具体的内容并生成文件
 *
 * @param {String} url - 具体行政区域码的内容页地址
 * @param {String} provinceName - 一级行政区名称
 */
const parseProvinceDetail = async (url, provinceName) => {
  let result = [];
  const startTime = new Date();

  logger.info({
    message: `开始爬取: https://www.ip138.com${url} - ${format(
      startTime,
      'yyyy-MM-dd HH:mm:ss'
    )}`,
  });

  const $ = await getPageWithCheerio(url, 'https://www.ip138.com');

  $('.mod-panel table.table')
    .find('tr')
    .each((i, tr) => {
      // 去除首行标题
      if (i > 0) {
        const $tds = $(tr).find('td');
        if ($tds.length === 4) {
          const name = $tds.eq(0).text();
          const zipCode = $tds.eq(1).text();
          const telPrefix = $tds.eq(2).text();
          if (name.length !== 0) {
            result.push({
              name,
              zipCode,
              telPrefix,
            });
          }
        } else if ($tds.length === 6) {
          const name = $tds.eq(0).text();
          const zipCode = $tds.eq(1).text();
          const telPrefix = $tds.eq(2).text();
          if (name.length !== 0) {
            result.push({
              name,
              zipCode,
              telPrefix,
            });
          }
          const name2 = $tds.eq(0).text();
          const zipCode2 = $tds.eq(1).text();
          const telPrefix2 = $tds.eq(2).text();
          if (name2.length !== 0) {
            result.push({
              name: name2,
              zipCode: zipCode2,
              telPrefix: telPrefix2,
            });
          }
        }
      }
    });

  result = _.uniqWith(result, _.isEqual);

  logger.info({
    message: `>> ${url} 爬取结束，共 ${
      result.length
    } 条有效记录，耗时: ${formatDistanceToNow(startTime, {
      locale: zhLocale,
    })}`,
  });
  return [`${provinceName}`, result];
};

/**
 * 解析入口地址
 *
 * @param {String} entryUrl
 */
(async (entryUrl) => {
  const startTime = new Date();
  console.log(`
================================================================
> 开始爬取 ip138/post 中的邮政编码及区号数据
> 开始时间：${format(startTime, 'yyyy-MM-dd HH:mm:ss')}
----------------------------------------------------------------
      `);

  const $ = await getPageWithCheerio(entryUrl, 'https://www.ip138.com');

  const provinceLinks = [];
  $('#quanguo')
    .find('tr>td')
    .each((index, td) => {
      const $el = $(td).children('a');
      const text = $el.text();
      const link = $el.attr('href');
      if (!_.isNil(link) && link.length !== 0) {
        provinceLinks.push({
          link,
          text,
        });
      }
    });

  const spinner = ora().start(`总共需要爬取${provinceLinks.length}个`);
  let done = 0;
  const postData = await Promise.all(
    provinceLinks.map(async ({ link, text }) => {
      let pdata = [];
      try {
        pdata = await parseProvinceDetail(link, text);
        spinner.succeed(
          `[${done + 1}/${provinceLinks.length}] - ${text}, 爬取成功，共${
            pdata[1].length
          }条有效数据`
        );
      } catch (error) {
        spinner.fail(
          `[${done + 1}/${provinceLinks.length}] - ${text}, 爬取失败`
        );
      }
      done += 1;
      return pdata;
    })
  );
  spinner.stop();

  console.log(`
----------------------------------------------------------------
> 总耗时: ${formatDistanceToNow(startTime, {
    locale: zhLocale,
  })}
> 爬取结束，共 ${_.reduce(postData, (m, [, d]) => m + d.length, 0)} 条记录。
================================================================
      `);

  makeCodeFile(format(new Date(), 'yyyy-MM-dd'), postData);
})('/post');
