const fs = require('fs');
const path = require('path');
const request = require('request-promise');
const cheerio = require('cheerio');
// const urlencode = require('urlencode');
// const Iconv = require('iconv-lite');
const isAbsoluteUrl = require('is-absolute-url');
const trim = require('./utils/trim');
const makeLog = require('./utils/log');
const userAgents = require('./utils/user-agents');

// 日志文件
const logFile = makeLog(
  path.join(__dirname, `../logs/gb2260/${new Date().getTime()}.txt`)
);

/**
 * 生成一个介于 min ~ max 的随机整数
 */
const getRandomInt = (min = 0, max = 200) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

// make request options
const requestOptions = (uri) =>
  isAbsoluteUrl(uri)
    ? uri
    : {
      headers: {
        // 设置随机`User-Agent`
        'User-Agent': userAgents[getRandomInt(0, userAgents.length - 1)],
      },
      gzip: true,
      uri,
      baseUrl: 'http://www.mca.gov.cn',
    };

/**
 * 生成数据文件
 *
 * @param {String} filename - 文件名字
 * @param {Object} content - 文件内容
 */
const makeCodeFile = (filename, content) => {
  fs.writeFileSync(
    path.join(__dirname, `../data/GB2260/${filename}.json`),
    JSON.stringify(content, null, 2),
    'utf8'
  );
};

/**
 * 解析具体的内容并生成文件
 *
 * @param {String} url - 具体行政区域码的内容页地址
 */
const parseCodeUrl = async (url) => {
  let html = null;
  try {
    html = await request(requestOptions(url));
  } catch (error) {
    console.error(`
===================================
url: ${url}
-----------------------------------
${JSON.stringify(error, null, 2)}
===================================
    `);
  }
  if (html !== null) {
    const $ = cheerio.load(html);

    let redirectUrl = '';
    // eslint-disable-next-line consistent-return
    $('script').each((i, s) => {
      const hrefMatch = trim($(s).html()).match(
        /window\.location\.href="(.*)"/
      );
      if (hrefMatch !== null && hrefMatch[1].length) {
        // redirectUrl = hrefMatch[1];
        [, redirectUrl] = hrefMatch;
        return false;
      }
    });

    if (redirectUrl.length) {
      parseCodeUrl(redirectUrl);
    } else {
      let filename = '';
      const fileContent = [];
      const provinces = [];
      const cities = [];
      const counties = [];
      // eslint-disable-next-line array-callback-return
      $('table')
        .find('tr')
        .each((i, m) => {
          const text = trim($(m).text());
          const codeMatch = text.match(/(\d{6}).?(\D+)/);
          if (codeMatch === null) {
            const yearMatch = text.match(/^(\d{4})/);
            if (yearMatch !== null) {
              // filename = yearMatch[1];
              [, filename] = yearMatch;
            }
          } else {
            if (/\d{2}0{4}/.test(codeMatch[1])) {
              provinces.push(codeMatch[1]);
            } else if (/\d{4}0{2}/.test(codeMatch[1])) {
              cities.push(codeMatch[1]);
            } else {
              counties.push(codeMatch[1]);
            }

            fileContent.push({
              code: codeMatch[1],
              name: trim(codeMatch[2]),
            });
          }
        });

      if (fileContent && fileContent.length) {
        makeCodeFile(filename, fileContent);
      }

      const log = `
  ------------------
  total: ${fileContent.length}, province: ${provinces.length}, city: ${cities.length
        }, county: ${counties.length}
  url: ${JSON.stringify(url)}
  file: ${filename}.json
  ------------------
    `;
      console.log(log);

      // 记录日志
      logFile.add(log);
    }
  }
};

/**
 * 解析最近一年的数据列表
 *
 * @param {String} entryUrl - 最近一年数据的入口地址
 */
const parseNewestList = async (entryUrl) => {
  const html = await request(requestOptions(entryUrl));
  const $ = cheerio.load(html);
  const $newest = $('div.content')
    .find('a')
    .filter((i, m) => {
      return $(m).text().indexOf('变更情况') < 0
    })
    .eq(0);
  if ($newest.length) {
    console.log($newest.attr('href'))
    // 解析最新的1条数据
    parseCodeUrl($newest.attr('href'));
  } else {
    console.log('Error > ', entryUrl)
  }
};

/**
 * 解析历史数据
 *
 * @param {String} url - 列表的入口地址
 * @param {Number} [page = 1] - 当前页码
 * @param {Number} [total = 3] - 总页码，首次进入时初始化未0，后续读取页面中的内容决定下一次的总页数
 */
const parseOldList = async (url, page = 1, total = 3) => {
  const html = await request(
    requestOptions(page === 1 ? url : `${url}?${page}`)
  );
  const $ = cheerio.load(html);
  const nextPage = page + 1;
  // eslint-disable-next-line array-callback-return
  $('table.article')
    .find('tr a.artitlelist')
    .each(async (i, e) => {
      const fileYearMatch = trim($(e).attr('title')).match(/^(\d{4})/);
      if (fileYearMatch !== null) {
        const artitleUrl = $(e).attr('href');
        const artitleHtml = await request(requestOptions(artitleUrl));
        const $artitle = cheerio.load(artitleHtml);
        const $artitleNestedLinks = $artitle('#zoom').find('a');
        if ($artitleNestedLinks.length) {
          //           console.log(`
          // ------------------ artitleNestedLinks ---------------------------
          // title: ${$(e).attr('title')}
          // origin: ${artitleUrl}
          // url: ${$artitleNestedLinks.eq(0).attr('href')}
          // ---------------------------------------------
          //           `);
          parseCodeUrl($artitleNestedLinks.eq(0).attr('href'));
        } else {
          //           console.log(`
          // ---------------------------------------------
          // title: ${$(e).attr('title')}
          // url: ${artitleUrl}
          // ---------------------------------------------
          //           `);
          parseCodeUrl(artitleUrl);
        }
      }
    });

  if (total === 0 || nextPage <= total) {
    parseOldList(url, nextPage, total);
  }
};

/**
 * 解析入口地址，区分最近一年及往年的信息
 *
 * @param {String} entryUrl - 民政部中《中华人民共和国行政区划代码》的入口地址
 */
(async (entryUrl) => {
  const html = await request(entryUrl);
  const $ = cheerio.load(html);

  const pageList = [];

  $('#comp_1284 table.article').find('a.artitlelist').each((i, m) => {
    if ((/(\d{4})年中华人民共和国行政区划代码/gi).test($(m).text())) {
      const url = new URL($(m).attr('href'), entryUrl).href;
      pageList.push({ url: url, title: $(m).attr('title') })
    }
  });

  for await (const pageNum of [1, 2]) {
    const pageContentHtml = await request(`https://www.mca.gov.cn/n156/n186/index_1284_${pageNum}.html`);
    const pageContent = cheerio.load(pageContentHtml);

    pageContent('table.article').find('a.artitlelist').each((i, m) => {
      if ((/(\d{4})年中华人民共和国行政区划代码/gi).test($(m).text())) {
        pageList.push({ url: $(m).attr('href'), title: $(m).attr('title') })
      }
    });
  }

  for await (const pageInfo of pageList) {
    if ((/mzsj\/(tjbz|xzqh)/gi).test(pageInfo.url)) {
      // await parseOldList(pageInfo.url);
      await parseCodeUrl(pageInfo.url);
    } else {
      await parseNewestList(pageInfo.url);
    }
  }
})('https://www.mca.gov.cn/n156/n186/index.html');
