import fs from 'fs';
import path from 'path';
import request from 'request-promise';
import cheerio from 'cheerio';
import trim from '../utils/trim';

const requestOptions = (uri) => ({
  uri,
  baseUrl: 'http://www.mca.gov.cn/',
});

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
    // } else {
    //   parseOldList($(m).attr('href'));
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
  parseCodeUrl(
    $newest.attr('href')
  );
};

/**
 * 解析具体的内容并生成文件
 *
 * @param {String} url - 具体行政区域码的内容页地址
 */
const parseCodeUrl = async (url, dom) => {
  let $;
  if (url && !dom) {
    const html = await request(requestOptions(url));
    $ = cheerio.load(html);
  } else {
    $ = dom;
  }
  console.log(`parseCodeUrl: ${url}`);
  let redirectUrl = '';
  $('script').each((i, s) => {
    const hrefMatch = trim($(s).html()).match(/window\.location\.href="(.*)"/);
    if (hrefMatch !== null && hrefMatch[1].length) {
      redirectUrl = hrefMatch[1];
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
        const yearMatch = text.match(/(\d{4})/);
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
  fs.writeFile(
    path.join(__dirname, `../data/${filename}.json`),
    JSON.stringify(content, null, 2),
    'utf8'
  );
};


parseEntryUrl();
