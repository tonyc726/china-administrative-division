import fs from 'fs';
import path from 'path';
import request from 'request-promise';
import cheerio from 'cheerio';
// import urlencode from 'urlencode';
// import Iconv from 'iconv-lite';
import trim from '../utils/trim';

const requestOptions = (uri) => (
  // eslint-disable-next-line no-useless-escape
  (/^(?:\w+:)?\/\/([^\s\.]+\.\S{2}|localhost[\:?\d]*)\S*$/).test(uri) ?
    uri :
    {
      uri,
      baseUrl: 'http://www.mca.gov.cn/',
    }
);

/**
 * 解析入口地址，区分最近一年及往年的信息
 *
 * @param {String} entryUrl - 民政部中《中华人民共和国行政区划代码》的入口地址
 */
const parseEntryUrl = async (
  entryUrl = 'http://www.mca.gov.cn/article/sj/tjbz/a/'
) => {
  const html = await request(entryUrl);
  const $ = cheerio.load(html);
  // eslint-disable-next-line array-callback-return
  $('table.article').find('a.artitlelist').each((i, m) => {
    if (i === 0) {
      parseNewestList($(m).attr('href'));
    } else {
      parseOldList($(m).attr('href'));
    }
  });
};

/**
 * 解析最近一年的数据列表
 *
 * @param {String} entryUrl - 最近一年数据的入口地址
 */
const parseNewestList = async (entryUrl) => {
  console.log(`parseNewestList: ${entryUrl}`);
  const html = await request(requestOptions(entryUrl));
  const $ = cheerio.load(html);
  const $newest = $('table.article').find('a.artitlelist')
    .filter((i, m) => ($(m).attr('title').indexOf('变更情况') < 0))
    .eq(0);
  // 解析最新的1条数据
  parseCodeUrl($newest.attr('href'));
};

/**
 * 解析历史数据
 *
 * @param {String} url - 列表的入口地址
 * @param {Number} [page = 1] - 当前页码
 * @param {Number} [total = 3] - 总页码，首次进入时初始化未0，后续读取页面中的内容决定下一次的总页数
 */
const parseOldList = async (
  url,
  page = 1,
  total = 3
) => {
  const html = await request(requestOptions(page === 1 ? url : `${url}?${page}`));
  const $ = cheerio.load(html);
  const nextPage = page + 1;
  // eslint-disable-next-line array-callback-return
  $('table.article').find('tr a.artitlelist').each(async (i, e) => {
    const fileYearMatch = trim($(e).attr('title')).match(/^(\d{4})/);
    if (fileYearMatch !== null) {
      const artitleUrl = $(e).attr('href');
      const artitleHtml = await request(requestOptions(artitleUrl));
      const $artitle = cheerio.load(artitleHtml);
      const $artitleNestedLinks = $artitle('#zoom').find('a');
      if ($artitleNestedLinks.length) {
        parseCodeUrl($artitleNestedLinks.eq(0).attr('href'));
      } else {
        parseCodeUrl(artitleUrl);
      }
    }
  });

  if (total === 0 || nextPage <= total) {
    parseOldList(url, nextPage, total);
  }
};

/**
 * 解析具体的内容并生成文件
 *
 * @param {String} url - 具体行政区域码的内容页地址
 */
const parseCodeUrl = async (url) => {
  const html = await request(requestOptions(url));
  const $ = cheerio.load(html);

  let redirectUrl = '';
  // eslint-disable-next-line consistent-return
  $('script').each((i, s) => {
    const hrefMatch = trim($(s).html()).match(/window\.location\.href="(.*)"/);
    if (hrefMatch !== null && hrefMatch[1].length) {
      redirectUrl = hrefMatch[1];
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
    $('table').find('tr').each((i, m) => {
      const text = trim($(m).text());
      const codeMatch = text.match(/(\d{6}).?(\D+)/);
      if (codeMatch === null) {
        const yearMatch = text.match(/^(\d{4})/);
        if (yearMatch !== null) {
          filename = yearMatch[1];
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

    console.log('\n------------------');
    console.log(`total: ${fileContent.length}, province: ${provinces.length}, city: ${cities.length}, county: ${counties.length}`);
    console.log(`url: ${url}`);
    makeCodeFile(filename, fileContent);
  }
};

/**
 * 生成数据文件
 *
 * @param {String} filename - 文件名字
 * @param {Object} content - 文件内容
 */
const makeCodeFile = (filename, content) => {
  console.log(`makeCodeFile: ${filename}.json`);
  console.log('------------------\n');
  fs.writeFileSync(
    path.join(__dirname, `../data/${filename}.json`),
    JSON.stringify(content, null, 2),
    'utf8'
  );
};


parseEntryUrl();
